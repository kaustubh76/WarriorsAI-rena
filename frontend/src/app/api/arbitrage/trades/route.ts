/**
 * Arbitrage Trading API - Get User Trades
 * GET /api/arbitrage/trades?userId=xxx&status=xxx&settled=xxx
 */

import { NextResponse } from 'next/server';
import { arbitrageTradingService } from '@/services/betting/arbitrageTradingService';
import { RateLimitPresets, ErrorResponses } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { userDataCache } from '@/lib/cache/hashedCache';

// Valid status values for filtering
const VALID_STATUSES = ['pending', 'partial', 'completed', 'settled', 'failed', 'stale'];

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arbitrage-trades', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const settledStr = searchParams.get('settled');
    const limitStr = searchParams.get('limit');

    // Validate userId
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw ErrorResponses.badRequest('Missing or invalid userId parameter');
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      throw ErrorResponses.badRequest(
        `Invalid status parameter. Valid values: ${VALID_STATUSES.join(', ')}`
      );
    }

    // Validate limit if provided
    const filters: Record<string, unknown> = {};
    if (status) filters.status = status;
    if (settledStr) filters.settled = settledStr === 'true';

    if (limitStr) {
      const limit = parseInt(limitStr, 10);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        throw ErrorResponses.badRequest('Limit must be a number between 1 and 100');
      }
      filters.limit = limit;
    }

    // Cache user trades (10min TTL via userDataCache)
    const cacheKey = `arb-trades:${userId.trim()}:${status || ''}:${settledStr || ''}:${limitStr || ''}`;
    const trades = await userDataCache.getOrSet(
      cacheKey,
      () => arbitrageTradingService.getUserTrades(userId.trim(), filters)
    ) as Awaited<ReturnType<typeof arbitrageTradingService.getUserTrades>>;

    // Convert BigInt to string for JSON serialization
    const serializedTrades = trades.map((trade) => ({
      ...trade,
      investmentAmount: trade.investmentAmount.toString(),
      market1Amount: trade.market1Amount.toString(),
      market2Amount: trade.market2Amount.toString(),
      actualProfit: trade.actualProfit?.toString() || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        trades: serializedTrades,
        total: trades.length,
      },
    });
  },
], { errorContext: 'API:Arbitrage:Trades:GET' });
