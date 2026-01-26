'use client';

/**
 * Optimistic Update Hooks
 * Hooks for handling optimistic updates with rollback on failure
 */

import { useState, useCallback, useRef } from 'react';

export interface OptimisticState<T> {
  data: T;
  isOptimistic: boolean;
  isPending: boolean;
  error: Error | null;
}

export interface UseOptimisticOptions<T> {
  /** Callback when mutation succeeds */
  onSuccess?: (data: T) => void;
  /** Callback when mutation fails */
  onError?: (error: Error, rollbackData: T) => void;
  /** Callback when mutation settles (success or failure) */
  onSettled?: () => void;
}

/**
 * Hook for optimistic updates with automatic rollback
 *
 * @example
 * const { data, isPending, mutate } = useOptimistic(
 *   initialLikes,
 *   async (newLikes) => {
 *     await api.updateLikes(postId, newLikes);
 *     return newLikes;
 *   }
 * );
 *
 * // Optimistically update, rolls back if mutation fails
 * mutate(data + 1);
 */
export function useOptimistic<T>(
  initialData: T,
  mutationFn: (optimisticData: T) => Promise<T>,
  options: UseOptimisticOptions<T> = {}
): {
  data: T;
  isOptimistic: boolean;
  isPending: boolean;
  error: Error | null;
  mutate: (optimisticValue: T) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<OptimisticState<T>>({
    data: initialData,
    isOptimistic: false,
    isPending: false,
    error: null,
  });

  const rollbackRef = useRef<T>(initialData);

  const mutate = useCallback(
    async (optimisticValue: T) => {
      // Store current value for rollback
      rollbackRef.current = state.data;

      // Apply optimistic update immediately
      setState({
        data: optimisticValue,
        isOptimistic: true,
        isPending: true,
        error: null,
      });

      try {
        // Perform actual mutation
        const result = await mutationFn(optimisticValue);

        // Mutation succeeded - confirm the update
        setState({
          data: result,
          isOptimistic: false,
          isPending: false,
          error: null,
        });

        options.onSuccess?.(result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Mutation failed - rollback to previous value
        setState({
          data: rollbackRef.current,
          isOptimistic: false,
          isPending: false,
          error,
        });

        options.onError?.(error, rollbackRef.current);
      } finally {
        options.onSettled?.();
      }
    },
    [state.data, mutationFn, options]
  );

  const reset = useCallback(() => {
    setState({
      data: initialData,
      isOptimistic: false,
      isPending: false,
      error: null,
    });
  }, [initialData]);

  return {
    data: state.data,
    isOptimistic: state.isOptimistic,
    isPending: state.isPending,
    error: state.error,
    mutate,
    reset,
  };
}

/**
 * Hook for optimistic list operations (add, remove, update items)
 *
 * @example
 * const { items, addItem, removeItem, updateItem } = useOptimisticList(
 *   initialItems,
 *   {
 *     add: (item) => api.addItem(item),
 *     remove: (id) => api.removeItem(id),
 *     update: (id, data) => api.updateItem(id, data),
 *   }
 * );
 */
export function useOptimisticList<T extends { id: string | number }>(
  initialItems: T[],
  mutations: {
    add?: (item: T) => Promise<T>;
    remove?: (id: T['id']) => Promise<void>;
    update?: (id: T['id'], data: Partial<T>) => Promise<T>;
  }
): {
  items: T[];
  isPending: boolean;
  pendingIds: Set<T['id']>;
  error: Error | null;
  addItem: (item: T) => Promise<void>;
  removeItem: (id: T['id']) => Promise<void>;
  updateItem: (id: T['id'], data: Partial<T>) => Promise<void>;
  reset: () => void;
} {
  const [items, setItems] = useState<T[]>(initialItems);
  const [pendingIds, setPendingIds] = useState<Set<T['id']>>(new Set());
  const [error, setError] = useState<Error | null>(null);

  const rollbackRef = useRef<T[]>(initialItems);

  const addItem = useCallback(
    async (item: T) => {
      if (!mutations.add) {
        console.warn('[useOptimisticList] add mutation not provided');
        return;
      }

      rollbackRef.current = items;
      setPendingIds((prev) => new Set(prev).add(item.id));
      setItems((prev) => [...prev, item]);
      setError(null);

      try {
        const result = await mutations.add(item);
        setItems((prev) => prev.map((i) => (i.id === item.id ? result : i)));
      } catch (err) {
        setItems(rollbackRef.current);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [items, mutations]
  );

  const removeItem = useCallback(
    async (id: T['id']) => {
      if (!mutations.remove) {
        console.warn('[useOptimisticList] remove mutation not provided');
        return;
      }

      rollbackRef.current = items;
      setPendingIds((prev) => new Set(prev).add(id));
      setItems((prev) => prev.filter((i) => i.id !== id));
      setError(null);

      try {
        await mutations.remove(id);
      } catch (err) {
        setItems(rollbackRef.current);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [items, mutations]
  );

  const updateItem = useCallback(
    async (id: T['id'], data: Partial<T>) => {
      if (!mutations.update) {
        console.warn('[useOptimisticList] update mutation not provided');
        return;
      }

      rollbackRef.current = items;
      setPendingIds((prev) => new Set(prev).add(id));
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...data } : i))
      );
      setError(null);

      try {
        const result = await mutations.update(id, data);
        setItems((prev) => prev.map((i) => (i.id === id ? result : i)));
      } catch (err) {
        setItems(rollbackRef.current);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [items, mutations]
  );

  const reset = useCallback(() => {
    setItems(initialItems);
    setPendingIds(new Set());
    setError(null);
  }, [initialItems]);

  return {
    items,
    isPending: pendingIds.size > 0,
    pendingIds,
    error,
    addItem,
    removeItem,
    updateItem,
    reset,
  };
}

/**
 * Hook for optimistic toggle (like/unlike, follow/unfollow)
 *
 * @example
 * const { isActive, isPending, toggle } = useOptimisticToggle(
 *   isFollowing,
 *   async (newState) => {
 *     if (newState) {
 *       await api.follow(userId);
 *     } else {
 *       await api.unfollow(userId);
 *     }
 *   }
 * );
 */
export function useOptimisticToggle(
  initialValue: boolean,
  mutationFn: (newValue: boolean) => Promise<void>,
  options: {
    onSuccess?: (newValue: boolean) => void;
    onError?: (error: Error) => void;
  } = {}
): {
  isActive: boolean;
  isPending: boolean;
  error: Error | null;
  toggle: () => Promise<void>;
  setActive: (value: boolean) => Promise<void>;
} {
  const [isActive, setIsActive] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const previousRef = useRef(initialValue);

  const setActive = useCallback(
    async (newValue: boolean) => {
      if (newValue === isActive) return;

      previousRef.current = isActive;
      setIsActive(newValue);
      setIsPending(true);
      setError(null);

      try {
        await mutationFn(newValue);
        options.onSuccess?.(newValue);
      } catch (err) {
        setIsActive(previousRef.current);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options.onError?.(error);
      } finally {
        setIsPending(false);
      }
    },
    [isActive, mutationFn, options]
  );

  const toggle = useCallback(() => {
    return setActive(!isActive);
  }, [isActive, setActive]);

  return {
    isActive,
    isPending,
    error,
    toggle,
    setActive,
  };
}

export default useOptimistic;
