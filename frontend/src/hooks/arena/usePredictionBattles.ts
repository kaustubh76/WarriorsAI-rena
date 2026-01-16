/**
 * Hook for fetching and managing prediction battles
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PredictionBattle,
  PredictionBattleStatus,
  BattlesResponse,
  MarketSource,
} from '../../types/predictionArena';

interface UsePredictionBattlesOptions {
  status?: PredictionBattleStatus;
  warriorId?: number;
  marketId?: string;
  source?: MarketSource;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UsePredictionBattlesReturn {
  battles: PredictionBattle[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

export function usePredictionBattles(
  options: UsePredictionBattlesOptions = {}
): UsePredictionBattlesReturn {
  const {
    status,
    warriorId,
    marketId,
    source,
    limit = 20,
    autoRefresh = false,
    refreshInterval = 30000,
  } = options;

  const [battles, setBattles] = useState<PredictionBattle[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBattles = useCallback(async (reset = true) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (warriorId) params.set('warriorId', warriorId.toString());
      if (marketId) params.set('marketId', marketId);
      if (source) params.set('source', source);
      params.set('limit', limit.toString());
      params.set('offset', reset ? '0' : offset.toString());

      const res = await fetch(`/api/arena/battles?${params.toString()}`);

      if (!res.ok) {
        throw new Error(`Failed to fetch battles: ${res.status}`);
      }

      const data: BattlesResponse = await res.json();

      if (reset) {
        setBattles(data.battles);
        setOffset(data.limit);
      } else {
        setBattles(prev => [...prev, ...data.battles]);
        setOffset(prev => prev + data.limit);
      }

      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [status, warriorId, marketId, source, limit, offset]);

  const refetch = useCallback(async () => {
    await fetchBattles(true);
  }, [fetchBattles]);

  const loadMore = useCallback(async () => {
    if (battles.length < total) {
      await fetchBattles(false);
    }
  }, [fetchBattles, battles.length, total]);

  // Initial fetch
  useEffect(() => {
    fetchBattles(true);
  }, [status, warriorId, marketId, source, limit]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchBattles(true);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchBattles]);

  return {
    battles,
    total,
    loading,
    error,
    refetch,
    loadMore,
    hasMore: battles.length < total,
  };
}

/**
 * Hook for fetching a single battle by ID
 */
export function usePredictionBattle(battleId: string | null) {
  const [battle, setBattle] = useState<PredictionBattle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBattle = useCallback(async () => {
    if (!battleId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch all battles and find the one we want
      // In production, you'd have a dedicated endpoint for single battle
      const res = await fetch(`/api/arena/battles?limit=100`);

      if (!res.ok) {
        throw new Error(`Failed to fetch battle: ${res.status}`);
      }

      const data: BattlesResponse = await res.json();
      const found = data.battles.find(b => b.id === battleId);

      if (!found) {
        throw new Error('Battle not found');
      }

      setBattle(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [battleId]);

  useEffect(() => {
    fetchBattle();
  }, [fetchBattle]);

  return {
    battle,
    loading,
    error,
    refetch: fetchBattle,
  };
}
