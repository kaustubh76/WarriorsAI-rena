/**
 * Custom hooks for AI Agent functionality
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { formatTokenAmount } from '@/utils/format';
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

// Interface for raw agent data from API
interface RawAgentData {
  tokenId: number;
  owner: string;
  onChainData: {
    stakedAmount: string;
    tier: number;
    isActive: boolean;
    copyTradingEnabled: boolean;
    createdAt: number;
    lastUpdatedAt: number;
  };
  performance: {
    totalTrades: string;
    winningTrades: string;
    totalPnL: string;
  };
}

/**
 * Hook to fetch all active agents (both registry agents and iNFTs)
 * Uses stable serialization to prevent infinite re-renders
 * Includes AbortController to prevent race conditions
 */
export function useAgents(options?: {
  filters?: AgentFilters;
  sort?: AgentSortOptions;
}) {
  const [agents, setAgents] = useState<AIAgentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Serialize options to create stable dependency
  const filtersKey = useMemo(() => JSON.stringify(options?.filters ?? {}), [options?.filters]);
  const sortKey = useMemo(() => JSON.stringify(options?.sort ?? { field: 'winRate', direction: 'desc' }), [options?.sort]);

  const fetchAgents = useCallback(async (skipCache = false) => {
    // Cancel any pending request to prevent race conditions
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setLoading(true);
      const sort = JSON.parse(sortKey) as AgentSortOptions;

      // Only fetch iNFT agents from 0G chain (legacy registry agents deprecated)
      const inftAgents = await fetchINFTAgents(skipCache, signal);

      // Check if request was aborted before updating state
      if (signal.aborted) return;

      console.log(`[useAgents] Fetched ${inftAgents.length} iNFT agents (skipCache: ${skipCache})`);

      // Sort results
      const sortedAgents = sortAgents(inftAgents, sort);

      setAgents(sortedAgents);
      setError(null);
    } catch (err) {
      // Ignore abort errors - they're expected when cancelling requests
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Failed to fetch agents');
      console.error(err);
    } finally {
      // Only update loading state if not aborted
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [sortKey]);

  useEffect(() => {
    fetchAgents();
    // Refresh every 30 seconds
    const interval = setInterval(() => fetchAgents(), 30000);
    return () => {
      clearInterval(interval);
      // Cancel any pending request on cleanup
      abortControllerRef.current?.abort();
    };
  }, [fetchAgents]);

  // Create stable refetch functions
  const refetch = useCallback(() => fetchAgents(false), [fetchAgents]);
  const refetchWithRefresh = useCallback(() => fetchAgents(true), [fetchAgents]);

  return {
    agents,
    loading,
    error,
    refetch,
    refetchWithRefresh // Use this after minting to force blockchain refresh
  };
}

/**
 * Fetch iNFT agents from 0G chain via API route
 * Uses server-side fetching to avoid browser CORS issues with 0G RPC
 * @param skipCache - If true, forces a refresh from blockchain (useful after minting)
 * @param signal - AbortSignal for cancelling the request
 */
async function fetchINFTAgents(skipCache = false, signal?: AbortSignal): Promise<AIAgentDisplay[]> {
  try {
    const url = skipCache ? '/api/agents?refresh=true' : '/api/agents';
    console.log(`[fetchINFTAgents] Fetching agents via API route... (skipCache: ${skipCache})`);

    const response = await fetch(url, { signal });

    // Check response status before parsing JSON
    if (!response.ok) {
      console.error('[fetchINFTAgents] HTTP error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();

    if (!data.success) {
      console.error('[fetchINFTAgents] API error:', data.error);
      return [];
    }

    console.log(`[fetchINFTAgents] Got ${data.agents.length} active iNFTs from API`);

    // Convert API response to AIAgentDisplay format
    const displayAgents: AIAgentDisplay[] = data.agents.map((agent: RawAgentData) => {
      const traits = { patience: 50, conviction: 50, contrarian: 50, momentum: 50 };
      const stakedAmount = BigInt(agent.onChainData.stakedAmount);
      const totalTrades = BigInt(agent.performance.totalTrades);
      const winningTrades = BigInt(agent.performance.winningTrades);
      const totalPnL = BigInt(agent.performance.totalPnL);

      // Calculate win rate
      const winRate = totalTrades > BigInt(0) ? Number((winningTrades * BigInt(100)) / totalTrades) : 0;

      // Format stake
      const stakedFormatted = `${(Number(stakedAmount) / 1e18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CRwN`;

      // Format PnL
      const pnlAmount = Number(totalPnL) / 1e18;
      const pnlFormatted = `${pnlAmount >= 0 ? '+' : ''}${pnlAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CRwN`;

      // Get tier label
      const tierLabels = ['Novice', 'Skilled', 'Expert', 'Oracle'];
      const tierLabel = tierLabels[agent.onChainData.tier] || 'Unknown';

      return {
        // AIAgent base fields
        id: BigInt(agent.tokenId),
        operator: agent.owner,
        name: `iNFT Agent #${agent.tokenId}`,
        description: 'AI Agent iNFT with encrypted strategy',
        strategy: 0, // Default - encrypted in metadata
        riskProfile: 1, // Default - encrypted in metadata
        specialization: 4, // Default - encrypted in metadata
        traits: traits,
        stakedAmount: stakedAmount,
        tier: agent.onChainData.tier,
        isActive: agent.onChainData.isActive,
        copyTradingEnabled: agent.onChainData.copyTradingEnabled,
        createdAt: BigInt(agent.onChainData.createdAt),
        lastTradeAt: BigInt(agent.onChainData.lastUpdatedAt),
        // AIAgentDisplay computed fields
        winRate: winRate,
        pnlFormatted: pnlFormatted,
        stakedFormatted: stakedFormatted,
        tierLabel: tierLabel,
        strategyLabel: 'Encrypted',
        riskLabel: 'Encrypted',
        specializationLabel: 'Encrypted',
        isOnline: true, // Assume online for now
        totalTrades: totalTrades,
        isOfficial: false,
        personaTraits: traits,
        followerCount: 0,
        // iNFT specific
        isINFT: true,
        inftTokenId: BigInt(agent.tokenId),
      } as AIAgentDisplay;
    });

    return displayAgents;
  } catch (err) {
    console.error('[fetchINFTAgents] Error:', err);
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
        // Safe BigInt comparison without Number conversion overflow
        if (a.stakedAmount > b.stakedAmount) comparison = 1;
        else if (a.stakedAmount < b.stakedAmount) comparison = -1;
        else comparison = 0;
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
 * Hook to fetch a single agent
 * Includes AbortController to prevent race conditions
 */
export function useAgent(agentId: bigint | null) {
  const [agent, setAgent] = useState<AIAgentDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchAgent = useCallback(async () => {
    if (agentId === null) return;

    try {
      setLoading(true);
      const agentData = await aiAgentService.getAgentWithDisplay(agentId);
      // Only update state if still mounted
      if (isMountedRef.current) {
        setAgent(agentData);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError('Failed to fetch agent');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentId]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchAgent();
    // Refresh every 10 seconds
    const interval = setInterval(fetchAgent, 10000);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchAgent]);

  return { agent, loading, error, refetch: fetchAgent };
}

/**
 * Hook to fetch agent performance
 * Includes mounted ref to prevent state updates after unmount
 */
export function useAgentPerformance(agentId: bigint | null) {
  const [performance, setPerformance] = useState<AgentPerformanceDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  const fetchPerformance = useCallback(async () => {
    if (agentId === null) return;

    try {
      setLoading(true);
      const perfData = await aiAgentService.getAgentPerformanceDisplay(agentId);
      if (isMountedRef.current) {
        setPerformance(perfData);
      }
    } catch (err) {
      console.error('Error fetching performance:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentId]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchPerformance();
    // Refresh every 15 seconds
    const interval = setInterval(fetchPerformance, 15000);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
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
 * Hook to get agents (iNFTs) the user is following
 * Uses 0G Galileo Testnet via API route
 */
export function useFollowingAgents() {
  const { address } = useAccount();
  const [agents, setAgents] = useState<AIAgentDisplay[]>([]);
  const [agentIds, setAgentIds] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFollowing = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch following list from 0G chain via API
      const response = await fetch(`/api/agents/following?address=${address}`);
      const data = await response.json();

      if (!data.success) {
        console.error('Error fetching following:', data.error);
        setAgentIds([]);
        setAgents([]);
        return;
      }

      const followingIds = (data.following || []).map((id: string) => BigInt(id));
      setAgentIds(followingIds);

      // Fetch agent details for each followed agent
      if (followingIds.length > 0) {
        const allAgentsResponse = await fetch('/api/agents');
        const allAgentsData = await allAgentsResponse.json();

        if (allAgentsData.success) {
          const followedAgents = allAgentsData.agents.filter((agent: RawAgentData) =>
            followingIds.some((id: bigint) => id === BigInt(agent.tokenId))
          ).map((agent: RawAgentData) => ({
            id: BigInt(agent.tokenId),
            operator: agent.owner,
            name: `iNFT Agent #${agent.tokenId}`,
            description: 'AI Agent iNFT with encrypted strategy',
            strategy: 0,
            riskProfile: 1,
            specialization: 4,
            traits: { patience: 50, conviction: 50, contrarian: 50, momentum: 50 },
            stakedAmount: BigInt(agent.onChainData.stakedAmount),
            tier: agent.onChainData.tier,
            isActive: agent.onChainData.isActive,
            copyTradingEnabled: agent.onChainData.copyTradingEnabled,
            createdAt: BigInt(agent.onChainData.createdAt),
            lastTradeAt: BigInt(agent.onChainData.lastUpdatedAt),
            winRate: 0,
            pnlFormatted: '+0.00 CRwN',
            stakedFormatted: `${(Number(agent.onChainData.stakedAmount) / 1e18).toFixed(2)} CRwN`,
            tierLabel: ['Novice', 'Skilled', 'Expert', 'Oracle'][agent.onChainData.tier] || 'Unknown',
            strategyLabel: 'Encrypted',
            riskLabel: 'Encrypted',
            specializationLabel: 'Encrypted',
            isOnline: true,
            totalTrades: BigInt(agent.performance.totalTrades),
            isOfficial: false,
            personaTraits: { patience: 50, conviction: 50, contrarian: 50, momentum: 50 },
            followerCount: 0,
            isINFT: true,
            inftTokenId: BigInt(agent.tokenId),
          } as AIAgentDisplay));

          setAgents(followedAgents);
        }
      } else {
        setAgents([]);
      }
    } catch (err) {
      console.error('Error fetching following agents:', err);
      setAgentIds([]);
      setAgents([]);
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
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchFollowers = useCallback(async () => {
    if (agentId === null) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch from 0G chain via agentINFTService (copy trading is on 0G)
      const [followerList, count] = await Promise.all([
        agentINFTService.getAgentFollowers(agentId),
        agentINFTService.getFollowerCount(agentId),
      ]);
      setFollowers(followerList);
      setFollowerCount(Number(count));
    } catch (err) {
      console.error('Error fetching followers:', err);
      setFollowers([]);
      setFollowerCount(0);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchFollowers();
  }, [fetchFollowers]);

  return {
    followers,
    followerCount,
    loading,
    refetch: fetchFollowers
  };
}

/**
 * Hook for agent registry statistics
 * Includes mounted ref to prevent state updates after unmount
 */
export function useAgentStats() {
  const [stats, setStats] = useState({
    totalAgents: BigInt(0),
    totalStaked: BigInt(0),
    nextAgentId: BigInt(1)
  });
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const [totalAgents, totalStaked, nextAgentId] = await Promise.all([
        aiAgentService.getTotalAgents(),
        aiAgentService.getTotalStaked(),
        aiAgentService.getNextAgentId()
      ]);
      if (isMountedRef.current) {
        setStats({ totalAgents, totalStaked, nextAgentId });
      }
    } catch (err) {
      console.error('Error fetching agent stats:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStats();
    // Refresh every minute
    const interval = setInterval(fetchStats, 60000);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
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
 * Uses direct contract read from 0G chain for accurate, real-time status
 */
export function useIsFollowing(agentId: bigint | null) {
  const { address } = useAccount();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkFollowing = useCallback(async () => {
    if (!address || agentId === null) {
      setIsFollowing(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Use the agentINFTService to check copy trade config directly
      const config = await agentINFTService.getCopyTradeConfig(address, agentId);
      // isFollowing is true if config exists and isActive is true
      setIsFollowing(config?.isActive === true);
    } catch (err) {
      console.error('Error checking following status:', err);
      setIsFollowing(false);
    } finally {
      setLoading(false);
    }
  }, [address, agentId]);

  useEffect(() => {
    checkFollowing();
  }, [checkFollowing]);

  return { isFollowing, loading, refetch: checkFollowing };
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
    balanceFormatted: formatTokenAmount(balance),
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

/**
 * Hook to fetch CRwN balance on 0G chain for iNFT staking
 * This is separate from Flow CRwN balance used for trading
 *
 * Architecture:
 * - 0G Galileo (16602): iNFT minting, AI compute, storage - uses 0G CRwN
 * - Flow Testnet (545): Prediction markets, trading - uses Flow CRwN
 */
export function useZeroGTokenBalance() {
  const { address } = useAccount();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setBalance(BigInt(0));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch 0G CRwN balance via API to avoid CORS issues
      const response = await fetch(`/api/0g/balance?address=${address}`);
      const data = await response.json();

      if (data.success) {
        setBalance(BigInt(data.balance));
      } else {
        setError(data.error || 'Failed to fetch 0G balance');
        setBalance(BigInt(0));
      }
    } catch (err) {
      console.error('Error fetching 0G CRwN balance:', err);
      setError('Failed to fetch 0G balance');
      setBalance(BigInt(0));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    balance,
    balanceFormatted: formatTokenAmount(balance),
    loading,
    error,
    refetch: fetchBalance
  };
}
