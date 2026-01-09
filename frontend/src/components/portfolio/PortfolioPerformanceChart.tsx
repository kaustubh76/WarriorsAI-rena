'use client';

import React, { useState, useMemo } from 'react';
import { type Market } from '@/services/predictionMarketService';
import { usePortfolioHistory, type TimeRange, type PortfolioHistoryPoint } from '@/hooks/usePortfolioHistory';

interface PortfolioPerformanceChartProps {
  markets: Market[];
  userMarketIds: bigint[];
}

export function PortfolioPerformanceChart({ markets, userMarketIds }: PortfolioPerformanceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('1m');
  const { history, loading, error, getFilteredHistory, currentStats } = usePortfolioHistory({
    markets,
    userMarketIds
  });

  const filteredHistory = useMemo(() =>
    getFilteredHistory(timeRange),
    [getFilteredHistory, timeRange]
  );

  // Filter out invalid points
  const validHistory = useMemo(() =>
    filteredHistory.filter(p =>
      !isNaN(p.pnl) && isFinite(p.pnl) &&
      !isNaN(p.timestamp) && p.timestamp > 0
    ),
    [filteredHistory]
  );

  // Calculate chart bounds
  const { minPnl, maxPnl, pnlRange } = useMemo(() => {
    if (validHistory.length === 0) {
      return { minPnl: -10, maxPnl: 10, pnlRange: 20 };
    }
    const pnlValues = validHistory.map(p => p.pnl);
    const min = Math.min(0, ...pnlValues);
    const max = Math.max(0, ...pnlValues);
    const range = max - min || 1;
    // Add some padding
    return {
      minPnl: min - range * 0.1,
      maxPnl: max + range * 0.1,
      pnlRange: range * 1.2
    };
  }, [validHistory]);

  // Generate SVG path for P&L line
  const generatePath = (data: PortfolioHistoryPoint[]): string => {
    if (data.length === 0) return '';
    if (data.length === 1) {
      const y = 100 - ((data[0].pnl - minPnl) / pnlRange) * 100;
      const safeY = isNaN(y) || !isFinite(y) ? 50 : Math.max(0, Math.min(100, y));
      return `M 0,${safeY} L 100,${safeY}`;
    }

    const points = data.map((point, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((point.pnl - minPnl) / pnlRange) * 100;
      const safeX = isNaN(x) || !isFinite(x) ? 0 : x;
      const safeY = isNaN(y) || !isFinite(y) ? 50 : Math.max(0, Math.min(100, y));
      return `${safeX},${safeY}`;
    });

    return `M ${points.join(' L ')}`;
  };

  // Generate area fill path
  const generateAreaPath = (data: PortfolioHistoryPoint[]): string => {
    if (data.length === 0) return '';

    const linePath = generatePath(data);
    if (!linePath) return '';

    // Find the y position of the zero line
    const zeroY = 100 - ((0 - minPnl) / pnlRange) * 100;
    const safeZeroY = isNaN(zeroY) || !isFinite(zeroY) ? 50 : Math.max(0, Math.min(100, zeroY));

    return `${linePath} L 100,${safeZeroY} L 0,${safeZeroY} Z`;
  };

  const pnlPath = generatePath(validHistory);
  const areaPath = generateAreaPath(validHistory);

  const isProfitable = currentStats.pnl >= 0;
  const lineColor = isProfitable ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
  const gradientId = isProfitable ? 'profitGradient' : 'lossGradient';

  // Calculate zero line position
  const zeroLineY = useMemo(() => {
    const y = 100 - ((0 - minPnl) / pnlRange) * 100;
    return isNaN(y) || !isFinite(y) ? 50 : Math.max(0, Math.min(100, y));
  }, [minPnl, pnlRange]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Performance History</h2>
        <div className="h-48 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
        </div>
      </div>
    );
  }

  // No history state
  if (history.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Performance History</h2>
        <div className="h-48 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-4xl mb-2">📊</div>
            <p>No trading history yet</p>
            <p className="text-sm">Start trading to track your P&L over time</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-white">Performance History</h2>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-2xl ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                  {isProfitable ? '+' : ''}{currentStats.pnl.toFixed(2)} CRwN
                </span>
              </div>
              <div className={`px-2 py-1 rounded text-sm font-medium ${
                isProfitable
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {isProfitable ? '+' : ''}{currentStats.pnlPercent.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm text-gray-400">Total Invested</span>
            <p className="text-white font-medium">{currentStats.totalInvested.toFixed(2)} CRwN</p>
          </div>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2 p-4 border-b border-gray-800">
        {(['1w', '1m', '3m', 'all'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              timeRange === range
                ? 'bg-purple-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {range === '1w' ? '1 Week' :
             range === '1m' ? '1 Month' :
             range === '3m' ? '3 Months' : 'All Time'}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="p-4">
        <div className="relative h-48 w-full">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 w-12">
            <span>{maxPnl.toFixed(1)}</span>
            <span className="text-gray-400">0</span>
            <span>{minPnl.toFixed(1)}</span>
          </div>

          {/* Chart area */}
          <div className="ml-14 h-full relative bg-gray-800/50 rounded-lg overflow-hidden">
            {/* Grid lines */}
            <div className="absolute inset-0">
              {[0, 25, 50, 75, 100].map((percent) => (
                <div
                  key={percent}
                  className="absolute w-full border-t border-gray-700/50"
                  style={{ top: `${percent}%` }}
                />
              ))}
              {/* Zero line - highlighted */}
              <div
                className="absolute w-full border-t border-gray-500"
                style={{ top: `${zeroLineY}%` }}
              />
            </div>

            {/* SVG Chart */}
            {validHistory.length > 0 && (
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* Gradient fills */}
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Area fill */}
                <path
                  d={areaPath}
                  fill={`url(#${gradientId})`}
                />

                {/* P&L line */}
                <path
                  d={pnlPath}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}

            {/* Current value indicator */}
            {validHistory.length > 0 && (
              <div
                className={`absolute right-0 w-2 h-2 rounded-full shadow-lg ${
                  isProfitable ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'
                }`}
                style={{
                  top: `${100 - ((currentStats.pnl - minPnl) / pnlRange) * 100}%`,
                  transform: 'translate(50%, -50%)'
                }}
              />
            )}
          </div>
        </div>

        {/* X-axis labels */}
        <div className="ml-14 mt-2 flex justify-between text-xs text-gray-500">
          <span>{formatTimeLabel(validHistory[0]?.timestamp, timeRange)}</span>
          <span>Now</span>
        </div>
      </div>

      {/* Stats Footer */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800/50 text-sm">
        <div>
          <span className="text-gray-400 block">Total Trades</span>
          <span className="text-white font-medium">{currentStats.totalTrades}</span>
        </div>
        <div>
          <span className="text-gray-400 block">Portfolio Value</span>
          <span className={`font-medium ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
            {currentStats.currentValue.toFixed(2)} CRwN
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">ROI</span>
          <span className={`font-medium ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
            {isProfitable ? '+' : ''}{currentStats.pnlPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Data Source Note */}
      <div className="px-4 pb-3 text-xs text-gray-500 text-center">
        Live data from blockchain • {currentStats.totalTrades} trades tracked
      </div>
    </div>
  );
}

function formatTimeLabel(timestamp: number | undefined, range: TimeRange): string {
  if (!timestamp) return '';

  const date = new Date(timestamp);

  switch (range) {
    case '1w':
      return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    case '1m':
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    case '3m':
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
  }
}

export default PortfolioPerformanceChart;
