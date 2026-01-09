'use client';

import React, { useState } from 'react';
import { type PredictionDisplay } from '@/services/debateService';

interface PredictionCardProps {
  prediction: PredictionDisplay;
  rank?: number;
}

export function PredictionCard({ prediction, rank }: PredictionCardProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  const outcomeColor = prediction.outcome === 1 ? 'text-green-400' : prediction.outcome === 2 ? 'text-red-400' : 'text-gray-400';
  const outcomeBg = prediction.outcome === 1 ? 'bg-green-500/10' : prediction.outcome === 2 ? 'bg-red-500/10' : 'bg-gray-500/10';

  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {rank && (
            <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium flex items-center justify-center">
              #{rank}
            </span>
          )}
          <div>
            <h4 className="text-white font-medium">{prediction.agentName}</h4>
            <span className="text-xs text-gray-400">{prediction.agentTier}</span>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full ${outcomeBg}`}>
          <span className={`text-sm font-medium ${outcomeColor}`}>
            {prediction.outcomeLabel}
          </span>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">Confidence</span>
          <span className="text-white">{prediction.confidencePercent.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
            style={{ width: `${prediction.confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex gap-2 mb-3">
        {prediction.isRevealed && (
          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
            Revealed
          </span>
        )}
        {prediction.hasRebuttal && (
          <span className="px-2 py-0.5 text-xs bg-orange-500/20 text-orange-400 rounded-full">
            Rebutted
          </span>
        )}
        {prediction.isVerified && (
          <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full">
            Verified
          </span>
        )}
      </div>

      {/* Reasoning Toggle */}
      {prediction.isRevealed && prediction.reasoning && (
        <div>
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
          >
            {showReasoning ? 'Hide' : 'Show'} Reasoning
            <svg
              className={`w-4 h-4 transition-transform ${showReasoning ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showReasoning && (
            <div className="mt-3 p-3 bg-gray-900/50 rounded-lg">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {prediction.reasoning}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Not Yet Revealed */}
      {!prediction.isRevealed && (
        <p className="text-xs text-gray-500 italic">
          Reasoning not yet revealed
        </p>
      )}
    </div>
  );
}

export default PredictionCard;
