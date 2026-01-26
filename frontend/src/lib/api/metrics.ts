/**
 * Simple Metrics Collection Utility
 * Collects API performance metrics for monitoring and debugging
 */

interface RequestMetric {
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

interface AggregatedMetrics {
  totalRequests: number;
  successRate: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  errorCount: number;
  requestsByPath: Record<string, number>;
  errorsByPath: Record<string, number>;
}

/**
 * In-memory metrics collector for API routes
 * In production, consider exporting to a proper metrics service
 */
class MetricsCollector {
  private metrics: RequestMetric[] = [];
  private readonly maxMetrics: number;
  private readonly retentionMs: number;

  constructor(options: { maxMetrics?: number; retentionMs?: number } = {}) {
    this.maxMetrics = options.maxMetrics ?? 10000;
    this.retentionMs = options.retentionMs ?? 3600000; // 1 hour default

    // Cleanup old metrics periodically
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 60000);
    }
  }

  /**
   * Record a request metric
   */
  record(metric: Omit<RequestMetric, 'timestamp'>): void {
    this.metrics.push({
      ...metric,
      timestamp: Date.now(),
    });

    // Trim if over limit
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get aggregated metrics for a time window
   */
  getAggregated(windowMs: number = 300000): AggregatedMetrics {
    const cutoff = Date.now() - windowMs;
    const recent = this.metrics.filter((m) => m.timestamp >= cutoff);

    if (recent.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        avgDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorCount: 0,
        requestsByPath: {},
        errorsByPath: {},
      };
    }

    // Calculate success rate
    const successCount = recent.filter((m) => m.statusCode < 400).length;
    const errorCount = recent.length - successCount;

    // Calculate duration percentiles
    const durations = recent.map((m) => m.duration).sort((a, b) => a - b);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Group by path
    const requestsByPath: Record<string, number> = {};
    const errorsByPath: Record<string, number> = {};

    for (const metric of recent) {
      requestsByPath[metric.path] = (requestsByPath[metric.path] || 0) + 1;
      if (metric.statusCode >= 400) {
        errorsByPath[metric.path] = (errorsByPath[metric.path] || 0) + 1;
      }
    }

    return {
      totalRequests: recent.length,
      successRate: (successCount / recent.length) * 100,
      avgDuration: Math.round(avgDuration),
      p50Duration: this.percentile(durations, 50),
      p95Duration: this.percentile(durations, 95),
      p99Duration: this.percentile(durations, 99),
      errorCount,
      requestsByPath,
      errorsByPath,
    };
  }

  /**
   * Get metrics for a specific path
   */
  getPathMetrics(
    path: string,
    windowMs: number = 300000
  ): {
    count: number;
    avgDuration: number;
    errorRate: number;
  } {
    const cutoff = Date.now() - windowMs;
    const pathMetrics = this.metrics.filter(
      (m) => m.path === path && m.timestamp >= cutoff
    );

    if (pathMetrics.length === 0) {
      return { count: 0, avgDuration: 0, errorRate: 0 };
    }

    const durations = pathMetrics.map((m) => m.duration);
    const errorCount = pathMetrics.filter((m) => m.statusCode >= 400).length;

    return {
      count: pathMetrics.length,
      avgDuration: Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length
      ),
      errorRate: (errorCount / pathMetrics.length) * 100,
    };
  }

  /**
   * Get slow requests (above threshold)
   */
  getSlowRequests(
    thresholdMs: number = 5000,
    limit: number = 10
  ): RequestMetric[] {
    return this.metrics
      .filter((m) => m.duration >= thresholdMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): RequestMetric[] {
    return this.metrics
      .filter((m) => m.statusCode >= 400)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get raw metrics count
   */
  getCount(): number {
    return this.metrics.length;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.retentionMs;
    this.metrics = this.metrics.filter((m) => m.timestamp >= cutoff);
  }
}

// Global metrics instance
export const apiMetrics = new MetricsCollector();

/**
 * Helper function to record a request with timing
 */
export function recordRequest(
  path: string,
  method: string,
  statusCode: number,
  startTime: number
): void {
  apiMetrics.record({
    path,
    method,
    statusCode,
    duration: Date.now() - startTime,
  });
}

/**
 * Middleware-style wrapper to automatically record metrics
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   return withMetrics(request, async () => {
 *     // ... handler logic
 *     return NextResponse.json({ success: true });
 *   });
 * }
 */
export async function withMetrics<T extends { status?: number }>(
  request: Request,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const url = new URL(request.url);

  try {
    const response = await handler();
    recordRequest(
      url.pathname,
      request.method,
      response.status ?? 200,
      startTime
    );
    return response;
  } catch (error) {
    recordRequest(url.pathname, request.method, 500, startTime);
    throw error;
  }
}

export default apiMetrics;
