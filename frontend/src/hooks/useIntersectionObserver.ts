'use client';

/**
 * Intersection Observer Hooks
 * Hooks for lazy loading, infinite scroll, and visibility detection
 */

import { useState, useEffect, useRef, RefObject, useCallback } from 'react';

export interface UseIntersectionObserverOptions {
  /** Element that is used as the viewport for checking visibility */
  root?: Element | null;
  /** Margin around the root */
  rootMargin?: string;
  /** Threshold(s) at which to trigger callback */
  threshold?: number | number[];
  /** Whether to disconnect after first intersection */
  once?: boolean;
  /** Whether the observer is enabled */
  enabled?: boolean;
}

export interface IntersectionObserverEntry {
  isIntersecting: boolean;
  intersectionRatio: number;
  boundingClientRect: DOMRectReadOnly;
}

/**
 * Hook to observe element intersection with viewport
 *
 * @example
 * function LazyImage({ src }) {
 *   const [ref, isVisible] = useIntersectionObserver({
 *     threshold: 0.1,
 *     once: true,
 *   });
 *
 *   return (
 *     <div ref={ref}>
 *       {isVisible && <img src={src} />}
 *     </div>
 *   );
 * }
 */
export function useIntersectionObserver<T extends HTMLElement>(
  options: UseIntersectionObserverOptions = {}
): [RefObject<T>, boolean, IntersectionObserverEntry | null] {
  const {
    root = null,
    rootMargin = '0px',
    threshold = 0,
    once = false,
    enabled = true,
  } = options;

  const ref = useRef<T>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsIntersecting(entry.isIntersecting);
        setEntry({
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          boundingClientRect: entry.boundingClientRect,
        });

        // Disconnect after first intersection if 'once' is true
        if (once && entry.isIntersecting) {
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [root, rootMargin, threshold, once, enabled]);

  return [ref, isIntersecting, entry];
}

/**
 * Hook for infinite scroll / load more functionality
 *
 * @example
 * function InfiniteList() {
 *   const [items, setItems] = useState([]);
 *   const [hasMore, setHasMore] = useState(true);
 *
 *   const loadMore = useCallback(async () => {
 *     const newItems = await fetchMoreItems();
 *     setItems(prev => [...prev, ...newItems]);
 *     if (newItems.length === 0) setHasMore(false);
 *   }, []);
 *
 *   const sentinelRef = useInfiniteScroll(loadMore, {
 *     enabled: hasMore,
 *   });
 *
 *   return (
 *     <div>
 *       {items.map(item => <Item key={item.id} {...item} />)}
 *       <div ref={sentinelRef} />
 *     </div>
 *   );
 * }
 */
export function useInfiniteScroll<T extends HTMLElement>(
  loadMore: () => void | Promise<void>,
  options: {
    enabled?: boolean;
    rootMargin?: string;
    threshold?: number;
  } = {}
): RefObject<T> {
  const { enabled = true, rootMargin = '100px', threshold = 0 } = options;

  const ref = useRef<T>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;

        if (entry.isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          try {
            await loadMore();
          } finally {
            loadingRef.current = false;
          }
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [loadMore, enabled, rootMargin, threshold]);

  return ref;
}

/**
 * Hook to track visibility percentage of an element
 *
 * @example
 * function ProgressTracker() {
 *   const [ref, visibility] = useVisibilityRatio();
 *
 *   return (
 *     <div ref={ref}>
 *       {Math.round(visibility * 100)}% visible
 *     </div>
 *   );
 * }
 */
export function useVisibilityRatio<T extends HTMLElement>(
  options: {
    rootMargin?: string;
    steps?: number;
  } = {}
): [RefObject<T>, number] {
  const { rootMargin = '0px', steps = 20 } = options;

  const ref = useRef<T>(null);
  const [ratio, setRatio] = useState(0);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const element = ref.current;
    if (!element) return;

    // Create threshold array for smooth updates
    const threshold = Array.from(
      { length: steps + 1 },
      (_, i) => i / steps
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setRatio(entry.intersectionRatio);
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, steps]);

  return [ref, ratio];
}

/**
 * Hook for lazy loading with placeholder
 *
 * @example
 * function LazyComponent({ component: Component }) {
 *   const [ref, shouldLoad] = useLazyLoad();
 *
 *   return (
 *     <div ref={ref}>
 *       {shouldLoad ? <Component /> : <Skeleton />}
 *     </div>
 *   );
 * }
 */
export function useLazyLoad<T extends HTMLElement>(
  rootMargin: string = '200px'
): [RefObject<T>, boolean] {
  const [ref, isVisible] = useIntersectionObserver<T>({
    rootMargin,
    once: true,
  });

  return [ref, isVisible];
}

export default useIntersectionObserver;
