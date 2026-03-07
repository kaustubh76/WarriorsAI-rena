/**
 * Pre-Execution Checks Pipeline
 *
 * 5-step validation pipeline run before every write trade operation.
 * Each check returns a structured result; pipeline short-circuits on failure
 * for place_order but returns all results for validate_trade.
 */

import { polymarketCircuitBreaker, kalshiCircuitBreaker } from '@/services/betting/tradingCircuitBreaker';
import { polymarketService } from '@/services/externalMarkets';
import { prisma } from '@/lib/prisma';
import { checkExposure, validateTradeAmount } from './exposureTracker';

// ============================================
// TYPES
// ============================================

export interface CheckResult {
  passed: boolean;
  reason?: string;
}

export interface PriceFreshnessResult extends CheckResult {
  livePrice: number;
  age: number; // seconds
}

export interface OrderbookDepthResult extends CheckResult {
  depth: number;
  minRequired: number;
  estimatedSlippage: number;
}

export interface ExposureResult extends CheckResult {
  current: number;
  max: number;
  afterTrade: number;
}

export interface SlippageResult extends CheckResult {
  estimated: number;
  max: number;
}

export interface ValidationResults {
  circuitBreaker: CheckResult;
  priceFreshness: PriceFreshnessResult;
  orderbookDepth: OrderbookDepthResult;
  userExposure: ExposureResult;
  slippage: SlippageResult;
  tradeAmount: CheckResult;
}

export interface PreExecutionResult {
  valid: boolean;
  checks: ValidationResults;
  failReasons: string[];
  recommendation: 'proceed' | 'caution' | 'reject';
  livePrice?: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Maximum age of price data in seconds */
const MAX_PRICE_AGE_SECONDS = 300; // 5 minutes

/** Minimum orderbook depth in USD at target price level */
const MIN_ORDERBOOK_DEPTH_USD = 500;

/** Maximum allowed slippage as percentage */
const MAX_SLIPPAGE_PERCENT = 3;

/** Warning threshold for price deviation */
const PRICE_DEVIATION_WARN_PERCENT = 1;

// ============================================
// PIPELINE
// ============================================

/**
 * Run the full 5-step pre-execution validation pipeline.
 *
 * Steps:
 *   1. Circuit Breaker — Is the exchange healthy?
 *   2. Price Freshness — Fetch live CLOB midpoint, reject if >5min old
 *   3. Orderbook Depth — Min $500 liquidity at target price level
 *   4. User Exposure — Current + proposed < $1000 max
 *   5. Slippage — Estimated < 3% max
 */
export async function runPreExecutionChecks(params: {
  marketId: string;
  source: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  amount: number;
  userId?: string;
}): Promise<PreExecutionResult> {
  const { marketId, source, side, amount, userId } = params;
  const failReasons: string[] = [];

  // Step 0: Trade amount validation
  const amountCheck = validateTradeAmount(amount);
  const tradeAmountResult: CheckResult = {
    passed: amountCheck.valid,
    reason: amountCheck.reason,
  };
  if (!amountCheck.valid) {
    failReasons.push(amountCheck.reason!);
  }

  // Step 1: Circuit Breaker Check
  const breaker = source === 'polymarket' ? polymarketCircuitBreaker : kalshiCircuitBreaker;
  const breakerStatus = breaker.getStatus();
  const circuitBreakerResult: CheckResult = {
    passed: !breakerStatus.isOpen,
    reason: breakerStatus.isOpen
      ? `${source} circuit breaker is open (${breakerStatus.failureCount} failures). Resets at ${breakerStatus.willResetAt?.toISOString()}`
      : undefined,
  };
  if (!circuitBreakerResult.passed) {
    failReasons.push(circuitBreakerResult.reason!);
  }

  // Step 2: Price Freshness
  let priceFreshnessResult: PriceFreshnessResult = {
    passed: false,
    livePrice: 0,
    age: Infinity,
    reason: 'Could not fetch live price',
  };

  try {
    // Look up the market in DB to get tokenId for Polymarket
    const market = await prisma.externalMarket.findUnique({
      where: { id: marketId },
      select: { metadata: true, yesPrice: true, lastSyncAt: true },
    });

    if (market) {
      const ageSec = (Date.now() - market.lastSyncAt.getTime()) / 1000;

      // Try to get live midpoint if Polymarket
      let livePrice = market.yesPrice / 100; // Fallback to DB price

      if (source === 'polymarket' && market.metadata) {
        try {
          const meta = JSON.parse(market.metadata);
          const tokenId = side === 'YES'
            ? meta.clobTokenIds?.[0]
            : meta.clobTokenIds?.[1];

          if (tokenId) {
            livePrice = await polymarketService.getMidpoint(tokenId);
          }
        } catch {
          // Fall through to DB price
        }
      }

      const isFresh = ageSec <= MAX_PRICE_AGE_SECONDS;
      priceFreshnessResult = {
        passed: isFresh,
        livePrice,
        age: Math.round(ageSec),
        reason: !isFresh
          ? `Price data is ${Math.round(ageSec)}s old (max ${MAX_PRICE_AGE_SECONDS}s)`
          : undefined,
      };

      if (!isFresh) {
        failReasons.push(priceFreshnessResult.reason!);
      }
    } else {
      failReasons.push('Market not found in database');
    }
  } catch (err) {
    priceFreshnessResult.reason = `Failed to check price freshness: ${err instanceof Error ? err.message : 'unknown error'}`;
    failReasons.push(priceFreshnessResult.reason);
  }

  // Step 3: Orderbook Depth
  let orderbookDepthResult: OrderbookDepthResult = {
    passed: false,
    depth: 0,
    minRequired: MIN_ORDERBOOK_DEPTH_USD,
    estimatedSlippage: Infinity,
    reason: 'Could not fetch orderbook',
  };

  try {
    if (source === 'polymarket') {
      const market = await prisma.externalMarket.findUnique({
        where: { id: marketId },
        select: { metadata: true },
      });

      if (market?.metadata) {
        const meta = JSON.parse(market.metadata);
        const tokenId = side === 'YES'
          ? meta.clobTokenIds?.[0]
          : meta.clobTokenIds?.[1];

        if (tokenId) {
          const orderbook = await polymarketService.getOrderbook(tokenId);
          const asks = orderbook.asks || [];

          // Calculate total depth on the ask side (what we'd buy into)
          let totalDepth = 0;
          let weightedPriceSum = 0;
          let sharesSum = 0;

          for (const level of asks) {
            const price = typeof level.price === 'string' ? parseFloat(level.price) : level.price;
            const size = typeof level.size === 'string' ? parseFloat(level.size) : level.size;
            if (isNaN(price) || isNaN(size)) continue;
            totalDepth += price * size;
            weightedPriceSum += price * size;
            sharesSum += size;
          }

          const midpoint = priceFreshnessResult.livePrice / 100; // Convert to 0-1
          const avgFillPrice = sharesSum > 0 ? weightedPriceSum / sharesSum : midpoint;
          const estimatedSlippage = midpoint > 0
            ? Math.abs(avgFillPrice - midpoint) / midpoint * 100
            : 0;

          const hasSufficientDepth = totalDepth >= MIN_ORDERBOOK_DEPTH_USD;

          orderbookDepthResult = {
            passed: hasSufficientDepth,
            depth: Math.round(totalDepth),
            minRequired: MIN_ORDERBOOK_DEPTH_USD,
            estimatedSlippage: Math.round(estimatedSlippage * 100) / 100,
            reason: !hasSufficientDepth
              ? `Orderbook depth $${Math.round(totalDepth)} below minimum $${MIN_ORDERBOOK_DEPTH_USD}`
              : undefined,
          };

          if (!hasSufficientDepth) {
            failReasons.push(orderbookDepthResult.reason!);
          }
        }
      }
    } else {
      // Kalshi: depth check not yet implemented, fail safe
      orderbookDepthResult = {
        passed: false,
        depth: 0,
        minRequired: MIN_ORDERBOOK_DEPTH_USD,
        estimatedSlippage: 0,
        reason: 'Kalshi orderbook depth validation not yet available',
      };
      failReasons.push(orderbookDepthResult.reason!);
    }
  } catch (err) {
    orderbookDepthResult.reason = `Orderbook depth check failed: ${err instanceof Error ? err.message : 'unknown'}`;
    failReasons.push(orderbookDepthResult.reason);
  }

  // Step 4: User Exposure Check
  let userExposureResult: ExposureResult = {
    passed: true,
    current: 0,
    max: 1000,
    afterTrade: amount,
  };

  if (userId) {
    const exposure = await checkExposure(userId, amount);
    userExposureResult = {
      passed: !exposure.wouldExceed,
      current: exposure.currentExposure,
      max: exposure.maxExposure,
      afterTrade: exposure.afterTradeExposure,
      reason: exposure.wouldExceed
        ? `Trade would bring exposure to $${exposure.afterTradeExposure.toFixed(2)} (max $${exposure.maxExposure})`
        : undefined,
    };
    if (exposure.wouldExceed) {
      failReasons.push(userExposureResult.reason!);
    }
  }

  // Step 5: Slippage Check
  const slippageResult: SlippageResult = {
    passed: orderbookDepthResult.estimatedSlippage <= MAX_SLIPPAGE_PERCENT,
    estimated: orderbookDepthResult.estimatedSlippage,
    max: MAX_SLIPPAGE_PERCENT,
    reason: orderbookDepthResult.estimatedSlippage > MAX_SLIPPAGE_PERCENT
      ? `Estimated slippage ${orderbookDepthResult.estimatedSlippage}% exceeds max ${MAX_SLIPPAGE_PERCENT}%`
      : undefined,
  };
  if (!slippageResult.passed) {
    failReasons.push(slippageResult.reason!);
  }

  // Aggregate results
  const checks: ValidationResults = {
    circuitBreaker: circuitBreakerResult,
    priceFreshness: priceFreshnessResult,
    orderbookDepth: orderbookDepthResult,
    userExposure: userExposureResult,
    slippage: slippageResult,
    tradeAmount: tradeAmountResult,
  };

  const allPassed = failReasons.length === 0;
  const hasWarnings = !allPassed && failReasons.length <= 2;

  return {
    valid: allPassed,
    checks,
    failReasons,
    recommendation: allPassed ? 'proceed' : hasWarnings ? 'caution' : 'reject',
    livePrice: priceFreshnessResult.livePrice,
  };
}
