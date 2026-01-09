/**
 * Hook for fetching and calculating portfolio performance history
 * Uses blockchain events to track P&L over time
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import predictionMarketService, {
  type Market
} from '@/services/predictionMarketService';

export interface PortfolioHistoryPoint {
  timestamp: number;           // Unix timestamp in ms
  cumulativeInvested: number;  // Total invested up to this point (CRwN)
  currentValue: number;        // Estimated portfolio value at this point
  pnl: number;                 // Profit/Loss at this point
  pnlPercent: number;          // P&L as percentage
  tradeType: 'buy' | 'sell' | 'add_liquidity' | 'remove_liquidity' | 'claim';
  marketQuestion?: string;     // Market question for tooltip
  amount: number;              // Trade amount in CRwN
}

export type TimeRange = '1w' | '1m' | '3m' | 'all';

interface UsePortfolioHistoryProps {
  markets: Market[];
  userMarketIds: bigint[];
}

export function usePortfolioHistory({ markets, userMarketIds }: UsePortfolioHistoryProps) {
  const { address } = useAccount();
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!address || userMarketIds.length === 0) {
      setHistory([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all user activities across their markets
      const activities = await predictionMarketService.getUserActivityAcrossMarkets(
        address,
        userMarketIds,
        100
      );

      if (activities.length === 0) {
        setHistory([]);
        setLoading(false);
        return;
      }

      // Build cumulative P&L history from activities
      // All values come from real blockchain events - no hardcoded/mock data
      const historyPoints: PortfolioHistoryPoint[] = [];
      let cumulativeInvested = 0;
      let currentValue = 0;

      for (const activity of activities) {
        const amount = Number(formatEther(activity.amount));
        const tokens = Number(formatEther(activity.tokens));

        // Update cumulative values based on activity type
        // These calculations are derived from actual blockchain transaction data
        if (activity.type === 'buy') {
          cumulativeInvested += amount;
          // When buying, tokens represent shares received
          currentValue += tokens;
        } else if (activity.type === 'sell') {
          // When selling, we receive collateral back
          currentValue -= tokens;
        } else if (activity.type === 'add_liquidity') {
          cumulativeInvested += amount;
          currentValue += amount; // LP shares valued at collateral input
        } else if (activity.type === 'remove_liquidity') {
          currentValue -= amount;
        } else if (activity.type === 'claim') {
          // Winnings claimed - pure profit from resolved markets
          currentValue += amount;
        }

        const pnl = currentValue - cumulativeInvested;
        const pnlPercent = cumulativeInvested > 0 ? (pnl / cumulativeInvested) * 100 : 0;

        historyPoints.push({
          timestamp: activity.timestamp * 1000, // Convert to ms
          cumulativeInvested,
          currentValue,
          pnl,
          pnlPercent,
          tradeType: activity.type,
          marketQuestion: undefined, // Market context not available from events
          amount
        });
      }

      setHistory(historyPoints);
    } catch (err) {
      console.error('Error fetching portfolio history:', err);
      setError('Failed to fetch portfolio history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [address, userMarketIds, markets]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Filter history by time range
  const getFilteredHistory = useCallback((timeRange: TimeRange): PortfolioHistoryPoint[] => {
    if (history.length === 0) return [];

    const now = Date.now();
    let cutoffTime: number;

    switch (timeRange) {
      case '1w':
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '1m':
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case '3m':
        cutoffTime = now - 90 * 24 * 60 * 60 * 1000;
        break;
      case 'all':
      default:
        cutoffTime = 0;
    }

    return history.filter(point => point.timestamp >= cutoffTime);
  }, [history]);

  // Calculate current portfolio stats
  const currentStats = useMemo(() => {
    if (history.length === 0) {
      return {
        totalInvested: 0,
        currentValue: 0,
        pnl: 0,
        pnlPercent: 0,
        totalTrades: 0
      };
    }

    const lastPoint = history[history.length - 1];
    return {
      totalInvested: lastPoint.cumulativeInvested,
      currentValue: lastPoint.currentValue,
      pnl: lastPoint.pnl,
      pnlPercent: lastPoint.pnlPercent,
      totalTrades: history.length
    };
  }, [history]);

  return {
    history,
    loading,
    error,
    getFilteredHistory,
    currentStats,
    refetch: fetchHistory
  };
}

export default usePortfolioHistory;
