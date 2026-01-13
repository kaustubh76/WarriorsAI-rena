/**
 * AI Agent Service
 * Handles all interactions with the AIAgentRegistry smart contract
 * Uses shared RPC client with rate limiting and caching
 */

import {
  formatEther,
  parseEther,
  type Address,
} from 'viem';
import { readContractWithRateLimit, batchReadContractsWithRateLimit } from '../lib/rpcClient';
import { chainsToContracts, AIAgentRegistryAbi, crownTokenAbi , getChainId } from '../constants';
import type {
  AIAgent,
  AgentPerformance,
  CopyTradeConfig,
  AgentTier,
  AgentFilters,
  AgentSortOptions,
  AIAgentDisplay,
  AgentPerformanceDisplay,
} from '../types/agent';
import {
  getStrategyLabel,
  getRiskLabel,
  getTierLabel,
  getSpecializationLabel,
  calculateWinRate
} from '../types/agent';

// Re-export types for convenience
export * from '../types/agent';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

// Cache TTL configurations (in ms)
const CACHE_TTL = {
  AGENT: 30000,           // 30 seconds - agent data changes rarely
  PERFORMANCE: 15000,     // 15 seconds - performance updates more frequently
  STATIC: 300000,         // 5 minutes - static data like total agents
  SHORT: 5000,            // 5 seconds - frequently changing data
};

class AIAgentService {
  private aiAgentRegistryAddress: Address;
  private crownTokenAddress: Address;
  private chainId: number = getChainId(); // Flow Testnet

  constructor() {
    const contracts = chainsToContracts[this.chainId];
    this.aiAgentRegistryAddress = contracts.aiAgentRegistry as Address;
    this.crownTokenAddress = contracts.crownToken as Address;
  }

  /**
   * Check if the contract is deployed
   */
  isContractDeployed(): boolean {
    return this.aiAgentRegistryAddress !== ZERO_ADDRESS;
  }

  /**
   * Set contract address (for testing or after deployment)
   */
  setContractAddress(address: Address) {
    this.aiAgentRegistryAddress = address;
  }

  // ============================================================================
  // Read Functions (with rate limiting and caching)
  // ============================================================================

  /**
   * Get agent by ID
   */
  async getAgent(agentId: bigint): Promise<AIAgent | null> {
    if (!this.isContractDeployed()) return null;

    try {
      const agent = await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getAgent',
        args: [agentId]
      }, { cacheTTL: CACHE_TTL.AGENT });
      return agent as AIAgent;
    } catch (error) {
      console.error('Error fetching agent:', error);
      return null;
    }
  }

  /**
   * Get agent performance stats
   */
  async getAgentPerformance(agentId: bigint): Promise<AgentPerformance | null> {
    if (!this.isContractDeployed()) return null;

    try {
      const performance = await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getAgentPerformance',
        args: [agentId]
      }, { cacheTTL: CACHE_TTL.PERFORMANCE });
      return performance as AgentPerformance;
    } catch (error) {
      console.error('Error fetching agent performance:', error);
      return null;
    }
  }

  /**
   * Get agent tier
   */
  async getAgentTier(agentId: bigint): Promise<AgentTier> {
    if (!this.isContractDeployed()) return 0; // NOVICE

    try {
      const tier = await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getAgentTier',
        args: [agentId]
      }, { cacheTTL: CACHE_TTL.AGENT });
      return tier as AgentTier;
    } catch (error) {
      console.error('Error fetching agent tier:', error);
      return 0; // NOVICE
    }
  }

  /**
   * Check if agent is active
   */
  async isAgentActive(agentId: bigint): Promise<boolean> {
    if (!this.isContractDeployed()) return false;

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'isAgentActive',
        args: [agentId]
      }, { cacheTTL: CACHE_TTL.SHORT }) as boolean;
    } catch (error) {
      console.error('Error checking agent status:', error);
      return false;
    }
  }

  /**
   * Get official protocol agents
   */
  async getOfficialAgents(): Promise<bigint[]> {
    if (!this.isContractDeployed()) return [];

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getOfficialAgents'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint[];
    } catch (error) {
      console.error('Error fetching official agents:', error);
      return [];
    }
  }

  /**
   * Get agents operated by a specific address
   */
  async getOperatorAgents(operator: Address): Promise<bigint[]> {
    if (!this.isContractDeployed()) return [];

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getOperatorAgents',
        args: [operator]
      }, { cacheTTL: CACHE_TTL.AGENT }) as bigint[];
    } catch (error) {
      console.error('Error fetching operator agents:', error);
      return [];
    }
  }

  /**
   * Get all agents a user is following
   */
  async getUserFollowing(user: Address): Promise<bigint[]> {
    if (!this.isContractDeployed()) return [];

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getUserFollowing',
        args: [user]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint[];
    } catch (error) {
      console.error('Error fetching user following:', error);
      return [];
    }
  }

  /**
   * Get copy trade config for a user and agent
   */
  async getCopyTradeConfig(user: Address, agentId: bigint): Promise<CopyTradeConfig | null> {
    if (!this.isContractDeployed()) return null;

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getCopyTradeConfig',
        args: [user, agentId]
      }, { cacheTTL: CACHE_TTL.SHORT }) as CopyTradeConfig;
    } catch (error) {
      console.error('Error fetching copy trade config:', error);
      return null;
    }
  }

  /**
   * Get all followers of an agent
   */
  async getAgentFollowers(agentId: bigint): Promise<Address[]> {
    if (!this.isContractDeployed()) return [];

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getAgentFollowers',
        args: [agentId]
      }, { cacheTTL: CACHE_TTL.AGENT }) as Address[];
    } catch (error) {
      console.error('Error fetching agent followers:', error);
      return [];
    }
  }

  /**
   * Get total number of agents created
   */
  async getTotalAgents(): Promise<bigint> {
    if (!this.isContractDeployed()) return BigInt(0);

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'totalAgentsCreated'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching total agents:', error);
      return BigInt(0);
    }
  }

  /**
   * Get next agent ID
   */
  async getNextAgentId(): Promise<bigint> {
    if (!this.isContractDeployed()) return BigInt(1);

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'nextAgentId'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching next agent ID:', error);
      return BigInt(1);
    }
  }

  /**
   * Get total staked in registry
   */
  async getTotalStaked(): Promise<bigint> {
    if (!this.isContractDeployed()) return BigInt(0);

    try {
      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'totalStaked'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching total staked:', error);
      return BigInt(0);
    }
  }

  // ============================================================================
  // Aggregated/Computed Functions (optimized with batch reads)
  // ============================================================================

  /**
   * Get all active agents - optimized with batching
   */
  async getAllActiveAgents(): Promise<AIAgent[]> {
    if (!this.isContractDeployed()) return [];

    try {
      const nextId = await this.getNextAgentId();
      if (nextId <= BigInt(1)) return [];

      // Build batch read requests for all agents
      const agentCalls = [];
      for (let i = BigInt(1); i < nextId; i++) {
        agentCalls.push({
          address: this.aiAgentRegistryAddress,
          abi: AIAgentRegistryAbi,
          functionName: 'getAgent',
          args: [i]
        });
      }

      // Batch fetch all agents
      const results = await batchReadContractsWithRateLimit<AIAgent[]>(
        agentCalls,
        { cacheTTL: CACHE_TTL.AGENT }
      );

      // Filter active agents
      return results.filter((agent: AIAgent) => agent && agent.isActive);
    } catch (error) {
      console.error('Error fetching all active agents:', error);
      return [];
    }
  }

  /**
   * Get agent with display values
   */
  async getAgentWithDisplay(agentId: bigint): Promise<AIAgentDisplay | null> {
    const agent = await this.getAgent(agentId);
    if (!agent) return null;

    const [performance, officialAgents, followers] = await Promise.all([
      this.getAgentPerformance(agentId),
      this.getOfficialAgents(),
      this.getAgentFollowers(agentId)
    ]);
    const winRate = performance ? calculateWinRate(performance) : 0;
    const pnl = performance?.totalPnL ?? BigInt(0);
    const totalTrades = performance?.totalTrades ?? BigInt(0);
    const isOnline = agent.lastTradeAt > BigInt(Math.floor(Date.now() / 1000) - 86400);
    const isOfficial = officialAgents.some(id => id === agentId);

    return {
      ...agent,
      winRate,
      pnlFormatted: this.formatPnL(pnl),
      stakedFormatted: `${parseFloat(formatEther(agent.stakedAmount)).toFixed(2)} CRwN`,
      tierLabel: getTierLabel(agent.tier),
      strategyLabel: getStrategyLabel(agent.strategy),
      riskLabel: getRiskLabel(agent.riskProfile),
      specializationLabel: getSpecializationLabel(agent.specialization),
      isOnline,
      totalTrades,
      isOfficial,
      personaTraits: agent.traits,
      followerCount: followers.length
    };
  }

  /**
   * Get agent performance with display values
   */
  async getAgentPerformanceDisplay(agentId: bigint): Promise<AgentPerformanceDisplay | null> {
    const performance = await this.getAgentPerformance(agentId);
    if (!performance) return null;

    const winRate = calculateWinRate(performance);
    const streakText = performance.currentStreak > BigInt(0)
      ? `${performance.currentStreak} wins`
      : '0';

    return {
      ...performance,
      winRate,
      pnlFormatted: this.formatPnL(performance.totalPnL),
      volumeFormatted: formatEther(performance.totalVolume),
      avgConfidencePercent: Number(performance.avgConfidence) / 100,
      streakText
    };
  }

  /**
   * Filter and sort agents - optimized with parallel fetches
   */
  async getFilteredAgents(
    filters: AgentFilters,
    sort: AgentSortOptions
  ): Promise<AIAgentDisplay[]> {
    const agents = await this.getAllActiveAgents();
    const displayAgents: AIAgentDisplay[] = [];

    // Pre-filter agents before fetching performance (reduces RPC calls)
    const preFilteredAgents = agents.filter(agent => {
      if (filters.tier && filters.tier !== 'all' && agent.tier !== filters.tier) return false;
      if (filters.strategy && filters.strategy !== 'all' && agent.strategy !== filters.strategy) return false;
      if (filters.riskProfile && filters.riskProfile !== 'all' && agent.riskProfile !== filters.riskProfile) return false;
      if (filters.specialization && filters.specialization !== 'all' && agent.specialization !== filters.specialization) return false;
      if (filters.onlyCopyTradingEnabled && !agent.copyTradingEnabled) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!agent.name.toLowerCase().includes(searchLower) &&
            !agent.description.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      return true;
    });

    // Batch fetch performance for filtered agents
    if (preFilteredAgents.length > 0) {
      const performanceCalls = preFilteredAgents.map(agent => ({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName: 'getAgentPerformance',
        args: [agent.id]
      }));

      const performances = await batchReadContractsWithRateLimit<(AgentPerformance | null)[]>(
        performanceCalls,
        { cacheTTL: CACHE_TTL.PERFORMANCE }
      );

      for (let i = 0; i < preFilteredAgents.length; i++) {
        const agent = preFilteredAgents[i];
        const performance = performances[i];
        const winRate = performance ? calculateWinRate(performance) : 0;

        // Apply performance-based filters
        if (filters.minWinRate && winRate < filters.minWinRate) continue;
        if (filters.minTrades && performance && Number(performance.totalTrades) < filters.minTrades) continue;

        const pnl = performance?.totalPnL ?? BigInt(0);
        const isOnline = agent.lastTradeAt > BigInt(Math.floor(Date.now() / 1000) - 86400);

        displayAgents.push({
          ...agent,
          winRate,
          pnlFormatted: this.formatPnL(pnl),
          stakedFormatted: `${parseFloat(formatEther(agent.stakedAmount)).toFixed(2)} CRwN`,
          tierLabel: getTierLabel(agent.tier),
          strategyLabel: getStrategyLabel(agent.strategy),
          riskLabel: getRiskLabel(agent.riskProfile),
          specializationLabel: getSpecializationLabel(agent.specialization),
          isOnline,
          totalTrades: performance?.totalTrades ?? BigInt(0),
          isOfficial: false, // Will be computed separately if needed
          personaTraits: agent.traits,
          followerCount: 0 // Will be fetched separately if needed for display
        });
      }
    }

    // Sort
    displayAgents.sort((a, b) => {
      let comparison = 0;
      switch (sort.field) {
        case 'winRate':
          comparison = a.winRate - b.winRate;
          break;
        case 'totalPnL':
          comparison = parseFloat(a.pnlFormatted.replace(/[^0-9.-]/g, '')) -
                      parseFloat(b.pnlFormatted.replace(/[^0-9.-]/g, ''));
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

    return displayAgents;
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Format PnL to human readable string
   */
  formatPnL(pnl: bigint): string {
    const value = Number(formatEther(pnl));
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Format stake amount
   */
  formatStake(amount: bigint): string {
    return `${parseFloat(formatEther(amount)).toFixed(2)} CRwN`;
  }

  /**
   * Parse amount from string to bigint
   */
  parseAmount(amount: string): bigint {
    return parseEther(amount);
  }

  /**
   * Get minimum stake for tier
   */
  async getMinStakeForTier(tier: AgentTier): Promise<bigint> {
    try {
      let functionName: string;
      switch (tier) {
        case 0: // NOVICE
          functionName = 'MIN_STAKE_NOVICE';
          break;
        case 1: // SKILLED
          functionName = 'MIN_STAKE_SKILLED';
          break;
        case 2: // EXPERT
          functionName = 'MIN_STAKE_EXPERT';
          break;
        case 3: // ORACLE
          functionName = 'MIN_STAKE_ORACLE';
          break;
        default:
          functionName = 'MIN_STAKE_NOVICE';
      }

      return await readContractWithRateLimit({
        address: this.aiAgentRegistryAddress,
        abi: AIAgentRegistryAbi,
        functionName
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching min stake:', error);
      return parseEther('100'); // Default 100 CRwN
    }
  }

  /**
   * Check token allowance for staking
   */
  async checkAllowance(owner: Address): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: crownTokenAbi,
        functionName: 'allowance',
        args: [owner, this.aiAgentRegistryAddress]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint;
    } catch (error) {
      console.error('Error checking allowance:', error);
      return BigInt(0);
    }
  }

  /**
   * Get token balance
   */
  async getBalance(address: Address): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: crownTokenAbi,
        functionName: 'balanceOf',
        args: [address]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint;
    } catch (error) {
      console.error('Error checking balance:', error);
      return BigInt(0);
    }
  }

  /**
   * Get contract addresses
   */
  getAddresses() {
    return {
      aiAgentRegistry: this.aiAgentRegistryAddress,
      crownToken: this.crownTokenAddress
    };
  }
}

export const aiAgentService = new AIAgentService();
export default aiAgentService;
