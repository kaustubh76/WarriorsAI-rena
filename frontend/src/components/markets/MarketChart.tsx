'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { formatEther } from 'viem';
import { type Market } from '@/services/predictionMarketService';
import { useMarketPrice, useMarketActivity } from '@/hooks/useMarkets';
import { formatTokenAmount } from '@/utils/format';

interface MarketChartProps {
  market: Market;
}

// Price point derived from blockchain events
interface PricePoint {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
}

type TimeRange = '1h' | '24h' | '7d' | 'all';

export function MarketChart({ market }: MarketChartProps) {
  const { yesProbability, noProbability, loading: priceLoading } = useMarketPrice(market.id);
  const { activities } = useMarketActivity(market.id);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  // Build price history from actual blockchain events
  // Each trade affects the AMM ratio, so we can derive prices from trading activity
  const priceHistory = useMemo(() => {
    const now = Date.now();
    const points: PricePoint[] = [];

    // Filter activities by time range
    let rangeMs: number;
    switch (timeRange) {
      case '1h':
        rangeMs = 60 * 60 * 1000;
        break;
      case '24h':
        rangeMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        rangeMs = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        // 'all' - use market creation time
        rangeMs = now - Number(market.createdAt) * 1000;
    }

    const cutoffTime = (now - rangeMs) / 1000;

    // Get buy/sell activities within time range, sorted by timestamp
    const relevantActivities = activities
      .filter(a => (a.type === 'buy' || a.type === 'sell') && a.timestamp >= cutoffTime)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (relevantActivities.length === 0) {
      // No trading history - show just current price as a single point
      points.push({
        timestamp: now,
        yesPrice: yesProbability,
        noPrice: noProbability
      });
      return points;
    }

    // Derive price evolution from trading activity
    // Starting from an assumed 50/50 and moving based on trades
    let currentYesRatio = 0.5;
    const totalYes = Number(formatEther(market.yesTokens));
    const totalNo = Number(formatEther(market.noTokens));
    const total = totalYes + totalNo;

    // Build price points from each trade
    for (const activity of relevantActivities) {
      // Estimate price impact based on trade direction
      const tradeSize = Number(formatEther(activity.tokens));
      const impact = tradeSize / (total || 1) * 0.5; // Simplified price impact

      if (activity.type === 'buy') {
        currentYesRatio = activity.isYes
          ? Math.min(0.95, currentYesRatio + impact)
          : Math.max(0.05, currentYesRatio - impact);
      } else {
        currentYesRatio = activity.isYes
          ? Math.max(0.05, currentYesRatio - impact)
          : Math.min(0.95, currentYesRatio + impact);
      }

      points.push({
        timestamp: activity.timestamp * 1000,
        yesPrice: currentYesRatio * 100,
        noPrice: (1 - currentYesRatio) * 100
      });
    }

    // Always add current blockchain price as final point
    points.push({
      timestamp: now,
      yesPrice: yesProbability,
      noPrice: noProbability
    });

    return points;
  }, [activities, timeRange, yesProbability, noProbability, market.yesTokens, market.noTokens, market.createdAt]);

  // Filter out any NaN or invalid values from price history
  const validPriceHistory = priceHistory.filter(p =>
    !isNaN(p.yesPrice) && !isNaN(p.noPrice) &&
    isFinite(p.yesPrice) && isFinite(p.noPrice)
  );

  const maxPrice = validPriceHistory.length > 0
    ? Math.max(...validPriceHistory.map((p) => Math.max(p.yesPrice, p.noPrice)))
    : 100;
  const minPrice = validPriceHistory.length > 0
    ? Math.min(...validPriceHistory.map((p) => Math.min(p.yesPrice, p.noPrice)))
    : 0;
  const priceRange = maxPrice - minPrice || 1;

  // SVG path generation for the chart lines
  const generatePath = (data: number[]): string => {
    // Filter out NaN values and ensure we have valid data
    const validData = data.filter(v => !isNaN(v) && isFinite(v));
    if (validData.length === 0) return '';
    if (validData.length === 1) {
      // Single point - draw a horizontal line
      const y = 100 - ((validData[0] - minPrice) / priceRange) * 100;
      const safeY = isNaN(y) || !isFinite(y) ? 50 : y;
      return `M 0,${safeY} L 100,${safeY}`;
    }

    const width = 100;
    const height = 100;
    const points = validData.map((value, index) => {
      const x = (index / (validData.length - 1)) * width;
      const y = height - ((value - minPrice) / priceRange) * height;
      // Ensure valid numbers
      const safeX = isNaN(x) || !isFinite(x) ? 0 : x;
      const safeY = isNaN(y) || !isFinite(y) ? 50 : y;
      return `${safeX},${safeY}`;
    });

    return `M ${points.join(' L ')}`;
  };

  const yesPath = generatePath(validPriceHistory.map((p) => p.yesPrice));
  const noPath = generatePath(validPriceHistory.map((p) => p.noPrice));

  const priceChange = validPriceHistory.length > 1
    ? yesProbability - validPriceHistory[0].yesPrice
    : 0;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-white">Price History</h3>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-green-400 font-bold text-xl">
                  {yesProbability.toFixed(1)}%
                </span>
                <span className="text-gray-400 text-sm">YES</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-red-400 font-bold text-xl">
                  {noProbability.toFixed(1)}%
                </span>
                <span className="text-gray-400 text-sm">NO</span>
              </div>
            </div>
          </div>
          <div className={`px-2 py-1 rounded text-sm font-medium ${
            priceChange >= 0
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2 p-4 border-b border-gray-800">
        {(['1h', '24h', '7d', 'all'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              timeRange === range
                ? 'bg-purple-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {range.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="p-4">
        <div className="relative h-48 w-full">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 w-8">
            <span>{maxPrice.toFixed(1)}%</span>
            <span>{((maxPrice + minPrice) / 2).toFixed(1)}%</span>
            <span>{minPrice.toFixed(1)}%</span>
          </div>

          {/* Chart area */}
          <div className="ml-10 h-full relative bg-gray-800/50 rounded-lg overflow-hidden">
            {/* Grid lines */}
            <div className="absolute inset-0">
              {[0, 25, 50, 75, 100].map((percent) => (
                <div
                  key={percent}
                  className="absolute w-full border-t border-gray-700/50"
                  style={{ top: `${percent}%` }}
                />
              ))}
            </div>

            {/* SVG Chart */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Gradient fills */}
              <defs>
                <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Yes line */}
              <path
                d={yesPath}
                fill="none"
                stroke="rgb(34, 197, 94)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />

              {/* No line */}
              <path
                d={noPath}
                fill="none"
                stroke="rgb(239, 68, 68)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* Current price indicator */}
            <div
              className="absolute right-0 w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-500/50"
              style={{
                top: `${100 - ((yesProbability - minPrice) / priceRange) * 100}%`,
                transform: 'translate(50%, -50%)'
              }}
            />
          </div>
        </div>

        {/* X-axis labels */}
        <div className="ml-10 mt-2 flex justify-between text-xs text-gray-500">
          <span>{formatTimeLabel(validPriceHistory[0]?.timestamp, timeRange)}</span>
          <span>Now</span>
        </div>
      </div>

      {/* Stats Footer */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800/50 text-sm">
        <div>
          <span className="text-gray-400 block">Current YES</span>
          <span className="text-green-400 font-medium">
            {yesProbability.toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">Current NO</span>
          <span className="text-red-400 font-medium">
            {noProbability.toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">Total Volume</span>
          <span className="text-white font-medium">
            {formatTokenAmount(market.yesTokens + market.noTokens)} CRwN
          </span>
        </div>
      </div>

      {/* Data Source Note */}
      <div className="px-4 pb-3 text-xs text-gray-500 text-center">
        {priceLoading ? (
          'Loading prices from blockchain...'
        ) : activities.length > 0 ? (
          `Live data from blockchain • ${activities.length} recent trades`
        ) : (
          'Live prices from blockchain • No recent trading activity'
        )}
      </div>
    </div>
  );
}

function formatTimeLabel(timestamp: number | undefined, range: TimeRange): string {
  if (!timestamp) return '';

  const date = new Date(timestamp);

  switch (range) {
    case '1h':
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case '24h':
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case '7d':
      return date.toLocaleDateString([], { weekday: 'short' });
    default:
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

export default MarketChart;
