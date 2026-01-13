'use client';

import React from 'react';
import Link from 'next/link';
import { WhaleTrade, MarketSource } from '@/types/externalMarket';

interface WhaleAlertCardProps {
  trade: WhaleTrade;
  compact?: boolean;
}

export function WhaleAlertCard({ trade, compact = false }: WhaleAlertCardProps) {
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const sourceIcons: Record<MarketSource, string> = {
    [MarketSource.NATIVE]: '🏆',
    [MarketSource.POLYMARKET]: '🔮',
    [MarketSource.KALSHI]: '📊',
  };

  const shortenAddress = (addr?: string) => {
    if (!addr) return 'Anonymous';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all">
        <span className="text-2xl">🐋</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
              {trade.side.toUpperCase()}
            </span>
            <span className="text-white font-medium">
              {formatAmount(trade.amountUsd)}
            </span>
            <span className={trade.outcome === 'yes' ? 'text-green-400' : 'text-red-400'}>
              {trade.outcome.toUpperCase()}
            </span>
          </div>
          <div className="text-gray-400 text-xs truncate">
            {trade.marketQuestion}
          </div>
        </div>
        <span className="text-gray-500 text-xs">{formatTime(trade.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🐋</span>
          <div>
            <div className="text-white font-bold text-lg">Whale Alert</div>
            <div className="text-gray-400 text-sm">
              {sourceIcons[trade.source]} {trade.source}
            </div>
          </div>
        </div>
        <span className="text-gray-500 text-sm">{formatTime(trade.timestamp)}</span>
      </div>

      {/* Trade Details */}
      <div className="mb-4">
        <Link
          href={`/markets/${trade.marketId}`}
          className="text-purple-400 hover:text-purple-300 font-medium line-clamp-2"
        >
          {trade.marketQuestion}
        </Link>
      </div>

      {/* Trade Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Action</div>
          <div className="flex items-center gap-2">
            <span
              className={`font-bold ${
                trade.side === 'buy' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {trade.side.toUpperCase()}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                trade.outcome === 'yes'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {trade.outcome.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Amount</div>
          <div className="text-white font-bold text-lg">
            {formatAmount(trade.amountUsd)}
          </div>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Price</div>
          <div className="text-white">
            {(trade.price / 100).toFixed(1)}%
          </div>
        </div>

        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="text-gray-400 text-xs mb-1">Shares</div>
          <div className="text-white">
            {parseFloat(trade.shares).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Trader Info */}
      {trade.traderAddress && (
        <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Trader:</span>
            <code className="text-purple-400 text-sm">
              {shortenAddress(trade.traderAddress)}
            </code>
          </div>
          {trade.txHash && (
            <a
              href={`https://etherscan.io/tx/${trade.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white text-xs"
            >
              View TX →
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Link
          href={`/markets/${trade.marketId}`}
          className="flex-1 py-2 text-center bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm font-medium"
        >
          View Market
        </Link>
        {trade.traderAddress && (
          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
            Track Trader
          </button>
        )}
      </div>
    </div>
  );
}

export default WhaleAlertCard;
