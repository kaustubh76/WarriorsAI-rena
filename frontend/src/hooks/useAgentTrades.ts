/**
 * useAgentTrades Hook
 * Fetch and display trade history for AI agents
 */

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface AgentTrade {
  id: string;
  agentId: string;
  marketId: string;
  isYes: boolean;
  amount: string;
  amountFormatted: string;
  txHash: string;
  isCopyTrade: boolean;
  copiedFrom: string | null;
  outcome: string | null;
  won: boolean | null;
  pnl: string | null;
  pnlFormatted: string | null;
  recordedOn0G: boolean;
  recordTxHash: string | null;
  createdAt: string;
  resolvedAt: string | null;
  status: 'pending' | 'won' | 'lost' | 'invalid';
}

export interface AgentTradeSummary {
  totalTrades: number;
  resolvedTrades: number;
  pendingTrades: number;
  wins: number;
  losses: number;
  winRate: string;
  totalTraded: string;
  realizedPnL: string;
  unrealizedVolume: string;
  pnlIsPositive: boolean;
}

export interface UseAgentTradesResult {
  trades: AgentTrade[];
  summary: AgentTradeSummary | null;
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  loadMore: () => void;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAgentTrades(
  agentId: bigint | string | null,
  options?: {
    limit?: number;
    status?: 'pending' | 'resolved' | 'all';
  }
): UseAgentTradesResult {
  const [trades, setTrades] = useState<AgentTrade[]>([]);
  const [summary, setSummary] = useState<AgentTradeSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = options?.limit ?? 20;
  const status = options?.status ?? 'all';

  const fetchTrades = useCallback(async (reset: boolean = true) => {
    if (!agentId) {
      setTrades([]);
      setSummary(null);
      setTotal(0);
      setHasMore(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setOffset(0);
    }

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
      });
      if (status !== 'all') {
        params.set('status', status);
      }

      const response = await fetch(
        `/api/agents/${agentId.toString()}/trades?${params}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch trades');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'API returned unsuccessful response');
      }

      if (reset) {
        setTrades(data.trades);
      } else {
        setTrades(prev => [...prev, ...data.trades]);
      }

      setSummary(data.summary);
      setTotal(data.total);
      setHasMore(data.hasMore);

    } catch (err) {
      console.error('Error fetching agent trades:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [agentId, limit, status, offset]);

  // Initial fetch
  useEffect(() => {
    fetchTrades(true);
  }, [agentId, limit, status]); // Don't include fetchTrades to avoid infinite loop

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setOffset(prev => prev + limit);
      fetchTrades(false);
    }
  }, [isLoading, hasMore, limit, fetchTrades]);

  const refetch = useCallback(() => {
    fetchTrades(true);
  }, [fetchTrades]);

  return {
    trades,
    summary,
    total,
    hasMore,
    isLoading,
    error,
    refetch,
    loadMore,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getTradeStatusColor(status: AgentTrade['status']): string {
  switch (status) {
    case 'won':
      return 'text-green-400';
    case 'lost':
      return 'text-red-400';
    case 'pending':
      return 'text-yellow-400';
    case 'invalid':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
}

export function getTradeStatusBadgeClass(status: AgentTrade['status']): string {
  switch (status) {
    case 'won':
      return 'bg-green-500/20 text-green-400';
    case 'lost':
      return 'bg-red-500/20 text-red-400';
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'invalid':
      return 'bg-gray-500/20 text-gray-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}

export function formatTradeAmount(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0.00';
  return num.toFixed(2);
}

export function formatTradePnL(pnl: string | null): string {
  if (!pnl) return '-';
  const num = parseFloat(pnl);
  if (isNaN(num)) return '-';
  const prefix = num >= 0 ? '+' : '';
  return `${prefix}${num.toFixed(4)}`;
}

export default useAgentTrades;
