'use client';

import React, { useState, useEffect } from 'react';
import { type Market } from '@/services/predictionMarketService';
import { useMarketPrice } from '@/hooks/useMarkets';

interface MarketChartProps {
  market: Market;
}

// Simulated price history data (in production, fetch from events/backend)
interface PricePoint {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
}

type TimeRange = '1h' | '24h' | '7d' | 'all';

export function MarketChart({ market }: MarketChartProps) {
  const { yesProbability, noProbability } = useMarketPrice(market.id);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);

  // Generate mock price history for visualization
  // In production, this would come from event logs or a backend
  useEffect(() => {
    const now = Date.now();
    const points: PricePoint[] = [];
    const numPoints = 50;

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
        rangeMs = Number(market.endTime) * 1000 - Date.now();
    }

    const interval = rangeMs / numPoints;
    let currentYes = 50;

    for (let i = 0; i < numPoints; i++) {
      // Random walk for mock data
      const change = (Math.random() - 0.5) * 5;
      currentYes = Math.max(5, Math.min(95, currentYes + change));

      points.push({
        timestamp: now - rangeMs + interval * i,
        yesPrice: currentYes,
        noPrice: 100 - currentYes
      });
    }

    // Add current price as last point
    points.push({
      timestamp: now,
      yesPrice: yesProbability,
      noPrice: noProbability
    });

    setPriceHistory(points);
  }, [timeRange, yesProbability, noProbability, market.endTime]);

  const maxPrice = Math.max(...priceHistory.map((p) => Math.max(p.yesPrice, p.noPrice)));
  const minPrice = Math.min(...priceHistory.map((p) => Math.min(p.yesPrice, p.noPrice)));
  const priceRange = maxPrice - minPrice || 1;

  // SVG path generation for the chart lines
  const generatePath = (data: number[]): string => {
    if (data.length === 0) return '';

    const width = 100;
    const height = 100;
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - minPrice) / priceRange) * height;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  };

  const yesPath = generatePath(priceHistory.map((p) => p.yesPrice));
  const noPath = generatePath(priceHistory.map((p) => p.noPrice));

  const priceChange = priceHistory.length > 1
    ? yesProbability - priceHistory[0].yesPrice
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
            <span>{maxPrice.toFixed(0)}%</span>
            <span>{((maxPrice + minPrice) / 2).toFixed(0)}%</span>
            <span>{minPrice.toFixed(0)}%</span>
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
          <span>{formatTimeLabel(priceHistory[0]?.timestamp, timeRange)}</span>
          <span>Now</span>
        </div>
      </div>

      {/* Stats Footer */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800/50 text-sm">
        <div>
          <span className="text-gray-400 block">24h High</span>
          <span className="text-white font-medium">
            {Math.max(...priceHistory.map((p) => p.yesPrice)).toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">24h Low</span>
          <span className="text-white font-medium">
            {Math.min(...priceHistory.map((p) => p.yesPrice)).toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">24h Volume</span>
          <span className="text-white font-medium">
            {/* Mock volume for now */}
            {(Math.random() * 1000).toFixed(0)} CRwN
          </span>
        </div>
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
