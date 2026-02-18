import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { executeDebateRound, executeFullBattle } from '../../../../../../services/arena/debateService';
import { WarriorTraits, MarketSource, PredictionRound } from '../../../../../../types/predictionArena';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

const prisma = new PrismaClient();

/**
 * Store completed battle to 0G Storage
 */
async function storeBattleTo0G(
  battle: any,
  rounds: any[],
  w1Traits: WarriorTraits,
  w2Traits: WarriorTraits
): Promise<{ rootHash?: string; success: boolean }> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const battleRecord = {
    version: '1.0.0',
    battleId: battle.id,
    timestamp: Date.now(),
    market: {
      externalId: battle.externalMarketId,
      source: battle.source,
      question: battle.question,
    },
    warriors: [
      {
        id: battle.warrior1Id,
        owner: battle.warrior1Owner,
        side: 'yes',
        traits: w1Traits,
        finalScore: battle.warrior1Score,
      },
      {
        id: battle.warrior2Id,
        owner: battle.warrior2Owner,
        side: 'no',
        traits: w2Traits,
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
      roundWinner: r.roundWinner,
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
    dataHash: '',
  };

  const response = await fetch(`${baseUrl}/api/arena/storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle: battleRecord }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to store to 0G');
  }

  return await response.json();
}

/**
 * POST /api/arena/battles/[id]/execute
 * Execute a battle round or full battle
 */
export const POST = composeMiddleware([
  withRateLimit({
    prefix: 'arena-battles-execute',
    ...RateLimitPresets.storageWrite,
  }),
  async (req, ctx) => {
    const battleId = ctx.params?.id;
    if (!battleId) {
      throw ErrorResponses.badRequest('Missing battle ID');
    }

    const body = await req.json();
    const { mode = 'round', warrior1Traits, warrior2Traits } = body;

    // Fetch battle
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    if (!battle) {
      throw ErrorResponses.notFound('Battle not found');
    }

    if (battle.status !== 'active') {
      throw ErrorResponses.badRequest(`Battle is not active (status: ${battle.status})`);
    }

    // Parse traits from request or use defaults
    const w1Traits: WarriorTraits = warrior1Traits || {
      strength: 5000,
      wit: 5000,
      charisma: 5000,
      defence: 5000,
      luck: 5000,
    };

    const w2Traits: WarriorTraits = warrior2Traits || {
      strength: 5000,
      wit: 5000,
      charisma: 5000,
      defence: 5000,
      luck: 5000,
    };

    const marketSource = battle.source as MarketSource;

    if (mode === 'full') {
      // Execute all remaining rounds
      const fullResult = executeFullBattle(
        w1Traits,
        w2Traits,
        battle.question,
        marketSource
      );

      // Save all rounds to database
      for (let i = 0; i < fullResult.rounds.length; i++) {
        const roundResult = fullResult.rounds[i];
        const roundNumber = i + 1;

        await prisma.predictionRound.upsert({
          where: {
            battleId_roundNumber: {
              battleId,
              roundNumber,
            },
          },
          update: {
            w1Argument: roundResult.warrior1.argument,
            w1Evidence: JSON.stringify(roundResult.warrior1.evidence),
            w1Move: roundResult.warrior1.move,
            w1Score: roundResult.warrior1Score,
            w2Argument: roundResult.warrior2.argument,
            w2Evidence: JSON.stringify(roundResult.warrior2.evidence),
            w2Move: roundResult.warrior2.move,
            w2Score: roundResult.warrior2Score,
            roundWinner: roundResult.roundWinner,
            judgeReasoning: roundResult.judgeReasoning,
            endedAt: new Date(),
          },
          create: {
            battleId,
            roundNumber,
            w1Argument: roundResult.warrior1.argument,
            w1Evidence: JSON.stringify(roundResult.warrior1.evidence),
            w1Move: roundResult.warrior1.move,
            w1Score: roundResult.warrior1Score,
            w2Argument: roundResult.warrior2.argument,
            w2Evidence: JSON.stringify(roundResult.warrior2.evidence),
            w2Move: roundResult.warrior2.move,
            w2Score: roundResult.warrior2Score,
            roundWinner: roundResult.roundWinner,
            judgeReasoning: roundResult.judgeReasoning,
            endedAt: new Date(),
          },
        });
      }

      // Update battle
      const updatedBattle = await prisma.predictionBattle.update({
        where: { id: battleId },
        data: {
          warrior1Score: fullResult.warrior1TotalScore,
          warrior2Score: fullResult.warrior2TotalScore,
          currentRound: 6,
          status: 'completed',
          completedAt: new Date(),
        },
        include: { rounds: true },
      });

      // Update warrior stats
      await updateWarriorStats(
        battle.warrior1Id,
        battle.warrior2Id,
        fullResult.warrior1TotalScore,
        fullResult.warrior2TotalScore
      );

      // Store battle record to 0G Storage
      let storageResult = null;
      try {
        storageResult = await storeBattleTo0G(
          updatedBattle,
          updatedBattle.rounds,
          w1Traits,
          w2Traits
        );
      } catch (storageError) {
        // Log with context for debugging - storage failures are non-critical but should be investigated
        console.warn(`[Battle ${battle.id}] Failed to store battle to 0G Storage:`, {
          battleId: battle.id,
          warrior1Id: battle.warrior1Id,
          warrior2Id: battle.warrior2Id,
          error: storageError instanceof Error ? storageError.message : 'Unknown error',
        });
      }

      return NextResponse.json({
        battle: updatedBattle,
        result: fullResult,
        message: 'Battle completed!',
        storage: storageResult,
      });
    }

    // Execute single round
    const roundNumber = battle.currentRound;

    if (roundNumber > 5) {
      throw ErrorResponses.badRequest('Battle already completed');
    }

    // Convert existing rounds to format expected by debate service
    const previousRounds: PredictionRound[] = battle.rounds.map(r => ({
      id: r.id,
      battleId: r.battleId,
      roundNumber: r.roundNumber,
      w1Argument: r.w1Argument || undefined,
      w1Evidence: r.w1Evidence || undefined,
      w1Move: r.w1Move as any,
      w1Score: r.w1Score,
      w2Argument: r.w2Argument || undefined,
      w2Evidence: r.w2Evidence || undefined,
      w2Move: r.w2Move as any,
      w2Score: r.w2Score,
      roundWinner: r.roundWinner as any,
      judgeReasoning: r.judgeReasoning || undefined,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString(),
    }));

    const roundResult = executeDebateRound(
      w1Traits,
      w2Traits,
      {
        marketQuestion: battle.question,
        marketSource,
        roundNumber,
        previousRounds,
      }
    );

    // Save round
    const round = await prisma.predictionRound.create({
      data: {
        battleId,
        roundNumber,
        w1Argument: roundResult.warrior1.argument,
        w1Evidence: JSON.stringify(roundResult.warrior1.evidence),
        w1Move: roundResult.warrior1.move,
        w1Score: roundResult.warrior1Score,
        w2Argument: roundResult.warrior2.argument,
        w2Evidence: JSON.stringify(roundResult.warrior2.evidence),
        w2Move: roundResult.warrior2.move,
        w2Score: roundResult.warrior2Score,
        roundWinner: roundResult.roundWinner,
        judgeReasoning: roundResult.judgeReasoning,
        endedAt: new Date(),
      },
    });

    // Update battle
    const isComplete = roundNumber >= 5;
    const newW1Score = battle.warrior1Score + roundResult.warrior1Score;
    const newW2Score = battle.warrior2Score + roundResult.warrior2Score;

    const updatedBattle = await prisma.predictionBattle.update({
      where: { id: battleId },
      data: {
        warrior1Score: newW1Score,
        warrior2Score: newW2Score,
        currentRound: roundNumber + 1,
        status: isComplete ? 'completed' : 'active',
        completedAt: isComplete ? new Date() : undefined,
      },
      include: { rounds: true },
    });

    // Update stats if complete
    let storageResult = null;
    if (isComplete) {
      await updateWarriorStats(
        battle.warrior1Id,
        battle.warrior2Id,
        newW1Score,
        newW2Score
      );

      // Store battle record to 0G Storage
      try {
        storageResult = await storeBattleTo0G(
          updatedBattle,
          updatedBattle.rounds,
          w1Traits,
          w2Traits
        );
      } catch (storageError) {
        console.warn('Failed to store battle to 0G:', storageError);
      }
    }

    return NextResponse.json({
      round,
      battle: updatedBattle,
      result: roundResult,
      message: `Round ${roundNumber} executed`,
      storage: storageResult,
    });
  },
], { errorContext: 'API:Arena:Battles:Execute:POST' });

async function updateWarriorStats(
  warrior1Id: number,
  warrior2Id: number,
  w1Score: number,
  w2Score: number
) {
  const winner = w1Score > w2Score ? warrior1Id : w2Score > w1Score ? warrior2Id : null;

  // Update warrior 1
  await prisma.warriorArenaStats.upsert({
    where: { warriorId: warrior1Id },
    update: {
      totalBattles: { increment: 1 },
      wins: winner === warrior1Id ? { increment: 1 } : undefined,
      losses: winner === warrior2Id ? { increment: 1 } : undefined,
      draws: winner === null ? { increment: 1 } : undefined,
    },
    create: {
      warriorId: warrior1Id,
      totalBattles: 1,
      wins: winner === warrior1Id ? 1 : 0,
      losses: winner === warrior2Id ? 1 : 0,
      draws: winner === null ? 1 : 0,
      arenaRating: 1000,
      peakRating: 1000,
    },
  });

  // Update warrior 2
  await prisma.warriorArenaStats.upsert({
    where: { warriorId: warrior2Id },
    update: {
      totalBattles: { increment: 1 },
      wins: winner === warrior2Id ? { increment: 1 } : undefined,
      losses: winner === warrior1Id ? { increment: 1 } : undefined,
      draws: winner === null ? { increment: 1 } : undefined,
    },
    create: {
      warriorId: warrior2Id,
      totalBattles: 1,
      wins: winner === warrior2Id ? 1 : 0,
      losses: winner === warrior1Id ? 1 : 0,
      draws: winner === null ? 1 : 0,
      arenaRating: 1000,
      peakRating: 1000,
    },
  });
}
