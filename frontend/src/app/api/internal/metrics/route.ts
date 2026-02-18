/**
 * Internal Metrics API Endpoint
 * GET /api/internal/metrics
 *
 * Returns API performance metrics for monitoring
 * This endpoint should be protected in production (e.g., behind auth or internal network only)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  RateLimitPresets,
  apiMetrics,
  circuitBreakers,
  createAPILogger,
} from '@/lib/api';
import { composeMiddleware, withRateLimit, withInternalAuth } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'internal-metrics', ...RateLimitPresets.moderateReads }),
  withInternalAuth(),
  async (req, ctx) => {
    const logger = createAPILogger(req);
    logger.start();

    const { searchParams } = new URL(req.url);
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
  },
], { errorContext: 'API:Internal:Metrics:GET' });

/**
 * POST /api/internal/metrics
 * Reset metrics (for testing/maintenance)
 */
export const POST = composeMiddleware([
  withInternalAuth(),
  async (req, ctx) => {
    const logger = createAPILogger(req);

    const body = await req.json();
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
  },
], { errorContext: 'API:Internal:Metrics:POST' });
