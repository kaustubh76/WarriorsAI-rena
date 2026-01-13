/**
 * 0G Network Provider Singleton
 *
 * Provides cached, reusable instances of ethers providers and wallets
 * to prevent ETIMEDOUT errors from creating too many connections.
 *
 * This module implements connection pooling for:
 * - JsonRpcProvider connections to 0G network
 * - Wallet instances for signing transactions
 * - 0G broker instances for compute operations
 */

import { ethers } from 'ethers';

// Configuration
const ZERO_G_CONFIG = {
  computeRpc: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  chainId: parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602'),
  storageIndexer: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai',
};

// Singleton instances
let cachedProvider: ethers.JsonRpcProvider | null = null;
let cachedWallet: ethers.Wallet | null = null;
let lastProviderCheck = 0;
const PROVIDER_CHECK_INTERVAL = 30000; // 30 seconds

// Connection health tracking
interface ConnectionHealth {
  isHealthy: boolean;
  lastError: string | null;
  lastSuccessTime: number;
  consecutiveFailures: number;
}

let connectionHealth: ConnectionHealth = {
  isHealthy: true,
  lastError: null,
  lastSuccessTime: Date.now(),
  consecutiveFailures: 0,
};

/**
 * Get or create a cached provider instance
 * Implements lazy initialization and health checking
 */
export async function getProvider(): Promise<ethers.JsonRpcProvider> {
  const now = Date.now();

  // Return cached provider if it exists and is healthy
  if (cachedProvider && connectionHealth.isHealthy && (now - lastProviderCheck < PROVIDER_CHECK_INTERVAL)) {
    return cachedProvider;
  }

  // Create new provider if needed
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc, {
      chainId: ZERO_G_CONFIG.chainId,
      name: '0G Galileo Testnet',
    });
  }

  // Perform health check
  try {
    await Promise.race([
      cachedProvider.getBlockNumber(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Provider health check timeout')), 5000))
    ]);

    connectionHealth.isHealthy = true;
    connectionHealth.lastSuccessTime = now;
    connectionHealth.consecutiveFailures = 0;
    connectionHealth.lastError = null;
    lastProviderCheck = now;
  } catch (error) {
    connectionHealth.consecutiveFailures++;
    connectionHealth.lastError = error instanceof Error ? error.message : 'Unknown error';

    // If too many failures, recreate provider
    if (connectionHealth.consecutiveFailures >= 3) {
      console.warn('[0G Provider] Too many consecutive failures, recreating provider');
      cachedProvider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc, {
        chainId: ZERO_G_CONFIG.chainId,
        name: '0G Galileo Testnet',
      });
      connectionHealth.consecutiveFailures = 0;
    }

    // Don't throw - return the provider anyway, let the actual call handle errors
    connectionHealth.isHealthy = false;
  }

  return cachedProvider;
}

/**
 * Get or create a cached wallet instance
 */
export async function getWallet(): Promise<ethers.Wallet> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is not set');
  }

  if (!cachedWallet) {
    const provider = await getProvider();
    cachedWallet = new ethers.Wallet(privateKey, provider);
  }

  return cachedWallet;
}

/**
 * Get connection health status
 */
export function getConnectionHealth(): ConnectionHealth {
  return { ...connectionHealth };
}

/**
 * Force reset all cached instances
 * Use this when switching networks or after persistent errors
 */
export function resetProviderCache(): void {
  cachedProvider = null;
  cachedWallet = null;
  lastProviderCheck = 0;
  connectionHealth = {
    isHealthy: true,
    lastError: null,
    lastSuccessTime: Date.now(),
    consecutiveFailures: 0,
  };
}

/**
 * Execute a function with automatic retry on connection errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, shouldRetry } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      const isRetryable = shouldRetry
        ? shouldRetry(lastError)
        : isRetryableError(lastError);

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`[0G Provider] Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable (transient network issues)
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  return (
    message.includes('etimedout') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('no matching receipts found') ||
    message.includes('potential data corruption') ||
    message.includes('failed to detect network')
  );
}

/**
 * Get configuration
 */
export function getConfig() {
  return { ...ZERO_G_CONFIG };
}

export { ZERO_G_CONFIG };
