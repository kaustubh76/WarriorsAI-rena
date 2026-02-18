/**
 * Market Betting API - Get Bet by ID
 * GET /api/markets/bets/[id]
 * DELETE /api/markets/bets/[id] - Cancel bet
 */

import { NextResponse } from 'next/server';
import { marketBettingService } from '@/services/betting/marketBettingService';
import { orderExecutionService } from '@/services/betting/orderExecutionService';
import { escrowService } from '@/services/escrow';
import { prisma } from '@/lib/prisma';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'market-bet-detail', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const betId = ctx.params?.id;

    if (!betId) {
      return NextResponse.json(
        { error: 'Missing bet ID' },
        { status: 400 }
      );
    }

    const status = await marketBettingService.getBetStatus(betId);

    if (!status) {
      return NextResponse.json(
        { error: 'Bet not found' },
        { status: 404 }
      );
    }

    // Convert BigInt to string for JSON serialization
    const serializedBet = {
      ...status.bet,
      amount: status.bet.amount.toString(),
      payout: status.bet.payout?.toString() || null,
    };

    return NextResponse.json({
      success: true,
      bet: serializedBet,
      orderStatus: status.orderStatus,
      fillPercentage: status.fillPercentage,
    });
  },
], { errorContext: 'API:Markets:Bets:Detail:GET' });

export const DELETE = composeMiddleware([
  withRateLimit({ prefix: 'market-bet-cancel', ...RateLimitPresets.marketBetting }),
  async (req, ctx) => {
    const betId = ctx.params?.id;

    if (!betId) {
      return NextResponse.json(
        { error: 'Missing bet ID' },
        { status: 400 }
      );
    }

    // 1. Get bet from database
    const bet = await prisma.marketBet.findUnique({
      where: { id: betId },
    });

    if (!bet) {
      return NextResponse.json(
        { error: 'Bet not found' },
        { status: 404 }
      );
    }

    // 2. Verify bet is in a cancellable status
    const cancellableStatuses = ['pending', 'placed'];
    if (!cancellableStatuses.includes(bet.status)) {
      return NextResponse.json(
        {
          error: 'Bet cannot be cancelled',
          details: `Current status "${bet.status}" is not cancellable. Only pending or placed bets can be cancelled.`
        },
        { status: 400 }
      );
    }

    // 3. Cancel order on external platform if order exists
    let orderCancelled = false;
    if (bet.orderId && bet.source) {
      const source = bet.source as 'polymarket' | 'kalshi';
      orderCancelled = await orderExecutionService.cancelOrder(bet.orderId, source);

      if (!orderCancelled) {
        console.warn(`[Market Betting API] Failed to cancel order ${bet.orderId} on ${source}, proceeding with local cancellation`);
      }
    }

    // 4. Release escrow funds if locked
    let escrowReleased = false;
    const escrowLock = await escrowService.getEscrowLockByReference(betId);
    if (escrowLock) {
      const releaseResult = await escrowService.releaseFunds(
        escrowLock.id,
        'bet_cancelled_by_user'
      );
      escrowReleased = releaseResult.success;

      if (!escrowReleased) {
        console.error(`[Market Betting API] Failed to release escrow for bet ${betId}:`, releaseResult.error);
      }
    }

    // 5. Update bet status to cancelled
    const updatedBet = await prisma.marketBet.update({
      where: { id: betId },
      data: {
        status: 'cancelled',
      },
    });

    // 6. Log the cancellation for audit
    await prisma.tradeAuditLog.create({
      data: {
        userId: bet.userId,
        tradeType: 'bet',
        action: 'cancel',
        marketId: bet.externalMarketId,
        orderId: bet.orderId || undefined,
        amount: bet.amount.toString(),
        source: bet.source || undefined,
        success: true,
        metadata: JSON.stringify({
          betId,
          orderCancelled,
          escrowReleased,
          previousStatus: bet.status,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      bet: {
        id: updatedBet.id,
        status: updatedBet.status,
        amount: updatedBet.amount.toString(),
      },
      orderCancelled,
      escrowReleased,
    });
  },
], { errorContext: 'API:Markets:Bets:Detail:DELETE' });
