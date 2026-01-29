/**
 * Market Betting API - Place Bet
 * POST /api/markets/bet
 */

import { NextRequest, NextResponse } from 'next/server';
import { marketBettingService } from '@/services/betting/marketBettingService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, externalMarketId, source, side, amount, warriorId } = body;

    // Validate inputs
    if (!userId || !externalMarketId || !source || !side || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (source !== 'polymarket' && source !== 'kalshi') {
      return NextResponse.json(
        { error: 'Invalid source. Must be "polymarket" or "kalshi"' },
        { status: 400 }
      );
    }

    if (side !== 'YES' && side !== 'NO') {
      return NextResponse.json(
        { error: 'Invalid side. Must be "YES" or "NO"' },
        { status: 400 }
      );
    }

    // Convert amount to bigint
    let amountBigInt: bigint;
    try {
      amountBigInt = BigInt(amount);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid amount format' },
        { status: 400 }
      );
    }

    // Place bet
    const result = await marketBettingService.placeBet({
      userId,
      externalMarketId,
      source,
      side,
      amount: amountBigInt,
      warriorId,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      betId: result.betId,
      orderId: result.orderId,
      shares: result.shares,
      executionPrice: result.executionPrice,
    });
  } catch (error) {
    console.error('[Market Betting API] POST error:', error);
    return NextResponse.json(
      {
        error: 'Failed to place bet',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
