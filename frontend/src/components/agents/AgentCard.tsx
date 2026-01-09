'use client';

import React from 'react';
import Link from 'next/link';
import { formatEther } from 'viem';
import { type AIAgentDisplay } from '@/services/aiAgentService';
import { useIsFollowing } from '@/hooks/useAgents';

interface AgentCardProps {
  agent: AIAgentDisplay;
  showFollowButton?: boolean;
}

export function AgentCard({ agent, showFollowButton = true }: AgentCardProps) {
  const { isFollowing } = useIsFollowing(agent.id);

  const isOnline = agent.isOnline;
  const pnlPositive = agent.pnlFormatted.startsWith('+');

  return (
    <Link href={`/ai-agents/${agent.id.toString()}`}>
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-all duration-200 cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xl font-bold text-white">
                {agent.name.charAt(0).toUpperCase()}
              </div>
              {isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition-colors">
                {agent.name}
              </h3>
              <div className="flex items-center gap-2">
                <TierBadge tier={agent.tier} label={agent.tierLabel} />
                {agent.isOfficial && (
                  <span className="text-xs text-yellow-400">Official</span>
                )}
              </div>
            </div>
          </div>
          {isFollowing && (
            <span className="px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full">
              Following
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-gray-400 mb-4 line-clamp-2">
          {agent.description}
        </p>

        {/* Strategy & Risk */}
        <div className="flex gap-2 mb-4">
          <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-300 rounded-full">
            {agent.strategyLabel}
          </span>
          <RiskBadge risk={agent.riskProfile} label={agent.riskLabel} />
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <span className="text-gray-400">Win Rate</span>
            <p className="text-white font-medium">{agent.winRate.toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-gray-400">PnL</span>
            <p className={`font-medium ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
              {agent.pnlFormatted}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Staked</span>
            <p className="text-white font-medium">{agent.stakedFormatted}</p>
          </div>
        </div>

        {/* Specialization & Copy Trading */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">
            {agent.specializationLabel}
          </span>
          {agent.copyTradingEnabled && (
            <span className="text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Copy Trading
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center text-sm">
          <span className="text-gray-400">
            {Number(agent.followerCount)} followers
          </span>
          <span className="text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
            View Profile
          </span>
        </div>
      </div>
    </Link>
  );
}

function TierBadge({ tier, label }: { tier: number; label: string }) {
  const colors = {
    0: 'bg-gray-500/20 text-gray-300',
    1: 'bg-blue-500/20 text-blue-300',
    2: 'bg-purple-500/20 text-purple-300',
    3: 'bg-yellow-500/20 text-yellow-300'
  };

  const icons = {
    0: '',
    1: '',
    2: '',
    3: ''
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[tier as keyof typeof colors] ?? colors[0]}`}>
      {icons[tier as keyof typeof icons]} {label}
    </span>
  );
}

function RiskBadge({ risk, label }: { risk: number; label: string }) {
  const colors = {
    0: 'bg-green-500/20 text-green-300',
    1: 'bg-yellow-500/20 text-yellow-300',
    2: 'bg-red-500/20 text-red-300'
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[risk as keyof typeof colors] ?? colors[1]}`}>
      {label}
    </span>
  );
}

export default AgentCard;
