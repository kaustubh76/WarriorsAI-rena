/**
 * Market Betting API - Get User Bets
 * GET /api/markets/bets?userId=xxx&status=xxx&source=xxx
 */

import { NextResponse } from 'next/server';
import { marketBettingService } from '@/services/betting/marketBettingService';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'market-bets-list', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const limitStr = searchParams.get('limit');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    const filters: any = {};
    if (status) filters.status = status;
    if (source) filters.source = source;
    if (limitStr) filters.limit = parseInt(limitStr);

    const bets = await marketBettingService.getUserBets(userId, filters);

    // Convert BigInt to string for JSON serialization
    const serializedBets = bets.map((bet) => ({
      ...bet,
      amount: bet.amount.toString(),
      payout: bet.payout?.toString() || null,
    }));

    return NextResponse.json({
      success: true,
      bets: serializedBets,
      total: bets.length,
    });
  },
], { errorContext: 'API:Markets:Bets:GET' });
