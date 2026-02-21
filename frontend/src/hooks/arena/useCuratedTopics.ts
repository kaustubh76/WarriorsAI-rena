'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface CuratedTopic {
  id: string;
  source: 'polymarket' | 'kalshi';
  externalId: string;
  question: string;
  category: string | null;
  yesPrice: number;   // 0-100
  noPrice: number;    // 0-100
  volume: string;
  liquidity: string;
  endTime: string;    // ISO string
  sourceUrl: string;
  tags: string | null;
}

interface UseCuratedTopicsOptions {
  initialFetch?: boolean;
  debounceMs?: number;
  limit?: number;
  category?: string;
}

interface UseCuratedTopicsReturn {
  topics: CuratedTopic[];
  loading: boolean;
  error: string | null;
  total: number;
  search: (query: string) => void;
  setCategory: (category: string | undefined) => void;
  refetch: () => Promise<void>;
  searchQuery: string;
  categoryFilter: string | undefined;
  hasMore: boolean;
}

export function useCuratedTopics(
  options: UseCuratedTopicsOptions = {}
): UseCuratedTopicsReturn {
  const {
    initialFetch = true,
    debounceMs = 300,
    limit = 50,
    category: initialCategory,
  } = options;

  const [topics, setTopics] = useState<CuratedTopic[]>([]);
  const [loading, setLoading] = useState(initialFetch);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(initialCategory);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const categoryRef = useRef(categoryFilter);
  const searchRef = useRef(searchQuery);

  useEffect(() => { categoryRef.current = categoryFilter; }, [categoryFilter]);
  useEffect(() => { searchRef.current = searchQuery; }, [searchQuery]);

  const fetchTopics = useCallback(async (
    query?: string,
    cat?: string,
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (cat) params.set('category', cat);
      params.set('limit', limit.toString());

      const response = await fetch(
        `/api/arena/curated-topics?${params.toString()}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch curated topics: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      if (mountedRef.current) {
        setTopics(data.topics);
        setTotal(data.total);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[useCuratedTopics] Error:', err);
      if (mountedRef.current) {
        setError((err as Error).message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [limit]);

  const search = useCallback((query: string) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTopics(query || undefined, categoryRef.current);
    }, debounceMs);
  }, [fetchTopics, debounceMs]);

  const setCategory = useCallback((cat: string | undefined) => {
    setCategoryFilter(cat);
    fetchTopics(searchRef.current || undefined, cat);
  }, [fetchTopics]);

  const refetch = useCallback(async () => {
    await fetchTopics(searchRef.current || undefined, categoryRef.current);
  }, [fetchTopics]);

  const initialFetchDoneRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (initialFetch && !initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchTopics(undefined, initialCategory);
    }
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [initialFetch, fetchTopics, initialCategory]);

  const hasMore = useMemo(() => topics.length < total, [topics.length, total]);

  return {
    topics,
    loading,
    error,
    total,
    search,
    setCategory,
    refetch,
    searchQuery,
    categoryFilter,
    hasMore,
  };
}

export default useCuratedTopics;
