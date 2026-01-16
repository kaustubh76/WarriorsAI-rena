/**
 * External Market Monitoring Service
 * Provides observability for Polymarket and Kalshi integrations
 *
 * Features:
 * - API operation metrics
 * - Rate limit tracking
 * - Health checks
 * - Error rate monitoring
 */

import {
  type RateLimitState,
  polymarketAdaptiveRateLimiter,
  kalshiAdaptiveRateLimiter,
  opinionAdaptiveRateLimiter,
} from '@/lib/adaptiveRateLimiter';

// ============================================
// TYPES
// ============================================

export type ExternalService = 'polymarket' | 'kalshi' | '0g' | 'opinion';

export interface MetricEvent {
  service: ExternalService;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export interface RateLimitMetrics {
  service: string;
  remaining: number;
  limit: number;
  resetAt: number;
}

export interface ServiceHealth {
  polymarket: boolean;
  kalshi: boolean;
  opinion: boolean;
  websockets: {
    polymarket: boolean;
    kalshi: boolean;
  };
}

export interface AggregatedMetrics {
  total: number;
  success: number;
  failed: number;
  avgDuration: number;
  errorRate: number;
  p95Duration: number;
}

// ============================================
// MONITOR CLASS
// ============================================

class ExternalMarketMonitor {
  private metrics: MetricEvent[] = [];
  private rateLimitState: Map<string, RateLimitMetrics> = new Map();
  private wsConnectionState: Map<string, boolean> = new Map();
  private maxMetrics: number = 1000;

  constructor() {
    // Initialize WebSocket states
    this.wsConnectionState.set('polymarket', false);
    this.wsConnectionState.set('kalshi', false);
  }

  /**
   * Record an API operation metric
   */
  recordOperation(event: MetricEvent): void {
    const fullEvent: MetricEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.metrics.push(fullEvent);

    // Keep only last maxMetrics entries
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log errors
    if (!event.success) {
      console.error(
        `[Monitor] ${event.service}/${event.operation} failed:`,
        event.error
      );
    }

    // Log slow operations (> 5 seconds)
    if (event.duration > 5000) {
      console.warn(
        `[Monitor] Slow operation: ${event.service}/${event.operation} took ${event.duration}ms`
      );
    }
  }

  /**
   * Update rate limit state for a service
   */
  updateRateLimit(service: string, state: RateLimitMetrics): void {
    this.rateLimitState.set(service, state);

    // Warn if approaching limit
    if (state.remaining < state.limit * 0.2) {
      console.warn(
        `[Monitor] ${service} rate limit low: ${state.remaining}/${state.limit}`
      );
    }
  }

  /**
   * Update WebSocket connection state
   */
  setWebSocketConnected(service: 'polymarket' | 'kalshi', connected: boolean): void {
    this.wsConnectionState.set(service, connected);

    if (!connected) {
      console.warn(`[Monitor] ${service} WebSocket disconnected`);
    }
  }

  /**
   * Get aggregated metrics for a time window
   */
  getMetrics(service?: ExternalService, minutes: number = 5): AggregatedMetrics {
    const cutoff = Date.now() - minutes * 60 * 1000;
    let filtered = this.metrics.filter(
      (m) => m.timestamp && m.timestamp >= cutoff
    );

    if (service) {
      filtered = filtered.filter((m) => m.service === service);
    }

    const total = filtered.length;
    const success = filtered.filter((m) => m.success).length;
    const failed = total - success;
    const avgDuration =
      total > 0
        ? filtered.reduce((sum, m) => sum + m.duration, 0) / total
        : 0;
    const errorRate = total > 0 ? (failed / total) * 100 : 0;

    // Calculate p95 duration
    const durations = filtered.map((m) => m.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Duration = durations[p95Index] || 0;

    return { total, success, failed, avgDuration, errorRate, p95Duration };
  }

  /**
   * Get current rate limit status for all services
   */
  getRateLimitStatus(): Map<string, RateLimitMetrics> {
    // Update from adaptive rate limiters
    this.rateLimitState.set('polymarket', {
      service: 'polymarket',
      ...polymarketAdaptiveRateLimiter.getState(),
    });
    this.rateLimitState.set('kalshi', {
      service: 'kalshi',
      ...kalshiAdaptiveRateLimiter.getState(),
    });
    this.rateLimitState.set('opinion', {
      service: 'opinion',
      ...opinionAdaptiveRateLimiter.getState(),
    });

    return new Map(this.rateLimitState);
  }

  /**
   * Get current service health status
   */
  getHealth(): ServiceHealth {
    const polymarketMetrics = this.getMetrics('polymarket', 1);
    const kalshiMetrics = this.getMetrics('kalshi', 1);
    const opinionMetrics = this.getMetrics('opinion', 1);

    return {
      polymarket: polymarketMetrics.errorRate < 50,
      kalshi: kalshiMetrics.errorRate < 50,
      opinion: opinionMetrics.errorRate < 50,
      websockets: {
        polymarket: this.wsConnectionState.get('polymarket') || false,
        kalshi: this.wsConnectionState.get('kalshi') || false,
      },
    };
  }

  /**
   * Get recent errors for debugging
   */
  getRecentErrors(limit: number = 10): MetricEvent[] {
    return this.metrics
      .filter((m) => !m.success)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get operations by type
   */
  getOperationBreakdown(
    service: ExternalService,
    minutes: number = 5
  ): Record<string, AggregatedMetrics> {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const filtered = this.metrics.filter(
      (m) => m.service === service && m.timestamp && m.timestamp >= cutoff
    );

    const breakdown: Record<string, MetricEvent[]> = {};
    for (const metric of filtered) {
      if (!breakdown[metric.operation]) {
        breakdown[metric.operation] = [];
      }
      breakdown[metric.operation].push(metric);
    }

    const result: Record<string, AggregatedMetrics> = {};
    for (const [operation, events] of Object.entries(breakdown)) {
      const total = events.length;
      const success = events.filter((m) => m.success).length;
      const failed = total - success;
      const avgDuration = events.reduce((s, m) => s + m.duration, 0) / total;
      const errorRate = (failed / total) * 100;
      const durations = events.map((m) => m.duration).sort((a, b) => a - b);
      const p95Duration = durations[Math.floor(durations.length * 0.95)] || 0;

      result[operation] = {
        total,
        success,
        failed,
        avgDuration,
        errorRate,
        p95Duration,
      };
    }

    return result;
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.metrics = [];
    this.rateLimitState.clear();
  }
}

// Export singleton instance
export const externalMarketMonitor = new ExternalMarketMonitor();

// ============================================
// WRAPPER FUNCTION
// ============================================

/**
 * Wrapper for monitored API calls
 * Automatically records metrics for the operation
 *
 * @param service - The external service being called
 * @param operation - Name of the operation
 * @param fn - Async function to execute
 * @param metadata - Optional metadata to record
 * @returns Result of the function
 */
export async function monitoredCall<T>(
  service: ExternalService,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();

  try {
    const result = await fn();
    externalMarketMonitor.recordOperation({
      service,
      operation,
      duration: Date.now() - start,
      success: true,
      metadata,
    });
    return result;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    externalMarketMonitor.recordOperation({
      service,
      operation,
      duration: Date.now() - start,
      success: false,
      error: errorMessage,
      metadata,
    });
    throw error;
  }
}

/**
 * Wrapper that doesn't throw on error
 * Returns null on failure instead
 */
export async function safeMonitoredCall<T>(
  service: ExternalService,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T | null> {
  try {
    return await monitoredCall(service, operation, fn, metadata);
  } catch {
    return null;
  }
}
