/**
 * Prediction Arena Types
 * Types for the warrior prediction debate system
 */

// ============================================
// ENUMS
// ============================================

export enum PredictionBattleStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum DebateMove {
  STRIKE = 'STRIKE',     // Direct factual attack (strength)
  TAUNT = 'TAUNT',       // Challenge credibility (charisma + wit)
  DODGE = 'DODGE',       // Reframe/deflect (defence)
  SPECIAL = 'SPECIAL',   // Novel insight (strength + charisma + wit)
  RECOVER = 'RECOVER',   // Acknowledge weakness, pivot (defence + charisma)
}

export enum MarketSource {
  POLYMARKET = 'polymarket',
  KALSHI = 'kalshi',
}

// ============================================
// WARRIOR TRAITS (from WarriorsNFT.sol)
// ============================================

export interface WarriorTraits {
  strength: number;   // 0-10000 (2 decimal precision)
  wit: number;        // 0-10000
  charisma: number;   // 0-10000
  defence: number;    // 0-10000
  luck: number;       // 0-10000
}

export interface WarriorMoves {
  strike: string;
  taunt: string;
  dodge: string;
  special: string;
  recover: string;
}

export interface Warrior {
  id: number;
  owner: string;
  traits: WarriorTraits;
  moves: WarriorMoves;
  ranking: 'UNRANKED' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
}

// ============================================
// BATTLE TYPES
// ============================================

export interface PredictionBattle {
  id: string;

  // External market
  externalMarketId: string;
  source: MarketSource;
  question: string;

  // Warriors
  warrior1Id: number;      // YES side
  warrior1Owner: string;
  warrior2Id: number;      // NO side
  warrior2Owner: string;

  // Stakes & scores
  stakes: string;          // CRwN amount
  warrior1Score: number;
  warrior2Score: number;

  // State
  status: PredictionBattleStatus;
  currentRound: number;

  // On-chain
  onChainBattleId?: string;
  txHash?: string;

  // 0G Storage
  battleDataHash?: string;

  // Timestamps
  createdAt: string;
  completedAt?: string;

  // Relations
  rounds?: PredictionRound[];
}

export interface PredictionRound {
  id: string;
  battleId: string;
  roundNumber: number;

  // Warrior 1 (YES) data
  w1Argument?: string;
  w1Evidence?: string;     // JSON array
  w1Move?: DebateMove;
  w1Confidence?: number;   // 0-100
  w1Score: number;

  // Warrior 2 (NO) data
  w2Argument?: string;
  w2Evidence?: string;
  w2Move?: DebateMove;
  w2Confidence?: number;
  w2Score: number;

  // Resolution
  roundWinner?: 'warrior1' | 'warrior2' | 'draw';
  judgeReasoning?: string;

  // 0G Storage
  argumentsHash?: string;

  // Timestamps
  startedAt: string;
  endedAt?: string;
}

// ============================================
// CHALLENGE TYPES
// ============================================

export interface CreateChallengeParams {
  warriorId: number;
  externalMarketId: string;
  source: MarketSource;
  question: string;
  sideYes: boolean;
  stakes: string;
  durationHours?: number;
}

export interface AcceptChallengeParams {
  battleId: string;
  warriorId: number;
}

// ============================================
// AI DEBATE TYPES
// ============================================

/** Real market data from synced ExternalMarket records (prices in 0-100 range) */
export interface RealMarketData {
  yesPrice: number;        // 0-100 (converted from basis points via /100)
  noPrice: number;         // 0-100
  volume: string;
  liquidity?: string;
  endTime: string;         // ISO string
  category?: string;
  source: MarketSource;
  // Cross-platform data (present for arbitrage battles)
  crossPlatformPrice?: number;  // Other platform's YES price (0-100)
  crossPlatformSource?: string;
  spread?: number;              // Absolute price difference between platforms
}

export interface DebateContext {
  marketQuestion: string;
  marketSource: MarketSource;
  side: 'yes' | 'no';
  roundNumber: number;
  previousRounds: PredictionRound[];
  opponentLastArgument?: string;
  opponentLastMove?: DebateMove;
  marketData?: RealMarketData;
  /** Optional AI-generated debate strategy from 0G inference */
  strategy?: {
    keyThesis: string;
    keyWeakness: string;
    bestEvidence: string;
    rhetoricalStyle: 'analytical' | 'aggressive' | 'persuasive' | 'defensive';
  };
}

export interface DebateEvidence {
  type: 'news' | 'data' | 'expert' | 'historical' | 'market';
  source: string;
  title: string;
  snippet: string;
  relevance: number;   // 0-100
  timestamp?: string;
  simulated?: boolean;  // true when evidence is AI-generated template, not real data
}

export interface GeneratedArgument {
  argument: string;
  evidence: DebateEvidence[];
  confidence: number;  // 0-100
  move: DebateMove;
  reasoning: string;   // Internal reasoning for move selection
}

export interface RoundResult {
  roundNumber: number;
  warrior1: GeneratedArgument;
  warrior2: GeneratedArgument;
  warrior1Score: number;
  warrior2Score: number;
  roundWinner: 'warrior1' | 'warrior2' | 'draw';
  judgeReasoning: string;
}

// ============================================
// SCORING TYPES
// ============================================

export interface TraitModifiers {
  strengthBonus: number;   // Applied to argument quality
  witBonus: number;        // Applied to rebuttal effectiveness
  charismaBonus: number;   // Applied to persuasiveness
  defenceBonus: number;    // Damage reduction from opponent
  luckBonus: number;       // Applied to evidence quality
}

export interface MoveEffectiveness {
  baseDamage: number;
  counters: DebateMove;
  counteredBy: DebateMove;
  traitScaling: keyof WarriorTraits;
}

export interface ScoreBreakdown {
  baseScore: number;
  traitBonus: number;
  moveMultiplier: number;
  counterBonus: number;
  finalScore: number;
}

// ============================================
// WARRIOR STATS
// ============================================

export interface WarriorArenaStats {
  id: string;
  warriorId: number;

  // Record
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;

  // Performance
  totalEarnings: string;
  avgScore?: number;

  // Streaks
  currentStreak: number;
  longestStreak: number;

  // Rating
  arenaRating: number;
  peakRating: number;

  // Category stats
  categoryStats?: Record<string, { wins: number; losses: number }>;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface BattlesResponse {
  battles: PredictionBattle[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateBattleResponse {
  battle: PredictionBattle;
  marketKey: string;
  message: string;
}

export interface SubmitRoundResponse {
  round: PredictionRound;
  battle: PredictionBattle;
  message: string;
}

// ============================================
// MOVE COUNTER MAP
// ============================================

export const MOVE_COUNTERS: Record<DebateMove, { counters: DebateMove; counteredBy: DebateMove }> = {
  [DebateMove.STRIKE]: {
    counters: DebateMove.DODGE,
    counteredBy: DebateMove.TAUNT,
  },
  [DebateMove.TAUNT]: {
    counters: DebateMove.STRIKE,
    counteredBy: DebateMove.SPECIAL,
  },
  [DebateMove.DODGE]: {
    counters: DebateMove.SPECIAL,
    counteredBy: DebateMove.RECOVER,
  },
  [DebateMove.SPECIAL]: {
    counters: DebateMove.TAUNT,
    counteredBy: DebateMove.STRIKE,
  },
  [DebateMove.RECOVER]: {
    counters: DebateMove.DODGE,
    counteredBy: DebateMove.TAUNT,
  },
};

// ============================================
// TRAIT SCALING FOR MOVES
// ============================================

export const MOVE_TRAIT_SCALING: Record<DebateMove, (keyof WarriorTraits)[]> = {
  [DebateMove.STRIKE]: ['strength'],
  [DebateMove.TAUNT]: ['charisma', 'wit'],
  [DebateMove.DODGE]: ['defence'],
  [DebateMove.SPECIAL]: ['strength', 'charisma', 'wit'],
  [DebateMove.RECOVER]: ['defence', 'charisma'],
};
