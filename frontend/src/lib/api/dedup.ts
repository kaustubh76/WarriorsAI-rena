/**
 * Request Deduplication Utility
 * Prevents duplicate concurrent requests to the same endpoint
 * Useful for expensive operations that multiple clients may request simultaneously
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

/**
 * Request deduplicator that coalesces concurrent identical requests
 *
 * @example
 * const dedup = new RequestDeduplicator<MarketData>();
 *
 * // Multiple concurrent calls will share the same request
 * const data = await dedup.dedupe('market-123', async () => {
 *   return await fetchMarketData('123');
 * });
 */
export class RequestDeduplicator<T> {
  private pending = new Map<string, PendingRequest<T>>();
  private maxAge: number;

  /**
   * @param maxAge - Maximum time in ms to keep pending requests (default: 30000)
   */
  constructor(maxAge: number = 30000) {
    this.maxAge = maxAge;

    // Cleanup stale entries periodically
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 60000);
    }
  }

  /**
   * Execute a function with deduplication
   * If another request with the same key is in progress, wait for its result
   */
  async dedupe(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Check for existing pending request
    const existing = this.pending.get(key);
    if (existing && now - existing.timestamp < this.maxAge) {
      return existing.promise;
    }

    // Create new request
    const promise = fn().finally(() => {
      // Remove from pending after completion
      // Use setTimeout to allow for brief window of result sharing
      setTimeout(() => {
        const current = this.pending.get(key);
        if (current?.promise === promise) {
          this.pending.delete(key);
        }
      }, 100);
    });

    this.pending.set(key, { promise, timestamp: now });
    return promise;
  }

  /**
   * Check if a request is currently pending
   */
  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Get count of pending requests
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pending.clear();
  }

  /**
   * Remove stale pending requests
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, request] of this.pending.entries()) {
      if (now - request.timestamp > this.maxAge) {
        this.pending.delete(key);
      }
    }
  }
}

/**
 * Cached request deduplicator that also caches successful results
 *
 * @example
 * const cache = new CachedDeduplicator<MarketData>({ ttl: 60000 });
 *
 * // First call fetches, subsequent calls return cached
 * const data = await cache.get('market-123', async () => {
 *   return await fetchMarketData('123');
 * });
 */
export class CachedDeduplicator<T> {
  private dedup: RequestDeduplicator<T>;
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private ttl: number;
  private maxSize: number;

  constructor(options: { ttl?: number; maxSize?: number } = {}) {
    this.ttl = options.ttl ?? 60000;
    this.maxSize = options.maxSize ?? 1000;
    this.dedup = new RequestDeduplicator<T>(this.ttl);

    // Cleanup expired entries periodically
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 60000);
    }
  }

  /**
   * Get value from cache or fetch with deduplication
   */
  async get(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt) {
      return cached.value;
    }

    // Deduplicate the fetch
    const value = await this.dedup.dedupe(key, fn);

    // Cache the result
    this.set(key, value);

    return value;
  }

  /**
   * Manually set a cache entry
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.ttl),
    });
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.dedup.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    pending: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      pending: this.dedup.getPendingCount(),
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Global instances for common use cases
export const marketDataCache = new CachedDeduplicator<unknown>({
  ttl: 30000, // 30 seconds for market data
  maxSize: 500,
});

export const leaderboardCache = new CachedDeduplicator<unknown>({
  ttl: 60000, // 1 minute for leaderboard
  maxSize: 100,
});

export const contractReadCache = new CachedDeduplicator<unknown>({
  ttl: 15000, // 15 seconds for contract reads
  maxSize: 200,
});
