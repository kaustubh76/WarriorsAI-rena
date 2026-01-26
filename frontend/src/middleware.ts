/**
 * Next.js Middleware for Request Authentication
 *
 * This middleware provides security for protected API routes by:
 * 1. Logging access to sensitive endpoints
 * 2. Optionally enforcing wallet signature authentication
 *
 * Current mode: LOGGING ONLY (audit mode)
 * - All requests are allowed through
 * - Unauthenticated requests to protected routes are logged for monitoring
 *
 * To enable enforcement:
 * 1. Set AUTH_ENFORCEMENT_MODE='enforce' in environment
 * 2. Update client code to include signature headers
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protected routes that require authentication for write operations
const PROTECTED_ROUTES = [
  { path: '/api/arena/battles', methods: ['POST', 'PATCH', 'DELETE'] },
  { path: '/api/agents/authorize', methods: ['POST', 'DELETE'] },
  { path: '/api/copy-trade/execute', methods: ['POST'] },
  { path: '/api/agents/external-trade', methods: ['POST'] },
  { path: '/api/flow/execute', methods: ['POST'] },
  { path: '/api/oracle/resolve', methods: ['POST'] },
];

// Public routes that never require authentication
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/arena/markets',
  '/api/external/markets',
  '/api/leaderboard',
];

// Authentication mode: 'log' | 'warn' | 'enforce'
// - log: Log unauthenticated requests but allow them
// - warn: Log and add warning header but allow them
// - enforce: Block unauthenticated requests (requires client updates)
const AUTH_MODE = process.env.AUTH_ENFORCEMENT_MODE || 'log';

function isProtectedRoute(pathname: string, method: string): boolean {
  // Check if it's explicitly public
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return false;
  }

  // Check if it matches a protected route
  return PROTECTED_ROUTES.some(
    route => pathname.startsWith(route.path) && route.methods.includes(method)
  );
}

function hasAuthHeaders(request: NextRequest): boolean {
  const address = request.headers.get('X-Address');
  const signature = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  const message = request.headers.get('X-Message');

  return !!(address && signature && timestamp && message);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Only apply to API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check if this is a protected route
  const isProtected = isProtectedRoute(pathname, method);

  if (!isProtected) {
    return NextResponse.next();
  }

  // Check for authentication headers
  const hasAuth = hasAuthHeaders(request);

  if (hasAuth) {
    // Has auth headers - allow through (signature verification happens in route)
    return NextResponse.next();
  }

  // Handle unauthenticated request based on mode
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  const timestamp = new Date().toISOString();

  switch (AUTH_MODE) {
    case 'enforce':
      // Block unauthenticated requests
      console.warn(
        `[AUTH] BLOCKED: ${method} ${pathname} from ${clientIP} at ${timestamp} - Missing authentication`
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          message: 'This endpoint requires wallet signature authentication',
        },
        { status: 401 }
      );

    case 'warn':
      // Allow but add warning header
      console.warn(
        `[AUTH] WARNING: ${method} ${pathname} from ${clientIP} at ${timestamp} - Unauthenticated request`
      );
      const response = NextResponse.next();
      response.headers.set('X-Auth-Warning', 'Authentication recommended for this endpoint');
      return response;

    case 'log':
    default:
      // Just log and allow
      console.log(
        `[AUTH] AUDIT: ${method} ${pathname} from ${clientIP} at ${timestamp} - No auth headers`
      );
      return NextResponse.next();
  }
}

// Configure which routes this middleware applies to
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
};
