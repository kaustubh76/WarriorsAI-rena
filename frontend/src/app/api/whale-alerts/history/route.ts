/**
 * Whale Trade History API Route
 * GET: Fetch historical whale trades
 */

import { NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'whale-history', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);

    const limit = parseInt(searchParams.get('limit') || '50');
    const source = searchParams.get('source') as MarketSource | null;

    const trades = await whaleTrackerService.getRecentWhaleTrades(
      limit,
      source || undefined
    );

    return NextResponse.json({
      success: true,
      data: {
        trades,
        count: trades.length,
      },
    });
  },
], { errorContext: 'API:WhaleHistory:GET' });
