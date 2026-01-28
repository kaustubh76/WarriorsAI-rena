/**
 * Advanced Rate Limiting System
 *
 * Implements token bucket algorithm for sophisticated rate limiting with:
 * - Per-user rate limiting
 * - Per-endpoint rate limiting
 * - Sliding window implementation
 * - Burst handling
 * - Rate limit headers (X-RateLimit-*)
 */

import { FlowMetrics } from '../metrics';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  maxTokens: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per second
  refillInterval: number; // Interval in ms to refill tokens
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitInfo {
  tokens: number;
  lastRefill: number;
  requestCount: number;
}

// ============================================================================
// Token Bucket Rate Limiter
// ============================================================================

export class TokenBucketRateLimiter {
  private buckets = new Map<string, RateLimitInfo>();
  private readonly config: RateLimitConfig;
  private refillTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxTokens: config.maxTokens || 60,
      refillRate: config.refillRate || 1, // 1 token per second
      refillInterval: config.refillInterval || 1000, // 1 second
    };

    // Start automatic token refill
    this.startRefillTimer();
  }

  /**
   * Check if request is allowed and consume token
   */
  async consume(key: string, tokens: number = 1): Promise<RateLimitResult> {
    // Get or create bucket
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: Date.now(),
        requestCount: 0,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    this.refillBucket(bucket);

    // Check if enough tokens available
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      bucket.requestCount++;

      FlowMetrics.incrementCounter('rate_limit_requests_allowed_total', 1, {
        key: this.sanitizeKey(key),
      });

      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: this.calculateResetTime(bucket),
      };
    }

    // Not enough tokens - rate limited
    FlowMetrics.incrementCounter('rate_limit_requests_blocked_total', 1, {
      key: this.sanitizeKey(key),
    });

    const retryAfter = this.calculateRetryAfter(bucket, tokens);

    return {
      allowed: false,
      remaining: 0,
      resetAt: this.calculateResetTime(bucket),
      retryAfter,
    };
  }

  /**
   * Refill tokens in bucket based on time elapsed
   */
  private refillBucket(bucket: RateLimitInfo): void {
    const now = Date.now();
    const timeSinceLastRefill = now - bucket.lastRefill;
    const intervalsElapsed = Math.floor(
      timeSinceLastRefill / this.config.refillInterval
    );

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.config.refillRate;
      bucket.tokens = Math.min(
        this.config.maxTokens,
        bucket.tokens + tokensToAdd
      );
      bucket.lastRefill = now;
    }
  }

  /**
   * Calculate when the bucket will be reset (full)
   */
  private calculateResetTime(bucket: RateLimitInfo): number {
    const tokensNeeded = this.config.maxTokens - bucket.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.config.refillRate);
    const msUntilReset = intervalsNeeded * this.config.refillInterval;

    return Date.now() + msUntilReset;
  }

  /**
   * Calculate retry-after time in seconds
   */
  private calculateRetryAfter(bucket: RateLimitInfo, tokensNeeded: number): number {
    const tokensShort = tokensNeeded - bucket.tokens;
    const intervalsNeeded = Math.ceil(tokensShort / this.config.refillRate);
    const msUntilAvailable = intervalsNeeded * this.config.refillInterval;

    return Math.ceil(msUntilAvailable / 1000);
  }

  /**
   * Start automatic token refill timer
   */
  private startRefillTimer(): void {
    this.refillTimer = setInterval(() => {
      for (const [key, bucket] of this.buckets.entries()) {
        this.refillBucket(bucket);

        // Clean up old buckets (no activity for 10 minutes)
        if (Date.now() - bucket.lastRefill > 600000) {
          this.buckets.delete(key);
        }
      }
    }, this.config.refillInterval);
  }

  /**
   * Stop refill timer
   */
  stop(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  /**
   * Get current bucket status
   */
  getStatus(key: string): RateLimitInfo | null {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;

    this.refillBucket(bucket);
    return { ...bucket };
  }

  /**
   * Reset bucket for key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Get all rate limit statistics
   */
  getStats() {
    return {
      totalKeys: this.buckets.size,
      buckets: Array.from(this.buckets.entries()).map(([key, info]) => ({
        key: this.sanitizeKey(key),
        tokens: Math.floor(info.tokens),
        requestCount: info.requestCount,
      })),
    };
  }

  /**
   * Sanitize key for metrics (remove sensitive data)
   */
  private sanitizeKey(key: string): string {
    // If key looks like IP address, keep it
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(key)) {
      return key;
    }
    // If key contains ':', split and keep first part
    if (key.includes(':')) {
      return key.split(':')[0];
    }
    return 'user';
  }
}

// ============================================================================
// Sliding Window Rate Limiter
// ============================================================================

export class SlidingWindowRateLimiter {
  private windows = new Map<string, number[]>();
  private readonly windowSize: number;
  private readonly maxRequests: number;

  constructor(windowSizeMs: number = 60000, maxRequests: number = 60) {
    this.windowSize = windowSizeMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if request is allowed
   */
  async isAllowed(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    // Get or create window
    let timestamps = this.windows.get(key) || [];

    // Remove timestamps outside window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    // Check limit
    if (timestamps.length >= this.maxRequests) {
      const oldestTimestamp = timestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + this.windowSize - now) / 1000);

      FlowMetrics.incrementCounter('rate_limit_requests_blocked_total', 1, {
        limiter: 'sliding_window',
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestTimestamp + this.windowSize,
        retryAfter,
      };
    }

    // Add current timestamp
    timestamps.push(now);
    this.windows.set(key, timestamps);

    FlowMetrics.incrementCounter('rate_limit_requests_allowed_total', 1, {
      limiter: 'sliding_window',
    });

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetAt: timestamps[0] + this.windowSize,
    };
  }

  /**
   * Clean up old windows
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    for (const [key, timestamps] of this.windows.entries()) {
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);

      if (validTimestamps.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, validTimestamps);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalKeys: this.windows.size,
      windows: Array.from(this.windows.entries()).map(([key, timestamps]) => ({
        key,
        requestCount: timestamps.length,
        remaining: this.maxRequests - timestamps.length,
      })),
    };
  }
}

// ============================================================================
// Global Rate Limiter Instances
// ============================================================================

// API endpoint rate limiter - 60 requests per minute
export const apiRateLimiter = new TokenBucketRateLimiter({
  maxTokens: 60,
  refillRate: 1,
  refillInterval: 1000,
});

// RPC call rate limiter - 120 requests per minute (higher limit for blockchain calls)
export const rpcRateLimiter = new TokenBucketRateLimiter({
  maxTokens: 120,
  refillRate: 2,
  refillInterval: 1000,
});

// Authentication rate limiter - 10 attempts per minute (stricter for auth)
export const authRateLimiter = new TokenBucketRateLimiter({
  maxTokens: 10,
  refillRate: 1,
  refillInterval: 6000,
});

// Sliding window for burst protection - 100 requests per 10 seconds
export const burstProtection = new SlidingWindowRateLimiter(10000, 100);

// Cleanup old rate limit data every 5 minutes
setInterval(() => {
  burstProtection.cleanup();
}, 300000);
