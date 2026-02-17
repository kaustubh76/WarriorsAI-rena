/**
 * Market Betting API - Claim Winnings
 * POST /api/markets/bets/[id]/claim
 */

import { NextRequest, NextResponse } from 'next/server';
import { marketBettingService } from '@/services/betting/marketBettingService';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    applyRateLimit(request, { prefix: 'market-bet-claim', ...RateLimitPresets.marketBetting });

    const betId = params.id;

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
  } catch (error) {
    console.error('[Market Betting API] Claim winnings error:', error);
    return NextResponse.json(
      {
        error: 'Failed to claim winnings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
