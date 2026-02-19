import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  composeMiddleware,
  forMethods,
  withCORS,
  withLogging,
  withValidation,
  onlyMethods,
  withCache,
  withRequestId,
  withRateLimit,
  withInternalAuth,
  type MiddlewareHandler,
  type RequestContext,
} from '../middleware';
import { RateLimitPresets } from '../rateLimit';

// ---------- helpers ----------

function createTestRequest(
  method: string = 'GET',
  options: { url?: string; headers?: Record<string, string>; body?: unknown } = {}
): NextRequest {
  const url = options.url || 'http://localhost:3000/api/test';
  const headers = new Headers(options.headers || {});
  const init: RequestInit = { method, headers };

  if (options.body && method !== 'GET') {
    init.body = JSON.stringify(options.body);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return new NextRequest(url, init);
}

async function getBody(response: Response) {
  return response.json();
}

let testCounter = 0;
function uniquePrefix(base: string): string {
  return `mw-${base}-${++testCounter}-${Date.now()}`;
}

// ---------- composeMiddleware ----------
describe('composeMiddleware', () => {
  it('should execute middleware in order', async () => {
    const order: number[] = [];

    const handler = composeMiddleware([
      async () => { order.push(1); },
      async () => { order.push(2); },
      async () => {
        order.push(3);
        return NextResponse.json({ ok: true });
      },
    ]);

    await handler(createTestRequest());
    expect(order).toEqual([1, 2, 3]);
  });

  it('should short-circuit when middleware returns a response', async () => {
    const order: number[] = [];

    const handler = composeMiddleware([
      async () => {
        order.push(1);
        return NextResponse.json({ early: true }, { status: 200 });
      },
      async () => {
        order.push(2);
        return NextResponse.json({ late: true });
      },
    ]);

    const res = await handler(createTestRequest());
    expect(order).toEqual([1]);
    const body = await getBody(res);
    expect(body.early).toBe(true);
  });

  it('should return 404 if no middleware returns a response', async () => {
    const handler = composeMiddleware([
      async () => { /* no-op */ },
    ]);

    const res = await handler(createTestRequest());
    expect(res.status).toBe(404);
  });

  it('should catch errors and delegate to handleAPIError', async () => {
    const handler = composeMiddleware([
      async () => {
        throw new Error('test error');
      },
    ], { errorContext: 'TestContext' });

    const res = await handler(createTestRequest());
    expect(res.status).toBe(500);
  });

  it('should pass route params into context', async () => {
    let receivedParams: Record<string, string> | undefined;

    const handler = composeMiddleware([
      async (_req, ctx) => {
        receivedParams = ctx.params;
        return NextResponse.json({ ok: true });
      },
    ]);

    await handler(createTestRequest(), { params: { id: '42' } });
    expect(receivedParams).toEqual({ id: '42' });
  });

  it('should share context between middleware', async () => {
    const handler = composeMiddleware([
      async (_req, ctx) => {
        ctx.userId = 'user-123';
      },
      async (_req, ctx) => {
        return NextResponse.json({ userId: ctx.userId });
      },
    ]);

    const res = await handler(createTestRequest());
    const body = await getBody(res);
    expect(body.userId).toBe('user-123');
  });
});

// ---------- forMethods ----------
describe('forMethods', () => {
  it('should run middleware for matching method', async () => {
    let ran = false;
    const middleware = forMethods(['POST'], async () => { ran = true; });

    await middleware(createTestRequest('POST'), {});
    expect(ran).toBe(true);
  });

  it('should skip middleware for non-matching method', async () => {
    let ran = false;
    const middleware = forMethods(['POST'], async () => { ran = true; });

    await middleware(createTestRequest('GET'), {});
    expect(ran).toBe(false);
  });
});

// ---------- withCORS ----------
describe('withCORS', () => {
  it('should return 204 for OPTIONS preflight', async () => {
    const middleware = withCORS();
    const result = await middleware(createTestRequest('OPTIONS'), {});
    expect(result).toBeInstanceOf(NextResponse);
    expect(result!.status).toBe(204);
  });

  it('should include CORS headers in preflight response', async () => {
    const middleware = withCORS({
      origins: ['https://example.com'],
      methods: ['GET', 'POST'],
    });
    const result = await middleware(createTestRequest('OPTIONS'), {});
    expect(result!.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    expect(result!.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
  });

  it('should return undefined for non-OPTIONS requests', async () => {
    const middleware = withCORS();
    const result = await middleware(createTestRequest('GET'), {});
    expect(result).toBeUndefined();
  });

  it('should include credentials header when requested', async () => {
    const middleware = withCORS({ credentials: true });
    const result = await middleware(createTestRequest('OPTIONS'), {});
    expect(result!.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});

// ---------- withLogging ----------
describe('withLogging', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log method and URL', async () => {
    const middleware = withLogging();
    const ctx: RequestContext = {};
    await middleware(createTestRequest('GET', { url: 'http://localhost:3000/api/test' }), ctx);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('GET'));
  });

  it('should set startTime in context', async () => {
    const middleware = withLogging();
    const ctx: RequestContext = {};
    await middleware(createTestRequest(), ctx);
    expect(ctx.startTime).toBeDefined();
    expect(typeof ctx.startTime).toBe('number');
  });
});

// ---------- withValidation ----------
describe('withValidation', () => {
  it('should validate body and store in context', async () => {
    const middleware = withValidation({
      body: (body: unknown) => {
        const b = body as Record<string, unknown>;
        if (!b.name) throw new Error('Name required');
      },
    });

    const ctx: RequestContext = {};
    const result = await middleware(
      createTestRequest('POST', { body: { name: 'Warrior' } }),
      ctx
    );
    expect(result).toBeUndefined();
    expect((ctx.body as Record<string, unknown>).name).toBe('Warrior');
  });

  it('should return 400 for validation failure', async () => {
    const middleware = withValidation({
      body: () => { throw new Error('Invalid data'); },
    });

    const result = await middleware(
      createTestRequest('POST', { body: { bad: true } }),
      {}
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect(result!.status).toBe(400);
    const body = await getBody(result!);
    expect(body.error).toBe('Invalid data');
  });

  it('should validate query params', async () => {
    const middleware = withValidation({
      query: (params) => {
        if (!params.get('page')) throw new Error('Page required');
      },
    });

    const result = await middleware(
      createTestRequest('GET', { url: 'http://localhost:3000/api/test?page=1' }),
      {}
    );
    expect(result).toBeUndefined();
  });
});

// ---------- onlyMethods ----------
describe('onlyMethods', () => {
  it('should allow specified methods', async () => {
    const middleware = onlyMethods(['GET', 'POST']);
    const result = await middleware(createTestRequest('GET'), {});
    expect(result).toBeUndefined();
  });

  it('should return 405 for disallowed methods', async () => {
    const middleware = onlyMethods(['GET', 'POST']);
    const result = await middleware(createTestRequest('DELETE'), {});
    expect(result).toBeInstanceOf(NextResponse);
    expect(result!.status).toBe(405);
    expect(result!.headers.get('Allow')).toBe('GET, POST');
  });
});

// ---------- withCache ----------
describe('withCache', () => {
  it('should set cacheControl on context', async () => {
    const middleware = withCache({ maxAge: 60, sMaxAge: 120 });
    const ctx: RequestContext = {};
    await middleware(createTestRequest(), ctx);
    expect(ctx.cacheControl).toBe('max-age=60, s-maxage=120');
  });

  it('should use no-cache when maxAge is 0', async () => {
    const middleware = withCache({});
    const ctx: RequestContext = {};
    await middleware(createTestRequest(), ctx);
    expect(ctx.cacheControl).toBe('no-cache');
  });

  it('should include stale-while-revalidate', async () => {
    const middleware = withCache({ maxAge: 30, staleWhileRevalidate: 60 });
    const ctx: RequestContext = {};
    await middleware(createTestRequest(), ctx);
    expect(ctx.cacheControl).toContain('stale-while-revalidate=60');
  });
});

// ---------- withRequestId ----------
describe('withRequestId', () => {
  it('should add requestId to context', async () => {
    const middleware = withRequestId();
    const ctx: RequestContext = {};
    await middleware(createTestRequest(), ctx);
    expect(ctx.requestId).toBeDefined();
    expect(typeof ctx.requestId).toBe('string');
  });

  it('should generate unique IDs', async () => {
    const middleware = withRequestId();
    const ctx1: RequestContext = {};
    const ctx2: RequestContext = {};
    await middleware(createTestRequest(), ctx1);
    await middleware(createTestRequest(), ctx2);
    expect(ctx1.requestId).not.toBe(ctx2.requestId);
  });
});

// ---------- withRateLimit ----------
describe('withRateLimit', () => {
  it('should allow requests within limit', async () => {
    const middleware = withRateLimit({
      prefix: uniquePrefix('wrl-ok'),
      maxRequests: 10,
      windowMs: 60000,
    });

    const result = await middleware(
      createTestRequest('GET', { headers: { 'x-forwarded-for': uniquePrefix('ip') } }),
      {}
    );
    expect(result).toBeUndefined();
  });

  it('should return 429 when rate limited', async () => {
    const prefix = uniquePrefix('wrl-block');
    const ip = uniquePrefix('wrl-block-ip');
    const middleware = withRateLimit({
      prefix,
      maxRequests: 2,
      windowMs: 60000,
    });

    const req = createTestRequest('GET', { headers: { 'x-forwarded-for': ip } });

    // Exhaust limit
    await middleware(req, {});
    await middleware(req, {});

    const result = await middleware(req, {});
    expect(result).toBeInstanceOf(NextResponse);
    expect(result!.status).toBe(429);
    expect(result!.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(result!.headers.get('Retry-After')).toBeDefined();
  });

  it('should work with presets', async () => {
    const middleware = withRateLimit({
      prefix: uniquePrefix('wrl-preset'),
      ...RateLimitPresets.apiQueries,
    });

    const result = await middleware(
      createTestRequest('GET', { headers: { 'x-forwarded-for': uniquePrefix('preset-ip') } }),
      {}
    );
    expect(result).toBeUndefined();
  });
});

// ---------- withInternalAuth ----------
describe('withInternalAuth', () => {
  it('should allow localhost access', async () => {
    const middleware = withInternalAuth();
    const result = await middleware(
      createTestRequest('GET', { headers: { host: 'localhost:3000' } }),
      {}
    );
    expect(result).toBeUndefined();
  });

  it('should allow valid internal API key', async () => {
    const middleware = withInternalAuth();
    const result = await middleware(
      createTestRequest('GET', {
        headers: {
          host: 'example.com',
          'x-internal-key': process.env.INTERNAL_API_KEY || 'test-internal-key-12345',
        },
      }),
      {}
    );
    expect(result).toBeUndefined();
  });

  it('should reject requests without key or localhost', async () => {
    const middleware = withInternalAuth();
    const result = await middleware(
      createTestRequest('GET', { headers: { host: 'example.com' } }),
      {}
    );
    expect(result).toBeInstanceOf(NextResponse);
    expect(result!.status).toBe(401);
  });
});
