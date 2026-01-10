/**
 * Custom hooks for AI Agent functionality
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
} from '@/services/aiAgentService';
import { agentINFTService } from '@/services/agentINFTService';

/**
 * Hook to fetch all active agents (both registry agents and iNFTs)
 * Uses stable serialization to prevent infinite re-renders
 */
export function useAgents(options?: {
  filters?: AgentFilters;
  sort?: AgentSortOptions;
}) {
  const [agents, setAgents] = useState<AIAgentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialize options to create stable dependency
  const filtersKey = useMemo(() => JSON.stringify(options?.filters ?? {}), [options?.filters]);
  const sortKey = useMemo(() => JSON.stringify(options?.sort ?? { field: 'winRate', direction: 'desc' }), [options?.sort]);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const sort = JSON.parse(sortKey) as AgentSortOptions;

      // Only fetch iNFT agents from 0G chain (legacy registry agents deprecated)
      const inftAgents = await fetchINFTAgents();

      console.log(`[useAgents] Fetched ${inftAgents.length} iNFT agents`);

      // Sort results
      const sortedAgents = sortAgents(inftAgents, sort);

      setAgents(sortedAgents);
      setError(null);
    } catch (err) {
      setError('Failed to fetch agents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [sortKey]);

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
 * Fetch iNFT agents from 0G chain and convert to AIAgentDisplay format
 */
async function fetchINFTAgents(): Promise<AIAgentDisplay[]> {
  try {
    const isDeployed = agentINFTService.isContractDeployed();
    const contractAddress = agentINFTService.getContractAddress();
    console.log(`[fetchINFTAgents] Contract deployed: ${isDeployed}, address: ${contractAddress}`);

    if (!isDeployed) {
      console.log('[fetchINFTAgents] Contract not deployed, returning empty array');
      return [];
    }

    const infts = await agentINFTService.getAllActiveINFTs();
    console.log(`[fetchINFTAgents] Got ${infts.length} active iNFTs from service`);

    // Convert iNFT format to AIAgentDisplay format
    const displayAgents: AIAgentDisplay[] = await Promise.all(
      infts.map(async (inft) => {
        const display = await agentINFTService.toDisplayFormat(inft);
        const traits = display.metadata?.traits || { patience: 50, conviction: 50, contrarian: 50, momentum: 50 };

        // Map iNFT to AIAgentDisplay structure
        return {
          // AIAgent base fields
          id: inft.tokenId,
          operator: inft.owner,
          name: display.metadata?.name || `iNFT Agent #${inft.tokenId}`,
          description: display.metadata?.description || 'AI Agent iNFT with encrypted strategy',
          strategy: display.metadata?.strategy?.type ?? 0,
          riskProfile: display.metadata?.riskProfile ?? 1,
          specialization: display.metadata?.specialization ?? 4,
          traits: traits,
          stakedAmount: inft.onChainData.stakedAmount,
          tier: inft.onChainData.tier,
          isActive: inft.onChainData.isActive,
          copyTradingEnabled: inft.onChainData.copyTradingEnabled,
          createdAt: inft.onChainData.createdAt,
          lastTradeAt: inft.onChainData.lastUpdatedAt,
          // AIAgentDisplay computed fields
          winRate: display.winRate,
          pnlFormatted: display.pnlFormatted,
          stakedFormatted: display.stakedFormatted,
          tierLabel: display.tierLabel,
          strategyLabel: display.strategyLabel,
          riskLabel: display.riskLabel,
          specializationLabel: display.specializationLabel,
          isOnline: display.isOnline,
          totalTrades: inft.performance.totalTrades,
          isOfficial: false,
          personaTraits: traits,
          followerCount: display.followerCount,
          // iNFT specific
          isINFT: true,
          inftTokenId: inft.tokenId,
        } as AIAgentDisplay;
      })
    );

    return displayAgents;
  } catch (err) {
    console.error('Error fetching iNFT agents:', err);
    return [];
  }
}

/**
 * Sort agents by the specified criteria
 */
function sortAgents(agents: AIAgentDisplay[], sort: AgentSortOptions): AIAgentDisplay[] {
  return [...agents].sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case 'winRate':
        comparison = (a.winRate || 0) - (b.winRate || 0);
        break;
      case 'totalPnL':
        // Parse PnL strings for comparison
        const pnlA = parseFloat(a.pnlFormatted?.replace(/[^0-9.-]/g, '') || '0');
        const pnlB = parseFloat(b.pnlFormatted?.replace(/[^0-9.-]/g, '') || '0');
        comparison = pnlA - pnlB;
        break;
      case 'stakedAmount':
        comparison = Number(a.stakedAmount - b.stakedAmount);
        break;
      case 'createdAt':
        comparison = Number(a.createdAt - b.createdAt);
        break;
      default:
        comparison = 0;
    }

    return sort.direction === 'desc' ? -comparison : comparison;
  });
}

/**
 * Hook to fetch official protocol agents
 * NOTE: Legacy registry deprecated - returning empty for now
 */
export function useOfficialAgents() {
  // Return empty - legacy registry agents deprecated in favor of iNFTs
  return {
    agents: [] as AIAgentDisplay[],
    loading: false,
    error: null,
    refetch: async () => {}
  };
}

/**
 * @deprecated Use useOfficialAgents() - kept for backwards compatibility
 */
function _useOfficialAgentsLegacy() {
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

  // Use string comparison for BigInt values to ensure correct comparison
  const isFollowing = agentId !== null && agentIds.some(id => id.toString() === agentId.toString());

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
