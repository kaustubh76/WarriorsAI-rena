/**
 * Rate Limiter and Circuit Breaker Utilities
 * For resilient external API calls to Polymarket and Kalshi
 */

// ============================================
// RATE LIMITER
// ============================================

interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private requests: number[] = [];
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  async acquire(): Promise<void> {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.config.windowMs
    );

    if (this.requests.length >= this.config.maxRequests) {
      // Wait until the oldest request expires
      const oldestRequest = this.requests[0];
      const waitTime = this.config.windowMs - (now - oldestRequest);

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      // Re-check after waiting
      return this.acquire();
    }

    this.requests.push(now);
  }

  getRemainingRequests(): number {
    const now = Date.now();
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.config.windowMs
    );
    return Math.max(0, this.config.maxRequests - this.requests.length);
  }
}

// ============================================
// CIRCUIT BREAKER
// ============================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailure: number = 0;
  private halfOpenSuccesses = 0;
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.name = name;
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.config.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenSuccesses = 0;
        console.log(`[CircuitBreaker:${this.name}] State changed to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN - service unavailable`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenRequests) {
        this.state = 'CLOSED';
        this.failures = 0;
        console.log(`[CircuitBreaker:${this.name}] State changed to CLOSED`);
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      console.log(`[CircuitBreaker:${this.name}] State changed to OPEN after ${this.failures} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.halfOpenSuccesses = 0;
  }
}

// ============================================
// RETRY WITH EXPONENTIAL BACKOFF
// ============================================

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === mergedConfig.maxRetries) break;

      const delay = Math.min(
        mergedConfig.baseDelay * Math.pow(mergedConfig.backoffMultiplier, attempt),
        mergedConfig.maxDelay
      );

      console.log(`Retry attempt ${attempt + 1}/${mergedConfig.maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// ============================================
// PRE-CONFIGURED INSTANCES
// ============================================

// Polymarket rate limiter - 100 requests per minute
export const polymarketRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
});

// Kalshi rate limiter - 100 requests per minute
export const kalshiRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
});

// Circuit breakers
export const polymarketCircuit = new CircuitBreaker('polymarket', {
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenRequests: 3,
});

export const kalshiCircuit = new CircuitBreaker('kalshi', {
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenRequests: 3,
});

export const zeroGCircuit = new CircuitBreaker('0g', {
  failureThreshold: 3,
  resetTimeout: 60000,
  halfOpenRequests: 2,
});

// Opinion rate limiter - 50 requests per minute (conservative estimate)
export const opinionRateLimiter = new RateLimiter({
  maxRequests: 50,
  windowMs: 60000,
});

// Opinion circuit breaker
export const opinionCircuit = new CircuitBreaker('opinion', {
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenRequests: 3,
});

// ============================================
// EXPORTS
// ============================================

export {
  RateLimiter,
  CircuitBreaker,
  withRetry,
  type RateLimiterConfig,
  type CircuitBreakerConfig,
  type RetryConfig,
  type CircuitState,
};
