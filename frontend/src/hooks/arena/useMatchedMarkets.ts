/**
 * useMatchedMarkets Hook
 * Fetches markets that exist on both Polymarket and Kalshi
 * Useful for arbitrage detection and cross-platform warrior battles
 */

import { useState, useCallback, useEffect, useRef } from 'react';

interface MatchedMarketPair {
  id: string;
  polymarket: {
    id: string;
    externalId: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
  };
  kalshi: {
    id: string;
    externalId: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
  };
  similarity: number;
  priceDifference: number;
  hasArbitrage: boolean;
  arbitrageStrategy?: {
    action: string;
    buyYesOn: 'polymarket' | 'kalshi';
    buyNoOn: 'polymarket' | 'kalshi';
    potentialProfit: number;
  };
}

interface MatchedMarketsStats {
  totalMatched: number;
  arbitrageOpportunities: number;
  avgSimilarity: number;
  avgPriceDifference: number;
}

interface UseMatchedMarketsOptions {
  minSimilarity?: number;
  onlyArbitrage?: boolean;
  limit?: number;
  autoFetch?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UseMatchedMarketsReturn {
  pairs: MatchedMarketPair[];
  stats: MatchedMarketsStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: number | null;
}

export function useMatchedMarkets(
  options: UseMatchedMarketsOptions = {}
): UseMatchedMarketsReturn {
  const {
    minSimilarity = 0.4,
    onlyArbitrage = false,
    limit = 50,
    autoFetch = true,
    refreshInterval = 60000, // Default: refresh every minute
  } = options;

  const [pairs, setPairs] = useState<MatchedMarketPair[]>([]);
  const [stats, setStats] = useState<MatchedMarketsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMatchedMarkets = useCallback(async () => {
    // Abort previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        minSimilarity: minSimilarity.toString(),
        onlyArbitrage: onlyArbitrage.toString(),
        limit: limit.toString(),
      });

      const response = await fetch(`/api/arena/matched-markets?${params}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch matched markets');
      }

      setPairs(data.data.pairs);
      setStats(data.data.stats);
      setLastUpdated(data.data.timestamp);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was aborted, ignore
        return;
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [minSimilarity, onlyArbitrage, limit]);

  // Auto-fetch on mount and when options change
  useEffect(() => {
    if (autoFetch) {
      fetchMatchedMarkets();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [autoFetch, fetchMatchedMarkets]);

  // Set up refresh interval
  useEffect(() => {
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        fetchMatchedMarkets();
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshInterval, fetchMatchedMarkets]);

  return {
    pairs,
    stats,
    loading,
    error,
    refetch: fetchMatchedMarkets,
    lastUpdated,
  };
}

export type { MatchedMarketPair, MatchedMarketsStats };
