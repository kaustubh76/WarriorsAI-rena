/**
 * Shared test utilities for API middleware tests.
 */
import { NextRequest } from 'next/server';

/**
 * Create a NextRequest for testing.
 * NextRequest requires a full URL string.
 */
export function createTestRequest(
  method: string = 'GET',
  options: {
    url?: string;
    headers?: Record<string, string>;
    body?: unknown;
    ip?: string;
  } = {}
): NextRequest {
  const url = options.url || 'http://localhost:3000/api/test';
  const headers = new Headers(options.headers || {});

  // Set IP via standard header if provided
  if (options.ip && !headers.has('x-forwarded-for')) {
    headers.set('x-forwarded-for', options.ip);
  }

  const init: RequestInit = { method, headers };

  if (options.body && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(options.body);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return new NextRequest(url, init);
}

/**
 * Parse JSON body from a Response for assertions.
 */
export async function getResponseBody<T = unknown>(
  response: Response
): Promise<T> {
  return response.json() as Promise<T>;
}
