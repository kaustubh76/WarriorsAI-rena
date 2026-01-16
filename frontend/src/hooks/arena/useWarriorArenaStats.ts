/**
 * Hook for fetching warrior arena statistics
 */

import { useState, useEffect, useCallback } from 'react';
import { WarriorArenaStats } from '../../types/predictionArena';

interface UseWarriorArenaStatsReturn {
  stats: WarriorArenaStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWarriorArenaStats(warriorId: number | null): UseWarriorArenaStatsReturn {
  const [stats, setStats] = useState<WarriorArenaStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!warriorId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch from API
      const res = await fetch(`/api/arena/warriors/${warriorId}/stats`);

      if (res.status === 404) {
        // No stats yet - warrior hasn't battled
        setStats({
          id: '',
          warriorId,
          totalBattles: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          totalEarnings: '0',
          currentStreak: 0,
          longestStreak: 0,
          arenaRating: 1000,
          peakRating: 1000,
        });
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.status}`);
      }

      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [warriorId]);

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

/**
 * Hook for fetching arena leaderboard
 */
interface LeaderboardEntry extends WarriorArenaStats {
  rank: number;
}

interface UseArenaLeaderboardReturn {
  leaderboard: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useArenaLeaderboard(
  sortBy: 'rating' | 'wins' | 'earnings' = 'rating',
  limit: number = 20
): UseArenaLeaderboardReturn {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/arena/leaderboard?sortBy=${sortBy}&limit=${limit}`);

      if (!res.ok) {
        throw new Error(`Failed to fetch leaderboard: ${res.status}`);
      }

      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [sortBy, limit]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    leaderboard,
    loading,
    error,
    refetch: fetchLeaderboard,
  };
}
