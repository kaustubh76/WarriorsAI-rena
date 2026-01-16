/**
 * Whale Trade History API Route
 * GET: Fetch historical whale trades
 */

import { NextRequest, NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';

export async function GET(request: NextRequest) {
  try {
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
    console.error('[API] Whale history error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch whale trade history',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
