/**
 * Retry Utilities for API Calls
 * Provides exponential backoff retry logic for external API calls
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Jitter factor 0-1 to randomize delay (default: 0.1) */
  jitter?: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

/**
 * Default retry condition - retry on network errors and 5xx responses
 */
export function defaultIsRetryable(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('etimedout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up')
  ) {
    return true;
  }

  // HTTP 5xx errors and rate limits
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('429') ||
    message.includes('rate limit')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Apply cap
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (randomize by +/- jitter factor)
  const jitterAmount = cappedDelay * jitter * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitterAmount);
}

/**
 * Execute a function with retry logic
 *
 * @example
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = 0.1,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      // Check if we should retry
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, baseDelay, maxDelay, jitter);

      // Notify about retry
      onRetry?.(attempt + 1, error, delay);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Retry-enabled fetch wrapper
 *
 * @example
 * const response = await retryFetch('https://api.example.com/data', {
 *   method: 'GET',
 * }, { maxRetries: 3 });
 */
export async function retryFetch(
  url: string,
  init?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, init);

    // Throw on 5xx errors to trigger retry
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Throw on rate limit to trigger retry
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    return response;
  }, retryOptions);
}

/**
 * Retry presets for common scenarios
 */
export const RetryPresets = {
  /**
   * Quick retries for fast APIs (3 attempts, 500ms base)
   */
  fast: {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 5000,
  },

  /**
   * Standard retries for most APIs (3 attempts, 1s base)
   */
  standard: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 15000,
  },

  /**
   * Patient retries for slow/flaky APIs (5 attempts, 2s base)
   */
  patient: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
  },

  /**
   * Aggressive retries for critical operations (7 attempts, 1s base)
   */
  critical: {
    maxRetries: 7,
    baseDelay: 1000,
    maxDelay: 60000,
  },
} as const;
