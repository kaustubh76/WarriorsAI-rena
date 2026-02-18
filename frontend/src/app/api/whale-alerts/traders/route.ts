/**
 * Tracked Traders API Route
 * GET: List tracked traders
 * POST: Track a new trader
 * DELETE: Untrack a trader
 */

import { NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';
import { RateLimitPresets, ErrorResponses } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'whale-traders-get', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const traders = await whaleTrackerService.getTrackedTraders();

    return NextResponse.json({
      success: true,
      data: {
        traders,
        count: traders.length,
      },
    });
  },
], { errorContext: 'API:WhaleTraders:GET' });

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'whale-traders-post', ...RateLimitPresets.storageWrite }),
  async (req, ctx) => {
    const body = await req.json();
    const { address, source, alias } = body;

    if (!address || !source) {
      throw ErrorResponses.badRequest('address and source are required');
    }

    const trader = await whaleTrackerService.trackTrader(
      address,
      source as MarketSource,
      alias
    );

    return NextResponse.json({
      success: true,
      data: { trader },
    });
  },
], { errorContext: 'API:WhaleTraders:POST' });

export const DELETE = composeMiddleware([
  withRateLimit({ prefix: 'whale-traders-delete', ...RateLimitPresets.storageWrite }),
  async (req, ctx) => {
    const body = await req.json();
    const { address, source } = body;

    if (!address || !source) {
      throw ErrorResponses.badRequest('address and source are required');
    }

    await whaleTrackerService.untrackTrader(address, source as MarketSource);

    return NextResponse.json({
      success: true,
      data: { message: 'Trader untracked successfully' },
    });
  },
], { errorContext: 'API:WhaleTraders:DELETE' });
