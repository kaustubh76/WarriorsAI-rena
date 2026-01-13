'use client';

import React, { useState } from 'react';
import { ArbitrageCard, ArbitrageOpportunity } from './ArbitrageCard';
import { useArbitrageOpportunities } from '@/hooks/useExternalMarkets';

interface ArbitrageOpportunityListProps {
  maxItems?: number;
  showControls?: boolean;
  compact?: boolean;
}

export function ArbitrageOpportunityList({
  maxItems = 10,
  showControls = true,
  compact = false,
}: ArbitrageOpportunityListProps) {
  const [minSpread, setMinSpread] = useState(5);
  const { opportunities, loading, error, refetch } = useArbitrageOpportunities(minSpread);

  const displayedOpportunities = (opportunities as ArbitrageOpportunity[])?.slice(0, maxItems) || [];
  const hasMore = (opportunities?.length || 0) > maxItems;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-64 bg-gray-800/50 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/20 border border-red-500/30 rounded-xl text-center">
        <p className="text-red-400">Failed to load arbitrage opportunities</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (displayedOpportunities.length === 0) {
    return (
      <div className="p-8 bg-gray-900/50 border border-gray-700 rounded-xl text-center">
        <span className="text-4xl mb-4 block">🔍</span>
        <h3 className="text-white font-medium mb-2">No Arbitrage Opportunities</h3>
        <p className="text-gray-400 text-sm mb-4">
          No opportunities found with spread &gt; {minSpread}%
        </p>
        {showControls && (
          <button
            onClick={() => setMinSpread(Math.max(1, minSpread - 2))}
            className="px-4 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg text-sm"
          >
            Lower threshold to {Math.max(1, minSpread - 2)}%
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      {showControls && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <label className="text-gray-400 text-sm">Min Spread:</label>
            <select
              value={minSpread}
              onChange={(e) => setMinSpread(parseInt(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-purple-500"
            >
              <option value={1}>1%</option>
              <option value={3}>3%</option>
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={15}>15%</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">
              {opportunities?.length || 0} opportunities found
            </span>
            <button
              onClick={() => refetch()}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Refresh"
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Opportunities Grid */}
      <div className={compact ? 'space-y-3' : 'grid gap-4 md:grid-cols-2'}>
        {displayedOpportunities.map((opportunity) => (
          <ArbitrageCard key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>

      {/* Show More */}
      {hasMore && (
        <div className="text-center pt-4">
          <a
            href="/external?tab=arbitrage"
            className="text-purple-400 hover:text-purple-300 text-sm"
          >
            View all {opportunities?.length} opportunities →
          </a>
        </div>
      )}
    </div>
  );
}

export default ArbitrageOpportunityList;
