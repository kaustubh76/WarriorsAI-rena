/**
 * Tool: place_order_validated
 * Type: WRITE (guarded — mandatory validation pipeline)
 *
 * Places an order ONLY after passing all pre-execution validation checks.
 * Monitors fill status and auto-cancels if unfilled after 30s.
 */

import { orderExecutionService } from '@/services/betting/orderExecutionService';
import { prisma } from '@/lib/prisma';
import { runPreExecutionChecks, type ValidationResults } from '../safety/preExecutionChecks';

export interface PlaceOrderInput {
  marketId: string;
  source: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  amount: number;       // USD, max $100
  maxSlippage?: number;  // Default 3%
  userId: string;
}

export interface PlaceOrderOutput {
  success: boolean;
  orderId?: string;
  executionPrice?: number;
  shares?: number;
  fillStatus: 'filled' | 'pending' | 'rejected' | 'auto_cancelled';
  validationResults: ValidationResults;
  error?: string;
}

const AUTO_CANCEL_TIMEOUT_MS = 30_000;
const MONITOR_INTERVAL_MS = 10_000;

export async function placeOrderValidated(
  input: PlaceOrderInput
): Promise<PlaceOrderOutput> {
  // Step 1: MANDATORY validation — cannot be bypassed
  const validation = await runPreExecutionChecks({
    marketId: input.marketId,
    source: input.source,
    side: input.side,
    amount: input.amount,
    userId: input.userId,
  });

  if (!validation.valid) {
    // Log rejected attempt
    await prisma.tradeAuditLog.create({
      data: {
        userId: input.userId,
        tradeType: 'bet',
        action: 'place_order',
        marketId: input.marketId,
        amount: input.amount.toString(),
        source: input.source,
        side: input.side,
        success: false,
        error: `Validation failed: ${validation.failReasons.join('; ')}`,
        metadata: JSON.stringify({ checks: validation.checks }),
      },
    });

    return {
      success: false,
      fillStatus: 'rejected',
      validationResults: validation.checks,
      error: validation.failReasons.join('; '),
    };
  }

  // Step 2: Execute via orderExecutionService
  try {
    const result = await orderExecutionService.placeOrder({
      marketId: input.marketId,
      source: input.source,
      side: input.side,
      amount: input.amount,
      orderType: 'limit',
      limitPrice: validation.livePrice ? validation.livePrice / 100 : undefined,
      userId: input.userId,
    });

    if (!result.success) {
      await prisma.tradeAuditLog.create({
        data: {
          userId: input.userId,
          tradeType: 'bet',
          action: 'place_order',
          marketId: input.marketId,
          orderId: result.orderId,
          amount: input.amount.toString(),
          source: input.source,
          side: input.side,
          success: false,
          error: result.error || 'Order placement failed',
          metadata: JSON.stringify({ checks: validation.checks }),
        },
      });

      return {
        success: false,
        orderId: result.orderId,
        fillStatus: 'rejected',
        validationResults: validation.checks,
        error: result.error,
      };
    }

    // Step 3: Log successful placement
    await prisma.tradeAuditLog.create({
      data: {
        userId: input.userId,
        tradeType: 'bet',
        action: 'place_order',
        marketId: input.marketId,
        orderId: result.orderId,
        amount: input.amount.toString(),
        source: input.source,
        side: input.side,
        success: true,
        metadata: JSON.stringify({
          checks: validation.checks,
          executionPrice: result.executionPrice,
          shares: result.shares,
        }),
      },
    });

    // Step 4: Monitor fill status (non-blocking — fire and forget)
    if (result.orderId && result.status === 'pending') {
      monitorAndAutoCancel(result.orderId, input.source, input.userId, input.marketId).catch(
        () => {} // Silently handle monitoring errors
      );
    }

    return {
      success: true,
      orderId: result.orderId,
      executionPrice: result.executionPrice,
      shares: result.shares,
      fillStatus: result.status === 'filled' ? 'filled' : 'pending',
      validationResults: validation.checks,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown execution error';

    await prisma.tradeAuditLog.create({
      data: {
        userId: input.userId,
        tradeType: 'bet',
        action: 'place_order',
        marketId: input.marketId,
        amount: input.amount.toString(),
        source: input.source,
        side: input.side,
        success: false,
        error: errorMsg,
        metadata: JSON.stringify({ checks: validation.checks }),
      },
    });

    return {
      success: false,
      fillStatus: 'rejected',
      validationResults: validation.checks,
      error: errorMsg,
    };
  }
}

/**
 * Monitor order fill status and auto-cancel if unfilled after 30s.
 * Polls 3 times at 10s intervals.
 */
async function monitorAndAutoCancel(
  orderId: string,
  source: 'polymarket' | 'kalshi',
  userId: string,
  marketId: string
): Promise<void> {
  const polls = 3;

  for (let i = 0; i < polls; i++) {
    await new Promise((resolve) => setTimeout(resolve, MONITOR_INTERVAL_MS));

    try {
      const status = await orderExecutionService.monitorOrder(orderId, source);
      if (status.status === 'filled') return; // Done
      if (status.status === 'cancelled' || status.status === 'failed') return;
    } catch {
      // Continue polling
    }
  }

  // Still pending after 30s — auto-cancel
  try {
    const cancelled = await orderExecutionService.cancelOrder(orderId, source);

    await prisma.tradeAuditLog.create({
      data: {
        userId,
        tradeType: 'bet',
        action: 'cancel_order',
        marketId,
        orderId,
        amount: '0',
        source,
        success: cancelled,
        error: cancelled ? undefined : 'Auto-cancel failed',
        metadata: JSON.stringify({ reason: 'auto_cancel_30s_timeout' }),
      },
    });
  } catch {
    // Best effort auto-cancel
  }
}
