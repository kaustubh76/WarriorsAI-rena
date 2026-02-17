/**
 * Arbitrage Trading API - Execute Arbitrage
 * POST /api/arbitrage/execute
 */

import { NextRequest, NextResponse } from 'next/server';
import { arbitrageTradingService } from '@/services/betting/arbitrageTradingService';
import { applyRateLimit, handleAPIError, ErrorResponses, RateLimitPresets } from '@/lib/api';
import { tradingConfig } from '@/services/config';

// Constants for validation
const MIN_INVESTMENT_WEI = BigInt(1e15); // 0.001 tokens minimum
const MAX_INVESTMENT_WEI = BigInt(100_000 * 1e18); // 100,000 tokens maximum absolute cap

export async function POST(request: NextRequest) {
  try {
    // 1. Apply rate limiting - max 10 executions per minute per IP
    applyRateLimit(request, {
      prefix: 'arbitrage-execute',
      ...RateLimitPresets.agentOperations,
    });

    const body = await request.json();
    const { userId, opportunityId, investmentAmount } = body;

    // 2. Validate required fields with type checking
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw ErrorResponses.badRequest('Invalid or missing userId');
    }

    if (!opportunityId || typeof opportunityId !== 'string' || opportunityId.trim().length === 0) {
      throw ErrorResponses.badRequest('Invalid or missing opportunityId');
    }

    if (investmentAmount === undefined || investmentAmount === null) {
      throw ErrorResponses.badRequest('Missing investmentAmount');
    }

    // 3. Validate and convert amount with comprehensive bounds checking
    let amountBigInt: bigint;
    try {
      // Handle both string and number inputs
      amountBigInt = BigInt(investmentAmount.toString());
    } catch {
      throw ErrorResponses.badRequest('Invalid investment amount format - must be a valid number');
    }

    // 4. Bounds validation
    if (amountBigInt <= 0n) {
      throw ErrorResponses.badRequest('Investment amount must be positive');
    }

    if (amountBigInt < MIN_INVESTMENT_WEI) {
      throw ErrorResponses.badRequest('Investment amount below minimum (0.001 tokens)');
    }

    if (amountBigInt > MAX_INVESTMENT_WEI) {
      throw ErrorResponses.badRequest('Investment amount exceeds maximum allowed');
    }

    // 5. Check against trading config limits
    const config = tradingConfig.getConfig();
    const maxSingleTradeWei = BigInt(Math.floor(config.maxSingleTradeUSD * 1e18));
    if (amountBigInt > maxSingleTradeWei) {
      throw ErrorResponses.badRequest(
        `Amount exceeds single trade limit of ${config.maxSingleTradeUSD} USD`,
        { limit: config.maxSingleTradeUSD, unit: 'USD' }
      );
    }

    // 6. Check if trading is enabled
    if (!tradingConfig.isTradingAllowed()) {
      throw ErrorResponses.badRequest('Trading is currently disabled');
    }

    if (!tradingConfig.isArbitrageAllowed()) {
      throw ErrorResponses.badRequest('Arbitrage trading is currently disabled');
    }

    // 7. Execute arbitrage
    const result = await arbitrageTradingService.executeArbitrage({
      userId: userId.trim(),
      opportunityId: opportunityId.trim(),
      investmentAmount: amountBigInt,
    });

    if (!result.success) {
      // Return 400 for business logic errors (insufficient funds, invalid opportunity, etc.)
      throw ErrorResponses.badRequest(result.error || 'Arbitrage execution failed');
    }

    return NextResponse.json({
      success: true,
      data: {
        tradeId: result.tradeId,
        market1OrderId: result.market1OrderId,
        market2OrderId: result.market2OrderId,
        expectedProfit: result.expectedProfit,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arbitrage:Execute');
  }
}
