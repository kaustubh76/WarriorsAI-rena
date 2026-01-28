/**
 * Battle Execution Monitoring System
 * Tracks health, performance, and alerts for scheduled transactions
 * Enhanced with webhook alerting to Slack/Discord
 */

import {
  alertHighErrorRate,
  alertSlowExecution,
  alertLowSuccessRate,
  sendAlert,
} from './alerts';

interface MonitoringMetrics {
  totalScheduled: number;
  totalExecuted: number;
  totalFailed: number;
  averageExecutionTime: number;
  successRate: number;
  lastExecutionTime?: Date;
  uptime: number;
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  data?: any;
  timestamp: Date;
  acknowledged: boolean;
}

export class BattleMonitor {
  private metrics: MonitoringMetrics = {
    totalScheduled: 0,
    totalExecuted: 0,
    totalFailed: 0,
    averageExecutionTime: 0,
    successRate: 100,
    uptime: 0,
  };

  private executionTimes: number[] = [];
  private alerts: Alert[] = [];
  private startTime: Date = new Date();

  // Thresholds for alerting
  private readonly SUCCESS_RATE_THRESHOLD = 95; // Alert if < 95%
  private readonly MAX_EXECUTION_TIME = 60000; // Alert if > 60s
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  private consecutiveFailures = 0;

  /**
   * Record a scheduled battle
   */
  recordScheduled(): void {
    this.metrics.totalScheduled++;
    this.updateMetrics();
  }

  /**
   * Record a successful execution
   */
  async recordExecution(executionTimeMs: number): Promise<void> {
    this.metrics.totalExecuted++;
    this.metrics.lastExecutionTime = new Date();
    this.consecutiveFailures = 0;

    // Track execution time
    this.executionTimes.push(executionTimeMs);
    if (this.executionTimes.length > 100) {
      this.executionTimes.shift(); // Keep last 100
    }

    // Alert if execution took too long
    if (executionTimeMs > this.MAX_EXECUTION_TIME) {
      await this.addAlert({
        level: 'warning',
        message: `Slow execution detected: ${executionTimeMs}ms`,
        data: { executionTimeMs },
      });
    }

    await this.updateMetrics();
  }

  /**
   * Record a failed execution
   */
  async recordFailure(error: string, battleId: number): Promise<void> {
    this.metrics.totalFailed++;
    this.consecutiveFailures++;

    // Alert based on consecutive failures
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      await this.addAlert({
        level: 'critical',
        message: `${this.consecutiveFailures} consecutive failures detected!`,
        data: { error, battleId, consecutiveFailures: this.consecutiveFailures },
      });
    } else if (this.consecutiveFailures === 2) {
      await this.addAlert({
        level: 'error',
        message: `Multiple failures detected: ${error}`,
        data: { error, battleId },
      });
    } else {
      await this.addAlert({
        level: 'warning',
        message: `Execution failed: ${error}`,
        data: { error, battleId },
      });
    }

    await this.updateMetrics();
  }

  /**
   * Update calculated metrics (enhanced with threshold checking)
   */
  private async updateMetrics(): Promise<void> {
    // Calculate success rate
    const totalAttempts = this.metrics.totalExecuted + this.metrics.totalFailed;
    if (totalAttempts > 0) {
      this.metrics.successRate = (this.metrics.totalExecuted / totalAttempts) * 100;
    }

    // Calculate average execution time
    if (this.executionTimes.length > 0) {
      const sum = this.executionTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageExecutionTime = sum / this.executionTimes.length;
    }

    // Calculate uptime
    this.metrics.uptime = Date.now() - this.startTime.getTime();

    // Check if success rate is below threshold
    if (
      this.metrics.successRate < this.SUCCESS_RATE_THRESHOLD &&
      totalAttempts >= 10
    ) {
      await this.addAlert({
        level: 'critical',
        message: `Success rate dropped to ${this.metrics.successRate.toFixed(2)}%`,
        data: { successRate: this.metrics.successRate, threshold: this.SUCCESS_RATE_THRESHOLD },
      });
    }
  }

  /**
   * Add an alert (enhanced with webhook notifications)
   */
  private async addAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>): Promise<void> {
    const newAlert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      acknowledged: false,
      ...alert,
    };

    this.alerts.push(newAlert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    console.log(`[Battle Monitor] ${newAlert.level.toUpperCase()}: ${newAlert.message}`);

    // NEW: Send webhook alerts for critical/error level alerts
    if (newAlert.level === 'critical' || newAlert.level === 'error') {
      try {
        // Determine alert type and send appropriate webhook
        if (alert.message.includes('Success rate')) {
          await alertLowSuccessRate(this.metrics.successRate, this.SUCCESS_RATE_THRESHOLD);
        } else if (alert.message.includes('Slow execution')) {
          const executionTime = alert.data?.executionTimeMs || this.metrics.averageExecutionTime;
          await alertSlowExecution(executionTime, this.MAX_EXECUTION_TIME);
        } else if (alert.message.includes('consecutive failures')) {
          await sendAlert(
            'Consecutive Battle Failures',
            alert.message,
            newAlert.level,
            {
              consecutiveFailures: this.consecutiveFailures,
              battleId: alert.data?.battleId,
              error: alert.data?.error,
            }
          );
        } else if (alert.message.includes('failed')) {
          await sendAlert(
            'Battle Execution Failed',
            alert.message,
            newAlert.level,
            {
              battleId: alert.data?.battleId,
              error: alert.data?.error,
            }
          );
        }
      } catch (webhookError) {
        // Don't throw - webhook failures shouldn't break monitoring
        console.error('[Battle Monitor] Failed to send webhook alert:', webhookError);
      }
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Get all alerts
   */
  getAlerts(level?: Alert['level']): Alert[] {
    if (level) {
      return this.alerts.filter((a) => a.level === level);
    }
    return [...this.alerts];
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(): Alert[] {
    return this.alerts.filter((a) => !a.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Acknowledge all alerts
   */
  acknowledgeAllAlerts(): void {
    this.alerts.forEach((alert) => {
      alert.acknowledged = true;
    });
  }

  /**
   * Clear old alerts
   */
  clearAlerts(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs;
    const originalLength = this.alerts.length;

    this.alerts = this.alerts.filter((alert) => alert.timestamp.getTime() > cutoff);

    return originalLength - this.alerts.length;
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  } {
    const issues: string[] = [];

    // Check success rate
    if (this.metrics.successRate < this.SUCCESS_RATE_THRESHOLD) {
      issues.push(`Low success rate: ${this.metrics.successRate.toFixed(2)}%`);
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      issues.push(`${this.consecutiveFailures} consecutive failures`);
    }

    // Check if no executions recently (if any scheduled)
    if (
      this.metrics.totalScheduled > 0 &&
      this.metrics.lastExecutionTime &&
      Date.now() - this.metrics.lastExecutionTime.getTime() > 60 * 60 * 1000
    ) {
      issues.push('No executions in the last hour');
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (issues.length === 0) {
      status = 'healthy';
    } else if (issues.length <= 1 || this.metrics.successRate >= 90) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return { status, issues };
  }

  /**
   * Export metrics for external monitoring (Prometheus format)
   */
  exportPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const health = this.getHealthStatus();

    return `
# HELP battle_scheduled_total Total number of scheduled battles
# TYPE battle_scheduled_total counter
battle_scheduled_total ${metrics.totalScheduled}

# HELP battle_executed_total Total number of executed battles
# TYPE battle_executed_total counter
battle_executed_total ${metrics.totalExecuted}

# HELP battle_failed_total Total number of failed executions
# TYPE battle_failed_total counter
battle_failed_total ${metrics.totalFailed}

# HELP battle_success_rate Success rate percentage
# TYPE battle_success_rate gauge
battle_success_rate ${metrics.successRate}

# HELP battle_avg_execution_time Average execution time in milliseconds
# TYPE battle_avg_execution_time gauge
battle_avg_execution_time ${metrics.averageExecutionTime}

# HELP battle_consecutive_failures Current consecutive failures
# TYPE battle_consecutive_failures gauge
battle_consecutive_failures ${this.consecutiveFailures}

# HELP battle_uptime System uptime in milliseconds
# TYPE battle_uptime counter
battle_uptime ${metrics.uptime}

# HELP battle_health_status System health status (0=unhealthy, 1=degraded, 2=healthy)
# TYPE battle_health_status gauge
battle_health_status ${health.status === 'healthy' ? 2 : health.status === 'degraded' ? 1 : 0}

# HELP battle_unacknowledged_alerts Number of unacknowledged alerts
# TYPE battle_unacknowledged_alerts gauge
battle_unacknowledged_alerts ${this.getUnacknowledgedAlerts().length}
`.trim();
  }

  /**
   * Reset all metrics (use with caution)
   */
  reset(): void {
    this.metrics = {
      totalScheduled: 0,
      totalExecuted: 0,
      totalFailed: 0,
      averageExecutionTime: 0,
      successRate: 100,
      uptime: 0,
    };
    this.executionTimes = [];
    this.consecutiveFailures = 0;
    this.startTime = new Date();
    console.log('[Battle Monitor] Metrics reset');
  }
}

// Singleton instance
let monitorInstance: BattleMonitor | null = null;

export function getBattleMonitor(): BattleMonitor {
  if (!monitorInstance) {
    monitorInstance = new BattleMonitor();
  }
  return monitorInstance;
}
