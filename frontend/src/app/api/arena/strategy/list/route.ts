/**
 * GET /api/arena/strategy/list
 *
 * List strategy battles for the arena page.
 * Returns summary data (no full cycle breakdown).
 *
 * Query params:
 *   ?limit=20        — max results (default 50, max 100)
 *   ?offset=0        — pagination offset
 *   ?status=active   — filter by status (active/completed/cancelled)
 *   ?owner=0x...     — filter by warrior owner (matches either side)
 */

import { NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const VALID_STATUSES = ['active', 'completed', 'cancelled', 'pending'] as const;

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-strategy-list', ...RateLimitPresets.apiQueries }),
  async (req) => {
    const url = new URL(req.url);

    // Parse pagination
    const rawLimit = url.searchParams.get('limit');
    const rawOffset = url.searchParams.get('offset');
    const limit = Math.min(Math.max(1, rawLimit ? parseInt(rawLimit, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Math.max(0, rawOffset ? parseInt(rawOffset, 10) || 0 : 0);

    // Parse optional filters
    const statusParam = url.searchParams.get('status');
    const ownerParam = url.searchParams.get('owner');

    // Build where clause
    const where: Record<string, unknown> = { isStrategyBattle: true };
    if (statusParam && VALID_STATUSES.includes(statusParam as typeof VALID_STATUSES[number])) {
      where.status = statusParam;
    }
    if (ownerParam && /^0x[0-9a-fA-F]{40}$/.test(ownerParam)) {
      const lowerOwner = ownerParam.toLowerCase();
      where.OR = [
        { warrior1Owner: lowerOwner },
        { warrior2Owner: lowerOwner },
      ];
    }

    const [battles, total] = await Promise.all([
      prisma.predictionBattle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
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
      }),
      prisma.predictionBattle.count({ where }),
    ]);

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

    return NextResponse.json({
      success: true,
      battles: formatted,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  },
], { errorContext: 'API:Arena:Strategy:List:GET' });
