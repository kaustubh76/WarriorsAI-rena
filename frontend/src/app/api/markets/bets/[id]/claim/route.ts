/**
 * Market Betting API - Claim Winnings
 * POST /api/markets/bets/[id]/claim
 */

import { NextResponse } from 'next/server';
import { marketBettingService } from '@/services/betting/marketBettingService';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'market-bet-claim', ...RateLimitPresets.marketBetting }),
  async (req, ctx) => {
    const betId = ctx.params?.id;

    if (!betId) {
      return NextResponse.json(
        { error: 'Missing bet ID' },
        { status: 400 }
      );
    }

    const result = await marketBettingService.claimWinnings(betId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      payout: result.payout?.toString(),
      txHash: result.txHash,
    });
  },
], { errorContext: 'API:Markets:Bets:Claim:POST' });
