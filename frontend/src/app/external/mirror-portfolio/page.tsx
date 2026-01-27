'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';

interface MirrorMarket {
  mirrorKey: string;
  externalId: string;
  source: string;
  question: string;
  lastSyncTime: number;
  totalVolume: string;
  isActive: boolean;
  position?: {
    yesShares: string;
    noShares: string;
    invested: string;
    currentValue: string;
    pnl: string;
  };
}

export default function MirrorPortfolioPage() {
  const { address, isConnected } = useAccount();
  const [mirrors, setMirrors] = useState<MirrorMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMirrors = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/portfolio/mirror?address=${address}`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch mirror portfolio');
        }

        setMirrors(data.data.positions || []);
      } catch (err) {
        console.error('[MirrorPortfolio] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load portfolio');
      } finally {
        setLoading(false);
      }
    };

    fetchMirrors();
  }, [address]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-white mb-6">Mirror Market Portfolio</h1>
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-8 text-center">
            <span className="text-4xl mb-4 block">🔐</span>
            <h3 className="text-white font-medium mb-2">Wallet Not Connected</h3>
            <p className="text-gray-400">
              Please connect your wallet to view your mirror market portfolio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-white mb-6">Mirror Market Portfolio</h1>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading your mirror markets...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-white mb-6">Mirror Market Portfolio</h1>
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded-lg"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const calculateTimeSinceSync = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    }
    return `${minutes}m ago`;
  };

  const needsSync = (timestamp: number) => {
    const now = Date.now() / 1000;
    const hoursSinceSync = (now - timestamp) / 3600;
    return hoursSinceSync > 1; // Needs sync if > 1 hour
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-3">Mirror Market Portfolio</h1>
          <p className="text-gray-400 text-lg">
            Your positions in Flow mirror markets linked to Polymarket and Kalshi
          </p>
        </div>

      {/* Portfolio Summary */}
      {mirrors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
            <div className="text-sm text-gray-400 mb-1">Total Markets</div>
            <div className="text-3xl font-bold text-white">{mirrors.length}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
            <div className="text-sm text-gray-400 mb-1">Active Positions</div>
            <div className="text-3xl font-bold text-white">
              {mirrors.filter(m => m.isActive).length}
            </div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
            <div className="text-sm text-gray-400 mb-1">Total Volume</div>
            <div className="text-3xl font-bold text-white">
              {mirrors.reduce((sum, m) => sum + parseFloat(m.totalVolume), 0).toFixed(2)} CRwN
            </div>
          </div>
        </div>
      )}

      {/* Mirror Markets Grid */}
      {mirrors.length === 0 ? (
        <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-8 text-center">
          <span className="text-4xl mb-4 block">🔍</span>
          <h3 className="text-white font-medium mb-2">No Mirror Markets Found</h3>
          <p className="text-gray-400 text-sm mb-6">
            You don't have any positions in mirror markets yet.
          </p>
          <Link
            href="/external"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Browse External Markets
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          {mirrors.map((mirror) => {
            const syncNeeded = needsSync(mirror.lastSyncTime);
            const timeSince = calculateTimeSinceSync(mirror.lastSyncTime);

            return (
              <div
                key={mirror.mirrorKey}
                className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">{mirror.question}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        mirror.source === 'polymarket'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {mirror.source}
                      </span>
                      {!mirror.isActive && (
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Market Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Last Sync</div>
                    <div className={`text-sm font-medium ${syncNeeded ? 'text-yellow-400' : 'text-green-400'}`}>
                      {timeSince}
                      {syncNeeded && ' ⚠️'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Total Volume</div>
                    <div className="text-sm font-medium text-white">
                      {parseFloat(mirror.totalVolume).toFixed(2)} CRwN
                    </div>
                  </div>
                  {mirror.position && (
                    <>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Your Investment</div>
                        <div className="text-sm font-medium text-white">
                          {parseFloat(mirror.position.invested).toFixed(2)} CRwN
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Current Value</div>
                        <div className={`text-sm font-medium ${
                          parseFloat(mirror.position.pnl) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {parseFloat(mirror.position.currentValue).toFixed(2)} CRwN
                          {parseFloat(mirror.position.pnl) >= 0 ? ' ▲' : ' ▼'}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Position Details */}
                {mirror.position && (
                  <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">YES Shares:</span>
                        <span className="ml-2 text-white font-medium">
                          {parseFloat(mirror.position.yesShares).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">NO Shares:</span>
                        <span className="ml-2 text-white font-medium">
                          {parseFloat(mirror.position.noShares).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">PnL:</span>
                        <span className={`text-lg font-bold ${
                          parseFloat(mirror.position.pnl) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {parseFloat(mirror.position.pnl) >= 0 ? '+' : ''}
                          {parseFloat(mirror.position.pnl).toFixed(2)} CRwN
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Link
                    href={`/markets/${mirror.mirrorKey}`}
                    className="flex-1 px-4 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded-lg text-center text-sm transition-colors"
                  >
                    View Mirror Market
                  </Link>
                  <Link
                    href={`/external/${mirror.source}/${mirror.externalId}`}
                    className="flex-1 px-4 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg text-center text-sm transition-colors"
                  >
                    View External Market
                  </Link>
                  {syncNeeded && (
                    <button
                      className="px-4 py-2 bg-yellow-600/30 hover:bg-yellow-600/50 text-yellow-300 rounded-lg text-sm transition-colors"
                      onClick={() => {
                        // TODO: Implement manual sync
                        console.log('Sync mirror:', mirror.mirrorKey);
                      }}
                    >
                      Sync Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
