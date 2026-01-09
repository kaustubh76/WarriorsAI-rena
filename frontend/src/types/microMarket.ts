/**
 * Micro Market Types
 * Type definitions for MicroMarketFactory contract interactions
 */

import type { Address } from 'viem';

// ============================================================================
// Enums (matching IMicroMarketFactory.sol)
// ============================================================================

export enum MicroMarketType {
  ROUND_WINNER = 0,
  MOVE_PREDICTION = 1,
  DAMAGE_THRESHOLD = 2,
  FIRST_BLOOD = 3,
  COMEBACK = 4,
  PERFECT_ROUND = 5,
  CRITICAL_HIT = 6,
  DOMINANT_WIN = 7
}

export enum PlayerMoves {
  STRIKE = 0,
  TAUNT = 1,
  DODGE = 2,
  SPECIAL = 3,
  RECOVER = 4
}

export enum MicroMarketStatus {
  ACTIVE = 0,
  PAUSED = 1,
  RESOLVED = 2,
  CANCELLED = 3
}

export enum MicroMarketOutcome {
  UNDECIDED = 0,
  YES = 1,
  NO = 2,
  DRAW = 3,
  INVALID = 4
}

// ============================================================================
// Structs (matching IMicroMarketFactory.sol)
// ============================================================================

export interface MicroMarket {
  id: bigint;
  battleId: bigint;
  parentMarketId: bigint;
  marketType: MicroMarketType;
  roundNumber: number;  // uint8
  warrior1Id: bigint;
  warrior2Id: bigint;
  targetMove: PlayerMoves;
  threshold: bigint;
  question: string;
  endTime: bigint;
  resolutionTime: bigint;
  status: MicroMarketStatus;
  outcome: MicroMarketOutcome;
  yesPool: bigint;
  noPool: bigint;
  totalVolume: bigint;
  creator: Address;
  createdAt: bigint;
}

export interface MicroMarketPosition {
  yesTokens: bigint;
  noTokens: bigint;
  totalInvested: bigint;
  hasClaimed: boolean;
}

export interface RoundData {
  roundNumber: number;  // uint8
  warrior1Damage: bigint;
  warrior2Damage: bigint;
  warrior1Move: PlayerMoves;
  warrior2Move: PlayerMoves;
  warrior1Dodged: boolean;
  warrior2Dodged: boolean;
  timestamp: bigint;
  isResolved: boolean;
}

// ============================================================================
// Frontend-specific types
// ============================================================================

/**
 * Micro market with computed display values
 */
export interface MicroMarketDisplay extends MicroMarket {
  // Computed values
  yesPrice: number;          // 0-100 percentage
  noPrice: number;           // 0-100 percentage
  totalVolumeFormatted: string;
  timeRemaining: string;     // e.g., "2h 30m" or "Ended"
  statusLabel: string;
  outcomeLabel: string;
  typeLabel: string;
  roundLabel: string;        // e.g., "Round 3"
  isExpired: boolean;
  canTrade: boolean;
}

/**
 * Position with computed display values
 */
export interface MicroMarketPositionDisplay extends MicroMarketPosition {
  yesTokensFormatted: string;
  noTokensFormatted: string;
  totalInvestedFormatted: string;
  potentialPayout: bigint;
  potentialPayoutFormatted: string;
}

/**
 * Grouped micro markets by type for a battle
 */
export interface BattleMicroMarkets {
  battleId: bigint;
  warrior1Id: bigint;
  warrior2Id: bigint;
  roundWinners: MicroMarket[];     // One per round
  movePredictions: MicroMarket[];  // Move-based markets
  damageThresholds: MicroMarket[]; // Damage threshold markets
  specialMarkets: MicroMarket[];   // First blood, comeback, etc.
}

/**
 * Grouped by round for display
 */
export interface RoundMarkets {
  roundNumber: number;
  markets: MicroMarket[];
  roundData: RoundData | null;
  isActive: boolean;
  isResolved: boolean;
}

/**
 * Trade form input
 */
export interface MicroMarketTradeInput {
  marketId: bigint;
  isYes: boolean;
  amount: string;  // User input as string
  slippage: number; // Percentage (e.g., 1 = 1%)
}

/**
 * Trade quote response
 */
export interface MicroMarketTradeQuote {
  tokensOut: bigint;
  priceImpact: number;
  effectivePrice: number;
  fee: bigint;
}

/**
 * Filter options for micro markets
 */
export interface MicroMarketFilters {
  battleId?: bigint;
  type?: MicroMarketType | 'all';
  status?: MicroMarketStatus | 'all';
  roundNumber?: number | 'all';
  hasPosition?: boolean;
}

/**
 * Sort options
 */
export type MicroMarketSortField =
  | 'endTime'
  | 'totalVolume'
  | 'yesPrice'
  | 'roundNumber'
  | 'createdAt';

export interface MicroMarketSortOptions {
  field: MicroMarketSortField;
  direction: 'asc' | 'desc';
}

// ============================================================================
// Event types
// ============================================================================

export interface MicroMarketCreatedEvent {
  marketId: bigint;
  battleId: bigint;
  marketType: MicroMarketType;
  roundNumber: number;
  question: string;
}

export interface RoundStartedEvent {
  battleId: bigint;
  round: number;
  timestamp: bigint;
}

export interface MoveExecutedEvent {
  battleId: bigint;
  warriorId: bigint;
  move: PlayerMoves;
  round: number;
}

export interface DamageDealtEvent {
  battleId: bigint;
  attackerId: bigint;
  damage: bigint;
  round: number;
}

export interface RoundResolvedEvent {
  battleId: bigint;
  round: number;
  warrior1Damage: bigint;
  warrior2Damage: bigint;
}

export interface MicroMarketResolvedEvent {
  marketId: bigint;
  outcome: MicroMarketOutcome;
}

// ============================================================================
// Helper functions
// ============================================================================

export function getMarketTypeLabel(type: MicroMarketType): string {
  const labels: Record<MicroMarketType, string> = {
    [MicroMarketType.ROUND_WINNER]: 'Round Winner',
    [MicroMarketType.MOVE_PREDICTION]: 'Move Prediction',
    [MicroMarketType.DAMAGE_THRESHOLD]: 'Damage Threshold',
    [MicroMarketType.FIRST_BLOOD]: 'First Blood',
    [MicroMarketType.COMEBACK]: 'Comeback',
    [MicroMarketType.PERFECT_ROUND]: 'Perfect Round',
    [MicroMarketType.CRITICAL_HIT]: 'Critical Hit',
    [MicroMarketType.DOMINANT_WIN]: 'Dominant Win'
  };
  return labels[type] ?? 'Unknown';
}

export function getMoveLabel(move: PlayerMoves): string {
  const labels: Record<PlayerMoves, string> = {
    [PlayerMoves.STRIKE]: 'Strike',
    [PlayerMoves.TAUNT]: 'Taunt',
    [PlayerMoves.DODGE]: 'Dodge',
    [PlayerMoves.SPECIAL]: 'Special',
    [PlayerMoves.RECOVER]: 'Recover'
  };
  return labels[move] ?? 'Unknown';
}

export function getMoveIcon(move: PlayerMoves): string {
  const icons: Record<PlayerMoves, string> = {
    [PlayerMoves.STRIKE]: '⚔️',
    [PlayerMoves.TAUNT]: '😤',
    [PlayerMoves.DODGE]: '💨',
    [PlayerMoves.SPECIAL]: '✨',
    [PlayerMoves.RECOVER]: '💚'
  };
  return icons[move] ?? '❓';
}

export function getMarketStatusLabel(status: MicroMarketStatus): string {
  const labels: Record<MicroMarketStatus, string> = {
    [MicroMarketStatus.ACTIVE]: 'Active',
    [MicroMarketStatus.PAUSED]: 'Paused',
    [MicroMarketStatus.RESOLVED]: 'Resolved',
    [MicroMarketStatus.CANCELLED]: 'Cancelled'
  };
  return labels[status] ?? 'Unknown';
}

export function getOutcomeLabel(outcome: MicroMarketOutcome): string {
  const labels: Record<MicroMarketOutcome, string> = {
    [MicroMarketOutcome.UNDECIDED]: 'Pending',
    [MicroMarketOutcome.YES]: 'Yes',
    [MicroMarketOutcome.NO]: 'No',
    [MicroMarketOutcome.DRAW]: 'Draw',
    [MicroMarketOutcome.INVALID]: 'Invalid'
  };
  return labels[outcome] ?? 'Unknown';
}

export function getMarketTypeColor(type: MicroMarketType): string {
  const colors: Record<MicroMarketType, string> = {
    [MicroMarketType.ROUND_WINNER]: 'blue',
    [MicroMarketType.MOVE_PREDICTION]: 'purple',
    [MicroMarketType.DAMAGE_THRESHOLD]: 'red',
    [MicroMarketType.FIRST_BLOOD]: 'orange',
    [MicroMarketType.COMEBACK]: 'green',
    [MicroMarketType.PERFECT_ROUND]: 'gold',
    [MicroMarketType.CRITICAL_HIT]: 'pink',
    [MicroMarketType.DOMINANT_WIN]: 'cyan'
  };
  return colors[type] ?? 'gray';
}

export function calculateMicroMarketPrices(market: MicroMarket): { yesPrice: number; noPrice: number } {
  const total = market.yesPool + market.noPool;
  if (total === BigInt(0)) {
    return { yesPrice: 50, noPrice: 50 };
  }
  const yesPrice = Number((market.yesPool * BigInt(100)) / total);
  const noPrice = 100 - yesPrice;
  return { yesPrice, noPrice };
}

export function isMarketTradeable(market: MicroMarket): boolean {
  return (
    market.status === MicroMarketStatus.ACTIVE &&
    BigInt(Date.now()) / BigInt(1000) < market.endTime
  );
}

export function formatTimeRemaining(endTime: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now >= endTime) return 'Ended';

  const remaining = Number(endTime - now);
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${remaining}s`;
}
