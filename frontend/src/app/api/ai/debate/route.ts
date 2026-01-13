/**
 * AI Debate API Route
 * POST: Start a new AI debate on a market
 * GET: Get debate history for a market
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiDebateService } from '@/services/aiDebateService';
import { MarketSource } from '@/types/externalMarket';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketId, question, source } = body;

    if (!marketId || !question) {
      return NextResponse.json(
        { success: false, error: 'marketId and question are required' },
        { status: 400 }
      );
    }

    const debate = await aiDebateService.conductDebate(
      marketId,
      question,
      (source as MarketSource) || MarketSource.NATIVE
    );

    return NextResponse.json({
      success: true,
      data: { debate },
    });
  } catch (error) {
    console.error('[API] AI debate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to conduct AI debate',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');

    if (!marketId) {
      return NextResponse.json(
        { success: false, error: 'marketId is required' },
        { status: 400 }
      );
    }

    const debates = await aiDebateService.getDebateHistory(marketId);

    return NextResponse.json({
      success: true,
      data: { debates },
    });
  } catch (error) {
    console.error('[API] Get debate history error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch debate history',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
