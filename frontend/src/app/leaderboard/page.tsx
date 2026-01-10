'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'all';
type Category = 'profit' | 'winRate' | 'volume' | 'streak';

interface LeaderboardEntry {
  rank: number;
  address: string;
  username?: string;
  totalTrades: number;
  totalVolume: string;
  marketsWon: number;
  marketsLost: number;
  totalProfit: string;
  winRate: number;
  streak: number;
  bestStreak: number;
}

// Leaderboard data will be populated from on-chain events
// Currently showing empty state until event indexing is implemented

export default function LeaderboardPage() {
  const { address, isConnected } = useAccount();
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [category, setCategory] = useState<Category>('profit');
  const [leaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading] = useState(false);

  // Sort leaderboard based on category
  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    switch (category) {
      case 'profit':
        return parseFloat(b.totalProfit) - parseFloat(a.totalProfit);
      case 'winRate':
        return b.winRate - a.winRate;
      case 'volume':
        return parseFloat(b.totalVolume) - parseFloat(a.totalVolume);
      case 'streak':
        return b.bestStreak - a.bestStreak;
      default:
        return 0;
    }
  });

  // Find user's rank
  const userEntry = address
    ? sortedLeaderboard.find(
        (e) => e.address.toLowerCase() === address.toLowerCase()
      )
    : null;

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Leaderboard
          </h1>
          <p className="text-xl text-gray-400">
            Top prediction market traders on Warriors AI Arena
          </p>
        </div>

        {/* User Stats Card (if connected) */}
        {isConnected && (
          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-2xl p-6 border border-purple-500/30 mb-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-gray-400 text-sm">Your Ranking</span>
                <p className="text-3xl font-bold text-white">
                  {userEntry ? `#${userEntry.rank}` : 'Unranked'}
                </p>
              </div>
              <div className="flex gap-8">
                <div className="text-center">
                  <span className="text-gray-400 text-sm">Win Rate</span>
                  <p className="text-2xl font-bold text-green-400">
                    {userEntry ? `${userEntry.winRate}%` : '0%'}
                  </p>
                </div>
                <div className="text-center">
                  <span className="text-gray-400 text-sm">Total Profit</span>
                  <p className="text-2xl font-bold text-white">
                    {userEntry ? `${userEntry.totalProfit} CRwN` : '0 CRwN'}
                  </p>
                </div>
                <div className="text-center">
                  <span className="text-gray-400 text-sm">Current Streak</span>
                  <p className="text-2xl font-bold text-orange-400">
                    {userEntry ? userEntry.streak : 0}
                  </p>
                </div>
              </div>
              <Link
                href="/portfolio"
                className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-lg transition-colors"
              >
                View Portfolio →
              </Link>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          {/* Time Range */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            {(['daily', 'weekly', 'monthly', 'all'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                  timeRange === range
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {range === 'all' ? 'All Time' : range}
              </button>
            ))}
          </div>

          {/* Category */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            {[
              { key: 'profit', label: 'Profit' },
              { key: 'winRate', label: 'Win Rate' },
              { key: 'volume', label: 'Volume' },
              { key: 'streak', label: 'Best Streak' }
            ].map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key as Category)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  category === cat.key
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {!loading && sortedLeaderboard.length === 0 && (
          <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-700 mb-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-white mb-2">No Leaderboard Data Yet</h3>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              The leaderboard will be populated as traders participate in prediction markets.
              Start trading to appear on the leaderboard!
            </p>
            <Link
              href="/markets"
              className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
            >
              Browse Markets
            </Link>
          </div>
        )}

        {/* Top 3 Podium */}
        {sortedLeaderboard.length >= 3 && (
        <div className="flex justify-center items-end gap-4 mb-12">
          {/* 2nd Place */}
          {sortedLeaderboard[1] && (
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-3 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-3xl">
                🥈
              </div>
              <div className="bg-gray-800 rounded-xl p-4 w-48">
                <p className="font-semibold text-white truncate">
                  {sortedLeaderboard[1].username || truncateAddress(sortedLeaderboard[1].address)}
                </p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {sortedLeaderboard[1].totalProfit} CRwN
                </p>
                <p className="text-sm text-gray-400">
                  {sortedLeaderboard[1].winRate}% win rate
                </p>
              </div>
            </div>
          )}

          {/* 1st Place */}
          {sortedLeaderboard[0] && (
            <div className="text-center -mt-8">
              <div className="w-32 h-32 mx-auto mb-3 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-5xl shadow-lg shadow-yellow-500/30">
                👑
              </div>
              <div className="bg-gradient-to-br from-yellow-900/30 to-gray-800 rounded-xl p-6 w-56 border border-yellow-500/30">
                <p className="font-bold text-xl text-white truncate">
                  {sortedLeaderboard[0].username || truncateAddress(sortedLeaderboard[0].address)}
                </p>
                <p className="text-3xl font-bold text-green-400 mt-2">
                  {sortedLeaderboard[0].totalProfit} CRwN
                </p>
                <p className="text-gray-400">
                  {sortedLeaderboard[0].winRate}% win rate
                </p>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {sortedLeaderboard[2] && (
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-3 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-3xl">
                🥉
              </div>
              <div className="bg-gray-800 rounded-xl p-4 w-48">
                <p className="font-semibold text-white truncate">
                  {sortedLeaderboard[2].username || truncateAddress(sortedLeaderboard[2].address)}
                </p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {sortedLeaderboard[2].totalProfit} CRwN
                </p>
                <p className="text-sm text-gray-400">
                  {sortedLeaderboard[2].winRate}% win rate
                </p>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Full Leaderboard Table */}
        {sortedLeaderboard.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800">
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Rank</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Trader</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Trades</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Volume</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">W/L</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Win Rate</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Profit</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Best Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedLeaderboard.map((entry, index) => (
                  <tr
                    key={entry.address}
                    className={`hover:bg-gray-800/50 transition-colors ${
                      address?.toLowerCase() === entry.address.toLowerCase()
                        ? 'bg-purple-900/20'
                        : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <span className={`font-bold ${
                        index === 0 ? 'text-yellow-400' :
                        index === 1 ? 'text-gray-300' :
                        index === 2 ? 'text-amber-600' :
                        'text-gray-400'
                      }`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-white">
                          {entry.username || truncateAddress(entry.address)}
                        </p>
                        {entry.username && (
                          <p className="text-sm text-gray-500">{truncateAddress(entry.address)}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-white">{entry.totalTrades}</td>
                    <td className="px-6 py-4 text-right text-white">{entry.totalVolume} CRwN</td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-green-400">{entry.marketsWon}</span>
                      <span className="text-gray-500">/</span>
                      <span className="text-red-400">{entry.marketsLost}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-medium ${
                        entry.winRate >= 60 ? 'text-green-400' :
                        entry.winRate >= 50 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {entry.winRate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${
                        parseFloat(entry.totalProfit) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {entry.totalProfit} CRwN
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-orange-400 font-medium">
                        {entry.bestStreak}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Rewards Info */}
        <div className="mt-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Seasonal Rewards</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
              <div className="text-4xl mb-3">🥇</div>
              <h3 className="text-lg font-semibold text-yellow-400 mb-2">1st Place</h3>
              <p className="text-2xl font-bold text-white">1000 CRwN</p>
              <p className="text-gray-400 text-sm mt-1">+ Exclusive NFT Badge</p>
            </div>
            <div className="text-center p-6 bg-gray-500/10 rounded-xl border border-gray-500/30">
              <div className="text-4xl mb-3">🥈</div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2">2nd Place</h3>
              <p className="text-2xl font-bold text-white">500 CRwN</p>
              <p className="text-gray-400 text-sm mt-1">+ Rare NFT Badge</p>
            </div>
            <div className="text-center p-6 bg-amber-500/10 rounded-xl border border-amber-500/30">
              <div className="text-4xl mb-3">🥉</div>
              <h3 className="text-lg font-semibold text-amber-500 mb-2">3rd Place</h3>
              <p className="text-2xl font-bold text-white">250 CRwN</p>
              <p className="text-gray-400 text-sm mt-1">+ NFT Badge</p>
            </div>
          </div>
          <p className="text-center text-gray-400 mt-6">
            Season ends in 23 days. Keep trading to climb the ranks!
          </p>
        </div>
    </main>
  );
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
