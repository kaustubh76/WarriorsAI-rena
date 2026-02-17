/**
 * Arbitrage Trading API - Get Trade by ID
 * GET /api/arbitrage/trades/[id]
 * POST /api/arbitrage/trades/[id] - Close positions manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { arbitrageTradingService } from '@/services/betting/arbitrageTradingService';
import { prisma } from '@/lib/prisma';
import { applyRateLimit, handleAPIError, RateLimitPresets, ErrorResponses } from '@/lib/api';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'arbitrage-trade-get',
      ...RateLimitPresets.apiQueries,
    });

    const tradeId = params.id;

    if (!tradeId || tradeId.trim().length === 0) {
      throw ErrorResponses.badRequest('Missing trade ID');
    }

    const trade = await prisma.arbitrageTrade.findUnique({
      where: { id: tradeId.trim() },
    });

    if (!trade) {
      throw ErrorResponses.notFound('Trade');
    }

    // Calculate P&L
    const pnl = await arbitrageTradingService.calculatePnL(tradeId);

    // Convert BigInt to string for JSON serialization
    const serializedTrade = {
      ...trade,
      investmentAmount: trade.investmentAmount.toString(),
      market1Amount: trade.market1Amount.toString(),
      market2Amount: trade.market2Amount.toString(),
      actualProfit: trade.actualProfit?.toString() || null,
    };

    const serializedPnL = pnl
      ? {
          ...pnl,
          investmentAmount: pnl.investmentAmount.toString(),
          market1Cost: pnl.market1Cost.toString(),
          market2Cost: pnl.market2Cost.toString(),
          market1Payout: pnl.market1Payout.toString(),
          market2Payout: pnl.market2Payout.toString(),
          totalPayout: pnl.totalPayout.toString(),
          profitLoss: pnl.profitLoss.toString(),
        }
      : null;

    return NextResponse.json({
      success: true,
      data: {
        trade: serializedTrade,
        pnl: serializedPnL,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arbitrage:Trade:GET');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply rate limiting - more restrictive for mutations
    applyRateLimit(request, {
      prefix: 'arbitrage-trade-close',
      ...RateLimitPresets.agentOperations,
    });

    const tradeId = params.id;

    if (!tradeId || tradeId.trim().length === 0) {
      throw ErrorResponses.badRequest('Missing trade ID');
    }

    // Close positions
    const result = await arbitrageTradingService.closePositions(tradeId.trim());

    if (!result.success) {
      throw ErrorResponses.badRequest(result.error || 'Failed to close positions');
    }

    return NextResponse.json({
      success: true,
      data: {
        profit: result.profit?.toString(),
        market1Payout: result.market1Payout?.toString(),
        market2Payout: result.market2Payout?.toString(),
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Arbitrage:Trade:Close');
  }
}
