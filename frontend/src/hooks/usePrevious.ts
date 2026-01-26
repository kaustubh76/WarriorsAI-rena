'use client';

/**
 * Previous Value Hooks
 * Hooks for tracking previous values and state history
 */

import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Hook to get the previous value of a variable
 *
 * @example
 * const [count, setCount] = useState(0);
 * const prevCount = usePrevious(count);
 * // After setCount(5): count = 5, prevCount = 0
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Hook to get the previous value with initial value support
 *
 * @example
 * const [count, setCount] = useState(0);
 * const prevCount = usePreviousWithInitial(count, 0);
 * // Initially: count = 0, prevCount = 0
 */
export function usePreviousWithInitial<T>(value: T, initialValue: T): T {
  const ref = useRef<T>(initialValue);
  const prev = ref.current;

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return prev;
}

/**
 * Hook to track value history
 *
 * @example
 * const [count, setCount] = useState(0);
 * const { history, back, forward, canBack, canForward } = useHistory(count, 10);
 */
export function useHistory<T>(
  value: T,
  maxHistory: number = 10
): {
  history: T[];
  position: number;
  back: () => T | undefined;
  forward: () => T | undefined;
  go: (index: number) => T | undefined;
  canBack: boolean;
  canForward: boolean;
  clear: () => void;
} {
  const [history, setHistory] = useState<T[]>([value]);
  const [position, setPosition] = useState(0);
  const isNavigatingRef = useRef(false);

  // Add new values to history
  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }

    setHistory((prev) => {
      // Remove any forward history when adding new value
      const newHistory = prev.slice(0, position + 1);
      newHistory.push(value);

      // Trim to max length
      if (newHistory.length > maxHistory) {
        newHistory.shift();
        return newHistory;
      }

      return newHistory;
    });
    setPosition((prev) => Math.min(prev + 1, maxHistory - 1));
  }, [value, maxHistory, position]);

  const canBack = position > 0;
  const canForward = position < history.length - 1;

  const back = useCallback(() => {
    if (!canBack) return undefined;
    isNavigatingRef.current = true;
    setPosition((p) => p - 1);
    return history[position - 1];
  }, [canBack, history, position]);

  const forward = useCallback(() => {
    if (!canForward) return undefined;
    isNavigatingRef.current = true;
    setPosition((p) => p + 1);
    return history[position + 1];
  }, [canForward, history, position]);

  const go = useCallback(
    (index: number) => {
      if (index < 0 || index >= history.length) return undefined;
      isNavigatingRef.current = true;
      setPosition(index);
      return history[index];
    },
    [history]
  );

  const clear = useCallback(() => {
    setHistory([value]);
    setPosition(0);
  }, [value]);

  return {
    history,
    position,
    back,
    forward,
    go,
    canBack,
    canForward,
    clear,
  };
}

/**
 * Hook to detect if a value has changed
 *
 * @example
 * const hasChanged = useHasChanged(userId);
 * if (hasChanged) {
 *   // Refetch data for new user
 * }
 */
export function useHasChanged<T>(value: T): boolean {
  const prevValue = usePrevious(value);
  return prevValue !== value;
}

/**
 * Hook to detect first render
 *
 * @example
 * const isFirstRender = useIsFirstRender();
 * if (!isFirstRender) {
 *   // Skip animation on first render
 * }
 */
export function useIsFirstRender(): boolean {
  const isFirstRef = useRef(true);

  useEffect(() => {
    isFirstRef.current = false;
  }, []);

  return isFirstRef.current;
}

/**
 * Hook to track mount state
 *
 * @example
 * const isMounted = useIsMounted();
 * useEffect(() => {
 *   fetchData().then(data => {
 *     if (isMounted()) setData(data);
 *   });
 * }, []);
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}

/**
 * Hook to run effect only on update (skip first render)
 *
 * @example
 * useUpdateEffect(() => {
 *   // This won't run on mount, only on updates
 *   console.log('Value updated:', value);
 * }, [value]);
 */
export function useUpdateEffect(
  effect: React.EffectCallback,
  deps?: React.DependencyList
): void {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Hook to track render count (useful for debugging)
 *
 * @example
 * const renderCount = useRenderCount();
 * console.log(`Component rendered ${renderCount} times`);
 */
export function useRenderCount(): number {
  const countRef = useRef(0);
  countRef.current++;
  return countRef.current;
}

/**
 * Hook to get a stable callback that always calls the latest version
 *
 * @example
 * const stableCallback = useLatestCallback((value) => {
 *   // Always uses the latest props/state
 *   console.log(latestState, value);
 * });
 */
export function useLatestCallback<T extends (...args: unknown[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args) => callbackRef.current(...args)) as T,
    []
  );
}

export default usePrevious;
