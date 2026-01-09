'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAgent, useAgentPerformance, useAgentFollowers } from '@/hooks/useAgents';
import { AgentPerformanceChart, PersonaTraitsCard, FollowButton } from '@/components/agents';

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.id ? BigInt(params.id as string) : null;

  const { agent, loading: agentLoading, error } = useAgent(agentId);
  const { performance, loading: perfLoading } = useAgentPerformance(agentId);
  const { followers, followerCount, loading: followersLoading } = useAgentFollowers(agentId);

  if (agentLoading) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-800 rounded w-1/3 mb-4" />
            <div className="h-4 bg-gray-800 rounded w-1/2 mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-96 bg-gray-800 rounded-xl" />
              <div className="h-96 bg-gray-800 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Agent Not Found</h1>
          <p className="text-gray-400 mb-6">{error || 'This agent does not exist or has been deactivated.'}</p>
          <Link
            href="/ai-agents"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500"
          >
            Browse Agents
          </Link>
        </div>
      </div>
    );
  }

  const pnlPositive = agent.pnlFormatted.startsWith('+');

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-12">
      <div className="container mx-auto px-4">
        {/* Back Link */}
        <Link href="/ai-agents" className="text-gray-400 hover:text-white mb-6 inline-block">
          &lt; Back to Agents
        </Link>

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-8 border border-gray-700 mb-8">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-4xl font-bold text-white">
                {agent.name.charAt(0).toUpperCase()}
              </div>
              {agent.isOnline && (
                <div className="absolute bottom-2 right-2 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">{agent.name}</h1>
                {agent.isOfficial && (
                  <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                    Official
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 text-sm bg-purple-500/20 text-purple-400 rounded-full">
                  {agent.tierLabel}
                </span>
                <span className="px-3 py-1 text-sm bg-blue-500/20 text-blue-400 rounded-full">
                  {agent.strategyLabel}
                </span>
                <span className={`px-3 py-1 text-sm rounded-full ${
                  agent.riskProfile === 0 ? 'bg-green-500/20 text-green-400' :
                  agent.riskProfile === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {agent.riskLabel}
                </span>
              </div>

              <p className="text-gray-400 mb-4">{agent.description}</p>

              <div className="flex items-center gap-6 text-sm">
                <span className="text-gray-400">{followerCount} followers</span>
                <span className="text-gray-400">Staked: {agent.stakedFormatted}</span>
                {agent.copyTradingEnabled && (
                  <span className="text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    Copy Trading Enabled
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <FollowButton agentId={agent.id} />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            <div className="bg-gray-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{agent.winRate.toFixed(1)}%</p>
              <p className="text-sm text-gray-400">Win Rate</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 text-center">
              <p className={`text-2xl font-bold ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                {agent.pnlFormatted}
              </p>
              <p className="text-sm text-gray-400">Total PnL</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{Number(agent.totalTrades)}</p>
              <p className="text-sm text-gray-400">Total Trades</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{agent.specializationLabel}</p>
              <p className="text-sm text-gray-400">Specialization</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Performance */}
          <div className="lg:col-span-2 space-y-8">
            {performance && <AgentPerformanceChart performance={performance} />}

            {/* Trade History Placeholder */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Trades</h3>
              <p className="text-gray-400 text-center py-8">
                Trade history coming soon...
              </p>
            </div>
          </div>

          {/* Right Column - Persona */}
          <div className="space-y-8">
            <PersonaTraitsCard traits={agent.personaTraits} />

            {/* Followers */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Followers ({followerCount})</h3>
              {followers.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No followers yet</p>
              ) : (
                <div className="space-y-2">
                  {followers.slice(0, 5).map((follower, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                      <span className="text-gray-400 text-sm">
                        {follower.slice(0, 6)}...{follower.slice(-4)}
                      </span>
                    </div>
                  ))}
                  {followers.length > 5 && (
                    <p className="text-sm text-gray-500 text-center pt-2">
                      +{followers.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
