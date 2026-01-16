'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { useFollowingAgents, useAgentStats } from '@/hooks/useAgents';
import { useCopyTradeConfig, useCopyTrade } from '@/hooks/useCopyTrade';
import { useCopyTradePnL, getPnLColorClass } from '@/hooks/useCopyTradePnL';

export default function CopyTradingPage() {
  const { isConnected } = useAccount();
  const { agents: followingAgents, agentIds, loading, refetch: refetchFollowing } = useFollowingAgents();
  const { totalAgentsNumber } = useAgentStats();
  const {
    totalPnL,
    realizedPnL,
    pnlFormatted,
    realizedPnLFormatted,
    winRate,
    pnl,
    isLoading: isPnLLoading,
    refetch: refetchPnL
  } = useCopyTradePnL();

  // Handle agent unfollow - refresh the lists
  const handleAgentUnfollow = () => {
    // Wait for blockchain confirmation then refetch
    setTimeout(() => {
      refetchFollowing();
      refetchPnL();
    }, 2000);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-6">Please connect your wallet to manage copy trading.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Copy Trading</h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Follow top AI agents and automatically mirror their trades.
            Manage your copy trading settings and track performance.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-4xl mx-auto mb-12">
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{agentIds.length}</p>
            <p className="text-sm text-gray-400">Following</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{totalAgentsNumber}</p>
            <p className="text-sm text-gray-400">Total Agents</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className={`text-2xl font-bold ${getPnLColorClass(totalPnL)}`}>
              {isPnLLoading ? '...' : pnlFormatted}
            </p>
            <p className="text-sm text-gray-400">Est. PnL</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className={`text-2xl font-bold ${getPnLColorClass(realizedPnL)}`}>
              {isPnLLoading ? '...' : realizedPnLFormatted}
            </p>
            <p className="text-sm text-gray-400">Realized PnL</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">
              {isPnLLoading ? '...' : `${winRate.toFixed(1)}%`}
            </p>
            <p className="text-sm text-gray-400">Win Rate</p>
          </div>
        </div>

        {/* Recent Trades from Followed Agents */}
        {pnl && pnl.followedAgents.some(a => a.recentTrades && a.recentTrades.length > 0) && (
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-4">Recent Agent Trades</h2>
            <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Agent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Market</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Position</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {pnl.followedAgents.flatMap(agent =>
                    (agent.recentTrades || []).slice(0, 3).map(trade => (
                      <tr key={trade.id} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm text-white">#{agent.tokenId}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <Link href={`/markets/${trade.marketId}`} className="hover:text-purple-400">
                            Market #{trade.marketId}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded ${trade.isYes ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {trade.isYes ? 'YES' : 'NO'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {(Number(trade.amount) / 1e18).toFixed(2)} CRwN
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            trade.resolvedAt
                              ? trade.won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {trade.resolvedAt ? (trade.won ? 'Won' : 'Lost') : 'Pending'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm font-medium ${
                          trade.pnl && BigInt(trade.pnl) > 0n ? 'text-green-400' :
                          trade.pnl && BigInt(trade.pnl) < 0n ? 'text-red-400' : 'text-gray-400'
                        }`}>
                          {trade.pnl ? `${(Number(trade.pnl) / 1e18).toFixed(4)}` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Following Agents */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Agents You Follow</h2>
            <Link
              href="/ai-agents"
              className="text-purple-400 hover:text-purple-300 text-sm"
            >
              Browse More Agents
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-gray-900 rounded-xl p-6 animate-pulse h-64" />
              ))}
            </div>
          ) : followingAgents.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-xl">
              <p className="text-gray-400 mb-4">You are not following any agents yet</p>
              <Link
                href="/ai-agents"
                className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500"
              >
                Discover Agents
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {followingAgents.map((agent) => (
                <CopyTradeAgentRow
                  key={agent.id.toString()}
                  agent={agent}
                  onUnfollow={handleAgentUnfollow}
                />
              ))}
            </div>
          )}
        </div>

        {/* How It Works */}
        <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-8">
          <h3 className="text-xl font-bold text-white mb-6 text-center">How Copy Trading Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">
                1
              </div>
              <h4 className="text-white font-medium mb-2">Follow an Agent</h4>
              <p className="text-gray-400 text-sm">
                Browse AI agents and follow the ones that match your strategy
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">
                2
              </div>
              <h4 className="text-white font-medium mb-2">Set Limits</h4>
              <p className="text-gray-400 text-sm">
                Configure maximum trade amounts to control your exposure
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">
                3
              </div>
              <h4 className="text-white font-medium mb-2">Auto-Trade</h4>
              <p className="text-gray-400 text-sm">
                Your wallet automatically mirrors the agent&apos;s trades
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyTradeAgentRow({
  agent,
  onUnfollow,
}: {
  agent: any;
  onUnfollow?: () => void;
}) {
  const { isActive, maxAmountFormatted, config } = useCopyTradeConfig(agent.id);
  const { unfollow, isPending, isConfirming, isSuccess, needsChainSwitch, switchTo0G } = useCopyTrade(agent.id);
  const [showConfirmUnfollow, setShowConfirmUnfollow] = useState(false);

  // Handle successful unfollow
  useEffect(() => {
    if (isSuccess && showConfirmUnfollow) {
      setShowConfirmUnfollow(false);
      onUnfollow?.();
    }
  }, [isSuccess, showConfirmUnfollow, onUnfollow]);

  const handleUnfollow = async () => {
    try {
      await unfollow();
    } catch (err) {
      console.error('Error unfollowing:', err);
    }
  };

  const isLoading = isPending || isConfirming;

  // Calculate estimated PnL from this agent
  const estimatedPnL = config ?
    (Number(agent.pnl || 0) * Number(config.totalCopied) / 1e18).toFixed(4) :
    '0.00';

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xl font-bold text-white">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <Link href={`/ai-agents/${agent.id}`} className="text-white font-medium hover:text-purple-300">
              {agent.name}
            </Link>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-400">{agent.tierLabel}</span>
              <span className={`${agent.pnlFormatted.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                {agent.pnlFormatted}
              </span>
              <span className="text-gray-500">|</span>
              <span className="text-gray-400">Win Rate: {agent.winRate?.toFixed(1) || '0.0'}%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-gray-400">Max Trade</p>
            <p className="text-white font-medium">{maxAmountFormatted} CRwN</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Your Est. PnL</p>
            <p className={`font-medium ${parseFloat(estimatedPnL) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(estimatedPnL) >= 0 ? '+' : ''}{estimatedPnL} CRwN
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Status</p>
            <p className={`font-medium ${isActive ? 'text-green-400' : 'text-gray-400'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {needsChainSwitch ? (
              <button
                onClick={() => switchTo0G()}
                className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 text-sm"
              >
                Switch Chain
              </button>
            ) : !showConfirmUnfollow ? (
              <>
                <Link
                  href={`/ai-agents/${agent.id}`}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm"
                >
                  Settings
                </Link>
                <button
                  onClick={() => setShowConfirmUnfollow(true)}
                  disabled={isLoading}
                  className="px-4 py-2 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 text-sm disabled:opacity-50"
                >
                  Unfollow
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowConfirmUnfollow(false)}
                  disabled={isLoading}
                  className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnfollow}
                  disabled={isLoading}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 text-sm disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
