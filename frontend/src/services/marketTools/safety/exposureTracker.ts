/**
 * Exposure Tracker
 *
 * Tracks per-user open position exposure across all markets.
 * Enforces maximum exposure limits to prevent over-leveraging.
 */

import { prisma } from '@/lib/prisma';

/** Maximum total exposure per user in USD */
const MAX_USER_EXPOSURE_USD = 1000;

/** Maximum single trade amount in USD */
const MAX_SINGLE_TRADE_USD = 100;

export interface ExposureCheck {
  currentExposure: number; // USD value of open positions
  maxExposure: number;
  remainingCapacity: number;
  wouldExceed: boolean;
  afterTradeExposure: number;
}

/**
 * Get a user's current open position exposure in USD.
 */
export async function getUserExposure(userId: string): Promise<{
  current: number;
  max: number;
  remaining: number;
}> {
  // Query pending/placed bets that haven't settled
  const openBets = await prisma.marketBet.findMany({
    where: {
      userId,
      status: { in: ['pending', 'placed'] },
    },
    select: {
      amount: true,
      entryPrice: true,
    },
  });

  // Sum up exposure: (amount in CRwN tokens) × (entryPrice / 100) ≈ USD value
  // amount is BigInt in CRwN wei (18 decimals), entryPrice is 0-100%
  let totalExposure = 0;
  for (const bet of openBets) {
    const amountTokens = Number(bet.amount) / 1e18; // Convert wei → tokens
    if (!isNaN(amountTokens) && isFinite(amountTokens)) {
      // Approximate USD: tokens × (entryPrice as fraction)
      const usdValue = amountTokens * (bet.entryPrice / 100);
      totalExposure += usdValue;
    }
  }

  // Also check open arbitrage trades
  const openArbs = await prisma.arbitrageTrade.findMany({
    where: {
      userId,
      status: { in: ['pending', 'partial'] },
    },
    select: {
      investmentAmount: true,
    },
  });

  for (const arb of openArbs) {
    const amountTokens = Number(arb.investmentAmount) / 1e18;
    if (!isNaN(amountTokens) && isFinite(amountTokens)) {
      totalExposure += amountTokens;
    }
  }

  return {
    current: totalExposure,
    max: MAX_USER_EXPOSURE_USD,
    remaining: Math.max(0, MAX_USER_EXPOSURE_USD - totalExposure),
  };
}

/**
 * Check if a new trade would exceed the user's exposure limit.
 */
export async function checkExposure(
  userId: string,
  additionalAmount: number
): Promise<ExposureCheck> {
  const { current, max, remaining } = await getUserExposure(userId);

  const afterTradeExposure = current + additionalAmount;
  const wouldExceed = afterTradeExposure > max;

  return {
    currentExposure: current,
    maxExposure: max,
    remainingCapacity: remaining,
    wouldExceed,
    afterTradeExposure,
  };
}

/**
 * Validate a single trade amount against per-trade limit.
 */
export function validateTradeAmount(amount: number): {
  valid: boolean;
  max: number;
  reason?: string;
} {
  if (amount <= 0) {
    return { valid: false, max: MAX_SINGLE_TRADE_USD, reason: 'Trade amount must be positive' };
  }
  if (amount > MAX_SINGLE_TRADE_USD) {
    return {
      valid: false,
      max: MAX_SINGLE_TRADE_USD,
      reason: `Trade amount $${amount} exceeds maximum of $${MAX_SINGLE_TRADE_USD}`,
    };
  }
  return { valid: true, max: MAX_SINGLE_TRADE_USD };
}
