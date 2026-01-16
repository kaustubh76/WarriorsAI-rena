/**
 * Adaptive Rate Limiter
 * Rate limiting that adapts based on API response headers
 *
 * Features:
 * - Reads rate limit info from response headers
 * - Queue-based request management
 * - Automatic waiting when limits are reached
 * - Monitoring integration
 */

export interface RateLimitState {
  remaining: number;
  resetAt: number;
  limit: number;
}

interface QueueItem {
  resolve: () => void;
  reject: (err: Error) => void;
}

export class AdaptiveRateLimiter {
  private state: RateLimitState;
  private queue: QueueItem[] = [];
  private processing = false;
  private name: string;

  constructor(
    name: string,
    private defaultLimit: number = 100,
    private defaultWindowMs: number = 60000
  ) {
    this.name = name;
    this.state = {
      remaining: defaultLimit,
      resetAt: Date.now() + defaultWindowMs,
      limit: defaultLimit,
    };
  }

  /**
   * Update state from response headers
   * Supports various header formats used by Polymarket and Kalshi
   */
  updateFromHeaders(headers: Headers): void {
    // Try various header naming conventions
    const remaining =
      headers.get('x-ratelimit-remaining') ||
      headers.get('ratelimit-remaining') ||
      headers.get('x-rate-limit-remaining');

    const reset =
      headers.get('x-ratelimit-reset') ||
      headers.get('ratelimit-reset') ||
      headers.get('x-rate-limit-reset');

    const limit =
      headers.get('x-ratelimit-limit') ||
      headers.get('ratelimit-limit') ||
      headers.get('x-rate-limit-limit');

    if (remaining !== null) {
      this.state.remaining = parseInt(remaining, 10);
    }

    if (reset !== null) {
      const resetValue = parseInt(reset, 10);
      // Reset can be Unix timestamp (seconds or ms) or seconds until reset
      if (resetValue > 1e12) {
        // Already Unix ms
        this.state.resetAt = resetValue;
      } else if (resetValue > 1e9) {
        // Unix seconds, convert to ms
        this.state.resetAt = resetValue * 1000;
      } else {
        // Seconds until reset
        this.state.resetAt = Date.now() + resetValue * 1000;
      }
    }

    if (limit !== null) {
      this.state.limit = parseInt(limit, 10);
    }

    // Log warning if approaching limit
    if (this.state.remaining < this.state.limit * 0.2) {
      console.warn(
        `[${this.name}] Rate limit low: ${this.state.remaining}/${this.state.limit}`
      );
    }
  }

  /**
   * Acquire permission to make a request
   * Will queue and wait if rate limit is exhausted
   */
  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();

      // Reset window if expired
      if (now >= this.state.resetAt) {
        this.state.remaining = this.state.limit;
        this.state.resetAt = now + this.defaultWindowMs;
      }

      // Check if we have quota
      if (this.state.remaining > 0) {
        this.state.remaining--;
        const item = this.queue.shift();
        item?.resolve();
      } else {
        // Wait until reset
        const waitTime = Math.max(0, this.state.resetAt - now);
        console.log(
          `[${this.name}] Rate limit reached. Waiting ${waitTime}ms for reset`
        );
        await new Promise((r) => setTimeout(r, waitTime));
      }
    }

    this.processing = false;
  }

  /**
   * Get current state for monitoring
   */
  getState(): RateLimitState {
    return { ...this.state };
  }

  /**
   * Check if request is likely to succeed without waiting
   */
  canMakeRequest(): boolean {
    if (Date.now() >= this.state.resetAt) return true;
    return this.state.remaining > 0;
  }

  /**
   * Get estimated wait time if rate limited
   */
  getEstimatedWaitTime(): number {
    if (this.canMakeRequest()) return 0;
    return Math.max(0, this.state.resetAt - Date.now());
  }

  /**
   * Reset the rate limiter state
   * Useful for testing or after authentication changes
   */
  reset(): void {
    this.state = {
      remaining: this.defaultLimit,
      resetAt: Date.now() + this.defaultWindowMs,
      limit: this.defaultLimit,
    };
    this.queue = [];
    this.processing = false;
  }
}

// Pre-configured instances for external market APIs
export const polymarketAdaptiveRateLimiter = new AdaptiveRateLimiter(
  'Polymarket',
  100, // 100 requests
  60000 // per minute
);

export const kalshiAdaptiveRateLimiter = new AdaptiveRateLimiter(
  'Kalshi',
  50, // 50 requests (more conservative for authenticated endpoints)
  60000 // per minute
);

export const zeroGAdaptiveRateLimiter = new AdaptiveRateLimiter(
  '0G',
  30, // 30 requests
  60000 // per minute
);

export const opinionAdaptiveRateLimiter = new AdaptiveRateLimiter(
  'Opinion',
  50, // 50 requests (conservative estimate)
  60000 // per minute
);
