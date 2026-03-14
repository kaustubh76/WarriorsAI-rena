/**
 * GET /api/arena/strategy/list
 *
 * List all strategy battles for the arena page.
 * Returns summary data (no full cycle breakdown).
 */

import { NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-strategy-list', ...RateLimitPresets.apiQueries }),
  async () => {
    const battles = await prisma.predictionBattle.findMany({
      where: { isStrategyBattle: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
          select: {
            roundNumber: true,
            w1DeFiMove: true,
            w2DeFiMove: true,
            w1Score: true,
            w2Score: true,
            roundWinner: true,
          },
        },
      },
    });

    // Batch-fetch betting pools (no Prisma relation from PredictionBattle → BattleBettingPool)
    const battleIds = battles.map(b => b.id);
    const bettingPools = await prisma.battleBettingPool.findMany({
      where: { battleId: { in: battleIds } },
      select: { battleId: true, totalWarrior1Bets: true, totalWarrior2Bets: true, totalBettors: true, bettingOpen: true },
    });
    const poolMap = new Map(bettingPools.map(p => [p.battleId, p]));

    const formatted = battles.map((b) => {
      const pool = poolMap.get(b.id);
      return {
        id: b.id,
        status: b.status,
        currentRound: b.currentRound,
        question: b.question,
        stakes: b.stakes,
        warrior1Id: b.warrior1Id,
        warrior1Owner: b.warrior1Owner,
        warrior1Score: b.warrior1Score,
        warrior2Id: b.warrior2Id,
        warrior2Owner: b.warrior2Owner,
        warrior2Score: b.warrior2Score,
        warrior1ImageUrl: b.warrior1ImageUrl,
        warrior2ImageUrl: b.warrior2ImageUrl,
        w1TotalYield: b.w1TotalYield,
        w2TotalYield: b.w2TotalYield,
        createdAt: b.createdAt,
        completedAt: b.completedAt,
        scheduledStartAt: b.scheduledStartAt,
        lastCycleAt: b.lastCycleAt,
        nextCycleEstimate: b.status === 'active' && b.currentRound < 5
          ? new Date(Math.max(
              (b.lastCycleAt?.getTime() ?? 0) + 60 * 1000,
              b.scheduledStartAt?.getTime() ?? 0,
              Date.now(),
            )).toISOString()
          : null,
        betting: pool ? {
          totalWarrior1Bets: pool.totalWarrior1Bets,
          totalWarrior2Bets: pool.totalWarrior2Bets,
          totalBettors: pool.totalBettors,
          bettingOpen: pool.bettingOpen,
        } : null,
        rounds: b.rounds.map((r) => ({
          roundNumber: r.roundNumber,
          w1DeFiMove: r.w1DeFiMove,
          w2DeFiMove: r.w2DeFiMove,
          w1Score: r.w1Score,
          w2Score: r.w2Score,
          roundWinner: r.roundWinner,
        })),
      };
    });

    return NextResponse.json({ success: true, battles: formatted });
  },
], { errorContext: 'API:Arena:Strategy:List:GET' });
