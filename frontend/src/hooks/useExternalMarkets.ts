/**
 * External Markets Hook
 * Fetches and manages external markets from Polymarket and Kalshi
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  UnifiedMarket,
  MarketSource,
  ExternalMarketStatus,
  MarketFilters,
  ExternalMarketsResponse,
  ArbitrageOpportunity,
} from '@/types/externalMarket';

// ============================================
// TYPES
// ============================================

interface UseExternalMarketsOptions extends MarketFilters {
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
}

interface UseExternalMarketsReturn {
  markets: UnifiedMarket[];
  loading: boolean;
  error: string | null;
  total: number;
  lastSync: number;
  refetch: () => Promise<void>;
  syncMarkets: (source?: MarketSource) => Promise<void>;
  syncing: boolean;
}

interface UseExternalMarketReturn {
  market: UnifiedMarket | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================
// HOOK: useExternalMarkets
// ============================================

export function useExternalMarkets(
  options: UseExternalMarketsOptions = {}
): UseExternalMarketsReturn {
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const {
    autoRefresh = true,
    refreshInterval = 30000, // 30 seconds
    source,
    status,
    category,
    search,
    minVolume,
    maxEndTime,
    sortBy,
    sortOrder,
    page,
    pageSize,
  } = options;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Serialize filter values to a stable string to avoid infinite re-render
  // from unstable rest-spread object references
  const filterKey = useMemo(() =>
    JSON.stringify({ source, status, category, search, minVolume, maxEndTime, sortBy, sortOrder, page, pageSize }),
    [source, status, category, search, minVolume, maxEndTime, sortBy, sortOrder, page, pageSize]
  );

  // Build query string from filters
  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();

    if (source) {
      if (Array.isArray(source)) {
        params.set('source', source.join(','));
      } else {
        params.set('source', source);
      }
    }

    if (status) {
      params.set('status', status);
    }

    if (category) {
      params.set('category', category);
    }

    if (search) {
      params.set('search', search);
    }

    if (minVolume) {
      params.set('minVolume', minVolume);
    }

    if (maxEndTime) {
      params.set('maxEndTime', maxEndTime.toString());
    }

    if (sortBy) {
      params.set('sortBy', sortBy);
    }

    if (sortOrder) {
      params.set('sortOrder', sortOrder);
    }

    if (page) {
      params.set('page', page.toString());
    }

    if (pageSize) {
      params.set('pageSize', pageSize.toString());
    }

    return params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Abort controller ref for cancelling in-flight fetches on filter change
  const abortRef = useRef<AbortController | null>(null);

  // Fetch markets
  const fetchMarkets = useCallback(async () => {
    // Cancel any in-flight request to prevent stale data overwrites
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      const queryString = buildQueryString();
      const url = `/api/external/markets${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch markets');
      }

      // Only apply if this request wasn't aborted
      if (!controller.signal.aborted) {
        setMarkets(data.data.markets);
        setTotal(data.data.total);
        setLastSync(data.data.lastSync);
      }
    } catch (err) {
      // Ignore abort errors — they're expected when filters change rapidly
      if ((err as Error).name === 'AbortError') return;
      console.error('[useExternalMarkets] Error:', err);
      setError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [buildQueryString]);

  // Sync markets from external sources
  const syncMarkets = useCallback(async (source?: MarketSource) => {
    try {
      setSyncing(true);
      setError(null);

      const url = source
        ? `/api/external/sync?source=${source}`
        : '/api/external/sync';

      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Sync failed: HTTP ${response.status}`);
      }
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to sync markets');
      }

      // Refetch after sync
      await fetchMarkets();
    } catch (err) {
      console.error('[useExternalMarkets] Sync error:', err);
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [fetchMarkets]);

  // Initial fetch + abort on unmount
  useEffect(() => {
    fetchMarkets();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchMarkets]);

  // Auto refresh
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(fetchMarkets, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, refreshInterval, fetchMarkets]);

  return {
    markets,
    loading,
    error,
    total,
    lastSync,
    refetch: fetchMarkets,
    syncMarkets,
    syncing,
  };
}

// ============================================
// HOOK: useExternalMarket
// ============================================

export function useExternalMarket(id: string | null): UseExternalMarketReturn {
  const [market, setMarket] = useState<UnifiedMarket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = useCallback(async () => {
    if (!id) {
      setMarket(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/external/markets/${id}`);
      if (response.status === 404) {
        setMarket(null);
        return;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch market: HTTP ${response.status}`);
      }
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch market');
      } else {
        setMarket(data.data);
      }
    } catch (err) {
      console.error('[useExternalMarket] Error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMarket();
  }, [fetchMarket]);

  // Auto refresh price every 5 seconds
  useEffect(() => {
    if (!id) return;

    const interval = setInterval(fetchMarket, 5000);
    return () => clearInterval(interval);
  }, [id, fetchMarket]);

  return {
    market,
    loading,
    error,
    refetch: fetchMarket,
  };
}

// ============================================
// HOOK: useUnifiedMarkets
// ============================================

/**
 * Combines native and external markets into a unified view
 */
export function useUnifiedMarkets(filters?: MarketFilters) {
  const {
    markets: externalMarkets,
    loading: externalLoading,
    error: externalError,
    refetch: refetchExternal,
  } = useExternalMarkets({
    ...filters,
    autoRefresh: true,
  });

  // For now, just return external markets
  // In the future, combine with native markets
  return {
    markets: externalMarkets,
    loading: externalLoading,
    error: externalError,
    refetch: refetchExternal,
  };
}

// ============================================
// HOOK: useExternalMarketStats
// ============================================

export function useExternalMarketStats() {
  const [stats, setStats] = useState<{
    totalMarkets: number;
    polymarketCount: number;
    kalshiCount: number;
    activeCount: number;
    totalVolume: string;
    lastSync: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/external/sync');
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: HTTP ${response.status}`);
      }
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch stats');
      }

      setStats(data.data.stats);
    } catch (err) {
      console.error('[useExternalMarketStats] Error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}

// ============================================
// HOOK: useArbitrageOpportunities
// ============================================

export function useArbitrageOpportunities(minSpread: number = 5) {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOpportunities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/external/arbitrage?minSpread=${minSpread}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch arbitrage opportunities: HTTP ${response.status}`);
      }
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch arbitrage opportunities');
      }

      setOpportunities(data.data.opportunities || []);
    } catch (err) {
      console.error('[useArbitrageOpportunities] Error fetching arbitrage opportunities:', err);
      setError((err as Error).message);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, [minSpread]);

  useEffect(() => {
    fetchOpportunities();

    // Refresh every minute
    const interval = setInterval(fetchOpportunities, 60000);
    return () => clearInterval(interval);
  }, [fetchOpportunities]);

  return {
    opportunities,
    loading,
    error,
    refetch: fetchOpportunities,
  };
}

export default useExternalMarkets;
