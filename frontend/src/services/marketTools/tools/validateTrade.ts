/**
 * Tool: validate_trade
 * Type: READ (analysis only — does NOT execute)
 *
 * Runs the full 5-step pre-execution validation pipeline
 * and returns structured results without placing any orders.
 */

import { runPreExecutionChecks, type PreExecutionResult } from '../safety/preExecutionChecks';

export interface ValidateTradeInput {
  marketId: string;
  source: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  amount: number;    // USD
  userId?: string;   // For exposure check
}

export type ValidateTradeOutput = PreExecutionResult;

export async function validateTrade(
  input: ValidateTradeInput
): Promise<ValidateTradeOutput> {
  return runPreExecutionChecks({
    marketId: input.marketId,
    source: input.source,
    side: input.side,
    amount: input.amount,
    userId: input.userId,
  });
}
