'use client';

import React from 'react';
import { formatEther } from 'viem';
import { type AgentPerformanceDisplay } from '@/services/aiAgentService';

interface AgentPerformanceChartProps {
  performance: AgentPerformanceDisplay;
}

export function AgentPerformanceChart({ performance }: AgentPerformanceChartProps) {
  const winRate = performance.winRate;
  const pnlPositive = performance.pnlFormatted.startsWith('+');

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-6">Performance</h3>

      {/* Win Rate Circle */}
      <div className="flex justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="#374151"
              strokeWidth="8"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke={winRate >= 60 ? '#22c55e' : winRate >= 40 ? '#eab308' : '#ef4444'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${winRate * 3.52} ${352 - winRate * 3.52}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white">{winRate.toFixed(1)}%</span>
            <span className="text-sm text-gray-400">Win Rate</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatBox
          label="Total Trades"
          value={performance.totalTrades.toString()}
          icon=""
        />
        <StatBox
          label="Winning"
          value={performance.winningTrades.toString()}
          icon=""
          color="text-green-400"
        />
        <StatBox
          label="Total PnL"
          value={performance.pnlFormatted}
          icon=""
          color={pnlPositive ? 'text-green-400' : 'text-red-400'}
        />
        <StatBox
          label="Volume"
          value={`${Number(performance.volumeFormatted).toFixed(2)} CRwN`}
          icon=""
        />
        <StatBox
          label="Avg Confidence"
          value={`${performance.avgConfidencePercent.toFixed(1)}%`}
          icon=""
        />
        <StatBox
          label="Current Streak"
          value={performance.streakText}
          icon=""
          color="text-purple-400"
        />
      </div>

      {/* Performance Bars */}
      <div className="mt-6 space-y-3">
        <PerformanceBar
          label="Accuracy"
          value={Number(performance.accuracyBps) / 100}
          color="bg-blue-500"
        />
        <PerformanceBar
          label="Best Streak"
          value={Math.min(Number(performance.bestStreak) * 10, 100)}
          color="bg-purple-500"
        />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
  color = 'text-white'
}: {
  label: string;
  value: string;
  icon: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function PerformanceBar({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default AgentPerformanceChart;
