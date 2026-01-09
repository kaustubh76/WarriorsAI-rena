'use client';

import React from 'react';
import { type DebateDisplay, type PredictionDisplay } from '@/services/debateService';
import { ConsensusIndicator } from './ConsensusIndicator';
import { PredictionCard } from './PredictionCard';

interface DebatePanelProps {
  debate: DebateDisplay;
  predictions: PredictionDisplay[];
}

export function DebatePanel({ debate, predictions }: DebatePanelProps) {
  const isActive = !debate.isFinalized;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">AI Debate</h2>
            <p className="text-gray-400">Market #{debate.marketId.toString()}</p>
          </div>
          <PhaseIndicator phase={debate.phase} label={debate.phaseLabel} color={debate.phaseColor} />
        </div>

        {/* Phase Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Phase Progress</span>
            <span>{debate.timeRemaining}</span>
          </div>
          <PhaseProgressBar currentPhase={debate.phase} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <span className="text-gray-400">Participants</span>
            <p className="text-white font-medium text-lg">{debate.participantCount}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <span className="text-gray-400">Consensus</span>
            <p className="text-white font-medium text-lg">{debate.consensusLabel}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <span className="text-gray-400">Confidence</span>
            <p className="text-white font-medium text-lg">{debate.consensusConfidencePercent.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Consensus Indicator */}
      {debate.consensus && (
        <ConsensusIndicator
          consensus={debate.consensus}
          confidencePercent={debate.consensusConfidencePercent}
        />
      )}

      {/* Predictions */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">
          Agent Predictions ({predictions.length})
        </h3>

        {predictions.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            Waiting for agents to submit predictions...
          </p>
        ) : (
          <div className="space-y-4">
            {predictions.map((prediction, index) => (
              <PredictionCard
                key={prediction.agentId.toString()}
                prediction={prediction}
                rank={index + 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dispute Status */}
      {debate.hasDispute && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <span className="text-lg">!</span>
            <span className="font-semibold">Dispute Filed</span>
          </div>
          <p className="text-gray-400 text-sm">
            This debate has an active dispute. Resolution may be delayed pending review.
          </p>
        </div>
      )}
    </div>
  );
}

function PhaseIndicator({
  phase,
  label,
  color
}: {
  phase: number;
  label: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-500/20 text-gray-400',
    blue: 'bg-blue-500/20 text-blue-400',
    purple: 'bg-purple-500/20 text-purple-400',
    orange: 'bg-orange-500/20 text-orange-400',
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400'
  };

  return (
    <div className={`px-4 py-2 rounded-lg ${colorMap[color] ?? colorMap.gray}`}>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function PhaseProgressBar({ currentPhase }: { currentPhase: number }) {
  const phases = ['Inactive', 'Prediction', 'Evidence', 'Rebuttal', 'Consensus', 'Finalized'];

  return (
    <div className="flex gap-1">
      {phases.map((phase, index) => (
        <div
          key={phase}
          className={`flex-1 h-2 rounded-full transition-all ${
            index <= currentPhase
              ? 'bg-purple-500'
              : 'bg-gray-700'
          }`}
        />
      ))}
    </div>
  );
}

export default DebatePanel;
