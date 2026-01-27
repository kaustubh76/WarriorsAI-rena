'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SyncEvent {
  id: string;
  mirrorKey: string;
  marketQuestion: string;
  externalPrice: number;
  mirrorPriceBefore: number;
  mirrorPriceAfter: number;
  source: string;
  timestamp: string;
  oracleAddress: string;
  txHash: string;
}

export default function SyncHistoryPage() {
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSyncHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        const url = selectedMarket
          ? `/api/external/sync-history?mirrorKey=${selectedMarket}`
          : '/api/external/sync-history';

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch sync history');
        }

        setSyncEvents(data.data?.events || []);
      } catch (err) {
        console.error('[SyncHistory] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load sync history');
      } finally {
        setLoading(false);
      }
    };

    fetchSyncHistory();
  }, [selectedMarket]);

  const uniqueMarkets = [...new Set(syncEvents.map((e) => e.mirrorKey))];

  const calculatePriceDiff = (before: number, after: number) => {
    return Math.abs(after - before).toFixed(2);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/external"
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to External Markets
          </Link>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">Price Sync History</h1>
          <p className="text-gray-400 text-lg">
            Track price synchronization events between external markets and Flow mirrors
          </p>
        </div>

        {/* Market Filter */}
        <div className="mb-6">
          <label htmlFor="market-filter" className="block text-sm font-medium text-gray-300 mb-2">
            Filter by Market
          </label>
          <select
            id="market-filter"
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            className="w-full max-w-md px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
          >
            <option value="">All Markets</option>
            {uniqueMarkets.map((key) => (
              <option key={key} value={key}>
                {key.substring(0, 20)}...
              </option>
            ))}
          </select>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="card p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading sync history...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="card p-8 text-center border-red-500/30">
            <div className="mb-4 text-red-400 text-4xl">⚠️</div>
            <h3 className="text-xl font-semibold text-white mb-2">Failed to Load History</h3>
            <p className="text-red-400 mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-red-600/30 hover:bg-red-600/50 text-red-300 hover:text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && syncEvents.length === 0 && (
          <div className="card p-12 text-center">
            <span className="text-5xl mb-4 block">📊</span>
            <h3 className="text-xl font-semibold text-white mb-2">No Sync Events Yet</h3>
            <p className="text-gray-400 mb-6">
              Price synchronization events will appear here once mirror markets are synced.
            </p>
            <Link
              href="/external/mirror-portfolio"
              className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              View Mirror Portfolio
            </Link>
          </div>
        )}

        {/* Sync Events List */}
        {!loading && !error && syncEvents.length > 0 && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
                <div className="text-sm text-gray-400 mb-1">Total Sync Events</div>
                <div className="text-3xl font-bold text-white">{syncEvents.length}</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
                <div className="text-sm text-gray-400 mb-1">Unique Markets</div>
                <div className="text-3xl font-bold text-white">{uniqueMarkets.length}</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
                <div className="text-sm text-gray-400 mb-1">Avg Price Change</div>
                <div className="text-3xl font-bold text-white">
                  {(
                    syncEvents.reduce(
                      (sum, e) => sum + Math.abs(e.mirrorPriceAfter - e.mirrorPriceBefore),
                      0
                    ) / syncEvents.length
                  ).toFixed(2)}
                  %
                </div>
              </div>
            </div>

            {/* Events Grid */}
            <div className="space-y-4">
              {syncEvents.map((event) => {
                const priceDiff = calculatePriceDiff(event.mirrorPriceBefore, event.mirrorPriceAfter);
                const priceIncreased = event.mirrorPriceAfter > event.mirrorPriceBefore;

                return (
                  <div
                    key={event.id}
                    className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Market Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">
                            {event.marketQuestion || 'Unknown Market'}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              event.source === 'polymarket'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {event.source}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatTimestamp(event.timestamp)}
                        </div>
                      </div>

                      {/* Price Changes */}
                      <div className="flex gap-6 text-sm">
                        <div>
                          <div className="text-gray-400 mb-1">External Price</div>
                          <div className="text-white font-medium">{event.externalPrice.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="text-gray-400 mb-1">Mirror Before</div>
                          <div className="text-white font-medium">
                            {event.mirrorPriceBefore.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400 mb-1">Mirror After</div>
                          <div
                            className={`font-medium ${
                              priceIncreased ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {event.mirrorPriceAfter.toFixed(2)}% {priceIncreased ? '↑' : '↓'}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400 mb-1">Change</div>
                          <div className="text-yellow-400 font-medium">±{priceDiff}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Links */}
                    <div className="mt-4 pt-4 border-t border-gray-700 flex items-center gap-4">
                      <a
                        href={`https://flowscan.io/tx/${event.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        View Transaction
                      </a>
                      <span className="text-gray-600">•</span>
                      <span className="text-xs text-gray-500 font-mono">
                        Oracle: {event.oracleAddress.substring(0, 10)}...
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
