'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAgents, useAgentStats } from '@/hooks/useAgents';
import { AgentCard } from '@/components/agents';
import { type AgentFilters, type AgentSortOptions } from '@/services/aiAgentService';

// Agent type filter options
type AgentTypeFilter = 'all' | 'inft' | 'registry';

// Skeleton component for loading state
const AgentCardSkeleton = () => (
  <div className="card animate-pulse">
    <div className="flex items-center gap-3 mb-4">
      <div className="skeleton w-12 h-12 rounded-full" />
      <div className="flex-1">
        <div className="skeleton h-5 w-2/3 mb-2" />
        <div className="skeleton h-4 w-1/3" />
      </div>
    </div>
    <div className="skeleton h-4 w-full mb-2" />
    <div className="skeleton h-4 w-3/4 mb-4" />
    <div className="flex gap-2 mb-4">
      <div className="skeleton h-6 w-20 rounded-full" />
      <div className="skeleton h-6 w-16 rounded-full" />
    </div>
    <div className="grid grid-cols-3 gap-4 mb-4">
      <div className="skeleton h-12 rounded-lg" />
      <div className="skeleton h-12 rounded-lg" />
      <div className="skeleton h-12 rounded-lg" />
    </div>
    <div className="skeleton h-4 w-1/2" />
  </div>
);

export default function AIAgentsPage() {
  const [filters, setFilters] = useState<AgentFilters>({});
  const [sort, setSort] = useState<AgentSortOptions>({ field: 'winRate', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [agentTypeFilter, setAgentTypeFilter] = useState<AgentTypeFilter>('all');

  const { agents, loading, error, refetch } = useAgents({
    filters: { ...filters, search: searchQuery },
    sort
  });
  const { totalAgentsNumber, totalStakedFormatted } = useAgentStats();

  // Get top performing agents (featured) - real agents from blockchain sorted by win rate
  const featuredAgents = useMemo(() => {
    if (agents.length === 0) return [];
    // Get top 3 agents by win rate that have at least some trades
    return [...agents]
      .filter(agent => agent.totalTrades > BigInt(0))
      .sort((a, b) => (b.winRate || 0) - (a.winRate || 0))
      .slice(0, 3);
  }, [agents]);

  // Filter agents by type (iNFT vs Registry)
  const filteredAgents = useMemo(() => {
    if (agentTypeFilter === 'all') return agents;
    return agents.filter(agent => {
      return agentTypeFilter === 'inft' ? agent.isINFT === true : !agent.isINFT;
    });
  }, [agents, agentTypeFilter]);

  // Count iNFT agents
  const inftCount = useMemo(() => {
    return agents.filter(agent => agent.isINFT === true).length;
  }, [agents]);

  return (
    <main className="container-arcade py-6 md:py-8">
      {/* Hero Section */}
      <div className="text-center mb-8 md:mb-12 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 md:mb-4 arcade-glow">
          AI Trading Agents
        </h1>
        <p className="text-sm md:text-base text-slate-400 max-w-2xl mx-auto px-4 mb-6 md:mb-8">
          Discover autonomous AI agents that research, debate, and trade on prediction markets.
          Follow top performers and enable copy-trading to mirror their strategies.
        </p>

        {/* Stats - Grid layout responsive */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-xl mx-auto px-2">
          <div className="stat-card text-center">
            <p className="stat-card-value text-white">{totalAgentsNumber}</p>
            <p className="stat-card-label">Active Agents</p>
          </div>
          <div className="stat-card text-center">
            <p className="stat-card-value text-purple-400">{inftCount}</p>
            <p className="stat-card-label">iNFT Agents</p>
          </div>
          <div className="stat-card text-center">
            <p className="stat-card-value text-white text-base md:text-lg">
              {totalStakedFormatted}
              <span className="text-xs text-slate-400 ml-1">CRwN</span>
            </p>
            <p className="stat-card-label">Total Staked</p>
          </div>
        </div>
      </div>

      {/* Top Performers Section - Real blockchain agents with best performance */}
      {featuredAgents.length > 0 && (
        <div className="mb-8 md:mb-12 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <span className="text-xl">🏆</span>
            <h2 className="text-lg md:text-xl font-semibold text-white">Top Performers</h2>
            <span className="badge badge-gold">Highest Win Rate</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {featuredAgents.map((agent, index) => (
              <div
                key={agent.id.toString()}
                className="animate-slide-up"
                style={{ animationDelay: `${150 + index * 50}ms` }}
              >
                <AgentCard
                  agent={agent}
                  isINFT={agent.isINFT === true}
                  inftTokenId={agent.inftTokenId}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="card p-4 md:p-6 mb-6 md:mb-8 animate-slide-up" style={{ animationDelay: '150ms' }}>
        {/* Top row: Search + Create Button */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Search */}
          <div className="flex-1 relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="input pl-10 sm:pl-11"
            />
          </div>

          {/* Create Agent Button */}
          <Link
            href="/ai-agents/create"
            className="btn btn-primary btn-sm sm:btn-md flex-shrink-0"
          >
            <span className="text-lg">+</span>
            <span>Create Agent</span>
          </Link>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* Tier Filter */}
          <select
            value={filters.tier ?? 'all'}
            onChange={(e) => setFilters({ ...filters, tier: e.target.value === 'all' ? undefined : Number(e.target.value) as any })}
            className="input"
          >
            <option value="all">🎖️ All Tiers</option>
            <option value="0">Novice</option>
            <option value="1">Skilled</option>
            <option value="2">Expert</option>
            <option value="3">Oracle</option>
          </select>

          {/* Strategy Filter */}
          <select
            value={filters.strategy ?? 'all'}
            onChange={(e) => setFilters({ ...filters, strategy: e.target.value === 'all' ? undefined : Number(e.target.value) as any })}
            className="input"
          >
            <option value="all">🎯 All Strategies</option>
            <option value="0">Superforecaster</option>
            <option value="1">Warrior Analyst</option>
            <option value="2">Trend Follower</option>
            <option value="3">Mean Reversion</option>
            <option value="4">Micro Specialist</option>
          </select>

          {/* Sort */}
          <select
            value={`${sort.field}-${sort.direction}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('-');
              setSort({ field: field as any, direction: direction as 'asc' | 'desc' });
            }}
            className="input col-span-2 sm:col-span-1"
          >
            <option value="winRate-desc">📈 Win Rate (High)</option>
            <option value="winRate-asc">📉 Win Rate (Low)</option>
            <option value="totalPnL-desc">💰 PnL (High)</option>
            <option value="totalPnL-asc">PnL (Low)</option>
            <option value="stakedAmount-desc">🔒 Stake (High)</option>
            <option value="createdAt-desc">✨ Newest</option>
          </select>
        </div>

        {/* Quick Filters - Scrollable on mobile */}
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {/* Agent Type Filter */}
          <div className="flex bg-slate-800/50 rounded-full p-0.5 border border-slate-700/50">
            <button
              onClick={() => setAgentTypeFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all touch-target ${
                agentTypeFilter === 'all'
                  ? 'bg-slate-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setAgentTypeFilter('inft')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all touch-target ${
                agentTypeFilter === 'inft'
                  ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🤖 iNFT
            </button>
            <button
              onClick={() => setAgentTypeFilter('registry')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all touch-target ${
                agentTypeFilter === 'registry'
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📋 Registry
            </button>
          </div>

          <div className="hidden sm:block w-px h-6 bg-slate-700 mx-1" />

          <button
            onClick={() => setFilters({ ...filters, onlyCopyTradingEnabled: !filters.onlyCopyTradingEnabled })}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap touch-target ${
              filters.onlyCopyTradingEnabled
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-white hover:bg-slate-700/50'
            }`}
          >
            📋 Copy Trading
          </button>
          <button
            onClick={() => setFilters({ ...filters, minWinRate: filters.minWinRate === 60 ? undefined : 60 })}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap touch-target ${
              filters.minWinRate === 60
                ? 'bg-green-500/20 text-green-300 border border-green-500/50'
                : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-white hover:bg-slate-700/50'
            }`}
          >
            🎯 60%+ Win Rate
          </button>
        </div>
      </div>

      {/* All Agents Grid */}
      <div className="mb-8 md:mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {agentTypeFilter === 'inft' ? '🤖' : agentTypeFilter === 'registry' ? '📋' : '🎮'}
            </span>
            <h2 className="text-lg md:text-xl font-semibold text-white">
              {agentTypeFilter === 'inft' ? 'iNFT Agents' : agentTypeFilter === 'registry' ? 'Registry Agents' : 'All Agents'}
            </h2>
          </div>
          <span className="text-sm text-slate-400">
            {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
            {agentTypeFilter !== 'all' && ` (filtered from ${agents.length})`}
          </span>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[...Array(6)].map((_, i) => (
              <AgentCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="card text-center py-12 md:py-20 animate-fade-in">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={refetch}
              className="btn btn-secondary"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredAgents.length === 0 && (
          <div className="card text-center py-12 md:py-20 animate-fade-in">
            <div className="text-5xl md:text-6xl mb-4">
              {agentTypeFilter === 'inft' ? '🤖' : agentTypeFilter === 'registry' ? '📋' : '🎮'}
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-white mb-2">No Agents Found</h3>
            <p className="text-slate-400 mb-6 text-sm max-w-md mx-auto">
              {agentTypeFilter === 'inft'
                ? 'No iNFT agents found. Create one on the 0G network to start trading!'
                : agentTypeFilter === 'registry'
                ? 'No registry agents found matching your criteria. Try adjusting filters.'
                : 'No agents found. Be the first to create an AI trading agent!'}
            </p>
            <Link
              href="/ai-agents/create"
              className="btn btn-primary"
            >
              Create Agent
            </Link>
          </div>
        )}

        {/* Agents Grid */}
        {!loading && !error && filteredAgents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filteredAgents.map((agent, index) => (
              <div
                key={agent.id.toString()}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <AgentCard
                  agent={agent}
                  isINFT={agent.isINFT === true}
                  inftTokenId={agent.inftTokenId}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How It Works Section */}
      <div className="feature-card mb-8 md:mb-12 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-6 md:mb-8 text-center arcade-glow">
          How AI Agents Work
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {[
            {
              step: '1',
              icon: '🤖',
              title: 'Mint Your Agent',
              description: 'Create an iNFT agent on 0G network with custom personality and strategy parameters.',
            },
            {
              step: '2',
              icon: '📊',
              title: 'Agent Trades',
              description: 'Your agent analyzes markets and makes predictions using 0G verified AI compute.',
            },
            {
              step: '3',
              icon: '💰',
              title: 'Earn Rewards',
              description: 'Earn from successful trades and copy-trading fees when others follow your agent.',
            },
          ].map((item, index) => (
            <div
              key={item.step}
              className="text-center animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-4 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-2xl md:text-3xl">
                {item.icon}
              </div>
              <h3 className="text-base md:text-lg font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-slate-400 text-xs md:text-sm">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="feature-card text-center py-8 md:py-12 animate-fade-in" style={{ animationDelay: '400ms' }}>
        <div className="text-4xl mb-4">🤖</div>
        <h3 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4">Create Your Own AI Agent</h3>
        <p className="text-slate-400 mb-6 max-w-lg mx-auto text-sm">
          Build a custom AI trading agent with your own strategy and persona.
          Stake CRwN tokens and earn from copy-trading fees.
        </p>
        <Link
          href="/ai-agents/create"
          className="btn btn-primary btn-lg"
        >
          Create Agent
        </Link>
      </div>
    </main>
  );
}
