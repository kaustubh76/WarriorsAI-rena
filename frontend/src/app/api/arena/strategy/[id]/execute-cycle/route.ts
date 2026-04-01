/**
 * POST /api/arena/strategy/[id]/execute-cycle
 *
 * Execute one DeFi yield cycle for both warriors in a strategy battle.
 * Auto-settles after cycle 5.
 */

import { NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { strategyArenaService } from '@/services/arena/strategyArenaService';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'arena-strategy-execute-cycle', ...RateLimitPresets.storageWrite }),
  async (req, ctx) => {
    const params = ctx?.params as { id?: string } | undefined;
    const battleId = params?.id;

    if (!battleId) {
      throw ErrorResponses.badRequest('Battle ID is required');
    }

    const result = await strategyArenaService.executeCycle(battleId);

    return NextResponse.json({
      success: true,
      battleId: result.battleId,
      roundNumber: result.roundNumber,
      warrior1: {
        nftId: result.warrior1.nftId,
        defiMove: result.warrior1.defiMove,
        score: result.warrior1.score.finalScore,
        yieldEarned: result.warrior1.yieldEarned,
        txHash: result.warrior1.txHash,
        allocationAfter: result.warrior1.allocationAfter,
      },
      warrior2: {
        nftId: result.warrior2.nftId,
        defiMove: result.warrior2.defiMove,
        score: result.warrior2.score.finalScore,
        yieldEarned: result.warrior2.yieldEarned,
        txHash: result.warrior2.txHash,
        allocationAfter: result.warrior2.allocationAfter,
      },
      roundWinner: result.roundWinner,
      poolAPYs: result.poolAPYs,
      settled: result.settled,
    });
  },
], { errorContext: 'API:Arena:Strategy:ExecuteCycle:POST' });
