'use client';

import React from 'react';
import { formatEther } from 'viem';
import { type MicroMarketDisplay } from '@/services/microMarketService';

interface MicroMarketCardProps {
  market: MicroMarketDisplay;
  onClick?: () => void;
  isSelected?: boolean;
}

export function MicroMarketCard({ market, onClick, isSelected = false }: MicroMarketCardProps) {
  const canTrade = market.canTrade;
  const isExpired = market.isExpired;

  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-4 border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-purple-500 ring-2 ring-purple-500/20'
          : 'border-gray-700 hover:border-purple-500/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <MarketTypeBadge type={market.marketType} label={market.typeLabel} />
          {market.roundNumber > 0 && (
            <span className="text-xs text-gray-400">{market.roundLabel}</span>
          )}
        </div>
        <StatusBadge status={market.status} label={market.statusLabel} />
      </div>

      {/* Question */}
      <h4 className="text-sm font-medium text-white mb-3 line-clamp-2">
        {market.question}
      </h4>

      {/* Probability Bars */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-green-400">Yes {market.yesPrice}%</span>
          <span className="text-red-400">No {market.noPrice}%</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
          <div
            className="bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
            style={{ width: `${market.yesPrice}%` }}
          />
          <div
            className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-300"
            style={{ width: `${market.noPrice}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-between text-xs text-gray-400">
        <span>Vol: {market.totalVolumeFormatted} CRwN</span>
        {canTrade && !isExpired && (
          <span className="text-green-400">{market.timeRemaining}</span>
        )}
        {isExpired && market.status === 0 && (
          <span className="text-yellow-400">Awaiting resolution</span>
        )}
        {market.status === 2 && (
          <span className="text-blue-400">Outcome: {market.outcomeLabel}</span>
        )}
      </div>
    </div>
  );
}

function MarketTypeBadge({ type, label }: { type: number; label: string }) {
  const colors: Record<number, string> = {
    0: 'bg-purple-500/20 text-purple-300', // ROUND_WINNER
    1: 'bg-blue-500/20 text-blue-300',     // MOVE_PREDICTION
    2: 'bg-orange-500/20 text-orange-300', // DAMAGE_THRESHOLD
    3: 'bg-red-500/20 text-red-300',       // FIRST_BLOOD
    4: 'bg-green-500/20 text-green-300',   // COMEBACK
    5: 'bg-yellow-500/20 text-yellow-300'  // PERFECT_ROUND
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[type] ?? colors[0]}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status, label }: { status: number; label: string }) {
  const colors: Record<number, string> = {
    0: 'bg-green-500/20 text-green-400', // ACTIVE
    1: 'bg-yellow-500/20 text-yellow-400', // PAUSED
    2: 'bg-blue-500/20 text-blue-400', // RESOLVED
    3: 'bg-gray-500/20 text-gray-400'  // CANCELLED
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] ?? colors[0]}`}>
      {label}
    </span>
  );
}

export default MicroMarketCard;
