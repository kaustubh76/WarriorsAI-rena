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
import { handleAPIError } from '@/lib/api/errorHandler';
import {
  verifyCronAuth,
  cronAuthErrorResponse,
  withCronTimeout,
  cronConfig,
} from '@/lib/api/cronAuth';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';

export async function GET(request: NextRequest) {
  try {
    // Rate limit cron endpoint (defense-in-depth)
    applyRateLimit(request, { prefix: 'cron-detect-arbitrage', ...RateLimitPresets.cronJobs });

    // Verify cron authorization
    const auth = verifyCronAuth(request, { allowDevBypass: true });
    if (!auth.authorized) {
      return cronAuthErrorResponse(auth);
    }

    console.log('[Cron] Starting arbitrage detection...');

    // Get minSpread from query params or default to 5%
    const searchParams = request.nextUrl.searchParams;
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
  } catch (error) {
    console.error('[Cron] Arbitrage detection failed:', error);
    return handleAPIError(error, 'CRON:DetectArbitrage');
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
