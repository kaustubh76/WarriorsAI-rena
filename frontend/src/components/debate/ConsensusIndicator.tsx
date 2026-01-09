'use client';

import React from 'react';
import { type ConsensusResult, type ConsensusBreakdown } from '@/services/debateService';

interface ConsensusIndicatorProps {
  consensus: ConsensusResult;
  confidencePercent: number;
  breakdown?: ConsensusBreakdown[];
}

export function ConsensusIndicator({
  consensus,
  confidencePercent,
  breakdown
}: ConsensusIndicatorProps) {
  const outcomeLabel = getOutcomeLabel(consensus.outcome);
  const outcomeColor = getOutcomeColor(consensus.outcome);

  const yesWeight = Number(consensus.yesWeight);
  const noWeight = Number(consensus.noWeight);
  const totalWeight = Number(consensus.totalWeight);

  const yesPercent = totalWeight > 0 ? (yesWeight / totalWeight) * 100 : 50;
  const noPercent = totalWeight > 0 ? (noWeight / totalWeight) * 100 : 50;

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-6">AI Consensus</h3>

      {/* Main Indicator */}
      <div className="flex justify-center mb-6">
        <div className="relative w-40 h-40">
          {/* Confidence Ring */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke="#374151"
              strokeWidth="10"
            />
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke={outcomeColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${confidencePercent * 4.4} ${440 - confidencePercent * 4.4}`}
              className="transition-all duration-1000"
            />
          </svg>

          {/* Center Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${outcomeColor === '#22c55e' ? 'text-green-400' : outcomeColor === '#ef4444' ? 'text-red-400' : 'text-gray-400'}`}>
              {outcomeLabel}
            </span>
            <span className="text-sm text-gray-400">{confidencePercent.toFixed(1)}% conf</span>
          </div>
        </div>
      </div>

      {/* Weight Distribution */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-green-400">Yes ({yesPercent.toFixed(1)}%)</span>
          <span className="text-red-400">No ({noPercent.toFixed(1)}%)</span>
        </div>
        <div className="h-4 bg-gray-700 rounded-full overflow-hidden flex">
          <div
            className="bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
            style={{ width: `${noPercent}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <span className="text-gray-400 block">Yes Votes</span>
          <span className="text-white font-medium">{yesWeight}</span>
        </div>
        <div className="text-center">
          <span className="text-gray-400 block">No Votes</span>
          <span className="text-white font-medium">{noWeight}</span>
        </div>
        <div className="text-center">
          <span className="text-gray-400 block">Total Weight</span>
          <span className="text-white font-medium">{totalWeight}</span>
        </div>
      </div>

      {/* Breakdown Chart */}
      {breakdown && breakdown.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h4 className="text-sm font-medium text-gray-400 mb-4">Vote Breakdown by Confidence</h4>
          <div className="space-y-2">
            {breakdown.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-gray-400 flex-1">{item.label}</span>
                <span className="text-sm text-white">{item.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getOutcomeLabel(outcome: number): string {
  switch (outcome) {
    case 1: return 'YES';
    case 2: return 'NO';
    case 3: return 'DRAW';
    default: return 'PENDING';
  }
}

function getOutcomeColor(outcome: number): string {
  switch (outcome) {
    case 1: return '#22c55e';
    case 2: return '#ef4444';
    case 3: return '#eab308';
    default: return '#6b7280';
  }
}

export default ConsensusIndicator;
