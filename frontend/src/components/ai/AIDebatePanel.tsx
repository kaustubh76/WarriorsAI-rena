'use client';

import React from 'react';
import { useAIDebate } from '@/hooks/useAIDebate';
import { MarketSource, DebateAgentRole } from '@/types/externalMarket';
import { DebateRoundCard } from './DebateRoundCard';
import { AIConfidenceMeter } from './AIConfidenceMeter';
import { ResearchSources } from './ResearchSources';

interface AIDebatePanelProps {
  marketId: string;
  question: string;
  source?: MarketSource;
}

export function AIDebatePanel({
  marketId,
  question,
  source = MarketSource.NATIVE,
}: AIDebatePanelProps) {
  const { debate, isLoading, error, startDebate } = useAIDebate(
    marketId,
    question,
    source
  );

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🤖</span> AI Analysis & Debate
        </h3>
        {debate?.isVerified && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full text-sm text-green-400">
            ✓ 0G Verified
          </span>
        )}
      </div>

      {/* Prediction Summary */}
      {debate?.finalPrediction && (
        <div className="mb-6 p-4 bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg border border-purple-500/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-300 font-medium">AI Prediction</span>
            <span
              className={`text-3xl font-bold ${
                debate.finalPrediction.outcome === 'yes'
                  ? 'text-green-400'
                  : 'text-red-400'
              }`}
            >
              {(debate.finalPrediction.probability * 100).toFixed(1)}%{' '}
              {debate.finalPrediction.outcome.toUpperCase()}
            </span>
          </div>

          <AIConfidenceMeter confidence={debate.finalPrediction.confidence} />
        </div>
      )}

      {/* Key Factors */}
      {debate?.keyFactors && debate.keyFactors.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
            <span>🎯</span> Key Decision Factors
          </h4>
          <ul className="space-y-2">
            {debate.keyFactors.map((factor, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-gray-300 text-sm"
              >
                <span className="text-purple-400 mt-1">•</span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Debate Rounds */}
      {debate?.rounds && debate.rounds.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
            <span>💬</span> Debate Transcript
          </h4>
          <div className="space-y-3">
            {debate.rounds.map((round, i) => (
              <DebateRoundCard key={i} round={round} />
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {debate?.sources && debate.sources.length > 0 && (
        <ResearchSources sources={debate.sources} />
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Start Debate Button */}
      {!debate && (
        <button
          onClick={startDebate}
          disabled={isLoading}
          className={`
            w-full py-4 rounded-lg font-medium text-lg transition-all
            ${
              isLoading
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/25'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              AI Agents Debating...
            </span>
          ) : (
            '🤖 Start AI Debate'
          )}
        </button>
      )}

      {/* Debate Complete Actions */}
      {debate && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={startDebate}
            disabled={isLoading}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm"
          >
            🔄 Re-run Debate
          </button>
          <button
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
          >
            📊 View Full Analysis
          </button>
        </div>
      )}
    </div>
  );
}

export default AIDebatePanel;
