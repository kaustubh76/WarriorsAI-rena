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
import { sendAlert } from '@/lib/monitoring/alerts';
import { detectTrendingTopics } from '@/services/topics/trendingDetectionService';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'cron-detect-arbitrage', ...RateLimitPresets.cronJobs }),
  withCronAuth({ allowDevBypass: true }),
  async (req, ctx) => {
    console.log('[Cron] Starting arbitrage detection...');

    // Get minSpread from query params or default to 5%
    const searchParams = req.nextUrl.searchParams;
    const rawMinSpread = parseFloat(searchParams.get('minSpread') || '5');
    const minSpread = isNaN(rawMinSpread) || rawMinSpread < 0 || rawMinSpread > 100 ? 5 : rawMinSpread;

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

    // After detection, mark trending topics from matched pairs
    let trendingResult = { marked: 0, unmarked: 0, pairsProcessed: 0 };
    try {
      trendingResult = await detectTrendingTopics();
      console.log('[Cron] Trending detection complete:', trendingResult);
    } catch (trendingErr) {
      console.error('[Cron] Trending detection failed:', trendingErr);
    }

    console.log('[Cron] Arbitrage detection complete:', summary);

    // Alert on detection errors
    if (results.errors.length > 0) {
      try {
        await sendAlert(
          'Arbitrage Detection Errors',
          `${results.errors.length} error(s) during arbitrage detection`,
          results.errors.length >= 3 ? 'critical' : 'warning',
          {
            errorCount: results.errors.length,
            opportunitiesFound: results.opportunitiesFound,
            errors: results.errors.slice(0, 5).join('; '),
            duration: results.duration,
          }
        );
      } catch (alertError) {
        console.error('[Cron] Failed to send detection alert:', alertError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        trending: {
          marked: trendingResult.marked,
          unmarked: trendingResult.unmarked,
          pairsProcessed: trendingResult.pairsProcessed,
        },
      },
    });
  },
], { errorContext: 'CRON:DetectArbitrage' });

// Also support POST for manual triggers
export const POST = GET;
