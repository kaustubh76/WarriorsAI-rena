'use client';

import React from 'react';
import Link from 'next/link';
import { formatEther } from 'viem';
import { type AIAgentDisplay } from '@/services/aiAgentService';
import { useIsFollowing } from '@/hooks/useAgents';
import { INFTBadge } from './INFTBadge';

interface AgentCardProps {
  agent: AIAgentDisplay;
  showFollowButton?: boolean;
  isINFT?: boolean;
  inftTokenId?: bigint;
}

export function AgentCard({ agent, showFollowButton = true, isINFT = false, inftTokenId }: AgentCardProps) {
  const { isFollowing } = useIsFollowing(agent.id);

  const isOnline = agent.isOnline;
  const pnlPositive = agent.pnlFormatted.startsWith('+');

  return (
    <Link href={`/ai-agents/${agent.id.toString()}`}>
      <div className="card hover:border-purple-500/50 transition-all duration-200 cursor-pointer group h-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-lg md:text-xl font-bold text-white">
                {agent.name.charAt(0).toUpperCase()}
              </div>
              {isOnline && (
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 md:w-3 md:h-3 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm md:text-base font-semibold text-white group-hover:text-purple-300 transition-colors truncate">
                  {agent.name}
                </h3>
                {isINFT && <INFTBadge size="sm" />}
              </div>
              <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                <TierBadge tier={agent.tier} label={agent.tierLabel} />
                {agent.isOfficial && (
                  <span className="text-[10px] md:text-xs text-arcade-gold font-medium">Official</span>
                )}
                {isINFT && inftTokenId !== undefined && (
                  <span className="text-[10px] md:text-xs text-purple-400">#{inftTokenId.toString()}</span>
                )}
              </div>
            </div>
          </div>
          {isFollowing && (
            <span className="badge badge-purple flex-shrink-0 text-[10px] md:text-xs">
              Following
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4 line-clamp-2">
          {agent.description}
        </p>

        {/* Strategy & Risk */}
        <div className="flex flex-wrap gap-1.5 md:gap-2 mb-3 md:mb-4">
          <span className="badge badge-blue">
            {agent.strategyLabel}
          </span>
          <RiskBadge risk={agent.riskProfile} label={agent.riskLabel} />
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3 md:mb-4">
          <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
            <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">Win Rate</span>
            <p className="text-white font-semibold text-xs md:text-sm">{agent.winRate.toFixed(1)}%</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
            <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">PnL</span>
            <p className={`font-semibold text-xs md:text-sm ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
              {agent.pnlFormatted}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
            <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">Staked</span>
            <p className="text-white font-semibold text-xs md:text-sm">{agent.stakedFormatted}</p>
          </div>
        </div>

        {/* Specialization & Copy Trading */}
        <div className="flex justify-between items-center text-xs md:text-sm">
          <span className="text-slate-400 truncate">
            {agent.specializationLabel}
          </span>
          {agent.copyTradingEnabled && (
            <span className="text-green-400 flex items-center gap-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="hidden sm:inline">Copy Trading</span>
              <span className="sm:hidden">Copy</span>
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-slate-700/50 flex justify-between items-center text-xs md:text-sm">
          <span className="text-slate-400">
            {Number(agent.followerCount)} follower{Number(agent.followerCount) !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 md:gap-3">
            {isINFT && (
              <span className="text-purple-400 text-[10px] md:text-xs flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span className="hidden sm:inline">Tradeable</span>
              </span>
            )}
            <span className="text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              View
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TierBadge({ tier, label }: { tier: number; label: string }) {
  const configs = {
    0: { classes: 'bg-slate-500/20 text-slate-300 border border-slate-500/30', icon: '🌱' },
    1: { classes: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', icon: '⚡' },
    2: { classes: 'bg-purple-500/20 text-purple-300 border border-purple-500/30', icon: '💎' },
    3: { classes: 'bg-arcade-gold/20 text-arcade-gold border border-arcade-gold/30', icon: '👑' }
  };

  const config = configs[tier as keyof typeof configs] ?? configs[0];

  return (
    <span className={`px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs font-medium rounded-full ${config.classes}`}>
      {config.icon} {label}
    </span>
  );
}

function RiskBadge({ risk, label }: { risk: number; label: string }) {
  const configs = {
    0: { classes: 'bg-green-500/20 text-green-300 border border-green-500/30', icon: '🛡️' },
    1: { classes: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', icon: '⚠️' },
    2: { classes: 'bg-red-500/20 text-red-300 border border-red-500/30', icon: '🔥' }
  };

  const config = configs[risk as keyof typeof configs] ?? configs[1];

  return (
    <span className={`px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs font-medium rounded-full ${config.classes}`}>
      {config.icon} {label}
    </span>
  );
}

// Specialized card for iNFT agents with action buttons
interface INFTAgentCardProps {
  agent: AIAgentDisplay;
  tokenId: bigint;
  isOwner?: boolean;
  onTransfer?: () => void;
  onAuthorize?: () => void;
}

export function INFTAgentCard({
  agent,
  tokenId,
  isOwner = false,
  onTransfer,
  onAuthorize
}: INFTAgentCardProps) {
  const { isFollowing } = useIsFollowing(agent.id);
  const isOnline = agent.isOnline;
  const pnlPositive = agent.pnlFormatted.startsWith('+');

  return (
    <div className="card border-purple-500/30 hover:border-purple-500 overflow-hidden p-0">
      {/* iNFT Header Bar */}
      <div className="px-3 md:px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-b border-purple-500/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <INFTBadge size="sm" />
          <span className="text-[10px] md:text-xs text-purple-300 font-medium">#{tokenId.toString()}</span>
        </div>
        <span className="text-[10px] md:text-xs text-slate-400">ERC-7857</span>
      </div>

      <Link href={`/ai-agents/${agent.id.toString()}`}>
        <div className="p-4 md:p-6 cursor-pointer group">
          {/* Header */}
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-lg md:text-xl font-bold text-white">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                {isOnline && (
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 md:w-3 md:h-3 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-semibold text-white group-hover:text-purple-300 transition-colors truncate">
                  {agent.name}
                </h3>
                <div className="flex items-center gap-1.5 md:gap-2">
                  <TierBadge tier={agent.tier} label={agent.tierLabel} />
                </div>
              </div>
            </div>
            {isFollowing && (
              <span className="badge badge-purple flex-shrink-0 text-[10px] md:text-xs">
                Following
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4 line-clamp-2">
            {agent.description}
          </p>

          {/* Strategy & Risk */}
          <div className="flex flex-wrap gap-1.5 md:gap-2 mb-3 md:mb-4">
            <span className="badge badge-blue">
              {agent.strategyLabel}
            </span>
            <RiskBadge risk={agent.riskProfile} label={agent.riskLabel} />
          </div>

          {/* Performance Stats */}
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
              <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">Win Rate</span>
              <p className="text-white font-semibold text-xs md:text-sm">{agent.winRate.toFixed(1)}%</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
              <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">PnL</span>
              <p className={`font-semibold text-xs md:text-sm ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                {agent.pnlFormatted}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
              <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">Staked</span>
              <p className="text-white font-semibold text-xs md:text-sm">{agent.stakedFormatted}</p>
            </div>
          </div>
        </div>
      </Link>

      {/* Owner Actions */}
      {isOwner && (onTransfer || onAuthorize) && (
        <div className="px-4 md:px-6 pb-4 flex gap-2">
          {onTransfer && (
            <button
              onClick={(e) => { e.preventDefault(); onTransfer(); }}
              className="btn btn-ghost flex-1 text-purple-300 border-purple-500/30 hover:bg-purple-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className="hidden sm:inline">Transfer</span>
            </button>
          )}
          {onAuthorize && (
            <button
              onClick={(e) => { e.preventDefault(); onAuthorize(); }}
              className="btn btn-ghost flex-1 text-blue-300 border-blue-500/30 hover:bg-blue-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span className="hidden sm:inline">Authorize</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentCard;
