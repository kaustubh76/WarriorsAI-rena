/**
 * Metrics Collection and Prometheus Exporter
 *
 * Production-grade metrics collection for monitoring and observability
 *
 * Features:
 * - Counter, Gauge, Histogram metrics
 * - Prometheus format export
 * - Custom labels and dimensions
 * - Automatic metric aggregation
 * - Performance monitoring
 * - Business metrics tracking
 */

// ============================================================================
// Types
// ============================================================================

export interface MetricLabels {
  [key: string]: string | number;
}

interface CounterMetric {
  type: 'counter';
  value: number;
  labels: MetricLabels;
}

interface GaugeMetric {
  type: 'gauge';
  value: number;
  labels: MetricLabels;
}

interface HistogramMetric {
  type: 'histogram';
  values: number[];
  labels: MetricLabels;
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric;

// ============================================================================
// Metrics Registry
// ============================================================================

class MetricsRegistry {
  private metrics = new Map<string, Map<string, Metric>>();
  private startTime = Date.now();

  // ========== Counter Methods ==========

  incrementCounter(name: string, value: number = 1, labels: MetricLabels = {}): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.getOrCreateMetricMap(name);

    const existing = metricMap.get(labelKey) as CounterMetric | undefined;

    if (existing) {
      existing.value += value;
    } else {
      metricMap.set(labelKey, {
        type: 'counter',
        value,
        labels,
      });
    }
  }

  getCounter(name: string, labels: MetricLabels = {}): number {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.metrics.get(name);

    if (!metricMap) return 0;

    const metric = metricMap.get(labelKey) as CounterMetric | undefined;
    return metric?.value ?? 0;
  }

  // ========== Gauge Methods ==========

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.getOrCreateMetricMap(name);

    metricMap.set(labelKey, {
      type: 'gauge',
      value,
      labels,
    });
  }

  incrementGauge(name: string, value: number = 1, labels: MetricLabels = {}): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.getOrCreateMetricMap(name);

    const existing = metricMap.get(labelKey) as GaugeMetric | undefined;

    if (existing) {
      existing.value += value;
    } else {
      metricMap.set(labelKey, {
        type: 'gauge',
        value,
        labels,
      });
    }
  }

  decrementGauge(name: string, value: number = 1, labels: MetricLabels = {}): void {
    this.incrementGauge(name, -value, labels);
  }

  getGauge(name: string, labels: MetricLabels = {}): number {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.metrics.get(name);

    if (!metricMap) return 0;

    const metric = metricMap.get(labelKey) as GaugeMetric | undefined;
    return metric?.value ?? 0;
  }

  // ========== Histogram Methods ==========

  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const labelKey = this.serializeLabels(labels);
    const metricMap = this.getOrCreateMetricMap(name);

    const existing = metricMap.get(labelKey) as HistogramMetric | undefined;

    if (existing) {
      existing.values.push(value);
    } else {
      metricMap.set(labelKey, {
        type: 'histogram',
        values: [value],
        labels,
      });
    }
  }

  // ========== Utility Methods ==========

  private getOrCreateMetricMap(name: string): Map<string, Metric> {
    let metricMap = this.metrics.get(name);

    if (!metricMap) {
      metricMap = new Map();
      this.metrics.set(name, metricMap);
    }

    return metricMap;
  }

  private serializeLabels(labels: MetricLabels): string {
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map(key => `${key}="${labels[key]}"`).join(',');
  }

  private formatLabels(labels: MetricLabels): string {
    if (Object.keys(labels).length === 0) return '';
    return `{${this.serializeLabels(labels)}}`;
  }

  // ========== Export Methods ==========

  exportPrometheus(): string {
    let output = '';

    for (const [name, metricMap] of this.metrics.entries()) {
      const firstMetric = metricMap.values().next().value as Metric;

      if (!firstMetric) continue;

      // Add help and type
      output += `# HELP ${name} Metric ${name}\n`;
      output += `# TYPE ${name} ${firstMetric.type === 'histogram' ? 'histogram' : firstMetric.type}\n`;

      for (const [_, metric] of metricMap.entries()) {
        const labelStr = this.formatLabels(metric.labels);

        if (metric.type === 'histogram') {
          const hist = metric as HistogramMetric;
          const stats = this.calculateHistogramStats(hist.values);

          output += `${name}_sum${labelStr} ${stats.sum}\n`;
          output += `${name}_count${labelStr} ${stats.count}\n`;
          output += `${name}_min${labelStr} ${stats.min}\n`;
          output += `${name}_max${labelStr} ${stats.max}\n`;
          output += `${name}_avg${labelStr} ${stats.avg}\n`;
          output += `${name}_p50${labelStr} ${stats.p50}\n`;
          output += `${name}_p95${labelStr} ${stats.p95}\n`;
          output += `${name}_p99${labelStr} ${stats.p99}\n`;
        } else {
          output += `${name}${labelStr} ${metric.value}\n`;
        }
      }

      output += '\n';
    }

    // Add system metrics
    output += this.exportSystemMetrics();

    return output;
  }

  private calculateHistogramStats(values: number[]) {
    if (values.length === 0) {
      return { sum: 0, count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      sum,
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      p50: sorted[Math.floor(values.length * 0.50)],
      p95: sorted[Math.floor(values.length * 0.95)],
      p99: sorted[Math.floor(values.length * 0.99)],
    };
  }

  private exportSystemMetrics(): string {
    const uptime = (Date.now() - this.startTime) / 1000;
    const memoryUsage = process.memoryUsage();

    let output = '# HELP process_uptime_seconds Process uptime in seconds\n';
    output += '# TYPE process_uptime_seconds gauge\n';
    output += `process_uptime_seconds ${uptime}\n\n`;

    output += '# HELP process_memory_bytes Process memory usage in bytes\n';
    output += '# TYPE process_memory_bytes gauge\n';
    output += `process_memory_bytes{type="rss"} ${memoryUsage.rss}\n`;
    output += `process_memory_bytes{type="heapTotal"} ${memoryUsage.heapTotal}\n`;
    output += `process_memory_bytes{type="heapUsed"} ${memoryUsage.heapUsed}\n`;
    output += `process_memory_bytes{type="external"} ${memoryUsage.external}\n\n`;

    return output;
  }

  exportJSON() {
    const result: Record<string, any> = {};

    for (const [name, metricMap] of this.metrics.entries()) {
      result[name] = [];

      for (const [_, metric] of metricMap.entries()) {
        if (metric.type === 'histogram') {
          const hist = metric as HistogramMetric;
          result[name].push({
            labels: metric.labels,
            stats: this.calculateHistogramStats(hist.values),
          });
        } else {
          result[name].push({
            labels: metric.labels,
            value: metric.value,
          });
        }
      }
    }

    return result;
  }

  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
  }
}

// ============================================================================
// Flow-Specific Metrics
// ============================================================================

export class FlowMetrics {
  private static registry = new MetricsRegistry();

  // ========== Event Tracking Metrics ==========

  static recordEventProcessed(eventName: string, success: boolean): void {
    this.registry.incrementCounter('flow_events_processed_total', 1, {
      event: eventName,
      status: success ? 'success' : 'error',
    });
  }

  static recordEventProcessingTime(eventName: string, durationMs: number): void {
    this.registry.observeHistogram('flow_event_processing_duration_ms', durationMs, {
      event: eventName,
    });
  }

  static setEventsSynced(blockNumber: number): void {
    this.registry.setGauge('flow_events_synced_block', blockNumber);
  }

  static setBlocksBehind(blocks: number): void {
    this.registry.setGauge('flow_blocks_behind', blocks);
  }

  // ========== RPC Metrics ==========

  static recordRPCCall(endpoint: string, method: string, success: boolean, durationMs: number): void {
    this.registry.incrementCounter('flow_rpc_calls_total', 1, {
      endpoint,
      method,
      status: success ? 'success' : 'error',
    });

    this.registry.observeHistogram('flow_rpc_call_duration_ms', durationMs, {
      endpoint,
      method,
    });
  }

  static recordRPCError(endpoint: string, errorType: string): void {
    this.registry.incrementCounter('flow_rpc_errors_total', 1, {
      endpoint,
      error_type: errorType,
    });
  }

  static setRPCCircuitBreakerState(endpoint: string, state: string): void {
    this.registry.setGauge('flow_rpc_circuit_breaker_state', state === 'OPEN' ? 1 : 0, {
      endpoint,
    });
  }

  // ========== Database Metrics ==========

  static recordDatabaseQuery(operation: string, table: string, durationMs: number): void {
    this.registry.incrementCounter('flow_database_queries_total', 1, {
      operation,
      table,
    });

    this.registry.observeHistogram('flow_database_query_duration_ms', durationMs, {
      operation,
      table,
    });
  }

  static recordDatabaseError(operation: string, table: string, errorType: string): void {
    this.registry.incrementCounter('flow_database_errors_total', 1, {
      operation,
      table,
      error_type: errorType,
    });
  }

  // ========== Business Metrics ==========

  static setTotalMarkets(count: number): void {
    this.registry.setGauge('flow_total_markets', count);
  }

  static setActiveMarkets(count: number): void {
    this.registry.setGauge('flow_active_markets', count);
  }

  static setTotalTrades(count: number): void {
    this.registry.setGauge('flow_total_trades', count);
  }

  static recordTradeVolume(amount: string): void {
    const volumeNumber = parseFloat(amount);
    if (!isNaN(volumeNumber)) {
      this.registry.incrementGauge('flow_total_volume', volumeNumber);
    }
  }

  static recordMarketCreated(source: string): void {
    this.registry.incrementCounter('flow_markets_created_total', 1, { source });
  }

  static recordTradeExecuted(source: string, direction: string): void {
    this.registry.incrementCounter('flow_trades_executed_total', 1, {
      source,
      direction,
    });
  }

  static recordMarketResolved(source: string, outcome: string): void {
    this.registry.incrementCounter('flow_markets_resolved_total', 1, {
      source,
      outcome,
    });
  }

  // ========== Oracle Metrics ==========

  static recordOracleOperation(operation: string, success: boolean): void {
    this.registry.incrementCounter('flow_oracle_operations_total', 1, {
      operation,
      status: success ? 'success' : 'error',
    });
  }

  static recordOracleVerificationTime(durationMs: number): void {
    this.registry.observeHistogram('flow_oracle_verification_duration_ms', durationMs);
  }

  // ========== Error Recovery Metrics ==========

  static recordRetryAttempt(operation: string, attempt: number): void {
    this.registry.incrementCounter('flow_retry_attempts_total', 1, {
      operation,
      attempt: attempt.toString(),
    });
  }

  static recordFailedOperation(operation: string, severity: string): void {
    this.registry.incrementCounter('flow_failed_operations_total', 1, {
      operation,
      severity,
    });
  }

  // ========== Convenience Aliases ==========

  /**
   * Record an operation failure (alias for recordFailedOperation with default severity)
   */
  static recordOperationFailed(operation: string, severity: string = 'error'): void {
    this.recordFailedOperation(operation, severity);
  }

  /**
   * Record VRF trade execution
   */
  static recordVRFTradeExecuted(mirrorKey: string, agentId: string, amount: string): void {
    this.registry.incrementCounter('flow_vrf_trades_executed_total', 1, {
      mirror_key: mirrorKey,
      agent_id: agentId,
    });
    this.recordTradeVolume(amount);
  }

  /**
   * Record 0G verification result
   */
  static recordZeroGVerification(success: boolean): void {
    this.registry.incrementCounter('flow_zerog_verifications_total', 1, {
      status: success ? 'success' : 'error',
    });
  }

  // ========== Export Methods ==========

  static exportPrometheus(): string {
    return this.registry.exportPrometheus();
  }

  static exportJSON() {
    return this.registry.exportJSON();
  }

  static reset(): void {
    this.registry.reset();
  }
}

// ============================================================================
// Performance Timer Utility
// ============================================================================

export class PerformanceTimer {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
  }

  end(labels?: MetricLabels): number {
    const duration = Date.now() - this.startTime;
    FlowMetrics.recordEventProcessingTime(this.operation, duration);
    return duration;
  }

  static async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    labels?: MetricLabels
  ): Promise<T> {
    const timer = new PerformanceTimer(operation);

    try {
      const result = await fn();
      timer.end(labels);
      return result;
    } catch (error) {
      timer.end({ ...labels, status: 'error' });
      throw error;
    }
  }
}

// Export singleton
export const flowMetrics = FlowMetrics;
