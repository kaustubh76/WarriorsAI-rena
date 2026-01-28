/**
 * Composable Middleware Utilities for API Routes
 * Chain multiple middleware functions together
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware handler function type
 */
export type MiddlewareHandler = (
  request: NextRequest,
  context?: RequestContext
) => Promise<NextResponse | void> | NextResponse | void;

/**
 * Request context passed between middleware
 */
export interface RequestContext {
  [key: string]: unknown;
}

/**
 * Compose multiple middleware functions into a single handler
 *
 * @example
 * const handler = composeMiddleware([
 *   withLogging,
 *   withAuth,
 *   withRateLimit,
 *   async (req, ctx) => {
 *     return NextResponse.json({ data: 'success' });
 *   },
 * ]);
 *
 * export const GET = handler;
 */
export function composeMiddleware(
  middlewares: MiddlewareHandler[]
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const context: RequestContext = {};

    for (const middleware of middlewares) {
      const result = await middleware(request, context);

      // If middleware returns a response, short-circuit and return it
      if (result instanceof NextResponse) {
        return result;
      }
    }

    // If no middleware returned a response, return 404
    return NextResponse.json(
      { error: 'No handler found' },
      { status: 404 }
    );
  };
}

/**
 * Create a middleware that only runs for specific HTTP methods
 *
 * @example
 * const handler = composeMiddleware([
 *   forMethods(['POST', 'PUT'], withAuth),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ]);
 */
export function forMethods(
  methods: string[],
  middleware: MiddlewareHandler
): MiddlewareHandler {
  return async (request, context) => {
    if (methods.includes(request.method)) {
      return middleware(request, context);
    }
  };
}

/**
 * Middleware: Add CORS headers
 *
 * @example
 * const handler = composeMiddleware([
 *   withCORS({ origins: ['https://example.com'] }),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ]);
 */
export function withCORS(options?: {
  origins?: string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
}): MiddlewareHandler {
  const {
    origins = ['*'],
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'Authorization'],
    credentials = false,
  } = options || {};

  return async (request, context) => {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origins.join(', '),
          'Access-Control-Allow-Methods': methods.join(', '),
          'Access-Control-Allow-Headers': headers.join(', '),
          ...(credentials && { 'Access-Control-Allow-Credentials': 'true' }),
        },
      });
    }

    // Continue to next middleware
    return undefined;
  };
}

/**
 * Middleware: Logging
 *
 * @example
 * const handler = composeMiddleware([
 *   withLogging(),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ]);
 */
export function withLogging(options?: {
  logBody?: boolean;
  logHeaders?: boolean;
}): MiddlewareHandler {
  const { logBody = false, logHeaders = false } = options || {};

  return async (request, context) => {
    const start = Date.now();
    const { method, url } = request;

    console.log(`[API] ${method} ${url}`);

    if (logHeaders) {
      console.log('[Headers]', Object.fromEntries(request.headers.entries()));
    }

    if (logBody && request.body) {
      try {
        const body = await request.clone().json();
        console.log('[Body]', body);
      } catch {
        // Body not JSON or already consumed
      }
    }

    // Store start time in context for response logging
    if (context) {
      context.startTime = start;
    }
  };
}

/**
 * Middleware: Error handling
 *
 * @example
 * const handler = composeMiddleware([
 *   withErrorHandler(),
 *   async (req) => {
 *     throw new Error('Something went wrong');
 *   },
 * ]);
 */
export function withErrorHandler(options?: {
  logErrors?: boolean;
  includeStack?: boolean;
}): MiddlewareHandler {
  const { logErrors = true, includeStack = false } = options || {};

  return async (request, context) => {
    try {
      // Continue to next middleware
      return undefined;
    } catch (error) {
      if (logErrors) {
        console.error('[API Error]', error);
      }

      const message = error instanceof Error ? error.message : 'Internal server error';
      const stack = error instanceof Error && includeStack ? error.stack : undefined;

      return NextResponse.json(
        {
          error: message,
          ...(stack && { stack }),
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware: Request validation
 *
 * @example
 * const handler = composeMiddleware([
 *   withValidation({
 *     body: (body) => {
 *       if (!body.email) throw new Error('Email required');
 *     },
 *   }),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ]);
 */
export function withValidation(options: {
  body?: (body: unknown) => void | Promise<void>;
  query?: (params: URLSearchParams) => void | Promise<void>;
  headers?: (headers: Headers) => void | Promise<void>;
}): MiddlewareHandler {
  return async (request, context) => {
    try {
      // Validate body
      if (options.body && request.body) {
        const body = await request.clone().json();
        await options.body(body);
        if (context) context.body = body;
      }

      // Validate query params
      if (options.query) {
        const { searchParams } = new URL(request.url);
        await options.query(searchParams);
        if (context) context.query = searchParams;
      }

      // Validate headers
      if (options.headers) {
        await options.headers(request.headers);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }
  };
}

/**
 * Middleware: Method guard
 *
 * @example
 * const handler = composeMiddleware([
 *   onlyMethods(['GET', 'POST']),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ]);
 */
export function onlyMethods(allowedMethods: string[]): MiddlewareHandler {
  return async (request) => {
    if (!allowedMethods.includes(request.method)) {
      return NextResponse.json(
        { error: `Method ${request.method} not allowed` },
        {
          status: 405,
          headers: { Allow: allowedMethods.join(', ') },
        }
      );
    }
  };
}

/**
 * Middleware: Response caching
 *
 * @example
 * const handler = composeMiddleware([
 *   withCache({ maxAge: 60 }),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ]);
 */
export function withCache(options: {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
}): MiddlewareHandler {
  const { maxAge = 0, sMaxAge, staleWhileRevalidate } = options;

  return async (request, context) => {
    if (context) {
      const cacheControl = [
        maxAge > 0 ? `max-age=${maxAge}` : 'no-cache',
        sMaxAge ? `s-maxage=${sMaxAge}` : null,
        staleWhileRevalidate ? `stale-while-revalidate=${staleWhileRevalidate}` : null,
      ].filter(Boolean).join(', ');

      context.cacheControl = cacheControl;
    }
  };
}

/**
 * Middleware: Add request ID
 *
 * @example
 * const handler = composeMiddleware([
 *   withRequestId(),
 *   async (req, ctx) => {
 *     console.log('Request ID:', ctx.requestId);
 *     return NextResponse.json({ data: 'ok' });
 *   },
 * ]);
 */
export function withRequestId(): MiddlewareHandler {
  return async (request, context) => {
    const requestId = crypto.randomUUID();
    if (context) {
      context.requestId = requestId;
    }
  };
}

/**
 * Middleware: Timeout
 *
 * @example
 * const handler = composeMiddleware([
 *   withTimeout(5000), // 5 second timeout
 *   async (req) => {
 *     await longRunningOperation();
 *     return NextResponse.json({ data: 'ok' });
 *   },
 * ]);
 */
export function withTimeout(ms: number): MiddlewareHandler {
  return async (request, context) => {
    const timeoutPromise = new Promise<NextResponse>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), ms);
    });

    if (context) {
      context.timeoutPromise = timeoutPromise;
    }
  };
}

/**
 * Create a route handler with typed response
 *
 * @example
 * const handler = createHandler<{ data: string }>({
 *   GET: async (req) => {
 *     return { data: 'Hello' };
 *   },
 *   POST: async (req) => {
 *     const body = await req.json();
 *     return { data: 'Created' };
 *   },
 * });
 */
export function createHandler<T = unknown>(handlers: {
  GET?: (request: NextRequest, context?: RequestContext) => Promise<T> | T;
  POST?: (request: NextRequest, context?: RequestContext) => Promise<T> | T;
  PUT?: (request: NextRequest, context?: RequestContext) => Promise<T> | T;
  PATCH?: (request: NextRequest, context?: RequestContext) => Promise<T> | T;
  DELETE?: (request: NextRequest, context?: RequestContext) => Promise<T> | T;
  middleware?: MiddlewareHandler[];
}) {
  const { middleware = [], ...methods } = handlers;

  const wrappedHandlers = Object.entries(methods).reduce((acc, [method, handler]) => {
    acc[method] = composeMiddleware([
      ...middleware,
      async (req, ctx) => {
        const result = await handler(req, ctx);
        return NextResponse.json(result);
      },
    ]);
    return acc;
  }, {} as Record<string, (request: NextRequest) => Promise<NextResponse>>);

  return wrappedHandlers;
}

/**
 * Middleware presets for common patterns
 */
export const presets = {
  /**
   * Standard API route with logging and error handling
   */
  api: [
    withRequestId(),
    withLogging(),
    withErrorHandler(),
  ],

  /**
   * Public API route with CORS
   */
  publicApi: [
    withRequestId(),
    withCORS(),
    withLogging(),
    withErrorHandler(),
  ],

  /**
   * Cached GET endpoint
   */
  cachedGet: [
    withRequestId(),
    onlyMethods(['GET']),
    withCache({ maxAge: 60, staleWhileRevalidate: 120 }),
    withLogging(),
    withErrorHandler(),
  ],
};
