/**
 * Custom hooks for AI Agent functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import aiAgentService, {
  type AIAgent,
  type AIAgentDisplay,
  type AgentPerformance,
  type AgentPerformanceDisplay,
  type AgentFilters,
  type AgentSortOptions,
  type AgentTier,
  type AgentStrategy,
  type RiskProfile,
  type Specialization,
  type PersonaTraits,
  AIAgentRegistryAbi,
  crownTokenAbi
} from '@/services/aiAgentService';

/**
 * Hook to fetch all active agents
 */
export function useAgents(options?: {
  filters?: AgentFilters;
  sort?: AgentSortOptions;
}) {
  const [agents, setAgents] = useState<AIAgentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const filters = options?.filters ?? {};
      const sort = options?.sort ?? { field: 'winRate', direction: 'desc' };
      const allAgents = await aiAgentService.getFilteredAgents(filters, sort);
      setAgents(allAgents);
      setError(null);
    } catch (err) {
      setError('Failed to fetch agents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [options?.filters, options?.sort]);

  useEffect(() => {
    fetchAgents();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  return {
    agents,
    loading,
    error,
    refetch: fetchAgents
  };
}

/**
 * Hook to fetch official protocol agents
 */
export function useOfficialAgents() {
  const [agents, setAgents] = useState<AIAgentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOfficialAgents = useCallback(async () => {
    try {
      setLoading(true);
      const officialIds = await aiAgentService.getOfficialAgents();
      const agentPromises = officialIds.map(id => aiAgentService.getAgentWithDisplay(id));
      const agentResults = await Promise.all(agentPromises);
      setAgents(agentResults.filter((a): a is AIAgentDisplay => a !== null));
      setError(null);
    } catch (err) {
      setError('Failed to fetch official agents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOfficialAgents();
  }, [fetchOfficialAgents]);

  return {
    agents,
    loading,
    error,
    refetch: fetchOfficialAgents
  };
}

/**
 * Hook to fetch a single agent
 */
export function useAgent(agentId: bigint | null) {
  const [agent, setAgent] = useState<AIAgentDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    if (agentId === null) return;

    try {
      setLoading(true);
      const agentData = await aiAgentService.getAgentWithDisplay(agentId);
      setAgent(agentData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch agent');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
    // Refresh every 10 seconds
    const interval = setInterval(fetchAgent, 10000);
    return () => clearInterval(interval);
  }, [fetchAgent]);

  return { agent, loading, error, refetch: fetchAgent };
}

/**
 * Hook to fetch agent performance
 */
export function useAgentPerformance(agentId: bigint | null) {
  const [performance, setPerformance] = useState<AgentPerformanceDisplay | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPerformance = useCallback(async () => {
    if (agentId === null) return;

    try {
      setLoading(true);
      const perfData = await aiAgentService.getAgentPerformanceDisplay(agentId);
      setPerformance(perfData);
    } catch (err) {
      console.error('Error fetching performance:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchPerformance();
    // Refresh every 15 seconds
    const interval = setInterval(fetchPerformance, 15000);
    return () => clearInterval(interval);
  }, [fetchPerformance]);

  return {
    performance,
    winRate: performance?.winRate ?? 0,
    pnlFormatted: performance?.pnlFormatted ?? '+0.00',
    loading,
    refetch: fetchPerformance
  };
}

/**
 * Hook to get agents operated by current user
 */
export function useMyAgents() {
  const { address } = useAccount();
  const [agents, setAgents] = useState<AIAgentDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyAgents = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const agentIds = await aiAgentService.getOperatorAgents(address);
      const agentPromises = agentIds.map(id => aiAgentService.getAgentWithDisplay(id));
      const agentResults = await Promise.all(agentPromises);
      setAgents(agentResults.filter((a): a is AIAgentDisplay => a !== null));
    } catch (err) {
      console.error('Error fetching my agents:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchMyAgents();
  }, [fetchMyAgents]);

  return { agents, loading, refetch: fetchMyAgents };
}

/**
 * Hook to get agents the user is following
 */
export function useFollowingAgents() {
  const { address } = useAccount();
  const [agents, setAgents] = useState<AIAgentDisplay[]>([]);
  const [agentIds, setAgentIds] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFollowing = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const followingIds = await aiAgentService.getUserFollowing(address);
      setAgentIds(followingIds);

      const agentPromises = followingIds.map(id => aiAgentService.getAgentWithDisplay(id));
      const agentResults = await Promise.all(agentPromises);
      setAgents(agentResults.filter((a): a is AIAgentDisplay => a !== null));
    } catch (err) {
      console.error('Error fetching following agents:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchFollowing();
  }, [fetchFollowing]);

  return {
    agents,
    agentIds,
    loading,
    refetch: fetchFollowing
  };
}

/**
 * Hook to get agent followers
 */
export function useAgentFollowers(agentId: bigint | null) {
  const [followers, setFollowers] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFollowers = useCallback(async () => {
    if (agentId === null) return;

    try {
      setLoading(true);
      const followerList = await aiAgentService.getAgentFollowers(agentId);
      setFollowers(followerList);
    } catch (err) {
      console.error('Error fetching followers:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchFollowers();
  }, [fetchFollowers]);

  return {
    followers,
    followerCount: followers.length,
    loading,
    refetch: fetchFollowers
  };
}

/**
 * Hook for agent registry statistics
 */
export function useAgentStats() {
  const [stats, setStats] = useState({
    totalAgents: BigInt(0),
    totalStaked: BigInt(0),
    nextAgentId: BigInt(1)
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const [totalAgents, totalStaked, nextAgentId] = await Promise.all([
        aiAgentService.getTotalAgents(),
        aiAgentService.getTotalStaked(),
        aiAgentService.getNextAgentId()
      ]);
      setStats({ totalAgents, totalStaked, nextAgentId });
    } catch (err) {
      console.error('Error fetching agent stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Refresh every minute
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    ...stats,
    totalAgentsNumber: Number(stats.totalAgents),
    totalStakedFormatted: formatEther(stats.totalStaked),
    loading,
    refetch: fetchStats
  };
}

/**
 * Hook to check if user is following a specific agent
 */
export function useIsFollowing(agentId: bigint | null) {
  const { agentIds, loading: followingLoading } = useFollowingAgents();

  const isFollowing = agentId !== null && agentIds.some(id => id === agentId);

  return { isFollowing, loading: followingLoading };
}

/**
 * Hook for token balance and allowance for agent registry
 */
export function useAgentTokenBalance() {
  const { address } = useAccount();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(true);

  const fetchBalanceAndAllowance = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const [bal, allow] = await Promise.all([
        aiAgentService.getBalance(address),
        aiAgentService.checkAllowance(address)
      ]);
      setBalance(bal);
      setAllowance(allow);
    } catch (err) {
      console.error('Error fetching balance/allowance:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalanceAndAllowance();
  }, [fetchBalanceAndAllowance]);

  return {
    balance,
    balanceFormatted: formatEther(balance),
    allowance,
    loading,
    refetch: fetchBalanceAndAllowance
  };
}

/**
 * Hook to get minimum stake requirements for tiers
 */
export function useMinStakeRequirements() {
  const [requirements, setRequirements] = useState<Record<AgentTier, bigint>>({
    0: BigInt(0),
    1: BigInt(0),
    2: BigInt(0),
    3: BigInt(0)
  });
  const [loading, setLoading] = useState(true);

  const fetchRequirements = useCallback(async () => {
    try {
      setLoading(true);
      const [novice, skilled, expert, oracle] = await Promise.all([
        aiAgentService.getMinStakeForTier(0),
        aiAgentService.getMinStakeForTier(1),
        aiAgentService.getMinStakeForTier(2),
        aiAgentService.getMinStakeForTier(3)
      ]);
      setRequirements({
        0: novice,
        1: skilled,
        2: expert,
        3: oracle
      });
    } catch (err) {
      console.error('Error fetching stake requirements:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequirements();
  }, [fetchRequirements]);

  return {
    requirements,
    requirementsFormatted: {
      0: formatEther(requirements[0]),
      1: formatEther(requirements[1]),
      2: formatEther(requirements[2]),
      3: formatEther(requirements[3])
    },
    loading
  };
}
