import { NextRequest, NextResponse } from 'next/server';
import { getBattleMonitor } from '@/lib/monitoring/battleMonitor';
import { getBattleQueue } from '@/lib/queue/battleExecutionQueue';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { checkThresholds, getHealthReport } from '@/lib/monitoring/metrics';
import type { MetricsSnapshot } from '@/lib/monitoring/metrics';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-me-in-production';

/**
 * GET /api/admin/monitor
 * Get monitoring dashboard data
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'admin-monitor', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    // Verify admin secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Invalid authorization'),
        { status: 401 }
      );
    }

    const monitor = getBattleMonitor();
    const queue = getBattleQueue(process.env.NEXT_PUBLIC_FLOW_CADENCE_ADDRESS || process.env.NEXT_PUBLIC_FLOW_TESTNET_ADDRESS);

    // Get query parameters
    const url = new URL(req.url);
    const format = url.searchParams.get('format'); // 'json' or 'prometheus'

    // Prometheus format
    if (format === 'prometheus') {
      return new NextResponse(monitor.exportPrometheusMetrics(), {
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    // JSON format (default)
    const metrics = monitor.getMetrics();
    const health = monitor.getHealthStatus();
    const queueStats = queue.getStats();
    const alerts = monitor.getAlerts();
    const unacknowledgedAlerts = monitor.getUnacknowledgedAlerts();

    // Create metrics snapshot for threshold checking
    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      total: metrics.totalScheduled,
      completed: metrics.totalExecuted,
      failed: metrics.totalFailed,
      pending: queueStats.pending,
      ready: queueStats.pending, // Approximation - could query blockchain for exact count
      successRate: metrics.successRate,
      averageExecutionTime: metrics.averageExecutionTime,
      queueDepth: queueStats.pending,
    };

    // Check for threshold violations
    const violations = checkThresholds(snapshot);
    const healthReport = getHealthReport(snapshot);

    return NextResponse.json({
      success: true,
      data: {
        health: {
          status: healthReport.health.status,
          issues: healthReport.health.issues,
          score: healthReport.health.score,
        },
        metrics: {
          ...metrics,
          lastExecutionTime: metrics.lastExecutionTime?.toISOString(),
        },
        queue: queueStats,
        alerts: {
          total: alerts.length,
          unacknowledged: unacknowledgedAlerts.length,
          byLevel: {
            info: alerts.filter((a) => a.level === 'info').length,
            warning: alerts.filter((a) => a.level === 'warning').length,
            error: alerts.filter((a) => a.level === 'error').length,
            critical: alerts.filter((a) => a.level === 'critical').length,
          },
          recent: alerts.slice(-10).map((alert) => ({
            id: alert.id,
            level: alert.level,
            message: alert.message,
            timestamp: alert.timestamp.toISOString(),
            acknowledged: alert.acknowledged,
          })),
        },
        violations: violations.map((v) => ({
          metric: v.metric,
          currentValue: v.current,
          threshold: v.threshold,
          severity: v.severity,
        })),
        recommendations: healthReport.recommendations,
        timestamp: new Date().toISOString(),
      },
    });
  },
], { errorContext: 'API:Admin:Monitor:GET' });

/**
 * POST /api/admin/monitor/acknowledge
 * Acknowledge alerts
 */
export const POST = composeMiddleware([
  withRateLimit({ prefix: 'admin-monitor-post', ...RateLimitPresets.agentOperations }),
  async (req, ctx) => {
    // Verify admin secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Invalid authorization'),
        { status: 401 }
      );
    }

    const body = await req.json();
    const { alertId, acknowledgeAll } = body;

    const monitor = getBattleMonitor();

    if (acknowledgeAll) {
      monitor.acknowledgeAllAlerts();
      return NextResponse.json({
        success: true,
        message: 'All alerts acknowledged',
      });
    } else if (alertId) {
      const success = monitor.acknowledgeAlert(alertId);
      if (success) {
        return NextResponse.json({
          success: true,
          message: `Alert ${alertId} acknowledged`,
        });
      } else {
        return NextResponse.json(
          ErrorResponses.badRequest('Alert not found'),
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        ErrorResponses.badRequest('Either alertId or acknowledgeAll must be provided'),
        { status: 400 }
      );
    }
  },
], { errorContext: 'API:Admin:Monitor:POST' });

/**
 * DELETE /api/admin/monitor/alerts
 * Clear old alerts
 */
export const DELETE = composeMiddleware([
  withRateLimit({ prefix: 'admin-monitor-delete', ...RateLimitPresets.agentOperations }),
  async (req, ctx) => {
    // Verify admin secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Invalid authorization'),
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const olderThanHours = parseInt(url.searchParams.get('olderThan') || '24');

    const monitor = getBattleMonitor();
    const cleared = monitor.clearAlerts(olderThanHours * 60 * 60 * 1000);

    return NextResponse.json({
      success: true,
      message: `Cleared ${cleared} alerts older than ${olderThanHours} hours`,
      cleared,
    });
  },
], { errorContext: 'API:Admin:Monitor:DELETE' });
