/**
 * Centralized Cron Job Authentication
 * Provides consistent auth verification across all cron endpoints
 */

import { NextRequest, NextResponse } from 'next/server';

export interface CronAuthResult {
  authorized: boolean;
  error?: string;
  statusCode?: number;
}

export interface CronAuthOptions {
  /** Allow GET requests without auth in development (for health checks) */
  allowDevBypass?: boolean;
}

/**
 * Verify cron job authorization
 *
 * Security rules:
 * - Always requires CRON_SECRET in production
 * - CRON_SECRET must be at least 32 characters
 * - Only accepts Bearer token in Authorization header
 * - Never accepts query param auth (URLs are logged)
 * - In development, can optionally allow GET health checks without auth
 *
 * @example
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const auth = verifyCronAuth(request);
 *   if (!auth.authorized) {
 *     return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
 *   }
 *   // ... proceed with cron logic
 * }
 * ```
 */
export function verifyCronAuth(
  request: NextRequest,
  options?: CronAuthOptions
): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET;

  // Validate secret exists
  if (!cronSecret) {
    console.error('[CronAuth] CRON_SECRET not configured');
    return {
      authorized: false,
      error: 'Cron secret not configured',
      statusCode: 500,
    };
  }

  // Validate secret strength (at least 32 chars for security)
  if (cronSecret.length < 32) {
    console.error('[CronAuth] CRON_SECRET too short (minimum 32 characters)');
    return {
      authorized: false,
      error: 'Cron secret configuration error',
      statusCode: 500,
    };
  }

  // Check Authorization header (only method we accept)
  const authHeader = request.headers.get('authorization');

  if (authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true };
  }

  // Development bypass for health checks only (GET requests)
  if (
    options?.allowDevBypass &&
    process.env.NODE_ENV === 'development' &&
    request.method === 'GET'
  ) {
    console.warn('[CronAuth] Development bypass used for GET health check');
    return { authorized: true };
  }

  // Log unauthorized attempt for security monitoring
  console.warn('[CronAuth] Unauthorized cron access attempt:', {
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    method: request.method,
    path: request.nextUrl.pathname,
    hasAuthHeader: !!authHeader,
    timestamp: new Date().toISOString(),
  });

  return {
    authorized: false,
    error: 'Unauthorized',
    statusCode: 401,
  };
}

/**
 * Helper to create error response for unauthorized cron requests
 */
export function cronAuthErrorResponse(result: CronAuthResult): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: result.error,
    },
    { status: result.statusCode || 401 }
  );
}

/**
 * Timeout wrapper for cron job operations
 * Prevents cron jobs from hanging indefinitely
 *
 * @example
 * ```typescript
 * const results = await withCronTimeout(
 *   externalMarketsService.syncAllMarkets(),
 *   240000, // 4 minutes
 *   'Market sync timed out'
 * );
 * ```
 */
export async function withCronTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Cron configuration with environment variable support
 */
export const cronConfig = {
  /** Timeout for battle execution transactions (ms) */
  battleExecutionTimeout: parseInt(process.env.BATTLE_EXECUTION_TIMEOUT_MS || '30000', 10),

  /** Queue depth threshold for alerting */
  queueDepthAlertThreshold: parseInt(process.env.QUEUE_DEPTH_ALERT_THRESHOLD || '20', 10),

  /** Maximum items to process per cron run */
  maxBatchSize: parseInt(process.env.CRON_MAX_BATCH_SIZE || '20', 10),

  /** Default timeout for external API calls (ms) */
  defaultApiTimeout: parseInt(process.env.CRON_API_TIMEOUT_MS || '240000', 10),

  /** Delay between sequential operations (ms) */
  operationDelay: parseInt(process.env.CRON_OPERATION_DELAY_MS || '1000', 10),
};
