'use client';

import { useState } from 'react';
import { useArenaLeaderboard } from '../../hooks/arena';
import { formatEther } from 'viem';

type SortOption = 'rating' | 'wins' | 'earnings';

const RANK_BADGES: Record<number, { icon: string; color: string }> = {
  1: { icon: '🥇', color: 'text-yellow-400' },
  2: { icon: '🥈', color: 'text-gray-300' },
  3: { icon: '🥉', color: 'text-orange-400' },
};

const TIER_COLORS: Record<string, string> = {
  UNRANKED: 'text-gray-400',
  BRONZE: 'text-orange-600',
  SILVER: 'text-gray-300',
  GOLD: 'text-yellow-400',
  PLATINUM: 'text-cyan-400',
  DIAMOND: 'text-purple-400',
};

function getTierFromRating(rating: number): string {
  if (rating >= 2000) return 'DIAMOND';
  if (rating >= 1600) return 'PLATINUM';
  if (rating >= 1400) return 'GOLD';
  if (rating >= 1200) return 'SILVER';
  if (rating >= 1000) return 'BRONZE';
  return 'UNRANKED';
}

interface ArenaLeaderboardProps {
  className?: string;
  limit?: number;
  compact?: boolean;
}

export function ArenaLeaderboard({
  className = '',
  limit = 20,
  compact = false,
}: ArenaLeaderboardProps) {
  const [sortBy, setSortBy] = useState<SortOption>('rating');
  const { leaderboard, loading, error, refetch } = useArenaLeaderboard(sortBy, limit);

  if (loading) {
    return (
      <div className={`bg-gray-800/50 rounded-2xl border border-gray-700 p-8 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-gray-800/50 rounded-2xl border border-gray-700 p-8 ${className}`}>
        <p className="text-red-400 text-center">{error}</p>
        <button
          onClick={refetch}
          className="mt-4 mx-auto block px-4 py-2 bg-purple-600 rounded-lg text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/30 to-pink-900/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Arena Leaderboard</h2>
            <p className="text-gray-400 text-sm">Top warriors by debate performance</p>
          </div>
          <div className="flex gap-2">
            {(['rating', 'wins', 'earnings'] as SortOption[]).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  sortBy === option
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Header */}
      {!compact && (
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-900/50 text-gray-400 text-sm font-medium">
          <div className="col-span-1">Rank</div>
          <div className="col-span-3">Warrior</div>
          <div className="col-span-2 text-center">W-L-D</div>
          <div className="col-span-2 text-center">Win Rate</div>
          <div className="col-span-2 text-center">Rating</div>
          <div className="col-span-2 text-right">Earnings</div>
        </div>
      )}

      {/* Leaderboard Entries */}
      <div className="divide-y divide-gray-700">
        {leaderboard.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No warriors have competed yet. Be the first!
          </div>
        ) : (
          leaderboard.map((entry, index) => (
            <LeaderboardRow
              key={entry.warriorId}
              entry={entry}
              rank={entry.rank || index + 1}
              compact={compact}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {!compact && leaderboard.length > 0 && (
        <div className="p-4 border-t border-gray-700 bg-gray-900/30">
          <p className="text-gray-500 text-sm text-center">
            Showing top {leaderboard.length} warriors
          </p>
        </div>
      )}
    </div>
  );
}

interface LeaderboardRowProps {
  entry: {
    warriorId: number;
    totalBattles: number;
    wins: number;
    losses: number;
    draws: number;
    arenaRating: number;
    peakRating: number;
    totalEarnings?: string;
    rank?: number;
  };
  rank: number;
  compact?: boolean;
}

function LeaderboardRow({ entry, rank, compact }: LeaderboardRowProps) {
  const tier = getTierFromRating(entry.arenaRating);
  const winRate = entry.totalBattles > 0
    ? ((entry.wins / entry.totalBattles) * 100).toFixed(1)
    : '0.0';

  const rankBadge = RANK_BADGES[rank];

  if (compact) {
    return (
      <div className="flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`text-xl ${rankBadge?.color || 'text-gray-500'}`}>
            {rankBadge?.icon || `#${rank}`}
          </span>
          <div>
            <p className="text-white font-medium">Warrior #{entry.warriorId}</p>
            <p className={`text-sm ${TIER_COLORS[tier]}`}>{tier}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white font-bold">{entry.arenaRating}</p>
          <p className="text-gray-400 text-sm">{entry.wins}W</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-700/30 transition-colors ${
      rank <= 3 ? 'bg-gradient-to-r from-purple-900/10 to-transparent' : ''
    }`}>
      {/* Rank */}
      <div className="col-span-1">
        {rankBadge ? (
          <span className={`text-2xl ${rankBadge.color}`}>{rankBadge.icon}</span>
        ) : (
          <span className="text-gray-400 font-medium">#{rank}</span>
        )}
      </div>

      {/* Warrior Info */}
      <div className="col-span-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-full flex items-center justify-center border border-purple-500/50">
            <span className="text-lg">⚔️</span>
          </div>
          <div>
            <p className="text-white font-medium">Warrior #{entry.warriorId}</p>
            <p className={`text-sm ${TIER_COLORS[tier]}`}>{tier}</p>
          </div>
        </div>
      </div>

      {/* Record */}
      <div className="col-span-2 text-center">
        <span className="text-green-400">{entry.wins}</span>
        <span className="text-gray-500">-</span>
        <span className="text-red-400">{entry.losses}</span>
        <span className="text-gray-500">-</span>
        <span className="text-yellow-400">{entry.draws}</span>
      </div>

      {/* Win Rate */}
      <div className="col-span-2 text-center">
        <div className="inline-flex items-center gap-2">
          <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
              style={{ width: `${winRate}%` }}
            />
          </div>
          <span className="text-white font-medium">{winRate}%</span>
        </div>
      </div>

      {/* Rating */}
      <div className="col-span-2 text-center">
        <p className="text-white font-bold text-lg">{entry.arenaRating}</p>
        {entry.peakRating > entry.arenaRating && (
          <p className="text-gray-500 text-xs">Peak: {entry.peakRating}</p>
        )}
      </div>

      {/* Earnings */}
      <div className="col-span-2 text-right">
        <p className="text-purple-400 font-medium">
          {entry.totalEarnings
            ? `${formatEther(BigInt(entry.totalEarnings))} CRwN`
            : `${entry.wins} wins`}
        </p>
      </div>
    </div>
  );
}

export default ArenaLeaderboard;
