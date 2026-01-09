'use client';

import React from 'react';
import Link from 'next/link';
import { formatEther } from 'viem';
import { type Market, MarketStatus, MarketOutcome } from '@/services/predictionMarketService';
import { useMarketPrice } from '@/hooks/useMarkets';
import { useMarketVerification } from '@/hooks/useMarketVerification';
import { VerificationBadge } from '@/components/0g/VerificationBadge';

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const { yesProbability, noProbability, loading: priceLoading } = useMarketPrice(market.id);

  const isActive = market.status === MarketStatus.Active;
  const isResolved = market.status === MarketStatus.Resolved;
  const isBattleMarket = market.battleId > BigInt(0);

  // Get live verification status from 0G network
  const verification = useMarketVerification(isBattleMarket);

  const endDate = new Date(Number(market.endTime) * 1000);
  const isEnded = endDate < new Date();
  const timeRemaining = getTimeRemaining(endDate);

  const totalVolume = market.yesTokens + market.noTokens;

  return (
    <Link href={`/markets/${market.id.toString()}`}>
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-all duration-200 cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {isBattleMarket && (
                <span className="inline-block px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full">
                  Battle Market
                </span>
              )}
              {isBattleMarket && !verification.isLoading && (
                <VerificationBadge
                  isVerified={verification.isVerified}
                  verificationType={verification.verificationType}
                  providerAddress={verification.providerAddress}
                  size="sm"
                />
              )}
            </div>
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition-colors line-clamp-2">
              {market.question}
            </h3>
          </div>
          <StatusBadge status={market.status} outcome={market.outcome} />
        </div>

        {/* Battle Warriors (if applicable) */}
        {isBattleMarket && (
          <div className="flex items-center gap-4 mb-4 p-3 bg-gray-800/50 rounded-lg">
            <div className="flex-1 text-center">
              <span className="text-sm text-gray-400">Warrior</span>
              <p className="text-lg font-bold text-purple-300">#{market.warrior1Id.toString()}</p>
            </div>
            <div className="text-2xl">⚔️</div>
            <div className="flex-1 text-center">
              <span className="text-sm text-gray-400">Warrior</span>
              <p className="text-lg font-bold text-orange-300">#{market.warrior2Id.toString()}</p>
            </div>
          </div>
        )}

        {/* Probability Bars */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-green-400 font-medium">Yes {yesProbability.toFixed(1)}%</span>
            <span className="text-red-400 font-medium">No {noProbability.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden flex">
            <div
              className="bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${yesProbability}%` }}
            />
            <div
              className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
              style={{ width: `${noProbability}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Volume</span>
            <p className="text-white font-medium">
              {formatEther(totalVolume)} CRwN
            </p>
          </div>
          <div>
            <span className="text-gray-400">Liquidity</span>
            <p className="text-white font-medium">
              {formatEther(market.liquidity)} CRwN
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center text-sm">
          {isActive && !isEnded && (
            <span className="text-gray-400">
              Ends {timeRemaining}
            </span>
          )}
          {isEnded && !isResolved && (
            <span className="text-yellow-400">
              Awaiting resolution
            </span>
          )}
          {isResolved && (
            <span className="text-green-400">
              Outcome: {getOutcomeLabel(market.outcome)}
            </span>
          )}
          <span className="text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
            View Details →
          </span>
        </div>
      </div>
    </Link>
  );
}

function StatusBadge({ status, outcome }: { status: MarketStatus; outcome: MarketOutcome }) {
  if (status === MarketStatus.Active) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
        Active
      </span>
    );
  }
  if (status === MarketStatus.Resolved) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
        Resolved
      </span>
    );
  }
  if (status === MarketStatus.Cancelled) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-400 rounded-full">
        Cancelled
      </span>
    );
  }
  // Unknown status
  return (
    <span className="px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
      Unknown
    </span>
  );
}

function getOutcomeLabel(outcome: MarketOutcome): string {
  switch (outcome) {
    case MarketOutcome.Yes:
      return 'YES';
    case MarketOutcome.No:
      return 'NO';
    case MarketOutcome.Invalid:
      return 'INVALID';
    default:
      return 'Pending';
  }
}

function getTimeRemaining(endDate: Date): string {
  const now = new Date();
  const diff = endDate.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

export default MarketCard;
