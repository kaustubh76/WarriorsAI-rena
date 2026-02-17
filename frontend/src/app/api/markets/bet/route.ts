/**
 * Market Betting API - Place Bet
 * POST /api/markets/bet
 *
 * Rate limited: 15 requests/minute per IP, stricter per wallet.
 * Uses sliding window counter to prevent boundary doubling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { marketBettingService } from '@/services/betting/marketBettingService';
import { applyRateLimitWithBody, RateLimitPresets } from '@/lib/api/rateLimit';
import { handleAPIError, ErrorResponses } from '@/lib/api/errorHandler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, externalMarketId, source, side, amount, warriorId } = body;

    // Apply rate limiting with wallet-based tracking (prevents IP rotation bypass)
    applyRateLimitWithBody(request, body, {
      prefix: 'market-bet',
      ...RateLimitPresets.marketBetting,
      strictWalletLimit: true,
    });

    // Validate inputs
    if (!userId || !externalMarketId || !source || !side || !amount) {
      throw ErrorResponses.badRequest('Missing required fields: userId, externalMarketId, source, side, amount');
    }

    if (source !== 'polymarket' && source !== 'kalshi') {
      throw ErrorResponses.badRequest('Invalid source. Must be "polymarket" or "kalshi"');
    }

    if (side !== 'YES' && side !== 'NO') {
      throw ErrorResponses.badRequest('Invalid side. Must be "YES" or "NO"');
    }

    // Convert amount to bigint
    let amountBigInt: bigint;
    try {
      amountBigInt = BigInt(amount);
    } catch {
      throw ErrorResponses.badRequest('Invalid amount format');
    }

    if (amountBigInt <= 0n) {
      throw ErrorResponses.badRequest('Amount must be greater than 0');
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
    return handleAPIError(error, 'API:Markets:Bet:POST');
  }
}
