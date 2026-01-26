/**
 * Internal Metrics API Endpoint
 * GET /api/internal/metrics
 *
 * Returns API performance metrics for monitoring
 * This endpoint should be protected in production (e.g., behind auth or internal network only)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handleAPIError,
  applyRateLimit,
  apiMetrics,
  circuitBreakers,
  createAPILogger,
} from '@/lib/api';

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();

  try {
    // Rate limit to prevent abuse
    applyRateLimit(request, {
      prefix: 'internal-metrics',
      maxRequests: 30,
      windowMs: 60000,
    });

    // Check for internal access (basic protection)
    // In production, add proper authentication
    const internalKey = request.headers.get('x-internal-key');
    const isLocalhost = request.headers.get('host')?.includes('localhost');

    if (!isLocalhost && internalKey !== process.env.INTERNAL_API_KEY) {
      logger.warn('Unauthorized metrics access attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const windowMs = parseInt(searchParams.get('window') || '300000'); // 5 min default
    const includeDetails = searchParams.get('details') === 'true';

    // Get aggregated metrics
    const aggregated = apiMetrics.getAggregated(windowMs);

    // Get circuit breaker states
    const circuitStates = circuitBreakers.getAllStates();

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      timestamp: Date.now(),
      window: {
        ms: windowMs,
        readable: `${Math.round(windowMs / 60000)} minutes`,
      },
      metrics: {
        requests: aggregated.totalRequests,
        successRate: `${aggregated.successRate.toFixed(2)}%`,
        errors: aggregated.errorCount,
        latency: {
          avg: `${aggregated.avgDuration}ms`,
          p50: `${aggregated.p50Duration}ms`,
          p95: `${aggregated.p95Duration}ms`,
          p99: `${aggregated.p99Duration}ms`,
        },
      },
      circuitBreakers: circuitStates,
    };

    // Add detailed breakdown if requested
    if (includeDetails) {
      response.details = {
        requestsByPath: aggregated.requestsByPath,
        errorsByPath: aggregated.errorsByPath,
        slowRequests: apiMetrics.getSlowRequests(5000, 5).map((r) => ({
          path: r.path,
          method: r.method,
          duration: `${r.duration}ms`,
          timestamp: new Date(r.timestamp).toISOString(),
        })),
        recentErrors: apiMetrics.getRecentErrors(5).map((r) => ({
          path: r.path,
          method: r.method,
          status: r.statusCode,
          timestamp: new Date(r.timestamp).toISOString(),
        })),
      };
    }

    logger.complete(200);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-ID': logger.requestId,
      },
    });
  } catch (error) {
    logger.error('Metrics fetch failed', error);
    return handleAPIError(error, 'API:Internal:Metrics:GET');
  }
}

/**
 * POST /api/internal/metrics
 * Reset metrics (for testing/maintenance)
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request);

  try {
    // Require internal key for reset
    const internalKey = request.headers.get('x-internal-key');
    if (internalKey !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const action = body.action;

    switch (action) {
      case 'reset-metrics':
        apiMetrics.clear();
        logger.info('Metrics reset by admin');
        return NextResponse.json({ success: true, message: 'Metrics reset' });

      case 'reset-circuits':
        circuitBreakers.resetAll();
        logger.info('Circuit breakers reset by admin');
        return NextResponse.json({ success: true, message: 'Circuit breakers reset' });

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Metrics action failed', error);
    return handleAPIError(error, 'API:Internal:Metrics:POST');
  }
}
