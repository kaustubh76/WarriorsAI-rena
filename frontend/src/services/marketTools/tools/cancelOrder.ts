/**
 * Tool: cancel_order
 * Type: WRITE
 *
 * Cancels a resting or partially filled order.
 * Wraps orderExecutionService.cancelOrder() with audit logging.
 */

import { orderExecutionService } from '@/services/betting/orderExecutionService';
import { prisma } from '@/lib/prisma';

export interface CancelOrderInput {
  orderId: string;
  source: 'polymarket' | 'kalshi';
  reason?: string;
  userId?: string;
}

export interface CancelOrderOutput {
  success: boolean;
  orderId: string;
  error?: string;
}

export async function cancelOrder(
  input: CancelOrderInput
): Promise<CancelOrderOutput> {
  try {
    const success = await orderExecutionService.cancelOrder(
      input.orderId,
      input.source
    );

    // Log cancellation
    if (input.userId) {
      await prisma.tradeAuditLog.create({
        data: {
          userId: input.userId,
          tradeType: 'bet',
          action: 'cancel_order',
          orderId: input.orderId,
          amount: '0',
          source: input.source,
          success,
          error: success ? undefined : 'Cancellation rejected by exchange',
          metadata: JSON.stringify({ reason: input.reason ?? 'user_requested' }),
        },
      });
    }

    return {
      success,
      orderId: input.orderId,
      error: success ? undefined : 'Cancellation rejected by exchange',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';

    if (input.userId) {
      await prisma.tradeAuditLog.create({
        data: {
          userId: input.userId,
          tradeType: 'bet',
          action: 'cancel_order',
          orderId: input.orderId,
          amount: '0',
          source: input.source,
          success: false,
          error: errorMsg,
        },
      });
    }

    return {
      success: false,
      orderId: input.orderId,
      error: errorMsg,
    };
  }
}
