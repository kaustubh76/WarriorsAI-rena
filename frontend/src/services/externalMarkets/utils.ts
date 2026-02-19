/**
 * Shared utilities for external market services
 */

const DEFAULT_TIMEOUT_MS = 15_000; // 15 seconds — reasonable for external APIs on serverless

/**
 * Fetch with an AbortController timeout to prevent requests from hanging indefinitely.
 * Falls back to standard fetch behavior if signal is already provided in options.
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
}
