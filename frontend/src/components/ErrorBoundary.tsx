'use client';

import React, { Component, ErrorInfo, ReactNode, useCallback, useState } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional context name for error reporting */
  context?: string;
  /** Whether to show a compact error UI */
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

/** Generate a unique error ID for tracking */
function generateErrorId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * React Error Boundary component for graceful error handling
 * Catches JavaScript errors in child component tree and displays fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorId: generateErrorId() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const context = this.props.context || 'Unknown';
    console.error(`[ErrorBoundary:${context}] Error ID: ${this.state.errorId}`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Compact version for inline errors
      if (this.props.compact) {
        return (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-red-400 text-sm">Failed to load</span>
              <button
                onClick={this.handleReset}
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg m-4">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
            Something went wrong
          </h2>
          <p className="text-red-600 dark:text-red-300 mt-2">
            An error occurred while rendering this section. Please try again.
          </p>
          {this.state.errorId && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-2">
              Error ID: {this.state.errorId}
            </p>
          )}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="mt-4 p-3 bg-red-100 dark:bg-red-900/40 rounded text-sm text-red-700 dark:text-red-300 overflow-auto max-h-40">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component wrapper for ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode,
  context?: string
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback} context={context}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Custom hook for async operations with built-in retry logic
 * Useful for blockchain operations that may fail due to network issues
 */
export interface UseAsyncRetryOptions<T> {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Delay between retries in milliseconds (uses exponential backoff) */
  baseDelay?: number;
  /** Callback when operation succeeds */
  onSuccess?: (data: T) => void;
  /** Callback when all retries fail */
  onError?: (error: Error) => void;
  /** Whether to retry on specific error types only */
  retryOn?: (error: Error) => boolean;
}

export interface UseAsyncRetryResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  retryCount: number;
  execute: () => Promise<T | null>;
  reset: () => void;
}

export function useAsyncRetry<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncRetryOptions<T> = {}
): UseAsyncRetryResult<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    onSuccess,
    onError,
    retryOn = () => true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setRetryCount(0);
  }, []);

  const execute = useCallback(async (): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        const result = await asyncFn();
        setData(result);
        setIsLoading(false);
        setRetryCount(attempts);
        onSuccess?.(result);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempts++;
        setRetryCount(attempts);

        // Check if we should retry this error
        if (attempts <= maxRetries && retryOn(lastError)) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const delay = baseDelay * Math.pow(2, attempts - 1);
          console.log(`[useAsyncRetry] Attempt ${attempts}/${maxRetries + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    // All retries exhausted
    setError(lastError);
    setIsLoading(false);
    if (lastError) {
      onError?.(lastError);
    }
    return null;
  }, [asyncFn, maxRetries, baseDelay, onSuccess, onError, retryOn]);

  return { data, error, isLoading, retryCount, execute, reset };
}

/**
 * Predefined retry conditions for common scenarios
 */
export const RetryConditions = {
  /** Retry on network errors */
  networkError: (error: Error) =>
    error.message.includes('network') ||
    error.message.includes('fetch') ||
    error.message.includes('timeout') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ECONNREFUSED'),

  /** Retry on rate limit errors */
  rateLimitError: (error: Error) =>
    error.message.includes('429') ||
    error.message.includes('rate limit') ||
    error.message.includes('too many requests'),

  /** Retry on blockchain RPC errors */
  blockchainError: (error: Error) =>
    error.message.includes('nonce') ||
    error.message.includes('gas') ||
    error.message.includes('pending') ||
    error.message.includes('replacement') ||
    error.message.includes('timeout'),

  /** Retry on any of the above */
  any: (error: Error) =>
    RetryConditions.networkError(error) ||
    RetryConditions.rateLimitError(error) ||
    RetryConditions.blockchainError(error),
};

export default ErrorBoundary;
