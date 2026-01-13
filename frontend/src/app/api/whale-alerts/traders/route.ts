/**
 * Tracked Traders API Route
 * GET: List tracked traders
 * POST: Track a new trader
 * DELETE: Untrack a trader
 */

import { NextRequest, NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';

export async function GET() {
  try {
    const traders = await whaleTrackerService.getTrackedTraders();

    return NextResponse.json({
      success: true,
      data: {
        traders,
        count: traders.length,
      },
    });
  } catch (error) {
    console.error('[API] Get tracked traders error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch tracked traders',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, source, alias } = body;

    if (!address || !source) {
      return NextResponse.json(
        { success: false, error: 'address and source are required' },
        { status: 400 }
      );
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
    console.error('[API] Track trader error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to track trader',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, source } = body;

    if (!address || !source) {
      return NextResponse.json(
        { success: false, error: 'address and source are required' },
        { status: 400 }
      );
    }

    await whaleTrackerService.untrackTrader(address, source as MarketSource);

    return NextResponse.json({
      success: true,
      data: { message: 'Trader untracked successfully' },
    });
  } catch (error) {
    console.error('[API] Untrack trader error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to untrack trader',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
