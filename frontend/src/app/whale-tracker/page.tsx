'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { WhaleAlertFeed } from '@/components/whale/WhaleAlertFeed';
import { WhaleAlertCard } from '@/components/whale/WhaleAlertCard';
import { TrackedTradersList } from '@/components/whale/TrackedTradersList';
import {
  useWhaleHistory,
  useTrackedTraders,
  useWhaleStats,
  useHotMarkets,
  useTopWhales,
} from '@/hooks/useWhaleAlerts';
import { MarketSource, TrackedTrader } from '@/types/externalMarket';

type Tab = 'live' | 'history' | 'traders';

// Helper functions for formatting
function formatVolume(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}%`;
}

function shortenAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WhaleTrackerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [sourceFilter, setSourceFilter] = useState<MarketSource | ''>('');
  const [selectedTrader, setSelectedTrader] = useState<TrackedTrader | null>(null);

  const {
    trades: historicalTrades,
    loading: historyLoading,
  } = useWhaleHistory(50, sourceFilter || undefined);

  const { traders } = useTrackedTraders();
  const { stats, loading: statsLoading } = useWhaleStats();
  const { hotMarkets, loading: hotMarketsLoading } = useHotMarkets(5);
  const { topWhales, loading: topWhalesLoading } = useTopWhales(5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/markets" className="text-gray-400 hover:text-white">
              ← Back to Markets
            </Link>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                <span>🐋</span> Whale Tracker
              </h1>
              <p className="text-gray-400">
                Monitor large trades on Polymarket and Kalshi in real-time
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">
                {stats?.trackedTraderCount ?? traders.length} traders tracked
              </span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="24h Whale Volume"
            value={statsLoading ? '...' : formatVolume(stats?.totalVolume24h ?? 0)}
            change={stats?.volumeChange24h !== undefined ? formatChange(stats.volumeChange24h) : undefined}
            icon="💰"
            positive={stats?.volumeChange24h !== undefined ? stats.volumeChange24h >= 0 : undefined}
            loading={statsLoading}
          />
          <StatCard
            label="Large Trades (24h)"
            value={statsLoading ? '...' : (stats?.tradeCount24h ?? 0).toString()}
            change={stats?.tradeCountChange !== undefined ? formatChange(stats.tradeCountChange) : undefined}
            icon="📊"
            positive={stats?.tradeCountChange !== undefined ? stats.tradeCountChange >= 0 : undefined}
            loading={statsLoading}
          />
          <StatCard
            label="Tracked Whales"
            value={(stats?.trackedTraderCount ?? traders.length).toString()}
            icon="👀"
            loading={statsLoading}
          />
          <StatCard
            label="Avg Trade Size"
            value={statsLoading ? '...' : formatVolume(stats?.avgTradeSize ?? 0)}
            change={stats?.avgTradeSizeChange !== undefined ? formatChange(stats.avgTradeSizeChange) : undefined}
            icon="📈"
            positive={stats?.avgTradeSizeChange !== undefined ? stats.avgTradeSizeChange >= 0 : undefined}
            loading={statsLoading}
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700 mb-6">
          <nav className="flex gap-6">
            {[
              { id: 'live' as Tab, label: 'Live Feed', icon: '🔴' },
              { id: 'history' as Tab, label: 'History', icon: '📜' },
              { id: 'traders' as Tab, label: 'Tracked Traders', icon: '👀' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 border-b-2 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {activeTab === 'live' && (
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                <WhaleAlertFeed maxAlerts={20} />
              </div>
            )}

            {activeTab === 'history' && (
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                {/* Source Filter */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">
                    📜 Trade History
                  </h3>
                  <select
                    value={sourceFilter}
                    onChange={(e) =>
                      setSourceFilter(e.target.value as MarketSource | '')
                    }
                    className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                  >
                    <option value="">All Sources</option>
                    <option value={MarketSource.POLYMARKET}>Polymarket</option>
                    <option value={MarketSource.KALSHI}>Kalshi</option>
                  </select>
                </div>

                {historyLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historicalTrades.map((trade) => (
                      <WhaleAlertCard key={trade.id} trade={trade} compact />
                    ))}
                    {historicalTrades.length === 0 && (
                      <div className="text-center py-8 text-gray-400">
                        No whale trades found
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'traders' && (
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                <TrackedTradersList onTraderSelect={setSelectedTrader} />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Hot Markets */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">
                🔥 Hot Markets
              </h3>
              {hotMarketsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500" />
                </div>
              ) : hotMarkets.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No hot markets yet
                </div>
              ) : (
                <div className="space-y-3">
                  {hotMarkets.map((market) => (
                    <HotMarketItem
                      key={market.marketId}
                      question={market.question}
                      whaleCount={market.whaleTradeCount}
                      bullishPercent={market.bullishPercent}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Top Whales */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">
                🏆 Top Whales (24h)
              </h3>
              {topWhalesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500" />
                </div>
              ) : topWhales.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No whale activity yet
                </div>
              ) : (
                <div className="space-y-3">
                  {topWhales.map((whale, index) => (
                    <TopWhaleItem
                      key={`${whale.address}-${whale.source}`}
                      address={whale.alias || shortenAddress(whale.address)}
                      volume={formatVolume(whale.volume24h)}
                      winRate={Math.round(whale.winRate * 100)}
                      rank={index + 1}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Alert Settings */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">
                ⚙️ Alert Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm">
                    Min Alert Amount
                  </label>
                  <select
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    defaultValue="10000"
                  >
                    <option value="1000">$1,000+</option>
                    <option value="5000">$5,000+</option>
                    <option value="10000">$10,000+</option>
                    <option value="50000">$50,000+</option>
                    <option value="100000">$100,000+</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Push Notifications</span>
                  <button className="w-12 h-6 bg-purple-600 rounded-full relative">
                    <span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Sound Alerts</span>
                  <button className="w-12 h-6 bg-gray-700 rounded-full relative">
                    <span className="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  change,
  icon,
  positive,
  loading,
}: {
  label: string;
  value: string;
  change?: string;
  icon: string;
  positive?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {change && !loading && (
          <span
            className={`text-xs ${
              positive ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {change}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-gray-700 animate-pulse rounded" />
      ) : (
        <div className="text-white text-2xl font-bold">{value}</div>
      )}
      <div className="text-gray-400 text-sm">{label}</div>
    </div>
  );
}

// Hot Market Item
function HotMarketItem({
  question,
  whaleCount,
  bullishPercent,
}: {
  question: string;
  whaleCount: number;
  bullishPercent: number;
}) {
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg">
      <div className="text-white text-sm font-medium line-clamp-1 mb-2">
        {question}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{whaleCount} whale trades</span>
        <span className={bullishPercent > 50 ? 'text-green-400' : 'text-red-400'}>
          {bullishPercent}% bullish
        </span>
      </div>
    </div>
  );
}

// Top Whale Item
function TopWhaleItem({
  address,
  volume,
  winRate,
  rank,
}: {
  address: string;
  volume: string;
  winRate: number;
  rank: number;
}) {
  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="flex items-center gap-2">
        <span>{rankEmoji}</span>
        <code className="text-purple-400 text-sm">{address}</code>
      </div>
      <div className="text-right">
        <div className="text-white text-sm font-medium">{volume}</div>
        <div className="text-green-400 text-xs">{winRate}% win</div>
      </div>
    </div>
  );
}
