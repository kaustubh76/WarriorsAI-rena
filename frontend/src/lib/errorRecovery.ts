/**
 * Error Recovery System
 *
 * Robust error handling and recovery mechanisms for production deployment
 *
 * Features:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Dead letter queue for failed operations
 * - Automatic retry with configurable policies
 * - Error classification and routing
 * - Metrics tracking
 */

import { prisma } from './prisma';

// ============================================================================
// Types
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  operation: string;
  severity: ErrorSeverity;
  retryable: boolean;
  metadata?: Record<string, any>;
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
  resetTimeout: 30000,
};

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN - operation rejected');
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await Promise.race([
        operation(),
        this.timeoutPromise(),
      ]);

      this.onSuccess();
      return result as T;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        console.log('[CircuitBreaker] State changed to CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.resetTimeout;
      console.error(
        `[CircuitBreaker] State changed to OPEN - will retry at ${new Date(this.nextAttempt).toISOString()}`
      );

      // Alert on circuit breaker opening
      import('@/lib/alerting/alertManager').then(({ globalAlertManager, AlertSeverity, ALERT_RULES }) => {
        globalAlertManager.sendAlert(
          ALERT_RULES.circuitBreakerOpen.name,
          `Circuit breaker opened after ${this.failureCount} failures - will retry at ${new Date(this.nextAttempt).toISOString()}`,
          AlertSeverity.ERROR,
          { source: 'circuit_breaker', metadata: { failureCount: this.failureCount, nextAttempt: this.nextAttempt } }
        );
      }).catch(err => console.error('[CircuitBreaker] Failed to send alert:', err));
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }
}

// ============================================================================
// Retry with Exponential Backoff
// ============================================================================

export class RetryHandler {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async execute<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry non-retryable errors
        if (!this.isRetryable(error, context)) {
          console.error(`[Retry] Non-retryable error in ${context.operation}:`, error.message);
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.config.maxAttempts) {
          console.error(
            `[Retry] Max attempts (${this.config.maxAttempts}) reached for ${context.operation}`
          );
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        console.warn(
          `[Retry] Attempt ${attempt}/${this.config.maxAttempts} failed for ${context.operation}. ` +
          `Retrying in ${delay}ms. Error: ${error.message}`
        );

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    await this.handleFailedOperation(context, lastError!);
    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();

    return Math.floor(exponentialDelay + jitter);
  }

  private isRetryable(error: any, context: ErrorContext): boolean {
    // Respect context retryable flag
    if (!context.retryable) {
      return false;
    }

    const errorMessage = error.message?.toLowerCase() || '';

    // Network errors are retryable
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('network')
    ) {
      return true;
    }

    // RPC errors
    if (errorMessage.includes('rpc') || errorMessage.includes('provider')) {
      return true;
    }

    // Database connection errors are retryable
    if (
      errorMessage.includes('connection') ||
      errorMessage.includes('pool')
    ) {
      return true;
    }

    // Rate limiting is retryable
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')
    ) {
      return true;
    }

    // Business logic errors are not retryable
    if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden')
    ) {
      return false;
    }

    // Default: retry for high/critical severity
    return context.severity === 'high' || context.severity === 'critical';
  }

  private async handleFailedOperation(context: ErrorContext, error: Error): Promise<void> {
    try {
      // Log to dead letter queue
      await this.logToDeadLetterQueue(context, error);

      // Alert for critical errors
      if (context.severity === 'critical') {
        await this.sendCriticalAlert(context, error);
      }
    } catch (loggingError) {
      console.error('[Retry] Failed to log failed operation:', loggingError);
    }
  }

  private async logToDeadLetterQueue(context: ErrorContext, error: Error): Promise<void> {
    // Store failed operation for manual review/retry
    await prisma.systemAudit.create({
      data: {
        eventType: 'FAILED_OPERATION',
        oldValue: context.operation,
        newValue: JSON.stringify({
          error: error.message,
          stack: error.stack,
          metadata: context.metadata,
          severity: context.severity,
          timestamp: new Date().toISOString(),
        }),
        txHash: 'N/A',
        blockNumber: 0,
      },
    });

    console.error(
      `[DeadLetter] Operation failed after all retries: ${context.operation}`,
      {
        error: error.message,
        severity: context.severity,
        metadata: context.metadata,
      }
    );
  }

  private async sendCriticalAlert(context: ErrorContext, error: Error): Promise<void> {
    // Integrate with alert manager
    const { globalAlertManager } = await import('@/lib/alerting/alertManager');
    const { AlertSeverity } = await import('@/lib/alerting/alertManager');

    await globalAlertManager.sendAlert(
      'Critical Operation Failure',
      `${context.operation} failed after all retries: ${error.message}`,
      AlertSeverity.CRITICAL,
      {
        source: 'error_recovery',
        metadata: {
          operation: context.operation,
          severity: context.severity,
          error: error.message,
          stack: error.stack,
          ...context.metadata,
        },
      }
    );

    console.error(
      `[CRITICAL ALERT] ${context.operation} failed:`,
      {
        error: error.message,
        metadata: context.metadata,
        timestamp: new Date().toISOString(),
      }
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Error Classification
// ============================================================================

export class ErrorClassifier {
  static classify(error: any): ErrorContext {
    const errorMessage = error.message?.toLowerCase() || '';

    // Network/RPC errors - high severity, retryable
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('rpc')
    ) {
      return {
        operation: 'rpc_call',
        severity: 'high',
        retryable: true,
      };
    }

    // Database errors - critical severity, retryable
    if (
      errorMessage.includes('prisma') ||
      errorMessage.includes('database') ||
      errorMessage.includes('connection pool')
    ) {
      return {
        operation: 'database_operation',
        severity: 'critical',
        retryable: true,
      };
    }

    // Oracle errors - critical severity, non-retryable
    if (
      errorMessage.includes('oracle') ||
      errorMessage.includes('unauthorized')
    ) {
      return {
        operation: 'oracle_operation',
        severity: 'critical',
        retryable: false,
      };
    }

    // Event processing errors - medium severity, retryable
    if (errorMessage.includes('event')) {
      return {
        operation: 'event_processing',
        severity: 'medium',
        retryable: true,
      };
    }

    // Default classification
    return {
      operation: 'unknown',
      severity: 'medium',
      retryable: true,
    };
  }
}

// ============================================================================
// Global Error Handler
// ============================================================================

export class GlobalErrorHandler {
  private static retryHandler = new RetryHandler();
  private static rpcCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  static async handleWithRetry<T>(
    operation: () => Promise<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    const fullContext: ErrorContext = {
      operation: context?.operation || 'unknown',
      severity: context?.severity || 'medium',
      retryable: context?.retryable ?? true,
      metadata: context?.metadata,
    };

    return this.retryHandler.execute(operation, fullContext);
  }

  static async handleRPCCall<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    return this.rpcCircuitBreaker.execute(async () => {
      return this.handleWithRetry(operation, {
        operation: operationName,
        severity: 'high',
        retryable: true,
      });
    });
  }

  static getCircuitBreakerMetrics() {
    return {
      rpc: this.rpcCircuitBreaker.getMetrics(),
    };
  }

  static resetCircuitBreakers() {
    this.rpcCircuitBreaker.reset();
    console.log('[GlobalErrorHandler] All circuit breakers reset');
  }
}

// ============================================================================
// Graceful Degradation
// ============================================================================

export class GracefulDegradation {
  private static featureFlags = new Map<string, boolean>([
    ['event_tracking', true],
    ['price_sync', true],
    ['oracle_verification', true],
    ['backfilling', true],
  ]);

  static isFeatureEnabled(feature: string): boolean {
    return this.featureFlags.get(feature) ?? false;
  }

  static disableFeature(feature: string, reason: string): void {
    this.featureFlags.set(feature, false);
    console.warn(`[GracefulDegradation] Feature '${feature}' disabled: ${reason}`);

    // Log to audit
    prisma.systemAudit.create({
      data: {
        eventType: 'FEATURE_DISABLED',
        oldValue: feature,
        newValue: reason,
        txHash: 'N/A',
        blockNumber: 0,
      },
    }).catch(console.error);
  }

  static enableFeature(feature: string): void {
    this.featureFlags.set(feature, true);
    console.log(`[GracefulDegradation] Feature '${feature}' enabled`);
  }

  static getFeatureStatus() {
    return Object.fromEntries(this.featureFlags);
  }
}

// Export singleton instances
export const globalErrorHandler = GlobalErrorHandler;
export const gracefulDegradation = GracefulDegradation;
