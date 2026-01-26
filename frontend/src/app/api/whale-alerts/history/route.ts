/**
 * Whale Trade History API Route
 * GET: Fetch historical whale trades
 */

import { NextRequest, NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-history',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);

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
  } catch (error) {
    return handleAPIError(error, 'API:WhaleHistory:GET');
  }
}
