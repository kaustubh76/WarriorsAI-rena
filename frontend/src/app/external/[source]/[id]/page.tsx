'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useExternalMarket } from '@/hooks/useExternalMarkets';
import { useMirrorMarketQuery, useMirrorMarketCreation } from '@/hooks/useMirrorMarket';
import { CreateMirrorMarketModal } from '@/components/markets/CreateMirrorMarketModal';
import { MirrorMarketTradePanel } from '@/components/markets/MirrorMarketTradePanel';
import { MarketSource } from '@/types/externalMarket';
import { formatTokenAmount } from '@/utils/format';

export default function ExternalMarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const source = params.source as string;
  const id = params.id as string;

  // Construct the market ID in the format used by the API
  const marketId = `${source}_${id}`;

  const { market, loading: marketLoading, error: marketError, refetch } = useExternalMarket(marketId);
  const { queryMirrorMarket, mirrorMarket, loading: mirrorLoading } = useMirrorMarketQuery();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mirrorKey, setMirrorKey] = useState<string | null>(null);

  // Check if mirror market exists
  useEffect(() => {
    if (market) {
      const key = `${market.source}_${market.externalId}`;
      setMirrorKey(key);
      queryMirrorMarket(key);
    }
  }, [market, queryMirrorMarket]);

  const getSourceColor = (src: MarketSource) => {
    switch (src) {
      case MarketSource.POLYMARKET:
        return 'text-purple-400 bg-purple-500/20';
      case MarketSource.KALSHI:
        return 'text-blue-400 bg-blue-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getSourceName = (src: MarketSource) => {
    switch (src) {
      case MarketSource.POLYMARKET:
        return 'Polymarket';
      case MarketSource.KALSHI:
        return 'Kalshi';
      default:
        return src;
    }
  };

  if (marketLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-20">
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400">Loading market details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (marketError || !market) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Market Not Found</h2>
            <p className="text-gray-400 mb-6">{marketError || 'This market does not exist or could not be loaded.'}</p>
            <Link
              href="/external"
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition-colors"
            >
              Back to Markets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const timeUntilEnd = market.endTime * 1000 - Date.now();
  const daysUntilEnd = Math.max(0, Math.floor(timeUntilEnd / (1000 * 60 * 60 * 24)));
  const isExpired = timeUntilEnd <= 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back Button */}
        <Link
          href="/external"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to External Markets
        </Link>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Market Header */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSourceColor(market.source)}`}>
                  {getSourceName(market.source)}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  market.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : market.status === 'resolved'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {market.status.charAt(0).toUpperCase() + market.status.slice(1)}
                </span>
                {mirrorMarket?.isActive && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-500/20 text-yellow-400">
                    Mirrored on Flow
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold mb-4">{market.question}</h1>

              {market.description && (
                <p className="text-gray-400 mb-6">{market.description}</p>
              )}

              {/* Price Display */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1">YES</div>
                  <div className="text-3xl font-bold text-green-400">{market.yesPrice.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1">NO</div>
                  <div className="text-3xl font-bold text-red-400">{market.noPrice.toFixed(1)}%</div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Volume</div>
                  <div className="text-lg font-semibold">${formatTokenAmount(market.volume)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Liquidity</div>
                  <div className="text-lg font-semibold">${formatTokenAmount(market.liquidity)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Time Left</div>
                  <div className={`text-lg font-semibold ${isExpired ? 'text-red-400' : ''}`}>
                    {isExpired ? 'Expired' : `${daysUntilEnd}d`}
                  </div>
                </div>
              </div>
            </div>

            {/* Mirror Market Info */}
            {mirrorMarket && mirrorMarket.isActive && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Mirror Market on Flow
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Mirror YES</div>
                    <div className="text-lg font-semibold text-green-400">{mirrorMarket.yesPrice.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Mirror NO</div>
                    <div className="text-lg font-semibold text-red-400">{mirrorMarket.noPrice.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Mirror Volume</div>
                    <div className="text-lg font-semibold">{formatTokenAmount(mirrorMarket.totalVolume)} CRwN</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Trades</div>
                    <div className="text-lg font-semibold">{mirrorMarket.tradeCount}</div>
                  </div>
                </div>
              </div>
            )}

            {/* External Link */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4">Trade on {getSourceName(market.source)}</h2>
              <p className="text-gray-400 text-sm mb-4">
                View this market on the original platform for additional information and direct trading.
              </p>
              <a
                href={market.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <span>Open on {getSourceName(market.source)}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Create Mirror or Trade */}
            {mirrorMarket && mirrorMarket.isActive && mirrorKey ? (
              <MirrorMarketTradePanel
                market={market}
                mirrorKey={mirrorKey}
                onTradeComplete={refetch}
              />
            ) : (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold mb-4">Mirror This Market</h3>
                <p className="text-gray-400 text-sm mb-6">
                  Create a mirror of this market on Flow chain to enable CRwN trading and AI agent participation.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  disabled={market.status !== 'active' || isExpired}
                  className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors"
                >
                  {market.status !== 'active'
                    ? 'Market Not Active'
                    : isExpired
                    ? 'Market Expired'
                    : 'Create Mirror Market'}
                </button>
              </div>
            )}

            {/* Market Info Card */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4">Market Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Source</span>
                  <span className={getSourceColor(market.source).split(' ')[0]}>
                    {getSourceName(market.source)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">External ID</span>
                  <span className="text-white font-mono text-xs">
                    {market.externalId.slice(0, 12)}...
                  </span>
                </div>
                {market.category && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Category</span>
                    <span className="text-white">{market.category}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">End Date</span>
                  <span className="text-white">
                    {new Date(market.endTime * 1000).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Synced</span>
                  <span className="text-white">
                    {new Date(market.lastSyncAt * 1000).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Mirror Modal */}
      <CreateMirrorMarketModal
        market={market}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          // Refresh mirror market data
          if (mirrorKey) {
            queryMirrorMarket(mirrorKey);
          }
        }}
      />
    </div>
  );
}
