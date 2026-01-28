import { NextRequest, NextResponse } from 'next/server';
import { getBattleMonitor } from '@/lib/monitoring/battleMonitor';
import { getBattleQueue } from '@/lib/queue/battleExecutionQueue';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { checkThresholds, getHealthReport } from '@/lib/monitoring/metrics';
import type { MetricsSnapshot } from '@/lib/monitoring/metrics';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-me-in-production';

/**
 * GET /api/admin/monitor
 * Get monitoring dashboard data
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Invalid authorization'),
        { status: 401 }
      );
    }

    const monitor = getBattleMonitor();
    const queue = getBattleQueue(process.env.NEXT_PUBLIC_FLOW_TESTNET_ADDRESS);

    // Get query parameters
    const url = new URL(request.url);
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
  } catch (error: any) {
    console.error('[Admin Monitor API] Error:', error);
    return NextResponse.json(
      ErrorResponses.internal(error.message || 'Failed to get monitoring data'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/monitor/acknowledge
 * Acknowledge alerts
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Invalid authorization'),
        { status: 401 }
      );
    }

    const body = await request.json();
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
  } catch (error: any) {
    console.error('[Admin Monitor API] Acknowledge error:', error);
    return NextResponse.json(
      ErrorResponses.internal(error.message || 'Failed to acknowledge alerts'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/monitor/alerts
 * Clear old alerts
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify admin secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Invalid authorization'),
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const olderThanHours = parseInt(url.searchParams.get('olderThan') || '24');

    const monitor = getBattleMonitor();
    const cleared = monitor.clearAlerts(olderThanHours * 60 * 60 * 1000);

    return NextResponse.json({
      success: true,
      message: `Cleared ${cleared} alerts older than ${olderThanHours} hours`,
      cleared,
    });
  } catch (error: any) {
    console.error('[Admin Monitor API] Clear alerts error:', error);
    return NextResponse.json(
      ErrorResponses.internal(error.message || 'Failed to clear alerts'),
      { status: 500 }
    );
  }
}
