'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useExternalMarkets, useExternalMarketStats } from '@/hooks/useExternalMarkets';
import { ExternalMarketCard } from '@/components/markets/ExternalMarketCard';
import { MarketSourceFilter, MarketSourceTabs } from '@/components/markets/MarketSourceFilter';
import { MarketSource, ExternalMarketStatus } from '@/types/externalMarket';

// Categories for filtering
const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'Politics', label: 'Politics' },
  { value: 'Crypto', label: 'Crypto' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Science', label: 'Science' },
  { value: 'Entertainment', label: 'Entertainment' },
  { value: 'Finance', label: 'Finance' },
];

// Sort options
const SORT_OPTIONS = [
  { value: 'volume', label: 'Volume' },
  { value: 'endTime', label: 'Ending Soon' },
  { value: 'yesPrice', label: 'Probability' },
  { value: 'createdAt', label: 'Newest' },
];

// Loading skeleton component
const ExternalMarketCardSkeleton = () => (
  <div className="card animate-pulse">
    <div className="flex items-center justify-between mb-4">
      <div className="skeleton h-6 w-24 rounded-full" />
      <div className="skeleton h-5 w-16" />
    </div>
    <div className="skeleton h-5 w-full mb-2" />
    <div className="skeleton h-4 w-3/4 mb-4" />
    <div className="flex items-center gap-4 mb-4">
      <div className="skeleton h-12 w-20" />
      <div className="skeleton h-12 w-24" />
    </div>
    <div className="skeleton h-3 w-1/2 mb-2" />
    <div className="skeleton h-10 w-full rounded-lg" />
  </div>
);

export default function ExternalMarketsPage() {
  // Filter state
  const [sourceFilter, setSourceFilter] = useState<MarketSource | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ExternalMarketStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'endTime' | 'yesPrice' | 'createdAt'>('volume');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Arbitrage state
  const [arbitrageOpps, setArbitrageOpps] = useState<any[]>([]);
  const [arbitrageLoading, setArbitrageLoading] = useState(false);

  // Build filters
  const filters = useMemo(() => ({
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    search: searchQuery || undefined,
    sortBy,
    sortOrder,
    page,
    pageSize,
  }), [sourceFilter, statusFilter, categoryFilter, searchQuery, sortBy, sortOrder, page]);

  // Reset page when filters change
  const resetFilters = () => setPage(1);

  // Fetch markets
  const { markets, loading, error, total, refetch, syncMarkets, syncing } = useExternalMarkets(filters);
  const { stats, loading: statsLoading } = useExternalMarketStats();

  // Fetch arbitrage opportunities
  useEffect(() => {
    const fetchArbitrage = async () => {
      try {
        setArbitrageLoading(true);
        const response = await fetch('/api/external/arbitrage');
        const data = await response.json();

        if (data.success && data.data?.opportunities) {
          setArbitrageOpps(data.data.opportunities);
        }
      } catch (error) {
        console.error('Failed to fetch arbitrage opportunities:', error);
      } finally {
        setArbitrageLoading(false);
      }
    };

    fetchArbitrage();

    // Refresh arbitrage data every 60 seconds
    const interval = setInterval(fetchArbitrage, 60000);
    return () => clearInterval(interval);
  }, []);

  // Handle sync
  const handleSync = async () => {
    if (sourceFilter === 'all') {
      await syncMarkets();
    } else {
      await syncMarkets(sourceFilter);
    }
  };

  // Check if a market has arbitrage opportunities
  const hasArbitrageOpportunity = (marketId: string, source: MarketSource) => {
    return arbitrageOpps.some(
      (opp) =>
        (opp.externalMarket?.id === marketId ||
          opp.externalMarket?.externalId === marketId) &&
        opp.externalMarket?.source === source
    );
  };

  // Count markets with arbitrage
  const arbitrageCount = useMemo(() => {
    return markets.filter((m) => hasArbitrageOpportunity(m.id, m.source)).length;
  }, [markets, arbitrageOpps]);

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
              <h1 className="text-3xl font-bold text-white mb-2">
                External Markets
              </h1>
              <p className="text-gray-400">
                Trade on Polymarket and Kalshi markets with AI insights
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/external/arbitrage"
                className="px-4 py-2 rounded-lg font-medium bg-yellow-600 text-white hover:bg-yellow-500 transition-all flex items-center gap-2"
              >
                <span>🎯</span>
                Arbitrage {arbitrageCount > 0 && `(${arbitrageCount})`}
              </Link>
              <button
                onClick={handleSync}
                disabled={syncing}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-all
                  ${syncing
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-500'
                  }
                `}
              >
                {syncing ? 'Syncing...' : 'Sync Markets'}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Markets"
              value={stats.totalMarkets.toString()}
              icon="📊"
            />
            <StatCard
              label="Polymarket"
              value={stats.polymarketCount.toString()}
              icon="🔮"
              color="blue"
            />
            <StatCard
              label="Kalshi"
              value={stats.kalshiCount.toString()}
              icon="📈"
              color="green"
            />
            <StatCard
              label="Total Volume"
              value={formatVolume(stats.totalVolume)}
              icon="💰"
              color="yellow"
            />
          </div>
        )}

        {/* Source Tabs */}
        <div className="mb-6">
          <MarketSourceTabs
            selected={sourceFilter}
            onChange={setSourceFilter}
            counts={{
              all: stats?.totalMarkets,
              polymarket: stats?.polymarketCount,
              kalshi: stats?.kalshiCount,
            }}
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 min-w-[200px] max-w-md">
            <input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ExternalMarketStatus | '')}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white hover:bg-gray-700"
            >
              {sortOrder === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-gray-400 text-sm">
            Showing {markets.length} of {total} markets
          </p>
          {stats?.lastSync && (
            <p className="text-gray-500 text-sm">
              Last synced: {new Date(stats.lastSync).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[...Array(6)].map((_, i) => (
              <ExternalMarketCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="card p-8 text-center border-red-500/30">
            <div className="mb-4 text-red-400 text-4xl">⚠️</div>
            <h3 className="text-xl font-semibold text-white mb-2">Failed to Load Markets</h3>
            <p className="text-red-400 mb-6">{error}</p>
            <button
              onClick={refetch}
              className="px-6 py-3 bg-red-600/30 hover:bg-red-600/50 text-red-300 hover:text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && markets.length === 0 && (
          <div className="card p-12 text-center">
            <div className="mb-4 text-gray-500 text-5xl">📊</div>
            <h3 className="text-xl font-semibold text-white mb-2">No Markets Found</h3>
            <p className="text-gray-400 mb-6">
              Try adjusting your filters or sync markets from external sources
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 transition-colors"
            >
              {syncing ? 'Syncing...' : 'Sync Markets Now'}
            </button>
          </div>
        )}

        {/* Markets Grid */}
        {!loading && markets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((market) => (
              <ExternalMarketCard
                key={market.id}
                market={market}
                hasArbitrage={hasArbitrageOpportunity(market.id, market.source)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {markets.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-gray-400">
              Page {page} of {Math.ceil(total / pageSize)}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={markets.length < pageSize || page * pageSize >= total}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  color = 'purple',
}: {
  label: string;
  value: string;
  icon: string;
  color?: 'purple' | 'blue' | 'green' | 'yellow';
}) {
  const colorClasses = {
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
  };

  return (
    <div
      className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-gray-400 text-sm">{label}</p>
          <p className="text-white text-xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function formatVolume(vol: string): string {
  const num = parseFloat(vol);
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}
