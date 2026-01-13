'use client';

import React, { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useMirrorMarketPositions, MirrorPosition } from '@/hooks/useMirrorMarket';
import { formatTokenAmount } from '@/utils/format';
import Link from 'next/link';

interface MirrorMarketPositionsProps {
  onPositionClick?: (position: MirrorPosition) => void;
  compact?: boolean;
}

export function MirrorMarketPositions({ onPositionClick, compact = false }: MirrorMarketPositionsProps) {
  const { isConnected } = useAccount();
  const { positions, fetchPositions, loading, error } = useMirrorMarketPositions();

  useEffect(() => {
    if (isConnected) {
      fetchPositions();
    }
  }, [isConnected, fetchPositions]);

  if (!isConnected) {
    return (
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Mirror Market Positions</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-700 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm">Connect your wallet to view positions</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Mirror Market Positions</h3>
        <div className="text-center py-8">
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading positions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Mirror Market Positions</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 bg-red-500/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => fetchPositions()}
            className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Mirror Market Positions</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-700 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm mb-2">No mirror market positions</p>
          <p className="text-gray-500 text-xs">Trade on mirror markets to see positions here</p>
        </div>
      </div>
    );
  }

  // Calculate totals
  const totalValue = positions.reduce((sum, pos) => sum + parseFloat(pos.value || '0'), 0);
  const totalPnL = positions.reduce((sum, pos) => sum + parseFloat(pos.pnl || '0'), 0);
  const avgPnLPercent = positions.length > 0
    ? positions.reduce((sum, pos) => sum + (pos.pnlPercent || 0), 0) / positions.length
    : 0;

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Mirror Market Positions</h3>
        <button
          onClick={() => fetchPositions()}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Summary */}
      {!compact && (
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-900 rounded-lg">
          <div>
            <div className="text-xs text-gray-500">Total Value</div>
            <div className="text-lg font-semibold text-white">{formatTokenAmount(totalValue.toString())}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Total P&L</div>
            <div className={`text-lg font-semibold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}{formatTokenAmount(totalPnL.toString())}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Avg Return</div>
            <div className={`text-lg font-semibold ${avgPnLPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {avgPnLPercent >= 0 ? '+' : ''}{avgPnLPercent.toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {/* Positions List */}
      <div className="space-y-3">
        {positions.map((position) => (
          <PositionCard
            key={position.mirrorKey}
            position={position}
            compact={compact}
            onClick={() => onPositionClick?.(position)}
          />
        ))}
      </div>
    </div>
  );
}

interface PositionCardProps {
  position: MirrorPosition;
  compact?: boolean;
  onClick?: () => void;
}

function PositionCard({ position, compact, onClick }: PositionCardProps) {
  const pnlPositive = (position.pnlPercent || 0) >= 0;

  return (
    <div
      className={`p-3 bg-gray-900 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium truncate">
            {position.market?.question || `Market ${position.marketId}`}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                position.outcome === 'yes'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {position.outcome.toUpperCase()}
            </span>
            {position.usedVRF && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                VRF
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-medium ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
            {pnlPositive ? '+' : ''}{(position.pnlPercent || 0).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">
            {formatTokenAmount(position.pnl || '0')} CRwN
          </div>
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Shares:</span>
            <span className="ml-1 text-white">{parseFloat(position.shares || '0').toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-500">Avg:</span>
            <span className="ml-1 text-white">{(position.avgPrice || 0).toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-gray-500">Current:</span>
            <span className="ml-1 text-white">{(position.currentPrice || 0).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default MirrorMarketPositions;
