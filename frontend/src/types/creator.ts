/**
 * Creator Revenue Types
 * Type definitions for CreatorRevenueShare contract interactions
 */

import type { Address } from 'viem';

// ============================================================================
// Enums (matching ICreatorRevenueShare.sol)
// ============================================================================

export enum CreatorType {
  MARKET_CREATOR = 0,
  WARRIOR_CREATOR = 1,
  AGENT_OPERATOR = 2,
  LIQUIDITY_PROVIDER = 3
}

export enum CreatorTier {
  BRONZE = 0,
  SILVER = 1,
  GOLD = 2,
  PLATINUM = 3,
  DIAMOND = 4
}

// ============================================================================
// Structs (matching ICreatorRevenueShare.sol)
// ============================================================================

export interface Creator {
  wallet: Address;
  creatorType: CreatorType;
  tier: CreatorTier;
  totalVolumeGenerated: bigint;
  totalFeesEarned: bigint;
  pendingRewards: bigint;
  totalClaimed: bigint;
  marketsCreated: bigint;
  warriorsCreated: bigint;
  agentsOperated: bigint;
  liquidityProvided: bigint;
  registeredAt: bigint;
  lastClaimAt: bigint;
  isActive: boolean;
}

export interface RevenueEntry {
  marketId: bigint;
  amount: bigint;
  timestamp: bigint;
  source: string;
}

export interface MarketFees {
  marketId: bigint;
  marketCreator: Address;
  totalFees: bigint;
  creatorFees: bigint;
  protocolFees: bigint;
  lpFees: bigint;
}

// ============================================================================
// Frontend-specific types
// ============================================================================

/**
 * Creator with display values
 */
export interface CreatorDisplay extends Creator {
  tierLabel: string;
  tierColor: string;
  typeLabel: string;
  totalVolumeFormatted: string;
  totalFeesEarnedFormatted: string;
  pendingRewardsFormatted: string;
  totalClaimedFormatted: string;
  memberSince: string;
  nextTierProgress: number;  // 0-100
  nextTierThreshold: bigint;
}

/**
 * Revenue entry with display values
 */
export interface RevenueEntryDisplay extends RevenueEntry {
  amountFormatted: string;
  dateFormatted: string;
  sourceLabel: string;
}

/**
 * Market fees with display values
 */
export interface MarketFeesDisplay extends MarketFees {
  totalFeesFormatted: string;
  creatorFeesFormatted: string;
  protocolFeesFormatted: string;
  lpFeesFormatted: string;
  creatorShare: number;  // percentage
}

/**
 * Revenue breakdown by source
 */
export interface RevenueBreakdown {
  source: string;
  amount: bigint;
  percentage: number;
  color: string;
}

/**
 * Tier requirements
 */
export interface TierRequirements {
  tier: CreatorTier;
  minVolume: bigint;
  feeMultiplierBps: bigint;  // e.g., 10000 = 1x, 12000 = 1.2x
  benefits: string[];
}

/**
 * Creator statistics summary
 */
export interface CreatorStats {
  totalEarnings: bigint;
  pendingRewards: bigint;
  totalVolume: bigint;
  assetsCreated: number;
  averageMarketVolume: bigint;
  bestPerformingMarket: bigint | null;
  monthlyEarnings: bigint;
  weeklyEarnings: bigint;
}

/**
 * Revenue time series data
 */
export interface RevenueTimePoint {
  timestamp: bigint;
  cumulativeRevenue: bigint;
  dailyRevenue: bigint;
}

/**
 * Leaderboard entry
 */
export interface CreatorLeaderboardEntry {
  rank: number;
  wallet: Address;
  tier: CreatorTier;
  totalVolume: bigint;
  totalFees: bigint;
  marketsCreated: number;
  winRate: number;  // percentage of successful markets
}

/**
 * Asset created by creator
 */
export interface CreatedAsset {
  type: 'market' | 'warrior' | 'agent';
  id: bigint;
  name: string;
  createdAt: bigint;
  volumeGenerated: bigint;
  feesEarned: bigint;
  status: 'active' | 'resolved' | 'cancelled';
}

// ============================================================================
// Event types
// ============================================================================

export interface CreatorRegisteredEvent {
  creator: Address;
  creatorType: CreatorType;
  timestamp: bigint;
}

export interface FeeRecordedEvent {
  creator: Address;
  marketId: bigint;
  amount: bigint;
  source: string;
}

export interface FeeDistributedEvent {
  creator: Address;
  amount: bigint;
  creatorType: CreatorType;
}

export interface RewardsClaimedEvent {
  creator: Address;
  amount: bigint;
  timestamp: bigint;
}

export interface TierUpgradedEvent {
  creator: Address;
  oldTier: CreatorTier;
  newTier: CreatorTier;
}

export interface MarketCreatorSetEvent {
  marketId: bigint;
  creator: Address;
}

export interface WarriorCreatorSetEvent {
  warriorId: bigint;
  creator: Address;
}

// ============================================================================
// Fee configuration constants
// ============================================================================

export const FEE_RATES = {
  MARKET_CREATOR_BPS: 200,     // 2%
  WARRIOR_CREATOR_BPS: 100,    // 1%
  AGENT_OPERATOR_BPS: 50,      // 0.5%
  LP_PROVIDER_BPS: 100,        // 1%
  PROTOCOL_BPS: 50             // 0.5%
} as const;

export const TIER_THRESHOLDS: Record<CreatorTier, bigint> = {
  [CreatorTier.BRONZE]: BigInt(0),
  [CreatorTier.SILVER]: BigInt(1000) * BigInt(10 ** 18),      // 1,000 CRwN
  [CreatorTier.GOLD]: BigInt(10000) * BigInt(10 ** 18),       // 10,000 CRwN
  [CreatorTier.PLATINUM]: BigInt(100000) * BigInt(10 ** 18),  // 100,000 CRwN
  [CreatorTier.DIAMOND]: BigInt(1000000) * BigInt(10 ** 18)   // 1,000,000 CRwN
};

export const TIER_MULTIPLIERS: Record<CreatorTier, number> = {
  [CreatorTier.BRONZE]: 1.0,
  [CreatorTier.SILVER]: 1.1,
  [CreatorTier.GOLD]: 1.25,
  [CreatorTier.PLATINUM]: 1.5,
  [CreatorTier.DIAMOND]: 2.0
};

// ============================================================================
// Helper functions
// ============================================================================

export function getCreatorTypeLabel(type: CreatorType): string {
  const labels: Record<CreatorType, string> = {
    [CreatorType.MARKET_CREATOR]: 'Market Creator',
    [CreatorType.WARRIOR_CREATOR]: 'Warrior Creator',
    [CreatorType.AGENT_OPERATOR]: 'Agent Operator',
    [CreatorType.LIQUIDITY_PROVIDER]: 'Liquidity Provider'
  };
  return labels[type] ?? 'Unknown';
}

export function getTierLabel(tier: CreatorTier): string {
  const labels: Record<CreatorTier, string> = {
    [CreatorTier.BRONZE]: 'Bronze',
    [CreatorTier.SILVER]: 'Silver',
    [CreatorTier.GOLD]: 'Gold',
    [CreatorTier.PLATINUM]: 'Platinum',
    [CreatorTier.DIAMOND]: 'Diamond'
  };
  return labels[tier] ?? 'Unknown';
}

export function getTierColor(tier: CreatorTier): string {
  const colors: Record<CreatorTier, string> = {
    [CreatorTier.BRONZE]: '#CD7F32',
    [CreatorTier.SILVER]: '#C0C0C0',
    [CreatorTier.GOLD]: '#FFD700',
    [CreatorTier.PLATINUM]: '#E5E4E2',
    [CreatorTier.DIAMOND]: '#B9F2FF'
  };
  return colors[tier] ?? '#808080';
}

export function getTierIcon(tier: CreatorTier): string {
  const icons: Record<CreatorTier, string> = {
    [CreatorTier.BRONZE]: '🥉',
    [CreatorTier.SILVER]: '🥈',
    [CreatorTier.GOLD]: '🥇',
    [CreatorTier.PLATINUM]: '💎',
    [CreatorTier.DIAMOND]: '👑'
  };
  return icons[tier] ?? '⭐';
}

export function getNextTier(currentTier: CreatorTier): CreatorTier | null {
  if (currentTier === CreatorTier.DIAMOND) return null;
  return currentTier + 1;
}

export function getTierProgress(volume: bigint, currentTier: CreatorTier): number {
  const nextTier = getNextTier(currentTier);
  if (nextTier === null) return 100;

  const currentThreshold = TIER_THRESHOLDS[currentTier];
  const nextThreshold = TIER_THRESHOLDS[nextTier];
  const range = nextThreshold - currentThreshold;
  const progress = volume - currentThreshold;

  return Math.min(100, Math.max(0, Number((progress * BigInt(100)) / range)));
}

export function calculateCreatorFee(volume: bigint, tier: CreatorTier, type: CreatorType): bigint {
  let baseBps: number;
  switch (type) {
    case CreatorType.MARKET_CREATOR:
      baseBps = FEE_RATES.MARKET_CREATOR_BPS;
      break;
    case CreatorType.WARRIOR_CREATOR:
      baseBps = FEE_RATES.WARRIOR_CREATOR_BPS;
      break;
    case CreatorType.AGENT_OPERATOR:
      baseBps = FEE_RATES.AGENT_OPERATOR_BPS;
      break;
    case CreatorType.LIQUIDITY_PROVIDER:
      baseBps = FEE_RATES.LP_PROVIDER_BPS;
      break;
    default:
      baseBps = 0;
  }

  const multiplier = TIER_MULTIPLIERS[tier];
  const effectiveBps = Math.floor(baseBps * multiplier);

  return (volume * BigInt(effectiveBps)) / BigInt(10000);
}

export function getRevenueSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    'trade': 'Trading Fee',
    'bet': 'Betting Fee',
    'copy_trade': 'Copy Trade Fee',
    'lp': 'LP Fee',
    'market_creation': 'Market Creation',
    'warrior_bet': 'Warrior Bet'
  };
  return labels[source] ?? source;
}

export function getRevenueSourceColor(source: string): string {
  const colors: Record<string, string> = {
    'trade': '#3B82F6',      // blue
    'bet': '#10B981',        // green
    'copy_trade': '#8B5CF6', // purple
    'lp': '#F59E0B',         // amber
    'market_creation': '#EC4899', // pink
    'warrior_bet': '#EF4444' // red
  };
  return colors[source] ?? '#6B7280';
}

export function formatVolume(volume: bigint): string {
  const num = Number(volume) / 1e18;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

export function getTierBenefits(tier: CreatorTier): string[] {
  const benefits: Record<CreatorTier, string[]> = {
    [CreatorTier.BRONZE]: [
      'Base fee share (2%)',
      'Creator profile',
      'Basic analytics'
    ],
    [CreatorTier.SILVER]: [
      '10% bonus on fees',
      'Featured in weekly digest',
      'Priority support'
    ],
    [CreatorTier.GOLD]: [
      '25% bonus on fees',
      'Featured on homepage',
      'Early access to features',
      'Custom creator badge'
    ],
    [CreatorTier.PLATINUM]: [
      '50% bonus on fees',
      'Premium placement',
      'API access',
      'Monthly strategy call',
      'Exclusive Discord role'
    ],
    [CreatorTier.DIAMOND]: [
      '100% bonus on fees',
      'Top creator spotlight',
      'Governance voting power',
      'Revenue share from referrals',
      'Direct team access',
      'Co-marketing opportunities'
    ]
  };
  return benefits[tier] ?? [];
}
