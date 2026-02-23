'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMarkets } from '@/hooks/useMarkets';
import { MarketCard } from '@/components/markets/MarketCard';
import { MarketStatus } from '@/services/predictionMarketService';

type FilterTab = 'all' | 'active' | 'battles' | 'resolved';
type SortOption = 'volume' | 'liquidity' | 'endTime' | 'newest';

// Tab configuration
const TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '📊' },
  { key: 'active', label: 'Active', icon: '🔥' },
  { key: 'battles', label: 'Battles', icon: '⚔️' },
  { key: 'resolved', label: 'Resolved', icon: '✅' },
];

// Loading skeleton component
const MarketCardSkeleton = () => (
  <div className="card animate-pulse">
    <div className="flex items-center gap-3 mb-4">
      <div className="skeleton w-10 h-10 rounded-full" />
      <div className="flex-1">
        <div className="skeleton h-4 w-3/4 mb-2" />
        <div className="skeleton h-3 w-1/2" />
      </div>
    </div>
    <div className="skeleton h-6 w-full mb-4" />
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="skeleton h-16 rounded-lg" />
      <div className="skeleton h-16 rounded-lg" />
    </div>
    <div className="skeleton h-10 w-full rounded-lg" />
  </div>
);

export default function MarketsPage() {
  const { markets, activeMarkets, resolvedMarkets, loading, error, refetch } = useMarkets();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('volume');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter markets based on active tab
  const filteredMarkets = markets.filter((market) => {
    // Apply search filter
    if (searchQuery && !market.question.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Apply tab filter
    switch (activeTab) {
      case 'active':
        return market.status === MarketStatus.Active;
      case 'battles':
        return market.battleId > BigInt(0);
      case 'resolved':
        return market.status === MarketStatus.Resolved;
      default:
        return true;
    }
  });

  // Sort markets
  const sortedMarkets = [...filteredMarkets].sort((a, b) => {
    switch (sortBy) {
      case 'volume':
        return Number(b.yesTokens + b.noTokens) - Number(a.yesTokens + a.noTokens);
      case 'liquidity':
        return Number(b.liquidity) - Number(a.liquidity);
      case 'endTime':
        return Number(a.endTime) - Number(b.endTime);
      case 'newest':
        return Number(b.id) - Number(a.id);
      default:
        return 0;
    }
  });

  // Stats
  const totalVolume = markets.reduce((acc, m) => acc + Number(m.yesTokens + m.noTokens), 0);
  const totalLiquidity = markets.reduce((acc, m) => acc + Number(m.liquidity), 0);

  return (
    <main className="container-arcade py-6 md:py-8">
      {/* Hero Section */}
      <div className="text-center mb-8 md:mb-12 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 md:mb-4 arcade-glow">
          Prediction Markets
        </h1>
        <p className="text-sm md:text-base text-slate-400 max-w-2xl mx-auto px-4">
          Bet on battle outcomes, create custom markets, and earn by providing liquidity.
          Powered by 0G AI Oracle for trustless resolution.
        </p>

        {/* Quick Stats - Grid on mobile, flex on desktop */}
        <div className="grid grid-cols-2 md:flex md:justify-center gap-4 md:gap-8 mt-6 md:mt-8 px-2">
          <div className="stat-card text-center">
            <p className="stat-card-value text-purple-400">{markets.length}</p>
            <p className="stat-card-label">Total Markets</p>
          </div>
          <div className="stat-card text-center">
            <p className="stat-card-value text-green-400">{activeMarkets.length}</p>
            <p className="stat-card-label">Active</p>
          </div>
          <div className="stat-card text-center">
            <p className="stat-card-value text-white text-base md:text-lg">
              {(totalVolume / 1e18).toFixed(0)}
              <span className="text-xs text-slate-400 ml-1">CRwN</span>
            </p>
            <p className="stat-card-label">Volume</p>
          </div>
          <div className="stat-card text-center">
            <p className="stat-card-value text-blue-400 text-base md:text-lg">
              {(totalLiquidity / 1e18).toFixed(0)}
              <span className="text-xs text-slate-400 ml-1">CRwN</span>
            </p>
            <p className="stat-card-label">Liquidity</p>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 mb-6 md:mb-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
        {/* Top row: Tabs + Create Button */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          {/* Tab Filters - Scrollable on mobile */}
          <div className="flex overflow-x-auto pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 gap-2 sm:gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap touch-target ${
                  activeTab === tab.key
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                    : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Create Market Button */}
          <Link
            href="/create-market"
            className="btn btn-primary btn-sm sm:btn-md flex-shrink-0"
          >
            <span className="text-lg">+</span>
            <span>Create</span>
          </Link>
        </div>

        {/* Bottom row: Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-11"
            />
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="input w-full sm:w-auto sm:min-w-[180px]"
          >
            <option value="volume">📈 Sort by Volume</option>
            <option value="liquidity">💧 Sort by Liquidity</option>
            <option value="endTime">⏰ Ending Soon</option>
            <option value="newest">✨ Newest First</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(6)].map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card text-center py-12 md:py-20 animate-fade-in">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="btn btn-secondary"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && sortedMarkets.length === 0 && (
        <div className="card text-center py-12 md:py-20 animate-fade-in">
          <div className="text-5xl md:text-6xl mb-4">📊</div>
          <h3 className="text-lg md:text-xl font-semibold text-white mb-2">No Markets Found</h3>
          <p className="text-slate-400 mb-6 text-sm">
            {searchQuery
              ? 'Try a different search term'
              : 'Be the first to create a prediction market!'}
          </p>
          <Link
            href="/create-market"
            className="btn btn-primary"
          >
            Create Market
          </Link>
        </div>
      )}

      {/* Markets Grid */}
      {!loading && !error && sortedMarkets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {sortedMarkets.map((market, index) => (
            <div
              key={market.id.toString()}
              className="animate-slide-up"
              style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
            >
              <MarketCard market={market} />
            </div>
          ))}
        </div>
      )}

      {/* Featured Markets Section */}
      {activeMarkets.length > 0 && activeTab === 'all' && !loading && (
        <div className="mt-12 md:mt-16 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">⚔️</span>
            <h2 className="text-xl md:text-2xl font-bold text-white">Featured Battle Markets</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {activeMarkets
              .filter((m) => m.battleId > BigInt(0))
              .slice(0, 2)
              .map((market) => (
                <MarketCard key={market.id.toString()} market={market} />
              ))}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="mt-12 md:mt-16 feature-card animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-6 md:mb-8 text-center arcade-glow">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {[
            {
              step: '1',
              icon: '🎯',
              title: 'Choose a Market',
              description: 'Browse active prediction markets for upcoming battles or create your own custom market.',
            },
            {
              step: '2',
              icon: '💰',
              title: 'Buy Outcome Tokens',
              description: 'Use CRwN to buy YES or NO shares. Prices reflect market probability.',
            },
            {
              step: '3',
              icon: '🏆',
              title: 'Claim Winnings',
              description: 'After resolution via 0G AI Oracle, winning shares redeem for 1 CRwN each.',
            },
          ].map((item, index) => (
            <div
              key={item.step}
              className="text-center animate-slide-up"
              style={{ animationDelay: `${400 + index * 100}ms` }}
            >
              <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-4 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-2xl md:text-3xl">
                {item.icon}
              </div>
              <h3 className="text-base md:text-lg font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-slate-400 text-xs md:text-sm">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-12 md:mt-16 text-center animate-fade-in" style={{ animationDelay: '500ms' }}>
        <p className="text-slate-400 mb-4 text-sm">
          Ready to make your prediction?
        </p>
        <Link
          href="/create-market"
          className="btn btn-primary btn-lg"
        >
          Create Your Market
        </Link>
      </div>
    </main>
  );
}
