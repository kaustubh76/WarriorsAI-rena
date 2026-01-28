import React, { useState, useEffect, useMemo } from 'react';
import { Search, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { OracleSourceBadge, OutcomeBadge } from './ResolutionStatusBadge';

interface ExternalMarket {
  id: string;
  marketId: string;
  question: string;
  source: string;
  outcome?: string;
  resolvedAt?: string;
  endTime?: string;
  status: string;
  volume?: number;
}

interface ExternalMarketSelectorProps {
  value?: string;
  onChange: (marketId: string, market: ExternalMarket) => void;
  disabled?: boolean;
  onlyResolved?: boolean;
}

export const ExternalMarketSelector: React.FC<ExternalMarketSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  onlyResolved = true,
}) => {
  const [markets, setMarkets] = useState<ExternalMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [isOpen, setIsOpen] = useState(false);

  // Fetch external markets
  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch from external markets API
        const response = await fetch('/api/external/markets');

        if (!response.ok) {
          throw new Error('Failed to fetch external markets');
        }

        const data = await response.json();

        // Filter for resolved markets if needed
        let filteredMarkets = data.markets || [];

        if (onlyResolved) {
          filteredMarkets = filteredMarkets.filter((m: ExternalMarket) =>
            m.status === 'resolved' && m.outcome !== undefined
          );
        }

        setMarkets(filteredMarkets);
      } catch (err: any) {
        console.error('Error fetching markets:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMarkets();
  }, [onlyResolved]);

  // Filter markets based on search and source
  const filteredMarkets = useMemo(() => {
    return markets.filter(market => {
      const matchesSearch = searchQuery === '' ||
        market.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        market.marketId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSource = sourceFilter === 'all' ||
        market.source.toLowerCase() === sourceFilter.toLowerCase();

      return matchesSearch && matchesSource;
    });
  }, [markets, searchQuery, sourceFilter]);

  // Get selected market
  const selectedMarket = markets.find(m => m.id === value);

  // Handle selection
  const handleSelect = (market: ExternalMarket) => {
    onChange(market.id, market);
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading markets...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-300 rounded-lg p-4 bg-red-50">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Selected Market Display / Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full border-2 rounded-lg p-4 text-left transition-all
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-purple-400 cursor-pointer'}
          ${isOpen ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-300'}
        `}
      >
        {selectedMarket ? (
          <div className="space-y-2">
            <div className="font-medium text-gray-900">{selectedMarket.question}</div>
            <div className="flex flex-wrap items-center gap-2">
              <OracleSourceBadge source={selectedMarket.source} size="sm" />
              {selectedMarket.outcome && (
                <OutcomeBadge
                  outcome={selectedMarket.outcome === 'YES'}
                  size="sm"
                />
              )}
              <span className="text-xs text-gray-500">ID: {selectedMarket.marketId}</span>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">Select an external market...</div>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white border-2 border-purple-500 rounded-lg shadow-xl max-h-96 overflow-hidden">
          {/* Search and Filters */}
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search markets..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSourceFilter('all')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  sourceFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSourceFilter('polymarket')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  sourceFilter === 'polymarket'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Polymarket
              </button>
              <button
                onClick={() => setSourceFilter('kalshi')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  sourceFilter === 'kalshi'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Kalshi
              </button>
            </div>
          </div>

          {/* Market List */}
          <div className="overflow-y-auto max-h-72">
            {filteredMarkets.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {onlyResolved ? 'No resolved markets found' : 'No markets found'}
              </div>
            ) : (
              filteredMarkets.map((market) => (
                <button
                  key={market.id}
                  type="button"
                  onClick={() => handleSelect(market)}
                  className="w-full p-3 hover:bg-purple-50 border-b border-gray-100 text-left transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {value === market.id && (
                      <Check className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 mb-1">
                        {market.question}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <OracleSourceBadge source={market.source} size="sm" />
                        {market.outcome && (
                          <OutcomeBadge
                            outcome={market.outcome === 'YES'}
                            size="sm"
                          />
                        )}
                        {market.resolvedAt && (
                          <span className="text-xs text-gray-500">
                            Resolved: {new Date(market.resolvedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 font-mono">
                        {market.marketId}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2 bg-gray-50 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
