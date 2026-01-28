/**
 * Metrics Collection and Tracking
 * Tracks system performance metrics for monitoring and alerting
 */

export interface MetricsSnapshot {
  timestamp: Date;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  ready: number;
  successRate: number;
  averageExecutionTime: number;
  queueDepth: number;
}

export interface MetricsThresholds {
  maxErrorRate: number; // Percentage (e.g., 5 = 5%)
  maxQueueDepth: number; // Number of pending battles
  maxExecutionTime: number; // Milliseconds
  minSuccessRate: number; // Percentage (e.g., 95 = 95%)
  maxAuthFailures: number; // Per hour
}

export const DEFAULT_THRESHOLDS: MetricsThresholds = {
  maxErrorRate: 5,
  maxQueueDepth: 20,
  maxExecutionTime: 15000, // 15 seconds
  minSuccessRate: 95,
  maxAuthFailures: 50,
};

/**
 * In-memory metrics store (replace with Redis in production)
 */
class MetricsStore {
  private snapshots: MetricsSnapshot[] = [];
  private maxSnapshots = 1000;
  private authFailures: number[] = []; // Timestamps of auth failures

  /**
   * Record a new metrics snapshot
   */
  recordSnapshot(snapshot: MetricsSnapshot): void {
    this.snapshots.push(snapshot);

    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Get most recent snapshot
   */
  getLatestSnapshot(): MetricsSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  /**
   * Get snapshots within time window
   */
  getSnapshotsInWindow(windowMs: number): MetricsSnapshot[] {
    const cutoff = new Date(Date.now() - windowMs);
    return this.snapshots.filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Calculate average metric over time window
   */
  getAverageMetric(
    metricKey: keyof Omit<MetricsSnapshot, 'timestamp'>,
    windowMs: number
  ): number {
    const snapshots = this.getSnapshotsInWindow(windowMs);
    if (snapshots.length === 0) return 0;

    const sum = snapshots.reduce((acc, s) => acc + (s[metricKey] as number), 0);
    return sum / snapshots.length;
  }

  /**
   * Record an authentication failure
   */
  recordAuthFailure(): void {
    this.authFailures.push(Date.now());

    // Clean up old failures (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.authFailures = this.authFailures.filter((ts) => ts > oneHourAgo);
  }

  /**
   * Get authentication failure count in time window
   */
  getAuthFailureCount(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.authFailures.filter((ts) => ts > cutoff).length;
  }

  /**
   * Clear all stored metrics
   */
  clear(): void {
    this.snapshots = [];
    this.authFailures = [];
  }
}

// Singleton instance
export const metricsStore = new MetricsStore();

/**
 * Calculate success rate from totals
 */
export function calculateSuccessRate(completed: number, failed: number): number {
  const total = completed + failed;
  if (total === 0) return 100;
  return (completed / total) * 100;
}

/**
 * Check if metrics exceed thresholds
 */
export interface MetricsViolation {
  metric: string;
  current: number;
  threshold: number;
  severity: 'warning' | 'critical';
}

export function checkThresholds(
  snapshot: MetricsSnapshot,
  thresholds: MetricsThresholds = DEFAULT_THRESHOLDS
): MetricsViolation[] {
  const violations: MetricsViolation[] = [];

  // Check error rate
  const errorRate = 100 - snapshot.successRate;
  if (errorRate > thresholds.maxErrorRate) {
    violations.push({
      metric: 'errorRate',
      current: errorRate,
      threshold: thresholds.maxErrorRate,
      severity: errorRate > thresholds.maxErrorRate * 2 ? 'critical' : 'warning',
    });
  }

  // Check queue depth
  if (snapshot.queueDepth > thresholds.maxQueueDepth) {
    violations.push({
      metric: 'queueDepth',
      current: snapshot.queueDepth,
      threshold: thresholds.maxQueueDepth,
      severity: snapshot.queueDepth > thresholds.maxQueueDepth * 2 ? 'critical' : 'warning',
    });
  }

  // Check execution time
  if (snapshot.averageExecutionTime > thresholds.maxExecutionTime) {
    violations.push({
      metric: 'averageExecutionTime',
      current: snapshot.averageExecutionTime,
      threshold: thresholds.maxExecutionTime,
      severity: snapshot.averageExecutionTime > thresholds.maxExecutionTime * 2 ? 'critical' : 'warning',
    });
  }

  // Check success rate
  if (snapshot.successRate < thresholds.minSuccessRate) {
    violations.push({
      metric: 'successRate',
      current: snapshot.successRate,
      threshold: thresholds.minSuccessRate,
      severity: 'critical', // Low success rate is always critical
    });
  }

  // Check auth failures
  const authFailures = metricsStore.getAuthFailureCount(60 * 60 * 1000); // Last hour
  if (authFailures > thresholds.maxAuthFailures) {
    violations.push({
      metric: 'authFailures',
      current: authFailures,
      threshold: thresholds.maxAuthFailures,
      severity: authFailures > thresholds.maxAuthFailures * 2 ? 'critical' : 'warning',
    });
  }

  return violations;
}

/**
 * Format metrics for display
 */
export function formatMetrics(snapshot: MetricsSnapshot): Record<string, string> {
  return {
    timestamp: snapshot.timestamp.toISOString(),
    total: snapshot.total.toString(),
    completed: snapshot.completed.toString(),
    failed: snapshot.failed.toString(),
    pending: snapshot.pending.toString(),
    ready: snapshot.ready.toString(),
    successRate: `${snapshot.successRate.toFixed(2)}%`,
    averageExecutionTime: `${Math.round(snapshot.averageExecutionTime)}ms`,
    queueDepth: snapshot.queueDepth.toString(),
  };
}

/**
 * Get system health status based on metrics
 */
export type HealthStatus = 'healthy' | 'warning' | 'critical';

export function getHealthStatus(snapshot: MetricsSnapshot): HealthStatus {
  const violations = checkThresholds(snapshot);

  if (violations.some((v) => v.severity === 'critical')) {
    return 'critical';
  }

  if (violations.some((v) => v.severity === 'warning')) {
    return 'warning';
  }

  return 'healthy';
}

/**
 * Get health status with details
 */
export interface HealthReport {
  health: {
    status: HealthStatus;
    issues: string[];
    score: number;
  };
  violations: MetricsViolation[];
  snapshot: MetricsSnapshot;
  recommendations: string[];
}

export function getHealthReport(snapshot: MetricsSnapshot): HealthReport {
  const violations = checkThresholds(snapshot);
  const status = getHealthStatus(snapshot);

  // Calculate health score (0-100)
  let score = 100;
  for (const violation of violations) {
    if (violation.severity === 'critical') {
      score -= 20;
    } else if (violation.severity === 'warning') {
      score -= 10;
    }
  }
  score = Math.max(0, score);

  // Generate issue list
  const issues: string[] = violations.map((v) => {
    switch (v.metric) {
      case 'errorRate':
        return `High error rate: ${v.current.toFixed(1)}% (threshold: ${v.threshold}%)`;
      case 'queueDepth':
        return `Queue depth too high: ${v.current} battles (threshold: ${v.threshold})`;
      case 'averageExecutionTime':
        return `Slow execution: ${Math.round(v.current)}ms (threshold: ${v.threshold}ms)`;
      case 'successRate':
        return `Low success rate: ${v.current.toFixed(1)}% (threshold: ${v.threshold}%)`;
      case 'authFailures':
        return `High auth failure rate: ${v.current} failures/hour (threshold: ${v.threshold})`;
      default:
        return `${v.metric}: ${v.current} (threshold: ${v.threshold})`;
    }
  });

  const recommendations: string[] = [];

  for (const violation of violations) {
    switch (violation.metric) {
      case 'errorRate':
        recommendations.push('Review error logs and consider rolling back recent changes');
        break;
      case 'queueDepth':
        recommendations.push('Check cron job status and Flow network connectivity');
        break;
      case 'averageExecutionTime':
        recommendations.push('Check Flow RPC performance and consider using fallback');
        break;
      case 'successRate':
        recommendations.push('Investigate failures immediately and pause scheduling if needed');
        break;
      case 'authFailures':
        recommendations.push('Review access logs for potential security threats');
        break;
    }
  }

  return {
    health: {
      status,
      issues,
      score,
    },
    violations,
    snapshot,
    recommendations,
  };
}

/**
 * Export metrics for external monitoring systems
 */
export interface PrometheusMetrics {
  flowScheduled_battles_total: number;
  flowScheduled_battles_completed: number;
  flowScheduled_battles_failed: number;
  flowScheduled_battles_pending: number;
  flowScheduled_battles_ready: number;
  flowScheduled_success_rate: number;
  flowScheduled_avg_execution_time_ms: number;
  flowScheduled_queue_depth: number;
}

export function exportPrometheusMetrics(snapshot: MetricsSnapshot): string {
  const metrics: PrometheusMetrics = {
    flowScheduled_battles_total: snapshot.total,
    flowScheduled_battles_completed: snapshot.completed,
    flowScheduled_battles_failed: snapshot.failed,
    flowScheduled_battles_pending: snapshot.pending,
    flowScheduled_battles_ready: snapshot.ready,
    flowScheduled_success_rate: snapshot.successRate,
    flowScheduled_avg_execution_time_ms: snapshot.averageExecutionTime,
    flowScheduled_queue_depth: snapshot.queueDepth,
  };

  return Object.entries(metrics)
    .map(([key, value]) => `${key} ${value}`)
    .join('\n');
}

/**
 * Create a metrics snapshot from current data
 */
export function createMetricsSnapshot(data: {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  ready: number;
  averageExecutionTime: number;
}): MetricsSnapshot {
  const successRate = calculateSuccessRate(data.completed, data.failed);

  return {
    timestamp: new Date(),
    total: data.total,
    completed: data.completed,
    failed: data.failed,
    pending: data.pending,
    ready: data.ready,
    successRate,
    averageExecutionTime: data.averageExecutionTime,
    queueDepth: data.pending + data.ready,
  };
}