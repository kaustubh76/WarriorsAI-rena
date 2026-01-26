/**
 * Fetch utility with timeout support
 * Prevents indefinite loading states when network requests hang
 */

export class FetchTimeoutError extends Error {
  public readonly url: string;
  public readonly timeout: number;

  constructor(url: string, timeout: number) {
    super(`Request to ${url} timed out after ${timeout}ms`);
    this.name = 'FetchTimeoutError';
    this.url = url;
    this.timeout = timeout;
  }
}

export class FetchAbortedError extends Error {
  constructor(url: string) {
    super(`Request to ${url} was aborted`);
    this.name = 'FetchAbortedError';
  }
}

/**
 * Fetch wrapper with automatic timeout
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options (can include an existing AbortSignal)
 * @param timeout - Timeout in milliseconds (default: 15000ms / 15 seconds)
 * @returns Promise<Response>
 * @throws FetchTimeoutError if request times out
 * @throws FetchAbortedError if request was aborted by user
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // If user provided their own signal, combine with our timeout signal
  const existingSignal = options.signal;
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        // Check if it was our timeout or user abort
        if (existingSignal?.aborted) {
          throw new FetchAbortedError(url);
        }
        throw new FetchTimeoutError(url, timeout);
      }
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * JSON fetch with timeout - convenience wrapper for JSON APIs
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param timeout - Timeout in milliseconds (default: 15000ms)
 * @returns Promise<T> - Parsed JSON response
 */
export async function fetchJSONWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeout: number = 15000
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }, timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): error is FetchTimeoutError {
  return error instanceof FetchTimeoutError;
}

/**
 * Check if an error is an abort error
 */
export function isAbortError(error: unknown): error is FetchAbortedError {
  return error instanceof FetchAbortedError ||
    (error instanceof Error && error.name === 'AbortError');
}

/**
 * Default timeout values for different operation types
 */
export const TimeoutDefaults = {
  /** Quick read operations (5 seconds) */
  quick: 5000,
  /** Standard API calls (15 seconds) */
  standard: 15000,
  /** Heavy operations like file uploads (30 seconds) */
  heavy: 30000,
  /** Very long operations like AI inference (60 seconds) */
  long: 60000,
} as const;
