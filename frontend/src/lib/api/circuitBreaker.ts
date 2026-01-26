/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when a service is down
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeout?: number;
  /** Number of successful calls to close circuit (default: 2) */
  successThreshold?: number;
  /** Callback when circuit opens */
  onOpen?: (failures: number) => void;
  /** Callback when circuit closes */
  onClose?: () => void;
  /** Callback when circuit enters half-open state */
  onHalfOpen?: () => void;
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

/**
 * Circuit Breaker class for protecting external service calls
 *
 * @example
 * const apiBreaker = new CircuitBreaker({ failureThreshold: 5 });
 *
 * // Wrap API calls
 * const result = await apiBreaker.call(() => fetch('/api/external'));
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30000,
      successThreshold: options.successThreshold ?? 2,
      onOpen: options.onOpen ?? (() => {}),
      onClose: options.onClose ?? (() => {}),
      onHalfOpen: options.onHalfOpen ?? (() => {}),
    };

    this.state = {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state.state,
      failures: this.state.failures,
      successes: this.state.successes,
      lastFailureTime: this.state.lastFailureTime,
    };
  }

  /**
   * Check if circuit allows requests
   */
  private canRequest(): boolean {
    const now = Date.now();

    switch (this.state.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if enough time has passed to try again
        if (now >= this.state.nextAttemptTime) {
          this.transitionTo('half-open');
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return false;
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state.state === newState) return;

    this.state.state = newState;

    switch (newState) {
      case 'open':
        this.options.onOpen(this.state.failures);
        break;
      case 'closed':
        this.state.failures = 0;
        this.state.successes = 0;
        this.options.onClose();
        break;
      case 'half-open':
        this.state.successes = 0;
        this.options.onHalfOpen();
        break;
    }
  }

  /**
   * Record a successful call
   */
  private recordSuccess(): void {
    if (this.state.state === 'half-open') {
      this.state.successes++;
      if (this.state.successes >= this.options.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state.state === 'closed') {
      // Reset failure count on success
      this.state.failures = 0;
    }
  }

  /**
   * Record a failed call
   */
  private recordFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'half-open') {
      // Any failure in half-open immediately opens circuit
      this.state.nextAttemptTime = Date.now() + this.options.resetTimeout;
      this.transitionTo('open');
    } else if (this.state.state === 'closed') {
      if (this.state.failures >= this.options.failureThreshold) {
        this.state.nextAttemptTime = Date.now() + this.options.resetTimeout;
        this.transitionTo('open');
      }
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canRequest()) {
      throw new CircuitBreakerError(
        'Circuit breaker is open',
        this.state.nextAttemptTime - Date.now()
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Registry for managing multiple circuit breakers
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker for a service
   */
  getBreaker(
    serviceName: string,
    options?: CircuitBreakerOptions
  ): CircuitBreaker {
    let breaker = this.breakers.get(serviceName);

    if (!breaker) {
      breaker = new CircuitBreaker({
        ...options,
        onOpen: (failures) => {
          console.warn(`[CircuitBreaker] ${serviceName} opened after ${failures} failures`);
          options?.onOpen?.(failures);
        },
        onClose: () => {
          console.log(`[CircuitBreaker] ${serviceName} closed`);
          options?.onClose?.();
        },
        onHalfOpen: () => {
          console.log(`[CircuitBreaker] ${serviceName} half-open, testing...`);
          options?.onHalfOpen?.();
        },
      });
      this.breakers.set(serviceName, breaker);
    }

    return breaker;
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates(): Record<string, CircuitState> {
    const states: Record<string, CircuitState> = {};
    for (const [name, breaker] of this.breakers) {
      states[name] = breaker.getState();
    }
    return states;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Global registry instance
export const circuitBreakers = new CircuitBreakerRegistry();

/**
 * Predefined circuit breaker configurations
 */
export const CircuitBreakerPresets = {
  /**
   * Strict breaker for critical services (opens fast, recovers slow)
   */
  strict: {
    failureThreshold: 3,
    resetTimeout: 60000,
    successThreshold: 3,
  },

  /**
   * Standard breaker for most external APIs
   */
  standard: {
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
  },

  /**
   * Lenient breaker for flaky but non-critical services
   */
  lenient: {
    failureThreshold: 10,
    resetTimeout: 15000,
    successThreshold: 1,
  },
} as const;
