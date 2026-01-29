'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface ArbitrageOpportunity {
  id: string;
  question: string;
  polymarket: {
    id: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
  };
  kalshi: {
    id: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
  };
  spread: number;
  potentialProfit: number;
  cost: number;
  strategy: {
    buyYesOn: string;
    buyNoOn: string;
  };
  similarity: number;
}

interface MarketSearchWithArbitrageProps {
  onSelectMarket: (polyId: string, kalshiId: string, opportunity: ArbitrageOpportunity) => void;
  minSpread?: number;
}

// ============================================
// COMPONENT
// ============================================

export default function MarketSearchWithArbitrage({
  onSelectMarket,
  minSpread = 5,
}: MarketSearchWithArbitrageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch opportunities
  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        minSpread: minSpread.toString(),
        limit: '20',
      });

      if (debouncedQuery) {
        params.append('search', debouncedQuery);
      }

      const response = await fetch(`/api/arena/arbitrage-opportunities?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch opportunities');
      }

      setOpportunities(data.opportunities || []);
    } catch (err) {
      setError((err as Error).message);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, minSpread]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  // Get profit color based on percentage
  const getProfitColor = (profit: number) => {
    if (profit >= 10) return 'text-green-600';
    if (profit >= 5) return 'text-emerald-500';
    return 'text-yellow-500';
  };

  // Get spread color
  const getSpreadColor = (spread: number) => {
    if (spread >= 10) return 'bg-green-100 text-green-800';
    if (spread >= 5) return 'bg-emerald-100 text-emerald-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search markets (e.g., Bitcoin, Trump, Fed)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Searching for opportunities...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && opportunities.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No arbitrage opportunities found</p>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your search or lowering the minimum spread
          </p>
        </div>
      )}

      {/* Opportunities List */}
      {!loading && opportunities.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Found {opportunities.length} arbitrage opportunities
          </p>

          {opportunities.map((opp) => (
            <div
              key={opp.id}
              onClick={() => onSelectMarket(opp.polymarket.id, opp.kalshi.id, opp)}
              className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer bg-white"
            >
              {/* Question */}
              <h3 className="font-semibold text-gray-900 mb-3">
                {opp.question}
              </h3>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-2 gap-4 mb-3">
                {/* Polymarket */}
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-purple-700">
                      Polymarket
                    </span>
                    <span className="text-xs text-gray-500">
                      ${(parseFloat(opp.polymarket.volume) / 1e6).toFixed(1)}M
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <div>
                      <p className="text-xs text-gray-600">YES</p>
                      <p className="font-semibold text-purple-900">
                        {opp.polymarket.yesPrice.toFixed(1)}¢
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">NO</p>
                      <p className="font-semibold text-purple-900">
                        {opp.polymarket.noPrice.toFixed(1)}¢
                      </p>
                    </div>
                  </div>
                </div>

                {/* Kalshi */}
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-blue-700">
                      Kalshi
                    </span>
                    <span className="text-xs text-gray-500">
                      ${(parseFloat(opp.kalshi.volume) / 1e6).toFixed(1)}M
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <div>
                      <p className="text-xs text-gray-600">YES</p>
                      <p className="font-semibold text-blue-900">
                        {opp.kalshi.yesPrice.toFixed(1)}¢
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">NO</p>
                      <p className="font-semibold text-blue-900">
                        {opp.kalshi.noPrice.toFixed(1)}¢
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Strategy & Metrics */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <div className="flex items-center gap-3">
                  {/* Profit Badge */}
                  <div className={`px-3 py-1 rounded-full ${getSpreadColor(opp.spread)}`}>
                    <span className="text-xs font-semibold">
                      +{opp.potentialProfit.toFixed(2)}% profit
                    </span>
                  </div>

                  {/* Strategy */}
                  <div className="text-xs text-gray-600">
                    Buy YES on {opp.strategy.buyYesOn}, NO on {opp.strategy.buyNoOn}
                  </div>
                </div>

                {/* Cost */}
                <div className="text-right">
                  <p className="text-xs text-gray-500">Cost</p>
                  <p className="font-semibold text-gray-900">
                    ${opp.cost.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Confidence Indicator */}
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Match confidence</span>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${opp.similarity * 100}%` }}
                      />
                    </div>
                    <span className="text-gray-700 font-medium">
                      {(opp.similarity * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
