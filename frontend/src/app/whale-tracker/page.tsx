'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { WhaleAlertFeed } from '@/components/whale/WhaleAlertFeed';
import { WhaleAlertCard } from '@/components/whale/WhaleAlertCard';
import { TrackedTradersList } from '@/components/whale/TrackedTradersList';
import { useWhaleHistory, useTrackedTraders } from '@/hooks/useWhaleAlerts';
import { MarketSource, TrackedTrader } from '@/types/externalMarket';

type Tab = 'live' | 'history' | 'traders';

export default function WhaleTrackerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [sourceFilter, setSourceFilter] = useState<MarketSource | ''>('');
  const [selectedTrader, setSelectedTrader] = useState<TrackedTrader | null>(null);

  const {
    trades: historicalTrades,
    loading: historyLoading,
    refetch: refetchHistory,
  } = useWhaleHistory(50, sourceFilter || undefined);

  const { traders } = useTrackedTraders();

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
                {traders.length} traders tracked
              </span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="24h Whale Volume"
            value="$2.4M"
            change="+12%"
            icon="💰"
            positive
          />
          <StatCard
            label="Large Trades (24h)"
            value="127"
            change="+8"
            icon="📊"
            positive
          />
          <StatCard
            label="Tracked Whales"
            value={traders.length.toString()}
            icon="👀"
          />
          <StatCard
            label="Avg Trade Size"
            value="$18.9K"
            change="-3%"
            icon="📈"
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
            {/* Quick Stats */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">
                🔥 Hot Markets
              </h3>
              <div className="space-y-3">
                <HotMarketItem
                  question="Will BTC hit $100K?"
                  whaleCount={23}
                  bullishPercent={78}
                />
                <HotMarketItem
                  question="2024 Election Winner"
                  whaleCount={18}
                  bullishPercent={52}
                />
                <HotMarketItem
                  question="Fed Rate Cut?"
                  whaleCount={15}
                  bullishPercent={65}
                />
              </div>
            </div>

            {/* Top Whales */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">
                🏆 Top Whales (24h)
              </h3>
              <div className="space-y-3">
                <TopWhaleItem
                  address="0x7a16..."
                  volume="$420K"
                  winRate={73}
                  rank={1}
                />
                <TopWhaleItem
                  address="0x3f82..."
                  volume="$312K"
                  winRate={68}
                  rank={2}
                />
                <TopWhaleItem
                  address="0x9c4d..."
                  volume="$287K"
                  winRate={71}
                  rank={3}
                />
              </div>
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
                  <select className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white">
                    <option>$1,000+</option>
                    <option>$5,000+</option>
                    <option selected>$10,000+</option>
                    <option>$50,000+</option>
                    <option>$100,000+</option>
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
}: {
  label: string;
  value: string;
  change?: string;
  icon: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {change && (
          <span
            className={`text-xs ${
              positive ? 'text-green-400' : change.startsWith('-') ? 'text-red-400' : 'text-gray-400'
            }`}
          >
            {change}
          </span>
        )}
      </div>
      <div className="text-white text-2xl font-bold">{value}</div>
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
  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';

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
