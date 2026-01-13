'use client';

import React from 'react';
import { formatEther } from 'viem';
import { useUnifiedPortfolio, PortfolioPosition } from '@/hooks/useUnifiedPortfolio';
import { MarketSource } from '@/types/externalMarket';

// ============================================
// SUB-COMPONENTS
// ============================================

function SummaryCard({
  label,
  value,
  suffix,
  isPositive,
}: {
  label: string;
  value: string;
  suffix?: string;
  isPositive?: boolean;
}) {
  const colorClass =
    isPositive === undefined
      ? 'text-white'
      : isPositive
      ? 'text-green-400'
      : 'text-red-400';

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorClass}`}>
        {value}
        {suffix && <span className="text-sm font-normal ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

function SourceBadge({ source }: { source: MarketSource }) {
  const config = {
    [MarketSource.NATIVE]: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Native' },
    [MarketSource.POLYMARKET]: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Polymarket' },
    [MarketSource.KALSHI]: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Kalshi' },
  };

  const { bg, text, label } = config[source] || config[MarketSource.NATIVE];

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${bg} ${text}`}>
      {label}
    </span>
  );
}

function PositionRow({ position }: { position: PortfolioPosition }) {
  const pnlColor = position.unrealizedPnL >= 0n ? 'text-green-400' : 'text-red-400';
  const pnlSign = position.unrealizedPnL >= 0n ? '+' : '';

  return (
    <tr className="border-t border-gray-700 hover:bg-gray-800/50 transition-colors">
      <td className="p-4">
        <div className="max-w-xs">
          <p className="text-white text-sm truncate" title={position.marketQuestion}>
            {position.marketQuestion}
          </p>
        </div>
      </td>
      <td className="p-4">
        <SourceBadge source={position.source} />
      </td>
      <td className="p-4 text-right">
        <span className={position.isYes ? 'text-green-400' : 'text-red-400'}>
          {Number(formatEther(position.shares)).toFixed(2)} {position.isYes ? 'YES' : 'NO'}
        </span>
      </td>
      <td className="p-4 text-right text-gray-300">
        {position.avgPrice.toFixed(1)}%
      </td>
      <td className="p-4 text-right text-white font-medium">
        {position.currentPrice.toFixed(1)}%
      </td>
      <td className={`p-4 text-right font-medium ${pnlColor}`}>
        {pnlSign}{Number(formatEther(position.unrealizedPnL)).toFixed(4)} CRwN
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <svg
        className="w-16 h-16 mx-auto text-gray-600 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
      <h3 className="text-lg font-medium text-gray-400 mb-2">No Positions</h3>
      <p className="text-gray-500 text-sm">
        Start trading on native or mirrored markets to build your portfolio.
      </p>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function UnifiedPortfolio() {
  const {
    portfolio,
    positions,
    filter,
    setFilter,
    loading,
    error,
    refresh,
    totalValueFormatted,
    totalPnLFormatted,
    isPnLPositive,
  } = useUnifiedPortfolio();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        <span className="ml-3 text-gray-400">Loading portfolio...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={refresh}
          className="mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Connect your wallet to view your portfolio.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Value"
          value={Number(totalValueFormatted).toFixed(4)}
          suffix="CRwN"
        />
        <SummaryCard
          label="Unrealized P&L"
          value={`${isPnLPositive ? '+' : ''}${Number(formatEther(portfolio.totalUnrealizedPnL)).toFixed(4)}`}
          suffix="CRwN"
          isPositive={portfolio.totalUnrealizedPnL >= 0n}
        />
        <SummaryCard
          label="Realized P&L"
          value={`${portfolio.totalRealizedPnL >= 0n ? '+' : ''}${Number(formatEther(portfolio.totalRealizedPnL)).toFixed(4)}`}
          suffix="CRwN"
          isPositive={portfolio.totalRealizedPnL >= 0n}
        />
        <SummaryCard
          label="Positions"
          value={portfolio.positionCount.toString()}
        />
      </div>

      {/* Source Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gray-400 text-sm">Filter by source:</span>
        {[
          { key: 'all', label: 'All' },
          { key: MarketSource.NATIVE, label: 'Native' },
          { key: MarketSource.POLYMARKET, label: 'Polymarket' },
          { key: MarketSource.KALSHI, label: 'Kalshi' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as MarketSource | 'all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}

        <button
          onClick={refresh}
          className="ml-auto px-3 py-2 text-gray-400 hover:text-white transition-colors"
          title="Refresh portfolio"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Source Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-400">Native</p>
            <p className="text-lg font-semibold text-white">{portfolio.nativePositions.length} positions</p>
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-400">Polymarket</p>
            <p className="text-lg font-semibold text-white">{portfolio.polymarketPositions.length} positions</p>
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-400">Kalshi</p>
            <p className="text-lg font-semibold text-white">{portfolio.kalshiPositions.length} positions</p>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      {positions.length > 0 ? (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="p-4 text-left text-sm font-medium text-gray-400">Market</th>
                <th className="p-4 text-left text-sm font-medium text-gray-400">Source</th>
                <th className="p-4 text-right text-sm font-medium text-gray-400">Position</th>
                <th className="p-4 text-right text-sm font-medium text-gray-400">Avg Price</th>
                <th className="p-4 text-right text-sm font-medium text-gray-400">Current</th>
                <th className="p-4 text-right text-sm font-medium text-gray-400">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <PositionRow key={pos.id} position={pos} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl">
          <EmptyState />
        </div>
      )}
    </div>
  );
}

export default UnifiedPortfolio;
