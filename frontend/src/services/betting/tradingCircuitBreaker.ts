/**
 * Trading Circuit Breaker
 *
 * Prevents cascade failures by temporarily disabling trading after
 * consecutive failures. Automatically resets after cooldown period.
 */

export class TradingCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private isOpen = false;

  // Configuration (can be overridden via environment variables)
  private readonly FAILURE_THRESHOLD = parseInt(
    process.env.CIRCUIT_BREAKER_THRESHOLD || '5'
  ); // 5 consecutive failures
  private readonly RESET_TIMEOUT_MS = parseInt(
    process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '60000'
  ); // 1 minute
  private readonly HALF_OPEN_TIMEOUT_MS = parseInt(
    process.env.CIRCUIT_BREAKER_HALF_OPEN_MS || '30000'
  ); // 30 seconds in half-open state

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime: Date | null;
    willResetAt: Date | null;
  } {
    let willResetAt: Date | null = null;

    if (this.isOpen && this.lastFailureTime) {
      willResetAt = new Date(
        this.lastFailureTime.getTime() + this.RESET_TIMEOUT_MS
      );
    }

    return {
      isOpen: this.isOpen,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      willResetAt,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param fn Function to execute
   * @param operationName Name of operation (for logging)
   * @returns Result of the function
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(
    fn: () => Promise<T>,
    operationName = 'trading operation'
  ): Promise<T> {
    // Check if circuit is open
    if (this.isOpen) {
      const timeSinceFailure =
        Date.now() - (this.lastFailureTime?.getTime() || 0);

      if (timeSinceFailure < this.RESET_TIMEOUT_MS) {
        const secondsRemaining = Math.ceil(
          (this.RESET_TIMEOUT_MS - timeSinceFailure) / 1000
        );

        console.error(
          `[CircuitBreaker] Circuit is OPEN - too many ${operationName} failures. ` +
            `Will reset in ${secondsRemaining}s. ` +
            `Failure count: ${this.failureCount}/${this.FAILURE_THRESHOLD}`
        );

        throw new Error(
          `Trading circuit breaker is open. System will retry in ${secondsRemaining} seconds. ` +
            `This is a safety mechanism to prevent cascade failures.`
        );
      }

      // Try to reset (enter half-open state)
      console.log(
        `[CircuitBreaker] Timeout elapsed. Entering HALF-OPEN state for ${operationName}.`
      );
      this.isOpen = false;
      this.failureCount = Math.floor(this.FAILURE_THRESHOLD / 2); // Keep partial count
    }

    try {
      const result = await fn();

      // Success - reset failure count
      if (this.failureCount > 0) {
        console.log(
          `[CircuitBreaker] ${operationName} succeeded. Resetting failure count from ${this.failureCount} to 0.`
        );
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      // Failure - increment count
      this.failureCount++;
      this.lastFailureTime = new Date();

      console.error(
        `[CircuitBreaker] ${operationName} failed. ` +
          `Failure count: ${this.failureCount}/${this.FAILURE_THRESHOLD}. ` +
          `Error: ${(error as Error).message}`
      );

      // Check if threshold reached
      if (this.failureCount >= this.FAILURE_THRESHOLD) {
        this.isOpen = true;
        console.error(
          `[CircuitBreaker] ⚠️  CIRCUIT BREAKER OPENED ⚠️  ` +
            `Trading disabled for ${this.RESET_TIMEOUT_MS / 1000}s after ${this.failureCount} consecutive failures. ` +
            `This is a safety mechanism to prevent further losses.`
        );
      }

      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker (admin use)
   */
  reset(): void {
    console.log('[CircuitBreaker] Manual reset requested.');
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.isOpen = false;
  }

  /**
   * Manually open the circuit breaker (emergency shutdown)
   */
  emergencyStop(): void {
    console.error(
      '[CircuitBreaker] ⚠️  EMERGENCY STOP - Circuit breaker manually opened'
    );
    this.isOpen = true;
    this.failureCount = this.FAILURE_THRESHOLD;
    this.lastFailureTime = new Date();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

// Global instance for Kalshi trading
export const kalshiCircuitBreaker = new TradingCircuitBreaker();

// Global instance for Polymarket trading
export const polymarketCircuitBreaker = new TradingCircuitBreaker();

// Global instance for arbitrage trading
export const arbitrageCircuitBreaker = new TradingCircuitBreaker();

// Export default for general use
export default TradingCircuitBreaker;
