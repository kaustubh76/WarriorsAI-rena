/**
 * Cron Job: Detect Arbitrage Opportunities
 *
 * This endpoint is called by Vercel Cron to periodically scan for
 * arbitrage opportunities between Polymarket and Kalshi markets.
 *
 * Configured to run every 10 minutes in vercel.json
 *
 * Process:
 * 1. Find arbitrage opportunities using market matcher
 * 2. Cache opportunities in MatchedMarketPair table
 * 3. Deactivate stale opportunities
 * 4. Return summary statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { arbitrageMarketMatcher } from '@/services/arbitrage/marketMatcher';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'cron-detect-arbitrage', ...RateLimitPresets.cronJobs }),
  withCronAuth({ allowDevBypass: true }),
  async (req, ctx) => {
    console.log('[Cron] Starting arbitrage detection...');

    // Get minSpread from query params or default to 5%
    const searchParams = req.nextUrl.searchParams;
    const minSpread = parseFloat(searchParams.get('minSpread') || '5');

    // Run market matcher with timeout protection
    const results = await withCronTimeout(
      arbitrageMarketMatcher.findAndCacheOpportunities(minSpread),
      cronConfig.defaultApiTimeout,
      'Arbitrage detection timed out'
    );

    const summary = {
      timestamp: new Date().toISOString(),
      minSpread: `${minSpread}%`,
      opportunitiesFound: results.opportunitiesFound,
      pairsCreated: results.pairsCreated,
      pairsUpdated: results.pairsUpdated,
      pairsDeactivated: results.pairsDeactivated,
      duration: `${results.duration}ms`,
      success: results.errors.length === 0,
      errors: results.errors.length > 0 ? results.errors : undefined
    };

    console.log('[Cron] Arbitrage detection complete:', summary);

    return NextResponse.json({
      success: true,
      data: summary
    });
  },
], { errorContext: 'CRON:DetectArbitrage' });

// Also support POST for manual triggers
export const POST = GET;
