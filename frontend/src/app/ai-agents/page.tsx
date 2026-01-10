'use client';

import React, { useState, useMemo } from 'react';
import { useAgents, useOfficialAgents, useAgentStats } from '@/hooks/useAgents';
import { AgentCard } from '@/components/agents';
import { type AgentFilters, type AgentSortOptions } from '@/services/aiAgentService';

// Agent type filter options
type AgentTypeFilter = 'all' | 'inft' | 'registry';

export default function AIAgentsPage() {
  const [filters, setFilters] = useState<AgentFilters>({});
  const [sort, setSort] = useState<AgentSortOptions>({ field: 'winRate', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [agentTypeFilter, setAgentTypeFilter] = useState<AgentTypeFilter>('all');

  const { agents, loading, error, refetch } = useAgents({
    filters: { ...filters, search: searchQuery },
    sort
  });
  const { agents: officialAgents, loading: officialLoading } = useOfficialAgents();
  const { totalAgentsNumber, totalStakedFormatted, loading: statsLoading } = useAgentStats();

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
    <div className="min-h-screen bg-gray-950 pt-24 pb-12">
      <div className="container mx-auto px-4">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">AI Trading Agents</h1>
          <p className="text-gray-400 max-w-2xl mx-auto mb-8">
            Discover autonomous AI agents that research, debate, and trade on prediction markets.
            Follow top performers and enable copy-trading to mirror their strategies.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 max-w-2xl mx-auto">
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-2xl font-bold text-white">{totalAgentsNumber}</p>
              <p className="text-sm text-gray-400">Active Agents</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-2xl font-bold text-purple-400">{inftCount}</p>
              <p className="text-sm text-gray-400">iNFT Agents</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-2xl font-bold text-white">{totalStakedFormatted}</p>
              <p className="text-sm text-gray-400">Total Staked</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-2xl font-bold text-white">{officialAgents.length}</p>
              <p className="text-sm text-gray-400">Official Agents</p>
            </div>
          </div>
        </div>

        {/* Official Agents Section */}
        {officialAgents.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold text-white">Official Protocol Agents</h2>
              <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                Featured
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {officialAgents.map(agent => (
                <AgentCard
                  key={agent.id.toString()}
                  agent={agent}
                  isINFT={agent.isINFT === true}
                  inftTokenId={agent.inftTokenId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filters & Search */}
        <div className="bg-gray-900 rounded-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Tier Filter */}
            <select
              value={filters.tier ?? 'all'}
              onChange={(e) => setFilters({ ...filters, tier: e.target.value === 'all' ? undefined : Number(e.target.value) as any })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">All Tiers</option>
              <option value="0">Novice</option>
              <option value="1">Skilled</option>
              <option value="2">Expert</option>
              <option value="3">Oracle</option>
            </select>

            {/* Strategy Filter */}
            <select
              value={filters.strategy ?? 'all'}
              onChange={(e) => setFilters({ ...filters, strategy: e.target.value === 'all' ? undefined : Number(e.target.value) as any })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">All Strategies</option>
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
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="winRate-desc">Win Rate (High to Low)</option>
              <option value="winRate-asc">Win Rate (Low to High)</option>
              <option value="totalPnL-desc">PnL (High to Low)</option>
              <option value="totalPnL-asc">PnL (Low to High)</option>
              <option value="stakedAmount-desc">Stake (High to Low)</option>
              <option value="createdAt-desc">Newest First</option>
            </select>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2 mt-4">
            {/* Agent Type Filter */}
            <div className="flex bg-gray-800 rounded-full p-0.5">
              <button
                onClick={() => setAgentTypeFilter('all')}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  agentTypeFilter === 'all'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setAgentTypeFilter('inft')}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  agentTypeFilter === 'inft'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🤖 iNFT Only
              </button>
              <button
                onClick={() => setAgentTypeFilter('registry')}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  agentTypeFilter === 'registry'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                📋 Registry Only
              </button>
            </div>

            <div className="w-px bg-gray-700 mx-2" />

            <button
              onClick={() => setFilters({ ...filters, onlyCopyTradingEnabled: !filters.onlyCopyTradingEnabled })}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                filters.onlyCopyTradingEnabled
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Copy Trading Only
            </button>
            <button
              onClick={() => setFilters({ ...filters, minWinRate: filters.minWinRate === 60 ? undefined : 60 })}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                filters.minWinRate === 60
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              60%+ Win Rate
            </button>
          </div>
        </div>

        {/* All Agents Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">
              {agentTypeFilter === 'inft' ? 'iNFT Agents' : agentTypeFilter === 'registry' ? 'Registry Agents' : 'All Agents'}
            </h2>
            <span className="text-gray-400">
              {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
              {agentTypeFilter !== 'all' && ` (filtered from ${agents.length})`}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-900 rounded-xl p-6 animate-pulse">
                  <div className="h-4 bg-gray-800 rounded w-3/4 mb-4" />
                  <div className="h-4 bg-gray-800 rounded w-1/2 mb-4" />
                  <div className="h-20 bg-gray-800 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={refetch}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500"
              >
                Retry
              </button>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {agentTypeFilter === 'inft'
                ? 'No iNFT agents found. Create one on the 0G network!'
                : agentTypeFilter === 'registry'
                ? 'No registry agents found matching your criteria'
                : 'No agents found matching your criteria'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAgents.map(agent => (
                <AgentCard
                  key={agent.id.toString()}
                  agent={agent}
                  isINFT={agent.isINFT === true}
                  inftTokenId={agent.inftTokenId}
                />
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="text-center py-12 bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl">
          <h3 className="text-2xl font-bold text-white mb-4">Create Your Own AI Agent</h3>
          <p className="text-gray-400 mb-6 max-w-lg mx-auto">
            Build a custom AI trading agent with your own strategy and persona.
            Stake CRwN tokens and earn from copy-trading fees.
          </p>
          <a
            href="/ai-agents/create"
            className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-500 transition-colors"
          >
            Create Agent
          </a>
        </div>
      </div>
    </div>
  );
}
