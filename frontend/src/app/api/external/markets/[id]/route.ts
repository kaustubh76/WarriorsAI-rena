/**
 * Single External Market API Route
 * GET: Fetch a specific market by ID (poly_xxx or kalshi_xxx)
 */

import { NextRequest, NextResponse } from 'next/server';
import { externalMarketsService } from '@/services/externalMarkets';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const market = await externalMarketsService.getMarket(id);

    if (!market) {
      return NextResponse.json(
        {
          success: false,
          error: 'Market not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: market,
    });
  } catch (error) {
    console.error('[API] External market error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch market',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
