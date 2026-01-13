'use client';

import React, { useState } from 'react';
import { useTrackedTraders } from '@/hooks/useWhaleAlerts';
import { TrackedTrader, MarketSource } from '@/types/externalMarket';

interface TrackedTradersListProps {
  onTraderSelect?: (trader: TrackedTrader) => void;
}

export function TrackedTradersList({ onTraderSelect }: TrackedTradersListProps) {
  const { traders, loading, error, trackTrader, untrackTrader, refetch } =
    useTrackedTraders();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTrader, setNewTrader] = useState({
    address: '',
    source: MarketSource.POLYMARKET,
    alias: '',
  });

  const handleAddTrader = async () => {
    if (!newTrader.address) return;

    try {
      await trackTrader(newTrader.address, newTrader.source, newTrader.alias || undefined);
      setShowAddModal(false);
      setNewTrader({ address: '', source: MarketSource.POLYMARKET, alias: '' });
    } catch (err) {
      console.error('Failed to track trader:', err);
    }
  };

  const handleUntrack = async (trader: TrackedTrader) => {
    if (confirm(`Stop tracking ${trader.alias || trader.address}?`)) {
      await untrackTrader(trader.address, trader.source);
    }
  };

  const formatVolume = (vol: string) => {
    const num = parseFloat(vol);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const sourceIcons: Record<MarketSource, string> = {
    [MarketSource.NATIVE]: '🏆',
    [MarketSource.POLYMARKET]: '🔮',
    [MarketSource.KALSHI]: '📊',
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={refetch}
          className="mt-2 text-sm text-red-300 hover:text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span>👀</span> Tracked Traders
          <span className="text-sm text-gray-400 font-normal">
            ({traders.length})
          </span>
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
        >
          + Track Trader
        </button>
      </div>

      {/* Trader List */}
      {traders.length === 0 ? (
        <div className="text-center py-8 text-gray-400 bg-gray-800/30 rounded-lg">
          <span className="text-4xl mb-2 block">👀</span>
          <p>No traders being tracked</p>
          <p className="text-sm text-gray-500 mt-1">
            Add whale addresses to follow their trades
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {traders.map((trader) => (
            <div
              key={trader.id}
              className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all cursor-pointer"
              onClick={() => onTraderSelect?.(trader)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {sourceIcons[trader.source]}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      {trader.alias && (
                        <span className="text-white font-medium">
                          {trader.alias}
                        </span>
                      )}
                      <code className="text-purple-400 text-sm">
                        {shortenAddress(trader.address)}
                      </code>
                      {trader.isWhale && (
                        <span className="text-xl" title="Whale">
                          🐋
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm">
                      Volume: {formatVolume(trader.totalVolume)}
                      {trader.winRate && (
                        <span className="ml-2">
                          • Win Rate:{' '}
                          <span
                            className={
                              trader.winRate >= 0.5
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            {(trader.winRate * 100).toFixed(1)}%
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">
                    {trader.followers} followers
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUntrack(trader);
                    }}
                    className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    title="Stop tracking"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Trader Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Track a Trader</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={newTrader.address}
                  onChange={(e) =>
                    setNewTrader({ ...newTrader, address: e.target.value })
                  }
                  placeholder="0x..."
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1">
                  Platform
                </label>
                <select
                  value={newTrader.source}
                  onChange={(e) =>
                    setNewTrader({
                      ...newTrader,
                      source: e.target.value as MarketSource,
                    })
                  }
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value={MarketSource.POLYMARKET}>🔮 Polymarket</option>
                  <option value={MarketSource.KALSHI}>📊 Kalshi</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1">
                  Alias (optional)
                </label>
                <input
                  type="text"
                  value={newTrader.alias}
                  onChange={(e) =>
                    setNewTrader({ ...newTrader, alias: e.target.value })
                  }
                  placeholder="e.g., Whale123"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTrader}
                disabled={!newTrader.address}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-white"
              >
                Track
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackedTradersList;
