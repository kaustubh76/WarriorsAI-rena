'use client';

import React from 'react';

export interface MarketInfo {
  source: string;
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
}

export interface ArbitrageOpportunity {
  id: string;
  market1: MarketInfo;
  market2: MarketInfo;
  spread: number;
  potentialProfit: number;
  confidence: number;
  status: 'active' | 'expired' | 'executed';
  detectedAt: number;
  expiresAt: number;
}

interface ArbitrageCardProps {
  opportunity: ArbitrageOpportunity;
  onExecute?: (opportunity: ArbitrageOpportunity) => void;
}

function getSourceIcon(source: string): string {
  switch (source.toLowerCase()) {
    case 'polymarket':
      return '🔮';
    case 'kalshi':
      return '📊';
    default:
      return '📈';
  }
}

function getSourceColor(source: string): string {
  switch (source.toLowerCase()) {
    case 'polymarket':
      return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
    case 'kalshi':
      return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    default:
      return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
  }
}

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return 'Expired';

  const minutes = Math.floor(remaining / (60 * 1000));
  const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function ArbitrageCard({ opportunity, onExecute }: ArbitrageCardProps) {
  const { market1, market2, spread, potentialProfit, confidence, status, expiresAt } = opportunity;
  const isActive = status === 'active' && expiresAt > Date.now();

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isActive
          ? 'bg-gradient-to-br from-green-900/20 to-emerald-900/20 border-green-500/30 hover:border-green-400/50'
          : 'bg-gray-900/50 border-gray-700 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <div>
            <span className="text-green-400 font-bold text-lg">
              +{potentialProfit.toFixed(2)}%
            </span>
            <span className="text-gray-400 text-sm ml-2">potential profit</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {formatTimeRemaining(expiresAt)}
            </span>
          ) : (
            <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">
              {status}
            </span>
          )}
        </div>
      </div>

      {/* Markets Comparison */}
      <div className="space-y-3">
        {/* Market 1 */}
        <div className={`p-3 rounded-lg border ${getSourceColor(market1.source)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2">
              <span>{getSourceIcon(market1.source)}</span>
              <span className="font-medium capitalize">{market1.source}</span>
            </span>
            <span className="text-xs opacity-70">Buy YES</span>
          </div>
          <p className="text-sm text-white/80 line-clamp-2 mb-2">{market1.question}</p>
          <div className="flex justify-between text-sm">
            <span>
              YES: <span className="text-green-400">{market1.yesPrice}%</span>
            </span>
            <span>
              NO: <span className="text-red-400">{market1.noPrice}%</span>
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <span className="text-gray-500">⇅</span>
        </div>

        {/* Market 2 */}
        <div className={`p-3 rounded-lg border ${getSourceColor(market2.source)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2">
              <span>{getSourceIcon(market2.source)}</span>
              <span className="font-medium capitalize">{market2.source}</span>
            </span>
            <span className="text-xs opacity-70">Buy NO</span>
          </div>
          <p className="text-sm text-white/80 line-clamp-2 mb-2">{market2.question}</p>
          <div className="flex justify-between text-sm">
            <span>
              YES: <span className="text-green-400">{market2.yesPrice}%</span>
            </span>
            <span>
              NO: <span className="text-red-400">{market2.noPrice}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-between mt-4 pt-3 border-t border-gray-700/50">
        <div className="text-center">
          <div className="text-xs text-gray-400">Spread</div>
          <div className="text-green-400 font-medium">{spread.toFixed(2)}%</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Match Confidence</div>
          <div className="text-yellow-400 font-medium">{confidence.toFixed(0)}%</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Total Cost</div>
          <div className="text-white font-medium">
            ${(100 - potentialProfit).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {isActive && (
        <div className="flex gap-2 mt-4">
          <a
            href={`https://polymarket.com/event/${market1.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 px-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg text-sm text-center transition-colors"
          >
            Open Polymarket
          </a>
          <a
            href={`https://kalshi.com/markets/${market2.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 px-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg text-sm text-center transition-colors"
          >
            Open Kalshi
          </a>
        </div>
      )}
    </div>
  );
}

export default ArbitrageCard;
