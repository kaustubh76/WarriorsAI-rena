/**
 * 0G Network Type Definitions
 * Types for 0G Compute Network and Storage integration
 */

import type { Address } from 'viem';

// ============================================================================
// 0G Network Configuration
// ============================================================================

export interface ZeroGConfig {
  computeRpc: string;
  chainId: number;
  storageIndexer: string;
  storageApiUrl: string;
}

export const ZERO_G_TESTNET_CONFIG: ZeroGConfig = {
  computeRpc: 'https://evmrpc-testnet.0g.ai',
  chainId: 16602, // 0G Galileo Testnet
  storageIndexer: 'https://indexer-storage-testnet-turbo.0g.ai',
  storageApiUrl: process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001'
};

// ============================================================================
// Inference Types
// ============================================================================

export interface InferenceRequest {
  agentId?: bigint;
  prompt: string;
  model?: string;
  context?: BattleDataIndex[];
  maxTokens?: number;
  temperature?: number;
}

export interface InferenceResult {
  chatId: string;
  response: string;
  provider: Address;
  timestamp: number;
  proof: InferenceProof;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost: string; // in OG tokens
  };
}

export interface InferenceProof {
  signature: string;
  attestation?: string; // TEE attestation (optional, depends on provider)
  modelHash: string;
  inputHash: string;
  outputHash: string;
  providerAddress: Address;
}

export interface PredictionResult {
  outcome: 'yes' | 'no' | 'draw';
  confidence: number; // 0-100
  reasoning: string;
  chatId: string;
  proof: InferenceProof;
}

export interface ReasoningResult {
  reasoning: string;
  evidence: string[];
  confidence: number;
  chatId: string;
  proof: InferenceProof;
}

// ============================================================================
// Battle Data Types (for RAG Storage)
// ============================================================================

export interface WarriorTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

export interface WarriorData {
  id: bigint;
  name?: string;
  traits: WarriorTraits;
  ranking?: number;
  totalBattles: number;
  wins: number;
  losses: number;
}

export type PlayerMoves = 'strike' | 'taunt' | 'dodge' | 'recover' | 'special_move';

export interface RoundMove {
  warriorId: bigint;
  move: PlayerMoves;
}

export interface RoundDamage {
  warriorId: bigint;
  damageDealt: number;
  damageTaken: number;
}

export interface RoundData {
  roundNumber: number;
  moves: RoundMove[];
  damage: RoundDamage[];
  roundWinner?: bigint;
}

export interface MarketDataSnapshot {
  marketId?: bigint;
  finalOdds: { yes: number; no: number };
  totalVolume: bigint;
  aiPredictionAccuracy?: number;
}

export interface BattleDataIndex {
  battleId: bigint;
  timestamp: number;

  // Warrior data
  warriors: WarriorData[];

  // Round-by-round data (for micro-markets)
  rounds: RoundData[];

  // Outcome
  outcome: 'warrior1' | 'warrior2' | 'draw';
  totalDamage: {
    warrior1: number;
    warrior2: number;
  };
  totalRounds: number;

  // Market data (for training)
  marketData?: MarketDataSnapshot;

  // Storage metadata
  rootHash?: string;
  storedAt?: number;
}

// ============================================================================
// Battle Query Types
// ============================================================================

export interface BattleQuery {
  warriorIds?: bigint[];
  dateRange?: {
    start: number;
    end: number;
  };
  outcome?: 'warrior1' | 'warrior2' | 'draw';
  minVolume?: bigint;
  limit?: number;
  offset?: number;
}

export interface WarriorAnalytics {
  warriorId: bigint;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  preferredMoves: {
    move: PlayerMoves;
    percentage: number;
  }[];
  strongAgainst: bigint[];
  weakAgainst: bigint[];
}

export interface MatchupHistory {
  warrior1Id: bigint;
  warrior2Id: bigint;
  totalMatches: number;
  warrior1Wins: number;
  warrior2Wins: number;
  draws: number;
  battles: BattleDataIndex[];
}

// ============================================================================
// AI Provider Types
// ============================================================================

export interface AIProvider {
  address: Address;
  name: string;
  model: string;
  endpoint: string;
  isActive: boolean;
  serviceType: 'chatbot' | 'inference' | 'embedding';
  inputPrice: bigint;
  outputPrice: bigint;
  verifiability?: 'none' | 'teeml' | 'zkml';
}

export interface LedgerInfo {
  balance: bigint;
  totalSpent: bigint;
  createdAt: number;
}

// ============================================================================
// Debate Types (0G-specific)
// ============================================================================

export interface DebatePredictionRequest {
  debateId: bigint;
  marketId: bigint;
  battleId: bigint;
  agentId: bigint;
  battleData: BattleDataIndex;
}

export interface DebateReasoningRequest {
  debateId: bigint;
  agentId: bigint;
  phase: 'prediction' | 'evidence' | 'rebuttal';
  context: {
    battleData: BattleDataIndex;
    otherPredictions?: {
      agentId: bigint;
      outcome: string;
      reasoning: string;
    }[];
  };
}

export interface DebateRebuttalRequest {
  debateId: bigint;
  agentId: bigint;
  targetAgentId: bigint;
  targetPrediction: {
    outcome: string;
    reasoning: string;
    confidence: number;
  };
  battleData: BattleDataIndex;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageUploadResult {
  rootHash: string;
  transactionHash: string;
  message: string;
}

export interface StorageDownloadResult {
  data: BattleDataIndex | string;
  rootHash: string;
}

export interface StorageStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  rpc: string;
  indexer: string;
  network: {
    healthy: boolean;
    connectedPeers: number;
    error?: string;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ZeroGInferenceResponse {
  success: boolean;
  result?: InferenceResult;
  error?: string;
}

export interface ZeroGStorageResponse {
  success: boolean;
  rootHash?: string;
  data?: BattleDataIndex;
  error?: string;
}

export interface ZeroGQueryResponse {
  success: boolean;
  battles?: BattleDataIndex[];
  analytics?: WarriorAnalytics;
  matchup?: MatchupHistory;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert PlayerMoves enum to string
 */
export function playerMoveToString(move: number): PlayerMoves {
  const moves: PlayerMoves[] = ['strike', 'taunt', 'dodge', 'recover', 'special_move'];
  return moves[move] || 'strike';
}

/**
 * Convert string to PlayerMoves enum value
 */
export function stringToPlayerMove(move: PlayerMoves): number {
  const moves: PlayerMoves[] = ['strike', 'taunt', 'dodge', 'recover', 'special_move'];
  return moves.indexOf(move);
}

/**
 * Calculate win rate from analytics
 */
export function calculateWinRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

/**
 * Format battle outcome for display
 */
export function formatBattleOutcome(outcome: 'warrior1' | 'warrior2' | 'draw'): string {
  switch (outcome) {
    case 'warrior1':
      return 'Warrior 1 Wins';
    case 'warrior2':
      return 'Warrior 2 Wins';
    case 'draw':
      return 'Draw';
    default:
      return 'Unknown';
  }
}

/**
 * Create empty battle data index
 */
export function createEmptyBattleData(battleId: bigint): BattleDataIndex {
  return {
    battleId,
    timestamp: Date.now(),
    warriors: [],
    rounds: [],
    outcome: 'draw',
    totalDamage: { warrior1: 0, warrior2: 0 },
    totalRounds: 0
  };
}

/**
 * Validate battle data index
 */
export function validateBattleData(data: BattleDataIndex): boolean {
  return (
    data.battleId !== undefined &&
    data.timestamp > 0 &&
    data.warriors.length === 2 &&
    data.rounds.length > 0 &&
    ['warrior1', 'warrior2', 'draw'].includes(data.outcome)
  );
}

/**
 * Serialize bigint for JSON storage
 */
export function serializeBattleData(data: BattleDataIndex): string {
  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

/**
 * Deserialize battle data from JSON
 */
export function deserializeBattleData(json: string): BattleDataIndex {
  return JSON.parse(json, (key, value) => {
    // Convert known bigint fields back
    if (['battleId', 'id', 'warriorId', 'totalVolume', 'marketId'].includes(key) && typeof value === 'string') {
      return BigInt(value);
    }
    return value;
  });
}
