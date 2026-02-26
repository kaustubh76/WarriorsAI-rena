/**
 * API Route: Arena Storage
 * Handles storing and retrieving prediction arena battles via 0G Storage
 */

import { NextResponse } from 'next/server';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { internalFetch } from '@/lib/api/internalFetch';
import { prisma } from '@/lib/prisma';

interface BattleStorageRecord {
  version: string;
  battleId: string;
  timestamp: number;
  market: {
    externalId: string;
    source: 'polymarket' | 'kalshi';
    question: string;
  };
  warriors: {
    id: number;
    owner: string;
    side: 'yes' | 'no';
    traits: {
      strength: number;
      wit: number;
      charisma: number;
      defence: number;
      luck: number;
    };
    finalScore: number;
  }[];
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
    roundWinner: string;
    judgeReasoning: string;
  }[];
  outcome: string;
  totalScores: {
    warrior1: number;
    warrior2: number;
  };
  stakes: string;
  betting?: {
    totalPool: string;
    warrior1Bets: string;
    warrior2Bets: string;
    totalBettors: number;
  };
  dataHash: string;
}

/**
 * POST /api/arena/storage
 * Store a completed battle record to 0G Storage
 */
export const POST = composeMiddleware([
  withRateLimit({
    prefix: 'arena-storage',
    ...RateLimitPresets.storageWrite,
  }),
  async (req, ctx) => {
    const body = await req.json();
    const { battle } = body as { battle: BattleStorageRecord };

    if (!battle || !battle.battleId) {
      throw ErrorResponses.badRequest('Battle data with battleId is required');
    }

    // Validate battle structure
    if (!battle.warriors || battle.warriors.length !== 2) {
      throw ErrorResponses.badRequest('Battle must have exactly 2 warriors');
    }

    if (!battle.rounds || battle.rounds.length === 0) {
      throw ErrorResponses.badRequest('Battle must have at least 1 round');
    }

    // Look up real market odds from DB (non-fatal: defaults to 50/50)
    let finalOdds = { yes: 50, no: 50 };
    try {
      const market = await prisma.externalMarket.findFirst({
        where: { externalId: battle.market.externalId },
        select: { yesPrice: true, noPrice: true },
      });
      if (market) {
        finalOdds = { yes: market.yesPrice / 100, no: market.noPrice / 100 };
      }
    } catch {
      // Non-fatal: use default 50/50 odds
    }

    // Prepare data for 0G storage in expected format
    const storageData = {
      battleId: `prediction_${battle.battleId}`,
      timestamp: battle.timestamp,
      warriors: battle.warriors.map(w => ({
        id: w.id.toString(),
        traits: w.traits,
        totalBattles: 0,
        wins: 0,
        losses: 0,
      })),
      rounds: battle.rounds.map(r => ({
        roundNumber: r.roundNumber,
        moves: [
          { warriorId: battle.warriors[0].id.toString(), move: r.warrior1.move.toLowerCase() },
          { warriorId: battle.warriors[1].id.toString(), move: r.warrior2.move.toLowerCase() },
        ],
        damage: [
          { warriorId: battle.warriors[0].id.toString(), damageDealt: r.warrior1.score, damageTaken: r.warrior2.score },
          { warriorId: battle.warriors[1].id.toString(), damageDealt: r.warrior2.score, damageTaken: r.warrior1.score },
        ],
        roundWinner: r.roundWinner === 'warrior1'
          ? battle.warriors[0].id.toString()
          : r.roundWinner === 'warrior2'
          ? battle.warriors[1].id.toString()
          : undefined,
      })),
      outcome: battle.outcome,
      totalDamage: {
        warrior1: battle.totalScores.warrior1,
        warrior2: battle.totalScores.warrior2,
      },
      totalRounds: battle.rounds.length,
      marketData: {
        marketId: battle.market.externalId,
        finalOdds,
        totalVolume: battle.stakes,
      },
      // Include full prediction data for retrieval
      _predictionData: battle,
    };

    // Store via existing 0G store endpoint
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim();
    const storeResponse = await internalFetch(`${baseUrl}/api/0g/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battle: storageData }),
    });

    if (!storeResponse.ok) {
      const errorData = await storeResponse.json();
      throw new Error(errorData.error || `Failed to store battle ${battle.battleId} to 0G`);
    }

    const storeResult = await storeResponse.json();

    // Update database with storage hash
    if (storeResult.rootHash) {
      await prisma.predictionBattle.update({
        where: { id: battle.battleId },
        data: { battleDataHash: storeResult.rootHash },
      });
    }

    return NextResponse.json({
      success: true,
      rootHash: storeResult.rootHash,
      transactionHash: storeResult.transactionHash,
      dataHash: storeResult.dataHash,
      message: `Battle ${battle.battleId} stored on 0G`,
    });
  },
], { errorContext: 'API:Arena:Storage:POST' });

/**
 * GET /api/arena/storage?rootHash=xxx
 * Retrieve a battle record from 0G Storage
 */
export const GET = composeMiddleware([
  withRateLimit({
    prefix: 'arena-storage-get',
    ...RateLimitPresets.flowExecution,
  }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const rootHash = searchParams.get('rootHash');

    if (!rootHash) {
      throw ErrorResponses.badRequest('rootHash is required');
    }

    // Retrieve via existing 0G store endpoint
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim();
    const getResponse = await internalFetch(`${baseUrl}/api/0g/store?rootHash=${rootHash}`);

    if (!getResponse.ok) {
      const errorData = await getResponse.json();
      throw new Error(errorData.error || `Failed to retrieve battle from 0G (rootHash: ${rootHash})`);
    }

    const result = await getResponse.json();

    // Extract prediction data if available
    const data = result.data?._predictionData || result.data;

    return NextResponse.json({
      success: true,
      rootHash,
      data,
    });
  },
], { errorContext: 'API:Arena:Storage:GET' });
