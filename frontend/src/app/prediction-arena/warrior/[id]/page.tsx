'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatEther } from 'viem';
import { useWarriorArenaStats } from '../../../../hooks/arena/useWarriorArenaStats';
import { Trophy, Flame, TrendingUp, Target, ArrowLeft } from 'lucide-react';

const TIER_COLORS: Record<string, string> = {
  UNRANKED: 'text-gray-400',
  BRONZE: 'text-orange-600',
  SILVER: 'text-gray-300',
  GOLD: 'text-yellow-400',
  PLATINUM: 'text-cyan-400',
  DIAMOND: 'text-purple-400',
};

const TIER_BG: Record<string, string> = {
  UNRANKED: 'bg-gray-500/20 border-gray-500/50',
  BRONZE: 'bg-orange-500/20 border-orange-500/50',
  SILVER: 'bg-gray-300/20 border-gray-300/50',
  GOLD: 'bg-yellow-500/20 border-yellow-500/50',
  PLATINUM: 'bg-cyan-500/20 border-cyan-500/50',
  DIAMOND: 'bg-purple-500/20 border-purple-500/50',
};

function getTierFromRating(rating: number): string {
  if (rating >= 2000) return 'DIAMOND';
  if (rating >= 1600) return 'PLATINUM';
  if (rating >= 1400) return 'GOLD';
  if (rating >= 1200) return 'SILVER';
  if (rating >= 1000) return 'BRONZE';
  return 'UNRANKED';
}

const TIER_THRESHOLDS = [
  { tier: 'UNRANKED', min: 0 },
  { tier: 'BRONZE', min: 1000 },
  { tier: 'SILVER', min: 1200 },
  { tier: 'GOLD', min: 1400 },
  { tier: 'PLATINUM', min: 1600 },
  { tier: 'DIAMOND', min: 2000 },
];

export default function WarriorProfilePage() {
  const params = useParams();
  const warriorId = parseInt(params?.id as string, 10);
  const { stats, loading, error } = useWarriorArenaStats(isNaN(warriorId) ? null : warriorId);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading warrior stats...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{error || 'Warrior not found'}</p>
          <Link href="/prediction-arena" className="px-6 py-3 bg-purple-600 rounded-xl text-white font-medium hover:bg-purple-500 transition-all">
            Back to Arena
          </Link>
        </div>
      </div>
    );
  }

  const tier = getTierFromRating(stats.arenaRating);
  const winRate = stats.totalBattles > 0 ? ((stats.wins / stats.totalBattles) * 100).toFixed(1) : '0.0';
  const ratingPercent = Math.min(100, (stats.arenaRating / 2200) * 100);

  // Parse category stats
  const categoryEntries = stats.categoryStats
    ? Object.entries(stats.categoryStats).sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses))
    : [];

  // Access recent battles from API response (extended stats)
  const recentBattles = (stats as any).recentBattles || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Navigation */}
        <div className="mb-6">
          <Link href="/prediction-arena" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Arena
          </Link>
        </div>

        {/* Hero Header */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 p-8 border-b border-gray-700">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-gray-800 border-4 border-purple-500 flex items-center justify-center">
                <span className="text-4xl">&#x2694;&#xFE0F;</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-white">Warrior #{warriorId}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold border ${TIER_BG[tier]}`}>
                    <span className={TIER_COLORS[tier]}>{tier}</span>
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-gray-400">
                    Rating: <span className="text-white font-bold text-xl">{stats.arenaRating}</span>
                  </p>
                  {stats.peakRating > stats.arenaRating && (
                    <p className="text-gray-500 text-sm">
                      Peak: <span className="text-gray-300">{stats.peakRating}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Rating Bar */}
          <div className="px-8 py-4 bg-gray-800/50">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              {TIER_THRESHOLDS.map((t) => (
                <span key={t.tier} className={stats.arenaRating >= t.min ? TIER_COLORS[t.tier] : ''}>
                  {t.tier.slice(0, 3)}
                </span>
              ))}
            </div>
            <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 via-yellow-400 via-cyan-400 to-purple-500 transition-all duration-500"
                style={{ width: `${ratingPercent}%` }}
              />
              {/* Current position marker */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-purple-500 shadow-lg"
                style={{ left: `${ratingPercent}%`, transform: `translate(-50%, -50%)` }}
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <p className="text-gray-400 text-sm">Record</p>
            </div>
            <p className="text-2xl font-bold text-white">
              <span className="text-green-400">{stats.wins}</span>
              <span className="text-gray-500">-</span>
              <span className="text-red-400">{stats.losses}</span>
              <span className="text-gray-500">-</span>
              <span className="text-yellow-400">{stats.draws}</span>
            </p>
            <p className="text-gray-500 text-xs mt-1">{winRate}% win rate</p>
          </div>

          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <p className="text-gray-400 text-sm">Earnings</p>
            </div>
            <p className="text-2xl font-bold text-purple-400">
              {stats.totalEarnings !== '0' ? formatEther(BigInt(stats.totalEarnings)) : '0'}
            </p>
            <p className="text-gray-500 text-xs mt-1">CRwN earned</p>
          </div>

          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <p className="text-gray-400 text-sm">Streaks</p>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.currentStreak > 0 ? (
                <span className="text-orange-400">{stats.currentStreak}</span>
              ) : (
                <span>0</span>
              )}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              current {stats.longestStreak > 0 ? `\u00B7 ${stats.longestStreak} best` : ''}
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <p className="text-gray-400 text-sm">Avg Score</p>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.avgScore != null ? stats.avgScore.toFixed(1) : '—'}
            </p>
            <p className="text-gray-500 text-xs mt-1">{stats.totalBattles} battles</p>
          </div>
        </div>

        {/* Category Breakdown */}
        {categoryEntries.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-bold text-white mb-4">Category Performance</h3>
            <div className="space-y-3">
              {categoryEntries.map(([category, data]) => {
                const total = data.wins + data.losses;
                const catWinRate = total > 0 ? (data.wins / total) * 100 : 0;
                return (
                  <div key={category} className="flex items-center gap-4">
                    <span className="text-gray-400 text-sm w-28 capitalize truncate">{category}</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400"
                        style={{ width: `${catWinRate}%` }}
                      />
                    </div>
                    <span className="text-white text-sm font-medium w-20 text-right">
                      {data.wins}W-{data.losses}L
                    </span>
                    <span className="text-gray-500 text-xs w-12 text-right">
                      {catWinRate.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Battles */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Recent Battles</h3>
          {recentBattles.length === 0 ? (
            <p className="text-gray-500 text-center py-6">No battles yet</p>
          ) : (
            <div className="space-y-3">
              {recentBattles.map((battle: any) => (
                <Link
                  key={battle.id}
                  href={`/prediction-arena/battle/${battle.id}`}
                  className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-all group"
                >
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    battle.won
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {battle.won ? 'WON' : 'LOST'}
                  </span>
                  <p className="flex-1 text-white text-sm truncate group-hover:text-purple-300 transition-colors">
                    {battle.question}
                  </p>
                  <span className="text-gray-400 text-sm">
                    {battle.warrior1Score}-{battle.warrior2Score}
                  </span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                    battle.source === 'polymarket'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {battle.source === 'polymarket' ? 'POLY' : 'KALSHI'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
