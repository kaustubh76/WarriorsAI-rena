import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { keccak256, toBytes } from 'viem';

const prisma = new PrismaClient();

export type BattleStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface CreateBattleRequest {
  externalMarketId: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  warrior1Id: number;
  warrior1Owner: string;
  stakes: string;
  challengerSideYes: boolean;
}

export interface AcceptBattleRequest {
  challengeId: string;
  warrior2Id: number;
  warrior2Owner: string;
}

/**
 * GET /api/arena/battles
 * List battles with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as BattleStatus | null;
    const warriorId = searchParams.get('warriorId');
    const marketId = searchParams.get('marketId');
    const source = searchParams.get('source');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (warriorId) {
      const id = parseInt(warriorId);
      where.OR = [{ warrior1Id: id }, { warrior2Id: id }];
    }

    if (marketId && source) {
      where.externalMarketId = marketId;
      where.source = source;
    }

    const [battles, total] = await Promise.all([
      prisma.predictionBattle.findMany({
        where,
        include: {
          rounds: {
            orderBy: { roundNumber: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.predictionBattle.count({ where }),
    ]);

    return NextResponse.json({
      battles,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching battles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch battles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/arena/battles
 * Create a new challenge (pending battle)
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateBattleRequest = await request.json();

    const {
      externalMarketId,
      source,
      question,
      warrior1Id,
      warrior1Owner,
      stakes,
      challengerSideYes,
    } = body;

    // Validate required fields
    if (!externalMarketId || !source || !question || !warrior1Id || !warrior1Owner || !stakes) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate market key (same as contract)
    const marketKey = keccak256(toBytes(`${source}:${externalMarketId}`));

    // Create pending battle (challenge)
    const battle = await prisma.predictionBattle.create({
      data: {
        externalMarketId,
        source,
        question,
        warrior1Id: challengerSideYes ? warrior1Id : 0, // 0 = placeholder until accepted
        warrior1Owner: challengerSideYes ? warrior1Owner : '',
        warrior2Id: challengerSideYes ? 0 : warrior1Id,
        warrior2Owner: challengerSideYes ? '' : warrior1Owner,
        stakes,
        status: 'pending',
        currentRound: 0,
      },
    });

    return NextResponse.json({
      battle,
      marketKey,
      message: 'Challenge created successfully',
    });
  } catch (error) {
    console.error('Error creating battle:', error);
    return NextResponse.json(
      { error: 'Failed to create battle' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/arena/battles
 * Accept a challenge or update battle state
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'accept') {
      const { battleId, warrior2Id, warrior2Owner } = body as {
        battleId: string;
        warrior2Id: number;
        warrior2Owner: string;
        action: string;
      };

      // Get existing battle
      const existing = await prisma.predictionBattle.findUnique({
        where: { id: battleId },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
      }

      if (existing.status !== 'pending') {
        return NextResponse.json(
          { error: 'Battle is not in pending state' },
          { status: 400 }
        );
      }

      // Determine which side needs to be filled
      const updateData: Record<string, unknown> = {
        status: 'active',
        currentRound: 1,
      };

      if (existing.warrior1Id === 0) {
        // Challenger was NO side, acceptor is YES
        updateData.warrior1Id = warrior2Id;
        updateData.warrior1Owner = warrior2Owner;
      } else {
        // Challenger was YES side, acceptor is NO
        updateData.warrior2Id = warrior2Id;
        updateData.warrior2Owner = warrior2Owner;
      }

      const battle = await prisma.predictionBattle.update({
        where: { id: battleId },
        data: updateData,
        include: { rounds: true },
      });

      return NextResponse.json({
        battle,
        message: 'Challenge accepted, battle started!',
      });
    }

    if (action === 'cancel') {
      const { battleId } = body as { battleId: string; action: string };

      const battle = await prisma.predictionBattle.update({
        where: { id: battleId },
        data: { status: 'cancelled' },
      });

      return NextResponse.json({
        battle,
        message: 'Battle cancelled',
      });
    }

    if (action === 'submitRound') {
      const {
        battleId,
        roundNumber,
        w1Argument,
        w1Evidence,
        w1Move,
        w1Score,
        w2Argument,
        w2Evidence,
        w2Move,
        w2Score,
        judgeReasoning,
      } = body;

      // Create or update round
      const round = await prisma.predictionRound.upsert({
        where: {
          battleId_roundNumber: {
            battleId,
            roundNumber,
          },
        },
        update: {
          w1Argument,
          w1Evidence: JSON.stringify(w1Evidence),
          w1Move,
          w1Score,
          w2Argument,
          w2Evidence: JSON.stringify(w2Evidence),
          w2Move,
          w2Score,
          roundWinner:
            w1Score > w2Score
              ? 'warrior1'
              : w2Score > w1Score
              ? 'warrior2'
              : 'draw',
          judgeReasoning,
          endedAt: new Date(),
        },
        create: {
          battleId,
          roundNumber,
          w1Argument,
          w1Evidence: JSON.stringify(w1Evidence),
          w1Move,
          w1Score,
          w2Argument,
          w2Evidence: JSON.stringify(w2Evidence),
          w2Move,
          w2Score,
          roundWinner:
            w1Score > w2Score
              ? 'warrior1'
              : w2Score > w1Score
              ? 'warrior2'
              : 'draw',
          judgeReasoning,
          endedAt: new Date(),
        },
      });

      // Update battle scores and round
      const battle = await prisma.predictionBattle.update({
        where: { id: battleId },
        data: {
          warrior1Score: { increment: w1Score },
          warrior2Score: { increment: w2Score },
          currentRound: roundNumber + 1,
          status: roundNumber >= 5 ? 'completed' : 'active',
          completedAt: roundNumber >= 5 ? new Date() : undefined,
        },
        include: { rounds: true },
      });

      // Update warrior stats if battle completed
      if (roundNumber >= 5) {
        await updateWarriorStats(battle);
      }

      return NextResponse.json({
        round,
        battle,
        message: `Round ${roundNumber} submitted`,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating battle:', error);
    return NextResponse.json(
      { error: 'Failed to update battle' },
      { status: 500 }
    );
  }
}

async function updateWarriorStats(battle: {
  warrior1Id: number;
  warrior2Id: number;
  warrior1Score: number;
  warrior2Score: number;
  stakes: string;
}) {
  const winner =
    battle.warrior1Score > battle.warrior2Score
      ? battle.warrior1Id
      : battle.warrior2Score > battle.warrior1Score
      ? battle.warrior2Id
      : null;

  // Update warrior 1 stats
  await prisma.warriorArenaStats.upsert({
    where: { warriorId: battle.warrior1Id },
    update: {
      totalBattles: { increment: 1 },
      wins: winner === battle.warrior1Id ? { increment: 1 } : undefined,
      losses: winner === battle.warrior2Id ? { increment: 1 } : undefined,
      draws: winner === null ? { increment: 1 } : undefined,
    },
    create: {
      warriorId: battle.warrior1Id,
      totalBattles: 1,
      wins: winner === battle.warrior1Id ? 1 : 0,
      losses: winner === battle.warrior2Id ? 1 : 0,
      draws: winner === null ? 1 : 0,
      arenaRating: 1000,
      peakRating: 1000,
    },
  });

  // Update warrior 2 stats
  await prisma.warriorArenaStats.upsert({
    where: { warriorId: battle.warrior2Id },
    update: {
      totalBattles: { increment: 1 },
      wins: winner === battle.warrior2Id ? { increment: 1 } : undefined,
      losses: winner === battle.warrior1Id ? { increment: 1 } : undefined,
      draws: winner === null ? { increment: 1 } : undefined,
    },
    create: {
      warriorId: battle.warrior2Id,
      totalBattles: 1,
      wins: winner === battle.warrior2Id ? 1 : 0,
      losses: winner === battle.warrior1Id ? 1 : 0,
      draws: winner === null ? 1 : 0,
      arenaRating: 1000,
      peakRating: 1000,
    },
  });
}
