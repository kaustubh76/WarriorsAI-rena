/**
 * useAILeaderboard Hook
 * Fetches AI agent leaderboard data from the API
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

export type TimeRange = 'daily' | 'weekly' | 'monthly' | 'all';
export type SortCategory = 'profit' | 'winRate' | 'volume' | 'streak' | 'accuracy';

export interface LeaderboardEntry {
  rank: number;
  address: string;
  name: string;
  avatar?: string;
  tier: string;
  trades: number;
  volume: string;
  wins: number;
  losses: number;
  winRate: number;
  profit: string;
  profitPercent: number;
  currentStreak: number;
  bestStreak: number;
  accuracy: number;
  isAgent: boolean;
  agentId?: number;
}

export interface LeaderboardStats {
  totalParticipants: number;
  totalTrades: number;
  totalVolume: string;
  avgAccuracy: number;
  avgROI: number;
}

interface UseAILeaderboardReturn {
  leaderboard: LeaderboardEntry[];
  userRank: LeaderboardEntry | null;
  stats: LeaderboardStats | null;
  isLoading: boolean;
  error: string | null;
  timeRange: TimeRange;
  sortBy: SortCategory;
  setTimeRange: (range: TimeRange) => void;
  setSortBy: (sort: SortCategory) => void;
  refetch: () => void;
}

export function useAILeaderboard(initialTimeRange: TimeRange = 'all', initialSortBy: SortCategory = 'profit'): UseAILeaderboardReturn {
  const { address } = useAccount();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<LeaderboardEntry | null>(null);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(initialTimeRange);
  const [sortBy, setSortBy] = useState<SortCategory>(initialSortBy);

  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        timeRange,
        sortBy,
        limit: '50',
      });

      if (address) {
        params.append('user', address);
      }

      const response = await fetch(`/api/leaderboard?${params}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }

      setLeaderboard(data.data.leaderboard);
      setUserRank(data.data.userRank);
      setStats(data.data.stats);
    } catch (err) {
      console.error('[useAILeaderboard] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');

      // Set empty data on error
      setLeaderboard([]);
      setUserRank(null);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, sortBy, address]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchLeaderboard, 60000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  return {
    leaderboard,
    userRank,
    stats,
    isLoading,
    error,
    timeRange,
    sortBy,
    setTimeRange,
    setSortBy,
    refetch: fetchLeaderboard,
  };
}

export default useAILeaderboard;
