/**
 * Creator Revenue Service
 * Handles all interactions with the CreatorRevenueShare smart contract
 * Uses shared RPC client with rate limiting and caching
 */

import {
  formatEther,
  parseEther,
  type Address,
} from 'viem';
import { readContractWithRateLimit } from '../lib/rpcClient';
import { chainsToContracts, CreatorRevenueShareAbi, crownTokenAbi , getChainId } from '../constants';
import type {
  Creator,
  RevenueEntry,
  MarketFees,
  CreatorType,
  CreatorTier,
  CreatorDisplay,
  RevenueEntryDisplay,
  MarketFeesDisplay,
  RevenueBreakdown,
  CreatorStats,
} from '../types/creator';
import {
  getCreatorTypeLabel,
  getTierLabel,
  getTierColor,
  getTierIcon,
  getNextTier,
  getTierProgress,
  getRevenueSourceLabel,
  getRevenueSourceColor,
  formatVolume,
  getTierBenefits,
  TIER_THRESHOLDS
} from '../types/creator';

// Re-export types
export * from '../types/creator';

// Cache TTL configurations (in ms)
const CACHE_TTL = {
  CREATOR: 30000,         // 30 seconds - creator data changes with claims
  REVENUE: 60000,         // 1 minute - revenue history
  FEES: 30000,            // 30 seconds - market fees
  STATIC: 300000,         // 5 minutes - static data
  SHORT: 10000,           // 10 seconds - frequently changing data
};

class CreatorService {
  private creatorRevenueAddress: Address;
  private crownTokenAddress: Address;
  private chainId: number = getChainId();

  constructor() {
    const contracts = chainsToContracts[this.chainId];
    this.creatorRevenueAddress = contracts.creatorRevenueShare as Address;
    this.crownTokenAddress = contracts.crownToken as Address;
  }

  /**
   * Set contract address
   */
  setContractAddress(address: Address) {
    this.creatorRevenueAddress = address;
  }

  // ============================================================================
  // Read Functions (with rate limiting and caching)
  // ============================================================================

  /**
   * Get creator profile
   */
  async getCreator(wallet: Address): Promise<Creator | null> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'getCreator',
        args: [wallet]
      }, { cacheTTL: CACHE_TTL.CREATOR }) as Creator;
    } catch (error) {
      console.error('Error fetching creator:', error);
      return null;
    }
  }

  /**
   * Get creator tier
   */
  async getCreatorTier(wallet: Address): Promise<CreatorTier> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'getCreatorTier',
        args: [wallet]
      }, { cacheTTL: CACHE_TTL.CREATOR }) as CreatorTier;
    } catch (error) {
      console.error('Error fetching creator tier:', error);
      return 0; // BRONZE
    }
  }

  /**
   * Get pending rewards
   */
  async getPendingRewards(wallet: Address): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'getPendingRewards',
        args: [wallet]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint;
    } catch (error) {
      console.error('Error fetching pending rewards:', error);
      return BigInt(0);
    }
  }

  /**
   * Get market fees breakdown
   */
  async getMarketFees(marketId: bigint): Promise<MarketFees | null> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'getMarketFees',
        args: [marketId]
      }, { cacheTTL: CACHE_TTL.FEES }) as MarketFees;
    } catch (error) {
      console.error('Error fetching market fees:', error);
      return null;
    }
  }

  /**
   * Get creator revenue history
   */
  async getCreatorRevenueHistory(wallet: Address): Promise<RevenueEntry[]> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'getCreatorRevenueHistory',
        args: [wallet]
      }, { cacheTTL: CACHE_TTL.REVENUE }) as RevenueEntry[];
    } catch (error) {
      console.error('Error fetching revenue history:', error);
      return [];
    }
  }

  /**
   * Get effective fee rate for creator
   */
  async getEffectiveFeeRate(creator: Address, creatorType: CreatorType): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'getEffectiveFeeRate',
        args: [creator, creatorType]
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching effective fee rate:', error);
      return BigInt(200); // Default 2%
    }
  }

  /**
   * Get tier bonus rate
   */
  async getTierBonusRate(tier: CreatorTier): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'getTierBonusRate',
        args: [tier]
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching tier bonus rate:', error);
      return BigInt(10000); // 1x (no bonus)
    }
  }

  /**
   * Get total creators
   */
  async getTotalCreators(): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'totalCreators'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching total creators:', error);
      return BigInt(0);
    }
  }

  /**
   * Get total fees distributed
   */
  async getTotalFeesDistributed(): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.creatorRevenueAddress,
        abi: CreatorRevenueShareAbi,
        functionName: 'totalFeesDistributed'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching total fees distributed:', error);
      return BigInt(0);
    }
  }

  // ============================================================================
  // Aggregated Functions
  // ============================================================================

  /**
   * Get creator with display values
   */
  async getCreatorWithDisplay(wallet: Address): Promise<CreatorDisplay | null> {
    const creator = await this.getCreator(wallet);
    if (!creator || !creator.isActive) return null;

    const nextTier = getNextTier(creator.tier);
    const progress = getTierProgress(creator.totalVolumeGenerated, creator.tier);
    const nextThreshold = nextTier !== null ? TIER_THRESHOLDS[nextTier] : BigInt(0);

    const registeredDate = new Date(Number(creator.registeredAt) * 1000);
    const memberSince = registeredDate.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric'
    });

    return {
      ...creator,
      tierLabel: getTierLabel(creator.tier),
      tierColor: getTierColor(creator.tier),
      typeLabel: getCreatorTypeLabel(creator.creatorType),
      totalVolumeFormatted: formatVolume(creator.totalVolumeGenerated),
      totalFeesEarnedFormatted: formatEther(creator.totalFeesEarned),
      pendingRewardsFormatted: formatEther(creator.pendingRewards),
      totalClaimedFormatted: formatEther(creator.totalClaimed),
      memberSince,
      nextTierProgress: progress,
      nextTierThreshold: nextThreshold
    };
  }

  /**
   * Get revenue history with display values
   */
  async getRevenueHistoryWithDisplay(wallet: Address): Promise<RevenueEntryDisplay[]> {
    const history = await this.getCreatorRevenueHistory(wallet);

    return history.map(entry => {
      const date = new Date(Number(entry.timestamp) * 1000);
      return {
        ...entry,
        amountFormatted: formatEther(entry.amount),
        dateFormatted: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        sourceLabel: getRevenueSourceLabel(entry.source)
      };
    });
  }

  /**
   * Get market fees with display values
   */
  async getMarketFeesWithDisplay(marketId: bigint): Promise<MarketFeesDisplay | null> {
    const fees = await this.getMarketFees(marketId);
    if (!fees) return null;

    const total = fees.totalFees;
    const creatorShare = total > BigInt(0)
      ? Number((fees.creatorFees * BigInt(100)) / total)
      : 0;

    return {
      ...fees,
      totalFeesFormatted: formatEther(fees.totalFees),
      creatorFeesFormatted: formatEther(fees.creatorFees),
      protocolFeesFormatted: formatEther(fees.protocolFees),
      lpFeesFormatted: formatEther(fees.lpFees),
      creatorShare
    };
  }

  /**
   * Get revenue breakdown by source
   */
  async getRevenueBreakdown(wallet: Address): Promise<RevenueBreakdown[]> {
    const history = await this.getCreatorRevenueHistory(wallet);
    const sourceMap = new Map<string, bigint>();

    for (const entry of history) {
      const current = sourceMap.get(entry.source) ?? BigInt(0);
      sourceMap.set(entry.source, current + entry.amount);
    }

    const total = Array.from(sourceMap.values()).reduce((a, b) => a + b, BigInt(0));
    const breakdown: RevenueBreakdown[] = [];

    for (const [source, amount] of sourceMap) {
      breakdown.push({
        source,
        amount,
        percentage: total > BigInt(0) ? Number((amount * BigInt(100)) / total) : 0,
        color: getRevenueSourceColor(source)
      });
    }

    return breakdown.sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * Get creator statistics summary
   */
  async getCreatorStats(wallet: Address): Promise<CreatorStats | null> {
    const creator = await this.getCreator(wallet);
    if (!creator) return null;

    const history = await this.getCreatorRevenueHistory(wallet);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const weekAgo = now - BigInt(7 * 24 * 3600);
    const monthAgo = now - BigInt(30 * 24 * 3600);

    let weeklyEarnings = BigInt(0);
    let monthlyEarnings = BigInt(0);

    for (const entry of history) {
      if (entry.timestamp >= weekAgo) {
        weeklyEarnings += entry.amount;
      }
      if (entry.timestamp >= monthAgo) {
        monthlyEarnings += entry.amount;
      }
    }

    const assetsCreated = Number(creator.marketsCreated) +
                          Number(creator.warriorsCreated) +
                          Number(creator.agentsOperated);

    const avgMarketVolume = creator.marketsCreated > BigInt(0)
      ? creator.totalVolumeGenerated / creator.marketsCreated
      : BigInt(0);

    return {
      totalEarnings: creator.totalFeesEarned,
      pendingRewards: creator.pendingRewards,
      totalVolume: creator.totalVolumeGenerated,
      assetsCreated,
      averageMarketVolume: avgMarketVolume,
      bestPerformingMarket: null,
      monthlyEarnings,
      weeklyEarnings
    };
  }

  /**
   * Get tier requirements and benefits
   */
  getTierInfo(tier: CreatorTier) {
    return {
      tier,
      label: getTierLabel(tier),
      color: getTierColor(tier),
      icon: getTierIcon(tier),
      threshold: TIER_THRESHOLDS[tier],
      benefits: getTierBenefits(tier)
    };
  }

  /**
   * Check if wallet is a registered creator
   */
  async isRegisteredCreator(wallet: Address): Promise<boolean> {
    const creator = await this.getCreator(wallet);
    return creator !== null && creator.isActive;
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Format amount to display string
   */
  formatAmount(amount: bigint): string {
    return formatEther(amount);
  }

  /**
   * Parse amount from string
   */
  parseAmount(amount: string): bigint {
    return parseEther(amount);
  }

  /**
   * Check token allowance
   */
  async checkAllowance(owner: Address): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: crownTokenAbi,
        functionName: 'allowance',
        args: [owner, this.creatorRevenueAddress]
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
      creatorRevenue: this.creatorRevenueAddress,
      crownToken: this.crownTokenAddress
    };
  }
}

export const creatorService = new CreatorService();
export default creatorService;
