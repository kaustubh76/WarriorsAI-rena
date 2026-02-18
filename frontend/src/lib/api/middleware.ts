/**
 * Composable Middleware Utilities for API Routes
 *
 * Chain multiple middleware functions together with built-in error handling.
 * Error handling is automatic — composeMiddleware catches all thrown errors
 * and delegates to handleAPIError for consistent responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, getRateLimitHeaders, checkRateLimit, getRateLimitKey, RateLimitPresets } from './rateLimit';
import { APIError, handleAPIError } from './errorHandler';
import { verifyCronAuth, cronAuthErrorResponse } from './cronAuth';

/**
 * Middleware handler function type
 */
export type MiddlewareHandler = (
  request: NextRequest,
  context: RequestContext
) => Promise<NextResponse | void> | NextResponse | void;

/**
 * Request context passed between middleware.
 * Includes optional `params` for dynamic route segments (e.g. [id]).
 */
export interface RequestContext {
  params?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Compose multiple middleware functions into a single Next.js route handler.
 *
 * Error handling is built-in: any error thrown by middleware or the final handler
 * is caught and passed to handleAPIError for consistent responses (APIError,
 * Prisma errors, standard errors are all handled).
 *
 * @example
 * export const GET = composeMiddleware([
 *   withRateLimit({ prefix: 'my-route', ...RateLimitPresets.apiQueries }),
 *   async (req, ctx) => {
 *     const data = await fetchData();
 *     return NextResponse.json({ success: true, data });
 *   },
 * ], { errorContext: 'API:MyRoute:GET' });
 */
export function composeMiddleware(
  middlewares: MiddlewareHandler[],
  options?: { errorContext?: string }
): (request: NextRequest, routeContext?: { params: Record<string, string> }) => Promise<NextResponse> {
  return async (request: NextRequest, routeContext?: { params: Record<string, string> }) => {
    const context: RequestContext = {};
    // Forward Next.js dynamic route params (e.g. [id]) into the middleware context
    if (routeContext?.params) {
      context.params = routeContext.params;
    }

    try {
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
    } catch (error) {
      return handleAPIError(error, options?.errorContext || 'API:Unknown');
    }
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

  return async (request) => {
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
    context.startTime = start;
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
        context.body = body;
      }

      // Validate query params
      if (options.query) {
        const { searchParams } = new URL(request.url);
        await options.query(searchParams);
        context.query = searchParams;
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
 * Sets cacheControl on context — read it in your handler to apply headers.
 *
 * @example
 * const handler = composeMiddleware([
 *   withCache({ maxAge: 60 }),
 *   async (req, ctx) => {
 *     const response = NextResponse.json({ data: 'ok' });
 *     if (ctx.cacheControl) response.headers.set('Cache-Control', ctx.cacheControl as string);
 *     return response;
 *   },
 * ]);
 */
export function withCache(options: {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
}): MiddlewareHandler {
  const { maxAge = 0, sMaxAge, staleWhileRevalidate } = options;

  return async (_request, context) => {
    const cacheControl = [
      maxAge > 0 ? `max-age=${maxAge}` : 'no-cache',
      sMaxAge ? `s-maxage=${sMaxAge}` : null,
      staleWhileRevalidate ? `stale-while-revalidate=${staleWhileRevalidate}` : null,
    ].filter(Boolean).join(', ');

    context.cacheControl = cacheControl;
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
  return async (_request, context) => {
    context.requestId = crypto.randomUUID();
  };
}

/**
 * Middleware: Timeout (sets up a timeout promise on context)
 * Note: The handler must use Promise.race with ctx.timeoutPromise to enforce the timeout.
 */
export function withTimeout(ms: number): MiddlewareHandler {
  return async (_request, context) => {
    const timeoutPromise = new Promise<NextResponse>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), ms);
    });

    context.timeoutPromise = timeoutPromise;
  };
}

/**
 * Create a route handler with typed response and per-method middleware.
 *
 * @example
 * const { GET, POST } = createHandler({
 *   middleware: [withRateLimit({ prefix: 'metrics', ...RateLimitPresets.moderateReads })],
 *   GET: async (req) => ({ success: true, data: await fetchData() }),
 *   POST: async (req) => ({ success: true }),
 * });
 * export { GET, POST };
 */
export function createHandler<T = unknown>(handlers: {
  GET?: (request: NextRequest, context: RequestContext) => Promise<T> | T;
  POST?: (request: NextRequest, context: RequestContext) => Promise<T> | T;
  PUT?: (request: NextRequest, context: RequestContext) => Promise<T> | T;
  PATCH?: (request: NextRequest, context: RequestContext) => Promise<T> | T;
  DELETE?: (request: NextRequest, context: RequestContext) => Promise<T> | T;
  middleware?: MiddlewareHandler[];
  errorContext?: string;
}) {
  const { middleware = [], errorContext, ...methods } = handlers;

  const wrappedHandlers = Object.entries(methods).reduce((acc, [method, handler]) => {
    acc[method] = composeMiddleware([
      ...middleware,
      async (req, ctx) => {
        const result = await handler(req, ctx);
        return NextResponse.json(result);
      },
    ], { errorContext: errorContext ? `${errorContext}:${method}` : undefined });
    return acc;
  }, {} as Record<string, (request: NextRequest) => Promise<NextResponse>>);

  return wrappedHandlers;
}

/**
 * Middleware: Rate Limiting
 *
 * Wraps the rate limiting module as a composable middleware.
 * Automatically returns 429 responses with proper headers.
 *
 * @example
 * const handler = composeMiddleware([
 *   withRateLimit({ prefix: 'my-route', ...RateLimitPresets.apiQueries }),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ]);
 */
export function withRateLimit(options: {
  prefix: string;
  maxRequests?: number;
  windowMs?: number;
  algorithm?: 'sliding-window' | 'token-bucket';
  refillRate?: number;
  maxTokens?: number;
}): MiddlewareHandler {
  return async (request) => {
    try {
      applyRateLimit(request, options);
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 429) {
        // Extract rate limit info for headers
        const key = getRateLimitKey(request, options.prefix);
        const maxRequests = options.maxTokens || options.maxRequests || 10;
        const result = checkRateLimit(key, maxRequests, options.windowMs || 60000, {
          algorithm: options.algorithm,
          refillRate: options.refillRate,
        });
        const headers = getRateLimitHeaders({
          limit: result.limit,
          remaining: result.remaining,
          resetIn: result.resetIn,
        });

        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            details: error.details,
          },
          { status: 429, headers }
        );
      }
      throw error;
    }
  };
}

/**
 * Middleware: Cron Job Authentication
 *
 * Verifies CRON_SECRET Bearer token. Returns 401/500 on failure.
 *
 * @example
 * export const POST = composeMiddleware([
 *   withCronAuth(),
 *   withRateLimit({ prefix: 'cron-sync', ...RateLimitPresets.cronJobs }),
 *   async (req) => { ... },
 * ], { errorContext: 'API:Cron:SyncMarkets:POST' });
 */
export function withCronAuth(options?: { allowDevBypass?: boolean }): MiddlewareHandler {
  return async (request) => {
    const auth = verifyCronAuth(request, options);
    if (!auth.authorized) {
      return cronAuthErrorResponse(auth);
    }
  };
}

/**
 * Middleware: Internal API Authentication
 *
 * Checks x-internal-key header or localhost access.
 *
 * @example
 * export const GET = composeMiddleware([
 *   withInternalAuth(),
 *   async (req) => NextResponse.json({ data: 'ok' }),
 * ], { errorContext: 'API:Internal:Metrics:GET' });
 */
export function withInternalAuth(): MiddlewareHandler {
  return async (request) => {
    const internalKey = request.headers.get('x-internal-key');
    const isLocalhost = request.headers.get('host')?.includes('localhost');
    if (!isLocalhost && internalKey !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  };
}

/**
 * Middleware presets for common route patterns.
 *
 * Usage: spread into composeMiddleware array, then add your handler.
 *
 * @example
 * export const GET = composeMiddleware([
 *   ...presets.api('my-route', RateLimitPresets.apiQueries),
 *   async (req, ctx) => NextResponse.json({ data: 'ok' }),
 * ], { errorContext: 'API:MyRoute:GET' });
 */
export const presets = {
  /** Standard API: rate limiting + request ID */
  api: (prefix: string, rateLimitPreset: { maxRequests: number; windowMs: number }) => [
    withRateLimit({ prefix, ...rateLimitPreset }),
  ],

  /** Public API with CORS: CORS + rate limiting + request ID */
  publicApi: (prefix: string, rateLimitPreset: { maxRequests: number; windowMs: number }) => [
    withCORS(),
    withRateLimit({ prefix, ...rateLimitPreset }),
  ],

  /** Cron job: auth + rate limiting */
  cron: (prefix: string, options?: { allowDevBypass?: boolean }) => [
    withCronAuth(options),
    withRateLimit({ prefix, ...RateLimitPresets.cronJobs }),
  ],

  /** Internal admin: auth + rate limiting */
  internal: (prefix: string, rateLimitPreset?: { maxRequests: number; windowMs: number }) => [
    withInternalAuth(),
    withRateLimit({ prefix, ...(rateLimitPreset || RateLimitPresets.moderateReads) }),
  ],
};
