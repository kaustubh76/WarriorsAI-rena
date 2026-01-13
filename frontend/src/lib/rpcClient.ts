/**
 * Shared RPC Client with Rate Limiting, Caching, and Request Queue
 *
 * This module provides a singleton RPC client that:
 * 1. Rate limits requests to stay under 40 req/sec (Flow public RPC limit)
 * 2. Caches contract read results with configurable TTL
 * 3. Queues requests to prevent burst traffic
 * 4. Implements exponential backoff retry on failures
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Address,
  type Abi,
  type ReadContractParameters,
  type ReadContractReturnType,
} from 'viem';
import { flowTestnet } from 'viem/chains';
import { getChainId, getFlowRpcUrl, getFlowFallbackRpcUrl } from '@/constants';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // RPC Configuration - Using environment-driven URLs with fallback
  RPC_URL: getFlowRpcUrl(),
  FALLBACK_RPC_URL: getFlowFallbackRpcUrl(),
  CHAIN_ID: getChainId(),

  // Rate Limiting - Keep well under 40 req/sec limit
  MAX_REQUESTS_PER_SECOND: 25, // Conservative limit (40 is max)
  REQUEST_INTERVAL_MS: 1000 / 25, // ~40ms between requests

  // Retry Configuration
  MAX_RETRIES: 5,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2,

  // Timeout Configuration - Increased for slow RPC endpoints
  REQUEST_TIMEOUT_MS: 60000, // 60 seconds (up from 30s default)

  // Cache Configuration
  DEFAULT_CACHE_TTL_MS: 10000, // 10 seconds default
  MAX_CACHE_SIZE: 1000, // Max cached entries

  // Batch Configuration
  BATCH_SIZE: 10,
  BATCH_WAIT_MS: 50, // Wait time to collect batch requests
};

// ============================================================================
// Types
// ============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
  priority: number;
}

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

// Cache key generator for contract reads
type ContractReadKey = string;

// ============================================================================
// Cache Implementation
// ============================================================================

class RequestCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private maxSize: number;

  constructor(maxSize: number = CONFIG.MAX_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  generateKey(
    address: Address,
    functionName: string,
    args: readonly unknown[] | undefined
  ): ContractReadKey {
    const argsKey = args ? JSON.stringify(args, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v
    ) : '';
    return `${address}:${functionName}:${argsKey}`;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set<T>(key: string, value: T, ttl: number = CONFIG.DEFAULT_CACHE_TTL_MS): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// ============================================================================
// Rate Limiter (Token Bucket Algorithm)
// ============================================================================

class RateLimiter {
  private state: RateLimitState;
  private maxTokens: number;
  private refillRate: number; // tokens per ms

  constructor(requestsPerSecond: number = CONFIG.MAX_REQUESTS_PER_SECOND) {
    this.maxTokens = requestsPerSecond;
    this.refillRate = requestsPerSecond / 1000;
    this.state = {
      tokens: requestsPerSecond,
      lastRefill: Date.now(),
    };
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.state.lastRefill;
    const newTokens = timePassed * this.refillRate;

    this.state.tokens = Math.min(this.maxTokens, this.state.tokens + newTokens);
    this.state.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.state.tokens >= 1) {
      this.state.tokens -= 1;
      return;
    }

    // Calculate wait time until we have a token
    const waitTime = (1 - this.state.tokens) / this.refillRate;
    await this.sleep(Math.ceil(waitTime));

    // Refill and consume
    this.refillTokens();
    this.state.tokens -= 1;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.state.tokens);
  }
}

// ============================================================================
// Request Queue
// ============================================================================

class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private processing: boolean = false;
  private rateLimiter: RateLimiter;

  constructor(rateLimiter: RateLimiter) {
    this.rateLimiter = rateLimiter;
  }

  async enqueue<T>(
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries: 0,
        priority,
      };

      // Insert by priority (higher priority first)
      const insertIndex = this.queue.findIndex(r => r.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(request as QueuedRequest<unknown>);
      } else {
        this.queue.splice(insertIndex, 0, request as QueuedRequest<unknown>);
      }

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;

      try {
        // Wait for rate limiter
        await this.rateLimiter.acquire();

        // Execute the request
        const result = await this.executeWithRetry(request);
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }

    this.processing = false;
  }

  private async executeWithRetry<T>(request: QueuedRequest<T>): Promise<T> {
    let lastError: Error | undefined;
    let delay = CONFIG.INITIAL_RETRY_DELAY_MS;

    for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await request.execute();
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error
        const isRateLimitError =
          lastError.message?.includes('rate limit') ||
          lastError.message?.includes('429') ||
          lastError.message?.includes('request limit') ||
          lastError.message?.includes('too many requests');

        if (!isRateLimitError && attempt === CONFIG.MAX_RETRIES) {
          throw lastError;
        }

        // Log retry attempt
        console.warn(
          `RPC request failed (attempt ${attempt + 1}/${CONFIG.MAX_RETRIES + 1}):`,
          lastError.message
        );

        // Wait before retry with exponential backoff
        await this.sleep(delay);
        delay = Math.min(delay * CONFIG.BACKOFF_MULTIPLIER, CONFIG.MAX_RETRY_DELAY_MS);
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

// ============================================================================
// Shared RPC Client (Singleton)
// ============================================================================

class SharedRPCClient {
  private static instance: SharedRPCClient | null = null;

  private publicClient: PublicClient;
  private fallbackClient: PublicClient;
  private cache: RequestCache;
  private rateLimiter: RateLimiter;
  private requestQueue: RequestQueue;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private useFallback: boolean = false;
  private consecutiveFailures: number = 0;
  private readonly FAILURE_THRESHOLD = 3;

  private constructor() {
    // Create viem public client with increased timeout
    this.publicClient = createPublicClient({
      chain: flowTestnet,
      transport: http(CONFIG.RPC_URL, {
        batch: {
          batchSize: CONFIG.BATCH_SIZE,
          wait: CONFIG.BATCH_WAIT_MS,
        },
        retryCount: 0, // We handle retries ourselves
        timeout: CONFIG.REQUEST_TIMEOUT_MS,
      }),
    });

    // Create fallback client for when primary times out
    this.fallbackClient = createPublicClient({
      chain: flowTestnet,
      transport: http(CONFIG.FALLBACK_RPC_URL, {
        batch: {
          batchSize: CONFIG.BATCH_SIZE,
          wait: CONFIG.BATCH_WAIT_MS,
        },
        retryCount: 0,
        timeout: CONFIG.REQUEST_TIMEOUT_MS,
      }),
    });

    this.cache = new RequestCache();
    this.rateLimiter = new RateLimiter();
    this.requestQueue = new RequestQueue(this.rateLimiter);

    // Start cache cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cache.cleanup();
    }, 60000); // Cleanup every minute

    console.log(`[RPC] Initialized with primary: ${CONFIG.RPC_URL}`);
    console.log(`[RPC] Fallback available: ${CONFIG.FALLBACK_RPC_URL}`);
  }

  private getActiveClient(): PublicClient {
    return this.useFallback ? this.fallbackClient : this.publicClient;
  }

  private handleRequestSuccess(): void {
    this.consecutiveFailures = 0;
    // Try switching back to primary after some successful requests on fallback
    if (this.useFallback) {
      console.log('[RPC] Request succeeded on fallback, will try primary on next batch');
    }
  }

  private handleRequestFailure(error: Error): void {
    this.consecutiveFailures++;
    const isTimeoutError = error.message?.includes('timeout') ||
                          error.message?.includes('timed out') ||
                          error.message?.includes('took too long');

    if (isTimeoutError && this.consecutiveFailures >= this.FAILURE_THRESHOLD && !this.useFallback) {
      console.warn(`[RPC] Primary endpoint failing (${this.consecutiveFailures} failures), switching to fallback`);
      this.useFallback = true;
      this.consecutiveFailures = 0;
    }
  }

  // Reset to primary endpoint (can be called to retry primary)
  resetToFallback(): void {
    this.useFallback = false;
    this.consecutiveFailures = 0;
    console.log('[RPC] Reset to primary endpoint');
  }

  static getInstance(): SharedRPCClient {
    if (!SharedRPCClient.instance) {
      SharedRPCClient.instance = new SharedRPCClient();
    }
    return SharedRPCClient.instance;
  }

  /**
   * Read contract with caching and rate limiting
   */
  async readContract<
    TAbi extends Abi | readonly unknown[],
    TFunctionName extends string,
  >(
    params: ReadContractParameters<TAbi, TFunctionName>,
    options?: {
      cacheTTL?: number; // Cache TTL in ms, 0 to disable caching
      priority?: number; // Higher priority = processed first
      skipCache?: boolean; // Force fresh read
    }
  ): Promise<ReadContractReturnType<TAbi, TFunctionName>> {
    const { cacheTTL = CONFIG.DEFAULT_CACHE_TTL_MS, priority = 0, skipCache = false } = options || {};

    // Generate cache key
    const cacheKey = this.cache.generateKey(
      params.address,
      params.functionName,
      params.args
    );

    // Check cache first (unless skipCache is true)
    if (!skipCache && cacheTTL > 0) {
      const cached = this.cache.get<ReadContractReturnType<TAbi, TFunctionName>>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Execute through queue with rate limiting and fallback support
    const result = await this.requestQueue.enqueue(
      async () => {
        try {
          const client = this.getActiveClient();
          const res = await client.readContract(params) as ReadContractReturnType<TAbi, TFunctionName>;
          this.handleRequestSuccess();
          return res;
        } catch (error) {
          this.handleRequestFailure(error as Error);
          // If we just switched to fallback, retry immediately with fallback
          if (this.useFallback) {
            const fallbackRes = await this.fallbackClient.readContract(params) as ReadContractReturnType<TAbi, TFunctionName>;
            this.handleRequestSuccess();
            return fallbackRes;
          }
          throw error;
        }
      },
      priority
    );

    // Cache the result
    if (cacheTTL > 0) {
      this.cache.set(cacheKey, result, cacheTTL);
    }

    return result;
  }

  /**
   * Batch multiple contract reads together
   */
  async batchReadContracts<T extends readonly unknown[]>(
    calls: ReadContractParameters[],
    options?: {
      cacheTTL?: number;
      priority?: number;
    }
  ): Promise<T> {
    const { cacheTTL = CONFIG.DEFAULT_CACHE_TTL_MS, priority = 0 } = options || {};

    const results: unknown[] = [];
    const uncachedCalls: { index: number; params: ReadContractParameters; cacheKey: string }[] = [];

    // Check cache for each call
    for (let i = 0; i < calls.length; i++) {
      const params = calls[i];
      const cacheKey = this.cache.generateKey(
        params.address,
        params.functionName,
        params.args
      );

      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        results[i] = cached;
      } else {
        uncachedCalls.push({ index: i, params, cacheKey });
      }
    }

    // Fetch uncached results with rate limiting
    if (uncachedCalls.length > 0) {
      // Process in smaller batches to respect rate limits
      const batchSize = Math.min(CONFIG.BATCH_SIZE, this.rateLimiter.getAvailableTokens());

      for (let i = 0; i < uncachedCalls.length; i += batchSize) {
        const batch = uncachedCalls.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batch.map(({ params }) =>
            this.requestQueue.enqueue(
              async () => {
                try {
                  const client = this.getActiveClient();
                  const res = await client.readContract(params);
                  this.handleRequestSuccess();
                  return res;
                } catch (error) {
                  this.handleRequestFailure(error as Error);
                  if (this.useFallback) {
                    const fallbackRes = await this.fallbackClient.readContract(params);
                    this.handleRequestSuccess();
                    return fallbackRes;
                  }
                  throw error;
                }
              },
              priority
            )
          )
        );

        // Store results and cache
        for (let j = 0; j < batch.length; j++) {
          const { index, cacheKey } = batch[j];
          results[index] = batchResults[j];

          if (cacheTTL > 0) {
            this.cache.set(cacheKey, batchResults[j], cacheTTL);
          }
        }
      }
    }

    return results as T;
  }

  /**
   * Get the underlying public client for non-cacheable operations
   * Use sparingly - prefer readContract for most reads
   */
  getPublicClient(): PublicClient {
    return this.getActiveClient();
  }

  /**
   * Check if currently using fallback RPC
   */
  isUsingFallback(): boolean {
    return this.useFallback;
  }

  /**
   * Force switch to fallback RPC (useful when primary is known to be down)
   */
  switchToFallback(): void {
    if (!this.useFallback) {
      console.log('[RPC] Manually switching to fallback endpoint');
      this.useFallback = true;
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Force switch back to primary RPC
   */
  switchToPrimary(): void {
    if (this.useFallback) {
      console.log('[RPC] Manually switching to primary endpoint');
      this.useFallback = false;
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Clear the cache (useful after writes)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate specific cache entries by address or function
   */
  invalidateCache(address?: Address, functionName?: string): void {
    // For now, just clear all cache
    // Could be optimized to selectively invalidate
    this.cache.clear();
  }

  /**
   * Get stats about the client
   */
  getStats(): {
    cacheSize: number;
    queueLength: number;
    availableTokens: number;
    usingFallback: boolean;
    consecutiveFailures: number;
  } {
    return {
      cacheSize: this.cache.size(),
      queueLength: this.requestQueue.getQueueLength(),
      availableTokens: this.rateLimiter.getAvailableTokens(),
      usingFallback: this.useFallback,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    SharedRPCClient.instance = null;
  }
}

// ============================================================================
// Exports
// ============================================================================

// Singleton instance getter
export function getSharedRPCClient(): SharedRPCClient {
  return SharedRPCClient.getInstance();
}

// Convenience function for contract reads
export async function readContractWithRateLimit<
  TAbi extends Abi | readonly unknown[],
  TFunctionName extends string,
>(
  params: ReadContractParameters<TAbi, TFunctionName>,
  options?: {
    cacheTTL?: number;
    priority?: number;
    skipCache?: boolean;
  }
): Promise<ReadContractReturnType<TAbi, TFunctionName>> {
  return getSharedRPCClient().readContract(params, options);
}

// Convenience function for batch reads
export async function batchReadContractsWithRateLimit<T extends readonly unknown[]>(
  calls: ReadContractParameters[],
  options?: {
    cacheTTL?: number;
    priority?: number;
  }
): Promise<T> {
  return getSharedRPCClient().batchReadContracts(calls, options);
}

// Get the underlying public client
export function getPublicClient(): PublicClient {
  return getSharedRPCClient().getPublicClient();
}

// Clear cache
export function clearRPCCache(): void {
  getSharedRPCClient().clearCache();
}

// Get client stats
export function getRPCClientStats() {
  return getSharedRPCClient().getStats();
}

// Export configuration for reference
export const RPC_CONFIG = CONFIG;

// Default export
export default getSharedRPCClient;
