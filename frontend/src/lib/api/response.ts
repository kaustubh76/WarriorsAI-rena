/**
 * API Response Utilities
 * Provides helper functions for creating consistent API responses with proper headers
 */

import { NextResponse } from 'next/server';

export interface ResponseOptions {
  /** HTTP status code (default: 200) */
  status?: number;
  /** Cache-Control header value */
  cache?: CachePreset | string;
  /** Include compression hint headers */
  compress?: boolean;
  /** Custom headers to include */
  headers?: Record<string, string>;
  /** Request ID for tracing */
  requestId?: string;
}

/**
 * Predefined cache control presets
 */
export type CachePreset = 'none' | 'short' | 'medium' | 'long' | 'immutable';

const cachePresets: Record<CachePreset, string> = {
  none: 'no-store, max-age=0',
  short: 'public, max-age=30, stale-while-revalidate=15',
  medium: 'public, max-age=60, stale-while-revalidate=30',
  long: 'public, max-age=300, stale-while-revalidate=60',
  immutable: 'public, max-age=31536000, immutable',
};

/**
 * Get cache control value from preset or custom string
 */
function getCacheControl(cache: CachePreset | string): string {
  return cachePresets[cache as CachePreset] || cache;
}

/**
 * Create a JSON response with consistent headers
 *
 * @example
 * return createResponse({ data: results }, {
 *   cache: 'short',
 *   compress: true,
 *   requestId: logger.requestId,
 * });
 */
export function createResponse<T>(
  data: T,
  options: ResponseOptions = {}
): NextResponse<T> {
  const {
    status = 200,
    cache = 'none',
    compress = true,
    headers = {},
    requestId,
  } = options;

  const response = NextResponse.json(data, { status });

  // Set cache control
  response.headers.set('Cache-Control', getCacheControl(cache));

  // Add compression hint headers (actual compression is handled by the web server/CDN)
  if (compress) {
    response.headers.set('Vary', 'Accept-Encoding');
    // Content-Type for JSON is automatically set by NextResponse.json
  }

  // Add request ID for tracing
  if (requestId) {
    response.headers.set('X-Request-ID', requestId);
  }

  // Add timing header for performance monitoring
  response.headers.set('X-Response-Time', `${Date.now()}`);

  // Add custom headers
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

/**
 * Create a success response
 */
export function successResponse<T extends object>(
  data: T,
  options: ResponseOptions = {}
): NextResponse<T & { success: true }> {
  return createResponse({ success: true as const, ...data }, options);
}

/**
 * Create a paginated response with metadata
 */
export function paginatedResponse<T>(
  items: T[],
  pagination: {
    total: number;
    limit: number;
    offset: number;
  },
  options: ResponseOptions = {}
): NextResponse {
  const { total, limit, offset } = pagination;
  const hasMore = offset + items.length < total;

  return createResponse(
    {
      success: true,
      data: items,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + items.length : null,
      },
    },
    {
      cache: 'short',
      ...options,
    }
  );
}

/**
 * Create a streaming response for large data sets
 * Note: This creates a standard JSON response but signals that streaming is preferred
 */
export function streamableResponse<T>(
  data: T,
  options: ResponseOptions = {}
): NextResponse<T> {
  return createResponse(data, {
    ...options,
    headers: {
      ...options.headers,
      'X-Accel-Buffering': 'no', // Disable nginx buffering for streaming
    },
  });
}

/**
 * Response presets for common API patterns
 */
export const ResponsePresets = {
  /**
   * For real-time data that shouldn't be cached
   */
  realtime: {
    cache: 'none' as const,
    compress: true,
  },

  /**
   * For data that changes frequently (every 30s)
   */
  dynamic: {
    cache: 'short' as const,
    compress: true,
  },

  /**
   * For data that changes occasionally (every minute)
   */
  standard: {
    cache: 'medium' as const,
    compress: true,
  },

  /**
   * For data that rarely changes (every 5 minutes)
   */
  stable: {
    cache: 'long' as const,
    compress: true,
  },

  /**
   * For immutable data (contract ABIs, static configs)
   */
  immutable: {
    cache: 'immutable' as const,
    compress: true,
  },
} as const;
