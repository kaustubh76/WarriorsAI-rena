'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { useFollowingAgents, useAgentStats } from '@/hooks/useAgents';
import { useCopyTradeConfig } from '@/hooks/useCopyTrade';
import { AgentCard } from '@/components/agents';

export default function CopyTradingPage() {
  const { isConnected } = useAccount();
  const { agents: followingAgents, agentIds, loading, refetch } = useFollowingAgents();
  const { totalAgentsNumber } = useAgentStats();

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
        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-12">
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{agentIds.length}</p>
            <p className="text-sm text-gray-400">Following</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{totalAgentsNumber}</p>
            <p className="text-sm text-gray-400">Total Agents</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-400">--</p>
            <p className="text-sm text-gray-400">Copy PnL</p>
          </div>
        </div>

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
                <CopyTradeAgentRow key={agent.id.toString()} agent={agent} onUnfollow={refetch} />
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
  onUnfollow
}: {
  agent: any;
  onUnfollow: () => void;
}) {
  const { config, isActive, maxAmountFormatted } = useCopyTradeConfig(agent.id);

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
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-gray-400">Max Trade</p>
            <p className="text-white font-medium">{maxAmountFormatted} CRwN</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Status</p>
            <p className={`font-medium ${isActive ? 'text-green-400' : 'text-gray-400'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </p>
          </div>
          <Link
            href={`/ai-agents/${agent.id}`}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm"
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
