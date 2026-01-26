'use client';

/**
 * Async Data Fetching Hooks
 * Hooks for managing async operations with loading, error, and data states
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

export interface UseAsyncOptions<T> {
  /** Whether to execute immediately on mount */
  immediate?: boolean;
  /** Initial data value */
  initialData?: T | null;
  /** Callback on success */
  onSuccess?: (data: T) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Dependencies that trigger re-fetch when changed */
  deps?: unknown[];
}

/**
 * Hook for managing async operations
 *
 * @example
 * const { data, isLoading, error, execute } = useAsync(
 *   () => fetchUserData(userId),
 *   { immediate: true, deps: [userId] }
 * );
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncOptions<T> = {}
): AsyncState<T> & {
  execute: () => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
} {
  const {
    immediate = false,
    initialData = null,
    onSuccess,
    onError,
    deps = [],
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    error: null,
    isLoading: immediate,
    isSuccess: false,
    isError: false,
  });

  const mountedRef = useRef(true);
  const asyncFnRef = useRef(asyncFn);

  // Update ref when asyncFn changes
  useEffect(() => {
    asyncFnRef.current = asyncFn;
  }, [asyncFn]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (): Promise<T | null> => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const result = await asyncFnRef.current();

      if (mountedRef.current) {
        setState({
          data: result,
          error: null,
          isLoading: false,
          isSuccess: true,
          isError: false,
        });
        onSuccess?.(result);
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          error,
          isLoading: false,
          isSuccess: false,
          isError: true,
        }));
        onError?.(error);
      }

      return null;
    }
  }, [onSuccess, onError]);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      error: null,
      isLoading: false,
      isSuccess: false,
      isError: false,
    });
  }, [initialData]);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({
      ...prev,
      data,
      isSuccess: data !== null,
    }));
  }, []);

  // Execute on mount if immediate
  useEffect(() => {
    if (immediate) {
      execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, ...deps]);

  return {
    ...state,
    execute,
    reset,
    setData,
  };
}

/**
 * Hook for polling data at regular intervals
 *
 * @example
 * const { data, isLoading } = usePolling(
 *   () => fetchLatestPrice(),
 *   { interval: 5000 }
 * );
 */
export function usePolling<T>(
  asyncFn: () => Promise<T>,
  options: {
    interval: number;
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  }
): AsyncState<T> & { refresh: () => Promise<T | null> } {
  const { interval, enabled = true, onSuccess, onError } = options;

  const result = useAsync(asyncFn, {
    immediate: enabled,
    onSuccess,
    onError,
  });

  useEffect(() => {
    if (!enabled) return;

    const intervalId = setInterval(() => {
      result.execute();
    }, interval);

    return () => clearInterval(intervalId);
  }, [enabled, interval, result.execute]);

  return {
    ...result,
    refresh: result.execute,
  };
}

/**
 * Hook for fetch with automatic JSON parsing
 *
 * @example
 * const { data, isLoading, error } = useFetch<User[]>(
 *   '/api/users',
 *   { immediate: true }
 * );
 */
export function useFetch<T>(
  url: string,
  options: UseAsyncOptions<T> & {
    fetchOptions?: RequestInit;
  } = {}
): AsyncState<T> & {
  execute: () => Promise<T | null>;
  reset: () => void;
  refetch: () => Promise<T | null>;
} {
  const { fetchOptions, ...asyncOptions } = options;

  const result = useAsync<T>(async () => {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }, {
    ...asyncOptions,
    deps: [url, JSON.stringify(fetchOptions), ...(asyncOptions.deps || [])],
  });

  return {
    ...result,
    refetch: result.execute,
  };
}

/**
 * Hook for paginated data fetching
 *
 * @example
 * const {
 *   data,
 *   page,
 *   hasMore,
 *   loadMore,
 *   reset
 * } = usePagination(
 *   (page) => fetchItems({ page, limit: 20 }),
 *   { pageSize: 20 }
 * );
 */
export function usePagination<T>(
  fetchFn: (page: number) => Promise<{ items: T[]; hasMore: boolean }>,
  options: {
    pageSize?: number;
    initialPage?: number;
  } = {}
): {
  data: T[];
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  reset: () => void;
  refresh: () => Promise<void>;
} {
  const { initialPage = 1 } = options;

  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const result = await fetchFn(pageNum);

        setData((prev) => (append ? [...prev, ...result.items] : result.items));
        setHasMore(result.hasMore);
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [fetchFn]
  );

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    await fetchPage(page + 1, true);
  }, [fetchPage, page, isLoading, isLoadingMore, hasMore]);

  const reset = useCallback(() => {
    setData([]);
    setPage(initialPage);
    setHasMore(true);
    setError(null);
  }, [initialPage]);

  const refresh = useCallback(async () => {
    reset();
    await fetchPage(initialPage, false);
  }, [reset, fetchPage, initialPage]);

  return {
    data,
    page,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    reset,
    refresh,
  };
}

/**
 * Hook for mutation operations (POST, PUT, DELETE)
 *
 * @example
 * const { mutate, isLoading } = useMutation(
 *   (data) => api.createUser(data),
 *   { onSuccess: () => refetchUsers() }
 * );
 *
 * await mutate({ name: 'John' });
 */
export function useMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    onSettled?: (data: TData | null, error: Error | null, variables: TVariables) => void;
  } = {}
): {
  mutate: (variables: TVariables) => Promise<TData | null>;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  data: TData | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
} {
  const { onSuccess, onError, onSettled } = options;

  const [state, setState] = useState<{
    data: TData | null;
    error: Error | null;
    isLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
  }>({
    data: null,
    error: null,
    isLoading: false,
    isSuccess: false,
    isError: false,
  });

  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TData> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await mutationFn(variables);

        setState({
          data: result,
          error: null,
          isLoading: false,
          isSuccess: true,
          isError: false,
        });

        onSuccess?.(result, variables);
        onSettled?.(result, null, variables);

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        setState((prev) => ({
          ...prev,
          error,
          isLoading: false,
          isSuccess: false,
          isError: true,
        }));

        onError?.(error, variables);
        onSettled?.(null, error, variables);

        throw error;
      }
    },
    [mutationFn, onSuccess, onError, onSettled]
  );

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | null> => {
      try {
        return await mutateAsync(variables);
      } catch {
        return null;
      }
    },
    [mutateAsync]
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      isLoading: false,
      isSuccess: false,
      isError: false,
    });
  }, []);

  return {
    mutate,
    mutateAsync,
    ...state,
    reset,
  };
}

export default useAsync;
