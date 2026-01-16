/**
 * Arena Storage Service
 * Handles storing and retrieving prediction battle records via 0G Storage
 */

import {
  PredictionBattle,
  PredictionRound,
  WarriorTraits,
  RoundResult,
} from '../../types/predictionArena';

// ============================================
// TYPES
// ============================================

export interface BattleStorageRecord {
  version: string;
  battleId: string;
  timestamp: number;

  // Market context
  market: {
    externalId: string;
    source: 'polymarket' | 'kalshi';
    question: string;
  };

  // Warriors
  warriors: {
    id: number;
    owner: string;
    side: 'yes' | 'no';
    traits: WarriorTraits;
    finalScore: number;
  }[];

  // All rounds
  rounds: {
    roundNumber: number;
    warrior1: {
      argument: string;
      move: string;
      score: number;
      evidence: string[];
    };
    warrior2: {
      argument: string;
      move: string;
      score: number;
      evidence: string[];
    };
    roundWinner: 'warrior1' | 'warrior2' | 'draw';
    judgeReasoning: string;
  }[];

  // Outcome
  outcome: 'warrior1' | 'warrior2' | 'draw';
  totalScores: {
    warrior1: number;
    warrior2: number;
  };

  // Stakes
  stakes: string;
  winnerPayout?: string;

  // Betting pool
  betting?: {
    totalPool: string;
    warrior1Bets: string;
    warrior2Bets: string;
    totalBettors: number;
  };

  // Verification
  dataHash: string;
}

export interface StorageResponse {
  success: boolean;
  rootHash?: string;
  transactionHash?: string;
  dataHash?: string;
  message?: string;
  error?: string;
}

// ============================================
// STORAGE FUNCTIONS
// ============================================

/**
 * Store a completed battle record to 0G Storage
 */
export async function storeBattleRecord(
  battle: PredictionBattle,
  rounds: PredictionRound[],
  warrior1Traits: WarriorTraits,
  warrior2Traits: WarriorTraits,
  bettingData?: {
    totalPool: string;
    warrior1Bets: string;
    warrior2Bets: string;
    totalBettors: number;
  }
): Promise<StorageResponse> {
  try {
    // Build storage record
    const record: BattleStorageRecord = {
      version: '1.0.0',
      battleId: battle.id,
      timestamp: Date.now(),

      market: {
        externalId: battle.externalMarketId,
        source: battle.source as 'polymarket' | 'kalshi',
        question: battle.question,
      },

      warriors: [
        {
          id: battle.warrior1Id,
          owner: battle.warrior1Owner,
          side: 'yes',
          traits: warrior1Traits,
          finalScore: battle.warrior1Score,
        },
        {
          id: battle.warrior2Id,
          owner: battle.warrior2Owner,
          side: 'no',
          traits: warrior2Traits,
          finalScore: battle.warrior2Score,
        },
      ],

      rounds: rounds.map(r => ({
        roundNumber: r.roundNumber,
        warrior1: {
          argument: r.w1Argument || '',
          move: r.w1Move || '',
          score: r.w1Score,
          evidence: r.w1Evidence ? JSON.parse(r.w1Evidence) : [],
        },
        warrior2: {
          argument: r.w2Argument || '',
          move: r.w2Move || '',
          score: r.w2Score,
          evidence: r.w2Evidence ? JSON.parse(r.w2Evidence) : [],
        },
        roundWinner: r.roundWinner as 'warrior1' | 'warrior2' | 'draw',
        judgeReasoning: r.judgeReasoning || '',
      })),

      outcome: battle.warrior1Score > battle.warrior2Score
        ? 'warrior1'
        : battle.warrior2Score > battle.warrior1Score
        ? 'warrior2'
        : 'draw',

      totalScores: {
        warrior1: battle.warrior1Score,
        warrior2: battle.warrior2Score,
      },

      stakes: battle.stakes,
      betting: bettingData,

      dataHash: '', // Will be set by 0G Storage
    };

    // Store via 0G API
    const response = await fetch('/api/arena/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battle: record }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error || 'Failed to store battle record',
      };
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retrieve a battle record from 0G Storage
 */
export async function retrieveBattleRecord(
  rootHash: string
): Promise<BattleStorageRecord | null> {
  try {
    const response = await fetch(`/api/arena/storage?rootHash=${rootHash}`);

    if (!response.ok) {
      console.error('Failed to retrieve battle record');
      return null;
    }

    const data = await response.json();
    return data.data as BattleStorageRecord;
  } catch (error) {
    console.error('Error retrieving battle record:', error);
    return null;
  }
}

/**
 * Query battle records by warrior ID
 */
export async function queryBattlesByWarrior(
  warriorId: number,
  limit: number = 10
): Promise<BattleStorageRecord[]> {
  try {
    const response = await fetch('/api/arena/storage/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warriorIds: [warriorId.toString()],
        limit,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.battles || [];
  } catch (error) {
    console.error('Error querying battles:', error);
    return [];
  }
}

/**
 * Get analytics for a warrior from stored battles
 */
export async function getWarriorAnalytics(
  warriorId: number
): Promise<{
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgScore: number;
  preferredMoves: { move: string; count: number }[];
} | null> {
  try {
    const response = await fetch(
      `/api/arena/storage/query?type=analytics&warriorId=${warriorId}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.analytics;
  } catch (error) {
    console.error('Error getting warrior analytics:', error);
    return null;
  }
}

/**
 * Get matchup history between two warriors
 */
export async function getMatchupHistory(
  warrior1Id: number,
  warrior2Id: number
): Promise<{
  totalMatches: number;
  warrior1Wins: number;
  warrior2Wins: number;
  draws: number;
  recentBattles: { battleId: string; outcome: string; timestamp: number }[];
} | null> {
  try {
    const response = await fetch(
      `/api/arena/storage/query?type=matchup&warrior1Id=${warrior1Id}&warrior2Id=${warrior2Id}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.matchup;
  } catch (error) {
    console.error('Error getting matchup history:', error);
    return null;
  }
}

// ============================================
// VERIFICATION FUNCTIONS
// ============================================

/**
 * Verify a stored battle record's integrity
 */
export async function verifyBattleRecord(rootHash: string): Promise<{
  verified: boolean;
  record?: BattleStorageRecord;
  error?: string;
}> {
  try {
    const record = await retrieveBattleRecord(rootHash);

    if (!record) {
      return { verified: false, error: 'Record not found' };
    }

    // Basic validation
    if (!record.battleId || !record.warriors || record.warriors.length !== 2) {
      return { verified: false, error: 'Invalid record structure' };
    }

    if (!record.rounds || record.rounds.length === 0) {
      return { verified: false, error: 'No rounds in record' };
    }

    // Verify scores match
    const calculatedW1Score = record.rounds.reduce((sum, r) => sum + r.warrior1.score, 0);
    const calculatedW2Score = record.rounds.reduce((sum, r) => sum + r.warrior2.score, 0);

    if (calculatedW1Score !== record.totalScores.warrior1 ||
        calculatedW2Score !== record.totalScores.warrior2) {
      return { verified: false, error: 'Score mismatch detected' };
    }

    return { verified: true, record };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Generate a shareable proof link for a battle
 */
export function generateBattleProofLink(rootHash: string): string {
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  return `${baseUrl}/prediction-arena/proof/${rootHash}`;
}
