'use client';

import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useAgent, useAgentPerformance, useAgentFollowers } from '@/hooks/useAgents';
import { AgentPerformanceChart, PersonaTraitsCard, FollowButton, INFTBadge, TransferAgentModal, AuthorizeUsageModal } from '@/components/agents';
import { useAgentINFT, useMyAgentINFTs } from '@/hooks/useAgentINFT';
import { useAgentTradeHistory, formatTradePnL, formatConfidence, formatTradeTime, getTradePnLColor } from '@/hooks/useAgentTradeHistory';

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.id ? BigInt(params.id as string) : null;
  const { address, isConnected } = useAccount();

  // Modal states
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAuthorizeModalOpen, setIsAuthorizeModalOpen] = useState(false);

  const { agent, loading: agentLoading, error, refetch: refetchAgent } = useAgent(agentId);
  const { performance, loading: perfLoading } = useAgentPerformance(agentId);
  const { followers, followerCount, loading: followersLoading } = useAgentFollowers(agentId);
  const { trades, isLoading: tradesLoading, error: tradesError } = useAgentTradeHistory(agentId ?? undefined);

  // iNFT detection - check if this agent has an associated iNFT
  const isINFT = agent?.isINFT === true;
  const inftTokenId = agent?.inftTokenId;

  // Fetch iNFT data if this is an iNFT agent
  const { inft, display: inftDisplay, refetch: refetchINFT } = useAgentINFT(inftTokenId);

  // Check if current user owns this iNFT
  const { isOwner } = useMyAgentINFTs();
  const isINFTOwner = useMemo(() => {
    if (!isINFT || !inftTokenId || !isConnected) return false;
    return isOwner(inftTokenId);
  }, [isINFT, inftTokenId, isConnected, isOwner]);

  // Alternative ownership check via direct comparison
  const isOwnerByAddress = useMemo(() => {
    if (!inft || !address) return false;
    return inft.owner.toLowerCase() === address.toLowerCase();
  }, [inft, address]);

  // Final ownership determination
  const canManageINFT = isINFTOwner || isOwnerByAddress;

  // Handle successful transfer
  const handleTransferSuccess = (txHash: string) => {
    console.log('Transfer successful:', txHash);
    // Refetch data after transfer
    refetchAgent();
    refetchINFT();
  };

  // Handle successful authorization
  const handleAuthorizeSuccess = (txHash: string) => {
    console.log('Authorization successful:', txHash);
    refetchINFT();
  };

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
                {isINFT && <INFTBadge size="md" />}
                {agent.isOfficial && (
                  <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                    Official
                  </span>
                )}
                {isINFT && inftTokenId !== undefined && (
                  <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                    #{inftTokenId.toString()}
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

              {/* iNFT Owner Actions */}
              {isINFT && canManageINFT && inftTokenId !== undefined && (
                <>
                  <button
                    onClick={() => setIsTransferModalOpen(true)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Transfer
                  </button>
                  <button
                    onClick={() => setIsAuthorizeModalOpen(true)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Authorize
                  </button>
                </>
              )}

              {/* iNFT indicator for non-owners */}
              {isINFT && !canManageINFT && (
                <div className="px-3 py-2 text-xs bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 text-center">
                  <span className="flex items-center justify-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    Tradeable iNFT
                  </span>
                </div>
              )}
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

            {/* Trade History */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Trades</h3>
              {tradesLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-14 bg-gray-800/50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : tradesError ? (
                <p className="text-red-400 text-center py-8">
                  Unable to load trade history
                </p>
              ) : trades.length === 0 ? (
                <p className="text-gray-400 text-center py-8">
                  No trades recorded yet
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {trades.map((trade, index) => (
                    <div
                      key={`${trade.transactionHash}-${index}`}
                      className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          trade.won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {trade.won ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">
                            Market #{trade.marketId.toString()}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {formatConfidence(trade.confidence)} confidence
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${getTradePnLColor(trade.pnl)}`}>
                          {formatTradePnL(trade.pnl)}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {trade.timestamp ? formatTradeTime(trade.timestamp) : 'Unknown'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* iNFT Modals */}
      {isINFT && inftTokenId !== undefined && (
        <>
          <TransferAgentModal
            tokenId={inftTokenId}
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            onSuccess={handleTransferSuccess}
          />
          <AuthorizeUsageModal
            tokenId={inftTokenId}
            isOpen={isAuthorizeModalOpen}
            onClose={() => setIsAuthorizeModalOpen(false)}
            onSuccess={handleAuthorizeSuccess}
          />
        </>
      )}
    </div>
  );
}
