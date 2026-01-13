'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  UnifiedMarket,
  MarketSource,
  ExternalMarketStatus,
} from '@/types/externalMarket';
import { MarketSourceBadge } from './MarketSourceBadge';
import { useAgentExternalTrading } from '@/hooks/useAgentExternalTrading';
import { useAgents } from '@/hooks/useAgents';
import { VerifiedMarketPrediction } from '@/services/externalMarketAgentService';

interface ExternalMarketCardProps {
  market: UnifiedMarket;
  showSource?: boolean;
  compact?: boolean;
  showAgentTrading?: boolean;
  selectedAgentId?: bigint | null;
}

export function ExternalMarketCard({
  market,
  showSource = true,
  compact = false,
  showAgentTrading = false,
  selectedAgentId = null,
}: ExternalMarketCardProps) {
  const endDate = new Date(market.endTime);
  const isEnded = endDate < new Date();
  const timeRemaining = getTimeRemaining(endDate);

  // Agent trading state
  const [prediction, setPrediction] = useState<VerifiedMarketPrediction | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);

  const {
    canTradePolymarket,
    canTradeKalshi,
    getPrediction,
    loading: tradingLoading,
    error: tradingError,
  } = useAgentExternalTrading(selectedAgentId);

  // Check if agent can trade on this market's source
  const canAgentTrade =
    market.source === MarketSource.POLYMARKET
      ? canTradePolymarket
      : market.source === MarketSource.KALSHI
      ? canTradeKalshi
      : false;

  const handleGetPrediction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedAgentId) return;

    const pred = await getPrediction(market);
    if (pred) {
      setPrediction(pred);
      setShowTradeModal(true);
    }
  };

  // Format volume for display
  const formatVolume = (vol: string) => {
    const num = parseFloat(vol);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  // Build the detail page URL
  const detailUrl = `/external/${market.source}/${market.externalId}`;

  if (compact) {
    return (
      <Link href={detailUrl}>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-purple-500/50 transition-all cursor-pointer">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {showSource && <MarketSourceBadge source={market.source} size="sm" />}
                <StatusBadge status={market.status} isEnded={isEnded} />
              </div>
              <h4 className="text-white font-medium text-sm line-clamp-2">
                {market.question}
              </h4>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-bold text-green-400">
                {market.yesPrice.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-400">YES</div>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={detailUrl}>
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-all duration-200 cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {showSource && <MarketSourceBadge source={market.source} />}
              {market.category && (
                <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full">
                  {market.category}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition-colors line-clamp-2">
              {market.question}
            </h3>
            {market.description && (
              <p className="text-sm text-gray-400 mt-2 line-clamp-2">
                {market.description}
              </p>
            )}
          </div>
          <StatusBadge status={market.status} isEnded={isEnded} outcome={market.outcome} />
        </div>

        {/* Probability Bars */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-green-400 font-medium">Yes {market.yesPrice.toFixed(1)}%</span>
            <span className="text-red-400 font-medium">No {market.noPrice.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden flex">
            <div
              className="bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${market.yesPrice}%` }}
            />
            <div
              className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
              style={{ width: `${market.noPrice}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Volume</span>
            <p className="text-white font-medium">
              {formatVolume(market.volume)}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Liquidity</span>
            <p className="text-white font-medium">
              {formatVolume(market.liquidity)}
            </p>
          </div>
        </div>

        {/* Tags */}
        {market.tags && market.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {market.tags.slice(0, 3).map((tag, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-xs bg-gray-700/50 text-gray-400 rounded"
              >
                {tag}
              </span>
            ))}
            {market.tags.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-gray-500">
                +{market.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center text-sm">
          {market.status === ExternalMarketStatus.ACTIVE && !isEnded && (
            <span className="text-gray-400">
              Ends {timeRemaining}
            </span>
          )}
          {isEnded && market.status !== ExternalMarketStatus.RESOLVED && (
            <span className="text-yellow-400">
              Awaiting resolution
            </span>
          )}
          {market.status === ExternalMarketStatus.RESOLVED && (
            <span className="text-green-400">
              Outcome: {market.outcome?.toUpperCase() || 'N/A'}
            </span>
          )}
          <div className="flex items-center gap-3">
            <a
              href={market.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-400 hover:text-white text-xs"
            >
              View on {getSourceName(market.source)}
            </a>

            {/* AI Trade Button */}
            {showAgentTrading && selectedAgentId && (
              <button
                onClick={handleGetPrediction}
                disabled={tradingLoading || !canAgentTrade}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs text-white flex items-center gap-1 transition-colors"
              >
                {tradingLoading ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>AI Trade</span>
                  </>
                )}
                {prediction && (
                  <span className="ml-1 px-1.5 py-0.5 bg-purple-800 rounded text-[10px]">
                    {prediction.confidence}%
                  </span>
                )}
              </button>
            )}

            {/* 0G Verification Badge */}
            {prediction?.isVerified && (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                0G Verified
              </div>
            )}

            {!showAgentTrading && (
              <span className="text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Mirror & Trade
              </span>
            )}
          </div>
        </div>

        {/* Error display */}
        {tradingError && showAgentTrading && (
          <div className="mt-2 text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded">
            {tradingError}
          </div>
        )}
      </div>
    </Link>
  );
}

function StatusBadge({
  status,
  isEnded,
  outcome,
}: {
  status: ExternalMarketStatus;
  isEnded?: boolean;
  outcome?: string;
}) {
  if (status === ExternalMarketStatus.ACTIVE && isEnded) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
        Expired
      </span>
    );
  }

  switch (status) {
    case ExternalMarketStatus.ACTIVE:
      return (
        <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
          Active
        </span>
      );
    case ExternalMarketStatus.CLOSED:
      return (
        <span className="px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-400 rounded-full">
          Closed
        </span>
      );
    case ExternalMarketStatus.RESOLVED:
      return (
        <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
          {outcome?.toUpperCase() || 'Resolved'}
        </span>
      );
    case ExternalMarketStatus.UNOPENED:
      return (
        <span className="px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full">
          Upcoming
        </span>
      );
    default:
      return null;
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

function getSourceName(source: MarketSource): string {
  switch (source) {
    case MarketSource.POLYMARKET:
      return 'Polymarket';
    case MarketSource.KALSHI:
      return 'Kalshi';
    default:
      return 'Source';
  }
}

export default ExternalMarketCard;
