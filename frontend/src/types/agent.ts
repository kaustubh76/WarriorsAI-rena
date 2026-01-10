/**
 * AI Agent Types
 * Type definitions for AI Agent Registry contract interactions
 */

import type { Address } from 'viem';

// ============================================================================
// Enums (matching IAIAgentRegistry.sol)
// ============================================================================

export enum AgentStrategy {
  SUPERFORECASTER = 0,
  WARRIOR_ANALYST = 1,
  TREND_FOLLOWER = 2,
  MEAN_REVERSION = 3,
  MICRO_SPECIALIST = 4,
  CUSTOM = 5
}

export enum RiskProfile {
  CONSERVATIVE = 0,
  MODERATE = 1,
  AGGRESSIVE = 2,
  DEGENERATE = 3
}

export enum AgentTier {
  NOVICE = 0,
  SKILLED = 1,
  EXPERT = 2,
  ORACLE = 3
}

export enum Specialization {
  BATTLE_OUTCOMES = 0,
  ROUND_MARKETS = 1,
  MOVE_PREDICTIONS = 2,
  ALL = 3
}

// ============================================================================
// Structs (matching IAIAgentRegistry.sol)
// ============================================================================

export interface PersonaTraits {
  patience: number;    // 0-100
  conviction: number;  // 0-100
  contrarian: number;  // 0-100
  momentum: number;    // 0-100
}

export interface AIAgent {
  id: bigint;
  operator: Address;
  name: string;
  description: string;
  strategy: AgentStrategy;
  riskProfile: RiskProfile;
  specialization: Specialization;
  traits: PersonaTraits;
  stakedAmount: bigint;
  tier: AgentTier;
  isActive: boolean;
  copyTradingEnabled: boolean;
  createdAt: bigint;
  lastTradeAt: bigint;
}

export interface AgentPerformance {
  totalTrades: bigint;
  winningTrades: bigint;
  totalPnL: bigint;  // int256 in contract, but bigint in JS (can be negative)
  totalVolume: bigint;
  avgConfidence: bigint;
  currentStreak: bigint;
  bestStreak: bigint;
  accuracyBps: bigint;  // basis points (e.g., 7500 = 75%)
}

export interface CopyTradeConfig {
  agentId: bigint;
  maxAmountPerTrade: bigint;
  totalCopied: bigint;
  startedAt: bigint;
  isActive: boolean;
}

// ============================================================================
// Frontend-specific types
// ============================================================================

/**
 * Agent with computed display values
 */
export interface AIAgentDisplay extends AIAgent {
  // Computed values
  winRate: number;           // Percentage (0-100)
  pnlFormatted: string;      // Formatted PnL string (e.g., "+1,234.56")
  stakedFormatted: string;   // Formatted stake (e.g., "100 CRwN")
  tierLabel: string;         // Human readable tier
  strategyLabel: string;     // Human readable strategy
  riskLabel: string;         // Human readable risk profile
  specializationLabel: string;
  isOnline: boolean;         // Has traded in last 24h
  totalTrades: bigint;       // Total trades from performance data
  isOfficial: boolean;       // Whether this is an official protocol agent
  personaTraits: PersonaTraits; // Persona traits (alias for traits)
  followerCount: number;     // Number of followers

  // iNFT integration (0G Galileo Testnet)
  isINFT?: boolean;          // Whether this agent is an ERC-7857 iNFT
  inftTokenId?: bigint;      // Token ID on AIAgentINFT contract (if isINFT)
}

/**
 * Agent performance with computed metrics
 */
export interface AgentPerformanceDisplay extends AgentPerformance {
  winRate: number;           // Percentage (0-100)
  pnlFormatted: string;      // Formatted PnL
  volumeFormatted: string;   // Formatted volume
  avgConfidencePercent: number;
  streakText: string;        // e.g., "5 wins" or "2 losses"
}

/**
 * Copy trade settings form
 */
export interface CopyTradeSettings {
  agentId: bigint;
  maxAmountPerTrade: string;  // User input as string
  enabled: boolean;
}

/**
 * Agent registration form
 */
export interface AgentRegistrationForm {
  name: string;
  description: string;
  strategy: AgentStrategy;
  riskProfile: RiskProfile;
  specialization: Specialization;
  traits: PersonaTraits;
  stakeAmount: string;  // User input as string
  enableCopyTrading: boolean;
}

/**
 * Agent filter options
 */
export interface AgentFilters {
  tier?: AgentTier | 'all';
  strategy?: AgentStrategy | 'all';
  riskProfile?: RiskProfile | 'all';
  specialization?: Specialization | 'all';
  minWinRate?: number;
  minTrades?: number;
  onlyActive?: boolean;
  onlyCopyTradingEnabled?: boolean;
  search?: string;
}

/**
 * Agent sort options
 */
export type AgentSortField =
  | 'winRate'
  | 'totalPnL'
  | 'totalVolume'
  | 'totalTrades'
  | 'createdAt'
  | 'stakedAmount';

export interface AgentSortOptions {
  field: AgentSortField;
  direction: 'asc' | 'desc';
}

/**
 * Trade record (for history display)
 */
export interface AgentTradeRecord {
  agentId: bigint;
  marketId: bigint;
  timestamp: bigint;
  isYes: boolean;
  amount: bigint;
  sharesReceived: bigint;
  won: boolean | null;  // null if market not resolved
  pnl: bigint | null;
  confidence: bigint;
}

/**
 * Copy trade execution record
 */
export interface CopyTradeExecution {
  follower: Address;
  agentId: bigint;
  marketId: bigint;
  amount: bigint;
  timestamp: bigint;
  txHash: string;
}

// ============================================================================
// Utility types
// ============================================================================

/**
 * Agent event types (from contract events)
 */
export interface AgentRegisteredEvent {
  agentId: bigint;
  operator: Address;
  name: string;
  strategy: AgentStrategy;
  stakedAmount: bigint;
}

export interface TradeRecordedEvent {
  agentId: bigint;
  marketId: bigint;
  won: boolean;
  pnl: bigint;
  confidence: bigint;
}

export interface CopyTradeStartedEvent {
  follower: Address;
  agentId: bigint;
  maxAmount: bigint;
}

export interface CopyTradeExecutedEvent {
  follower: Address;
  agentId: bigint;
  marketId: bigint;
  amount: bigint;
}

// ============================================================================
// Helper functions
// ============================================================================

export function getStrategyLabel(strategy: AgentStrategy): string {
  const labels: Record<AgentStrategy, string> = {
    [AgentStrategy.SUPERFORECASTER]: 'Superforecaster',
    [AgentStrategy.WARRIOR_ANALYST]: 'Warrior Analyst',
    [AgentStrategy.TREND_FOLLOWER]: 'Trend Follower',
    [AgentStrategy.MEAN_REVERSION]: 'Mean Reversion',
    [AgentStrategy.MICRO_SPECIALIST]: 'Micro Specialist',
    [AgentStrategy.CUSTOM]: 'Custom'
  };
  return labels[strategy] ?? 'Unknown';
}

export function getRiskLabel(risk: RiskProfile): string {
  const labels: Record<RiskProfile, string> = {
    [RiskProfile.CONSERVATIVE]: 'Conservative',
    [RiskProfile.MODERATE]: 'Moderate',
    [RiskProfile.AGGRESSIVE]: 'Aggressive',
    [RiskProfile.DEGENERATE]: 'Degen'
  };
  return labels[risk] ?? 'Unknown';
}

export function getTierLabel(tier: AgentTier): string {
  const labels: Record<AgentTier, string> = {
    [AgentTier.NOVICE]: 'Novice',
    [AgentTier.SKILLED]: 'Skilled',
    [AgentTier.EXPERT]: 'Expert',
    [AgentTier.ORACLE]: 'Oracle'
  };
  return labels[tier] ?? 'Unknown';
}

export function getSpecializationLabel(spec: Specialization): string {
  const labels: Record<Specialization, string> = {
    [Specialization.BATTLE_OUTCOMES]: 'Battle Outcomes',
    [Specialization.ROUND_MARKETS]: 'Round Markets',
    [Specialization.MOVE_PREDICTIONS]: 'Move Predictions',
    [Specialization.ALL]: 'All Markets'
  };
  return labels[spec] ?? 'Unknown';
}

export function getTierColor(tier: AgentTier): string {
  const colors: Record<AgentTier, string> = {
    [AgentTier.NOVICE]: 'gray',
    [AgentTier.SKILLED]: 'blue',
    [AgentTier.EXPERT]: 'purple',
    [AgentTier.ORACLE]: 'gold'
  };
  return colors[tier] ?? 'gray';
}

export function calculateWinRate(performance: AgentPerformance): number {
  if (performance.totalTrades === BigInt(0)) return 0;
  return Number((performance.winningTrades * BigInt(100)) / performance.totalTrades);
}
