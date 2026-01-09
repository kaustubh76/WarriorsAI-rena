'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMarkets } from '@/hooks/useMarkets';
import { MarketCard } from '@/components/markets/MarketCard';
import { MarketStatus } from '@/services/predictionMarketService';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

type FilterTab = 'all' | 'active' | 'battles' | 'resolved';
type SortOption = 'volume' | 'liquidity' | 'endTime' | 'newest';

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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Prediction Markets
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Bet on battle outcomes, create custom markets, and earn by providing liquidity.
            Powered by 0G AI Oracle for trustless resolution.
          </p>

          {/* Quick Stats */}
          <div className="flex justify-center gap-8 mt-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-400">{markets.length}</p>
              <p className="text-gray-400 text-sm">Total Markets</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">{activeMarkets.length}</p>
              <p className="text-gray-400 text-sm">Active</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">
                {(totalVolume / 1e18).toFixed(0)} CRwN
              </p>
              <p className="text-gray-400 text-sm">Total Volume</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-400">
                {(totalLiquidity / 1e18).toFixed(0)} CRwN
              </p>
              <p className="text-gray-400 text-sm">Total Liquidity</p>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          {/* Tab Filters */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            {[
              { key: 'all', label: 'All Markets' },
              { key: 'active', label: 'Active' },
              { key: 'battles', label: 'Battles' },
              { key: 'resolved', label: 'Resolved' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as FilterTab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
          >
            <option value="volume">Sort by Volume</option>
            <option value="liquidity">Sort by Liquidity</option>
            <option value="endTime">Ending Soon</option>
            <option value="newest">Newest First</option>
          </select>

          {/* Create Market Button */}
          <Link
            href="/markets/create"
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all text-center"
          >
            + Create Market
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={refetch}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && sortedMarkets.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-white mb-2">No Markets Found</h3>
            <p className="text-gray-400 mb-6">
              {searchQuery
                ? 'Try a different search term'
                : 'Be the first to create a prediction market!'}
            </p>
            <Link
              href="/markets/create"
              className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
            >
              Create Market
            </Link>
          </div>
        )}

        {/* Markets Grid */}
        {!loading && !error && sortedMarkets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedMarkets.map((market) => (
              <MarketCard key={market.id.toString()} market={market} />
            ))}
          </div>
        )}

        {/* Featured Markets Section */}
        {activeMarkets.length > 0 && activeTab === 'all' && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-white mb-6">Featured Battle Markets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div className="mt-16 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl">
                1
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Choose a Market</h3>
              <p className="text-gray-400">
                Browse active prediction markets for upcoming battles or create your own custom market.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl">
                2
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Buy Outcome Tokens</h3>
              <p className="text-gray-400">
                Use CRwN to buy YES or NO shares. Prices reflect market probability.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl">
                3
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Claim Winnings</h3>
              <p className="text-gray-400">
                After resolution via 0G AI Oracle, winning shares redeem for 1 CRwN each.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
