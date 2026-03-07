/**
 * Tool: monitor_position
 * Type: READ
 *
 * Tracks order fill status and P&L.
 * Wraps orderExecutionService.monitorOrder().
 */

import { orderExecutionService } from '@/services/betting/orderExecutionService';

export interface MonitorPositionInput {
  orderId: string;
  source: 'polymarket' | 'kalshi';
}

export interface MonitorPositionOutput {
  orderId: string;
  status: 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'failed';
  fillPercentage: number;
  executionPrice: number;
  shares: number;
  filledShares: number;
  timeElapsed: number; // seconds since order placement (approximate)
}

export async function monitorPosition(
  input: MonitorPositionInput
): Promise<MonitorPositionOutput> {
  const status = await orderExecutionService.monitorOrder(
    input.orderId,
    input.source
  );

  const shares = status.shares ?? 0;
  const filledShares = status.filledShares ?? 0;
  const fillPercentage = status.fillPercentage ?? (shares > 0 ? (filledShares / shares) * 100 : 0);

  return {
    orderId: status.orderId,
    status: status.status,
    fillPercentage: Math.round(fillPercentage * 100) / 100,
    executionPrice: status.executionPrice ?? 0,
    shares,
    filledShares,
    timeElapsed: status.timestamp
      ? Math.round((Date.now() - status.timestamp) / 1000)
      : 0,
  };
}
