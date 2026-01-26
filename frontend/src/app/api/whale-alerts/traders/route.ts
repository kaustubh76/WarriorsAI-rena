/**
 * Tracked Traders API Route
 * GET: List tracked traders
 * POST: Track a new trader
 * DELETE: Untrack a trader
 */

import { NextRequest, NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-traders-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const traders = await whaleTrackerService.getTrackedTraders();

    return NextResponse.json({
      success: true,
      data: {
        traders,
        count: traders.length,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:WhaleTraders:GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-traders-post',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body = await request.json();
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
  } catch (error) {
    return handleAPIError(error, 'API:WhaleTraders:POST');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-traders-delete',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body = await request.json();
    const { address, source } = body;

    if (!address || !source) {
      throw ErrorResponses.badRequest('address and source are required');
    }

    await whaleTrackerService.untrackTrader(address, source as MarketSource);

    return NextResponse.json({
      success: true,
      data: { message: 'Trader untracked successfully' },
    });
  } catch (error) {
    return handleAPIError(error, 'API:WhaleTraders:DELETE');
  }
}
