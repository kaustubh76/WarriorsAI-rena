'use client';

/**
 * Debounce and Throttle Hooks
 * Utility hooks for rate-limiting function calls and values
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounce a value - returns the value after it stops changing for the delay period
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 *
 * useEffect(() => {
 *   // Only search after user stops typing for 300ms
 *   performSearch(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounce a callback function
 *
 * @example
 * const debouncedSave = useDebouncedCallback(
 *   (data) => saveToServer(data),
 *   500
 * );
 *
 * // Call debouncedSave multiple times, only the last call executes
 * debouncedSave(formData);
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref on each render to capture latest closure
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

/**
 * Throttle a value - returns the value at most once per delay period
 *
 * @example
 * const [scrollY, setScrollY] = useState(0);
 * const throttledScrollY = useThrottle(scrollY, 100);
 *
 * // throttledScrollY updates at most every 100ms
 */
export function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecuted = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastExecuted.current;

    if (elapsed >= delay) {
      setThrottledValue(value);
      lastExecuted.current = now;
    } else {
      const timer = setTimeout(() => {
        setThrottledValue(value);
        lastExecuted.current = Date.now();
      }, delay - elapsed);

      return () => clearTimeout(timer);
    }
  }, [value, delay]);

  return throttledValue;
}

/**
 * Throttle a callback function - executes at most once per delay period
 *
 * @example
 * const throttledScroll = useThrottledCallback(
 *   () => updateScrollPosition(),
 *   100
 * );
 *
 * window.addEventListener('scroll', throttledScroll);
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (...args: Parameters<T>) => void {
  const { leading = true, trailing = true } = options;

  const lastExecuted = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const elapsed = now - lastExecuted.current;

      lastArgsRef.current = args;

      if (elapsed >= delay) {
        // Enough time has passed, execute immediately
        if (leading) {
          lastExecuted.current = now;
          callbackRef.current(...args);
        }
      } else if (trailing && !timeoutRef.current) {
        // Schedule trailing call
        timeoutRef.current = setTimeout(() => {
          lastExecuted.current = Date.now();
          timeoutRef.current = null;
          if (lastArgsRef.current) {
            callbackRef.current(...lastArgsRef.current);
          }
        }, delay - elapsed);
      }
    },
    [delay, leading, trailing]
  );
}

/**
 * Debounce with immediate execution option
 * Executes immediately on first call, then debounces subsequent calls
 *
 * @example
 * const debouncedWithImmediate = useDebounceImmediate(
 *   (value) => saveValue(value),
 *   500
 * );
 */
export function useDebounceImmediate<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCalledRef = useRef(false);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (!hasCalledRef.current) {
        // First call - execute immediately
        hasCalledRef.current = true;
        callbackRef.current(...args);

        // Reset after delay
        timeoutRef.current = setTimeout(() => {
          hasCalledRef.current = false;
        }, delay);
      } else {
        // Subsequent calls - debounce
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          callbackRef.current(...args);
          hasCalledRef.current = false;
        }, delay);
      }
    },
    [delay]
  );
}

export default useDebounce;
