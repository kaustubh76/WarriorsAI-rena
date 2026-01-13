'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDebateFull, usePhaseDurations } from '@/hooks/useDebate';
import { DebatePanel, ConsensusIndicator } from '@/components/debate';

export default function DebatePage() {
  const params = useParams();
  const debateId = params?.id ? BigInt(params.id as string) : null;

  // For now, using debateId as marketId and battleId (these would come from context in real app)
  const marketId = debateId;
  const battleId = BigInt(0);

  const {
    debate,
    consensus,
    consensusBreakdown,
    confidencePercent,
    predictions,
    participantCount,
    yesCount,
    noCount,
    timeline,
    canFinalize,
    loading,
    error
  } = useDebateFull(debateId, marketId, battleId);

  const { durationsFormatted } = usePhaseDurations();

  if (!debateId) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Debate</h1>
          <Link href="/markets" className="text-purple-400 hover:text-purple-300">
            Browse Markets
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-800 rounded w-1/3 mb-4" />
            <div className="h-64 bg-gray-800 rounded-xl mb-4" />
            <div className="h-96 bg-gray-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !debate) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Debate Not Found</h1>
          <p className="text-gray-400 mb-6">{error || 'This debate does not exist.'}</p>
          <Link href="/markets" className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500">
            Browse Markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-12">
      <div className="container mx-auto px-4">
        {/* Back Link */}
        <Link href="/markets" className="text-gray-400 hover:text-white mb-6 inline-block">
          &lt; Back to Markets
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">AI Debate #{debateId.toString()}</h1>
          <p className="text-gray-400">Market #{marketId?.toString()}</p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Debate Panel */}
          <div className="lg:col-span-2">
            <DebatePanel debate={debate} predictions={predictions} />
          </div>

          {/* Right Column - Consensus & Info */}
          <div className="space-y-6">
            {/* Consensus */}
            {consensus && (
              <ConsensusIndicator
                consensus={consensus}
                confidencePercent={confidencePercent}
                breakdown={consensusBreakdown}
              />
            )}

            {/* Phase Durations */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Phase Durations</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Prediction</span>
                  <span className="text-white">{durationsFormatted.prediction}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Evidence</span>
                  <span className="text-white">{durationsFormatted.evidence}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Rebuttal</span>
                  <span className="text-white">{durationsFormatted.rebuttal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Dispute Period</span>
                  <span className="text-white">{durationsFormatted.dispute}</span>
                </div>
              </div>
            </div>

            {/* Vote Summary */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Vote Summary</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-400">{yesCount}</p>
                  <p className="text-sm text-gray-400">Yes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{noCount}</p>
                  <p className="text-sm text-gray-400">No</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{participantCount}</p>
                  <p className="text-sm text-gray-400">Total</p>
                </div>
              </div>
            </div>

            {/* Finalize Button */}
            {canFinalize && (
              <button className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors">
                Finalize Debate
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {timeline.length > 0 && (
          <div className="mt-8 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Event Timeline</h3>
            <div className="space-y-4">
              {timeline.map((event, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="w-2 h-2 rounded-full bg-purple-500 mt-2" />
                  <div>
                    <p className="text-white text-sm">{event.description}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(Number(event.timestamp) * 1000).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
