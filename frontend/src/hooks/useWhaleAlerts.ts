/**
 * Whale Alerts Hook
 * Subscribe to and manage whale trade alerts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WhaleTrade, MarketSource, TrackedTrader } from '@/types/externalMarket';

// ============================================
// TYPES
// ============================================

interface UseWhaleAlertsReturn {
  alerts: WhaleTrade[];
  isConnected: boolean;
  threshold: number;
  setThreshold: (threshold: number) => void;
  clearAlerts: () => void;
}

interface UseWhaleHistoryReturn {
  trades: WhaleTrade[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseTrackedTradersReturn {
  traders: TrackedTrader[];
  loading: boolean;
  error: string | null;
  trackTrader: (address: string, source: MarketSource, alias?: string) => Promise<void>;
  untrackTrader: (address: string, source: MarketSource) => Promise<void>;
  refetch: () => Promise<void>;
}

// ============================================
// HOOK: useWhaleAlerts
// ============================================

export function useWhaleAlerts(initialThreshold: number = 10000): UseWhaleAlertsReturn {
  const [alerts, setAlerts] = useState<WhaleTrade[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [threshold, setThreshold] = useState(initialThreshold);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for new whale trades
  const pollForTrades = useCallback(async () => {
    try {
      const response = await fetch(`/api/whale-alerts?limit=10&threshold=${threshold}`);
      const data = await response.json();

      if (data.success && data.data.trades) {
        const newTrades = data.data.trades as WhaleTrade[];

        setAlerts((prev) => {
          // Merge new trades, avoiding duplicates
          const existingIds = new Set(prev.map((t) => t.id));
          const filtered = newTrades.filter((t) => !existingIds.has(t.id));

          if (filtered.length > 0) {
            // Keep only last 50 alerts
            return [...filtered, ...prev].slice(0, 50);
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('[useWhaleAlerts] Polling error:', error);
    }
  }, [threshold]);

  // Start polling
  useEffect(() => {
    // Initial fetch
    pollForTrades();
    setIsConnected(true);

    // Poll every 30 seconds
    pollingRef.current = setInterval(pollForTrades, 30000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      setIsConnected(false);
    };
  }, [pollForTrades]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    alerts,
    isConnected,
    threshold,
    setThreshold,
    clearAlerts,
  };
}

// ============================================
// HOOK: useWhaleHistory
// ============================================

export function useWhaleHistory(
  limit: number = 50,
  source?: MarketSource
): UseWhaleHistoryReturn {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ limit: limit.toString() });
      if (source) params.append('source', source);

      const response = await fetch(`/api/whale-alerts/history?${params}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch whale history');
      }

      setTrades(data.data.trades || []);
    } catch (err) {
      console.error('[useWhaleHistory] Error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [limit, source]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  return {
    trades,
    loading,
    error,
    refetch: fetchTrades,
  };
}

// ============================================
// HOOK: useTrackedTraders
// ============================================

export function useTrackedTraders(): UseTrackedTradersReturn {
  const [traders, setTraders] = useState<TrackedTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTraders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/whale-alerts/traders');
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch tracked traders');
      }

      setTraders(data.data.traders || []);
    } catch (err) {
      console.error('[useTrackedTraders] Error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const trackTrader = useCallback(
    async (address: string, source: MarketSource, alias?: string) => {
      try {
        const response = await fetch('/api/whale-alerts/traders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, source, alias }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to track trader');
        }

        await fetchTraders();
      } catch (err) {
        console.error('[useTrackedTraders] Track error:', err);
        throw err;
      }
    },
    [fetchTraders]
  );

  const untrackTrader = useCallback(
    async (address: string, source: MarketSource) => {
      try {
        const response = await fetch('/api/whale-alerts/traders', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, source }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to untrack trader');
        }

        await fetchTraders();
      } catch (err) {
        console.error('[useTrackedTraders] Untrack error:', err);
        throw err;
      }
    },
    [fetchTraders]
  );

  useEffect(() => {
    fetchTraders();
  }, [fetchTraders]);

  return {
    traders,
    loading,
    error,
    trackTrader,
    untrackTrader,
    refetch: fetchTraders,
  };
}

// ============================================
// HOOK: useTraderTrades
// ============================================

export function useTraderTrades(address: string | null) {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    if (!address) {
      setTrades([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/whale-alerts/traders/${address}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch trader trades');
      }

      setTrades(data.data.trades || []);
    } catch (err) {
      console.error('[useTraderTrades] Error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  return {
    trades,
    loading,
    error,
    refetch: fetchTrades,
  };
}

export default useWhaleAlerts;
