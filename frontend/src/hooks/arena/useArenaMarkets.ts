'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { UnifiedMarket } from '@/types/externalMarket';

export interface ArenaMarket {
  id: string;
  question: string;
  source: 'polymarket' | 'kalshi';
  yesPrice: number;
  noPrice: number;
  volume: string;
  externalId: string;
  category?: string;
  endTime?: number;
}

export type MarketSourceFilter = 'all' | 'polymarket' | 'kalshi';

interface UseArenaMarketsOptions {
  initialFetch?: boolean;
  debounceMs?: number;
  limit?: number;
  source?: MarketSourceFilter;
}

interface SourceCounts {
  polymarket: number;
  kalshi: number;
}

interface UseArenaMarketsReturn {
  markets: ArenaMarket[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
  refetch: () => Promise<void>;
  setSource: (source: MarketSourceFilter) => void;
  searchQuery: string;
  sourceFilter: MarketSourceFilter;
  sourceCounts: SourceCounts;
  hasMore: boolean;
}

// Type guard to validate market source
function isValidMarketSource(source: string): source is 'polymarket' | 'kalshi' {
  return source === 'polymarket' || source === 'kalshi';
}

/**
 * Hook for fetching real prediction markets from Polymarket and Kalshi
 * Used in CreateChallengeModal for arena challenges
 */
export function useArenaMarkets(
  options: UseArenaMarketsOptions = {}
): UseArenaMarketsReturn {
  const {
    initialFetch = true,
    debounceMs = 300,
    limit = 50,
    source: initialSource = 'all',
  } = options;

  const [markets, setMarkets] = useState<ArenaMarket[]>([]);
  const [loading, setLoading] = useState(initialFetch);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<MarketSourceFilter>(initialSource);
  const [totalCount, setTotalCount] = useState(0);
  const [sourceCounts, setSourceCounts] = useState<SourceCounts>({ polymarket: 0, kalshi: 0 });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Use refs to track latest values for debounced callbacks (prevents stale closures)
  const sourceFilterRef = useRef(sourceFilter);
  const searchQueryRef = useRef(searchQuery);

  // Keep refs in sync with state
  useEffect(() => {
    sourceFilterRef.current = sourceFilter;
  }, [sourceFilter]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Transform UnifiedMarket to ArenaMarket with proper type validation
  const transformMarket = useCallback((market: UnifiedMarket): ArenaMarket => {
    // Validate source at runtime to ensure type safety
    const source = isValidMarketSource(market.source) ? market.source : 'polymarket';

    return {
      id: market.id,
      question: market.question,
      source,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      externalId: market.externalId,
      category: market.category,
      endTime: market.endTime,
    };
  }, []);

  // Fetch markets from API
  const fetchMarkets = useCallback(async (query?: string, source?: MarketSourceFilter) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (source && source !== 'all') params.set('source', source);
      params.set('limit', limit.toString());

      const response = await fetch(
        `/api/arena/markets?${params.toString()}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch markets: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      if (mountedRef.current) {
        const transformedMarkets = data.data.markets.map(transformMarket);
        setMarkets(transformedMarkets);
        setTotalCount(data.data.total);
        if (data.data.sources) {
          setSourceCounts(data.data.sources);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return; // Ignore aborted requests
      }
      console.error('[useArenaMarkets] Error:', err);
      if (mountedRef.current) {
        setError((err as Error).message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [limit, transformMarket]);

  // Debounced search - uses refs to always get latest values in debounced callback
  const search = useCallback((query: string) => {
    setSearchQuery(query);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      // Use ref to get the latest sourceFilter value at execution time
      fetchMarkets(query || undefined, sourceFilterRef.current);
    }, debounceMs);
  }, [fetchMarkets, debounceMs]); // Note: sourceFilter removed from deps, using ref instead

  // Set source filter and refetch - uses ref for searchQuery
  const setSource = useCallback((source: MarketSourceFilter) => {
    setSourceFilter(source);
    // Use ref to get the latest searchQuery value
    fetchMarkets(searchQueryRef.current || undefined, source);
  }, [fetchMarkets]); // Note: searchQuery removed from deps, using ref instead

  // Refetch with current search query and source - uses refs for both
  const refetch = useCallback(async () => {
    await fetchMarkets(searchQueryRef.current || undefined, sourceFilterRef.current);
  }, [fetchMarkets]); // Uses refs for latest values

  // Track if initial fetch has been done to prevent re-fetching on dependency changes
  const initialFetchDoneRef = useRef(false);

  // Initial fetch on mount only
  useEffect(() => {
    mountedRef.current = true;

    // Only do initial fetch once
    if (initialFetch && !initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      fetchMarkets(undefined, initialSource);
    }

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [initialFetch, fetchMarkets, initialSource]); // Use initialSource (stable) instead of sourceFilter

  const hasMore = useMemo(() => markets.length < totalCount, [markets.length, totalCount]);

  return {
    markets,
    loading,
    error,
    search,
    refetch,
    setSource,
    searchQuery,
    sourceFilter,
    sourceCounts,
    hasMore,
  };
}

export default useArenaMarkets;
