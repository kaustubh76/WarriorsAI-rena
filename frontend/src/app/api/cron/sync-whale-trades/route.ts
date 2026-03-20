/**
 * Cron Job: Sync Whale Trades
 *
 * This endpoint is called by Vercel Cron to periodically detect
 * and save whale trades from Polymarket and Kalshi.
 *
 * Configured to run every 6 hours in vercel.json
 */

import { NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';
import { sendAlertWithRateLimit } from '@/lib/monitoring/alerts';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'cron-sync-whale-trades', ...RateLimitPresets.cronJobs }),
  withCronAuth({ allowDevBypass: true }),
  async (req, ctx) => {
    console.log('[Cron] Starting whale trade sync...');

    const results = await withCronTimeout(
      whaleTrackerService.syncWhaleTrades(),
      cronConfig.defaultApiTimeout,
      'Whale trade sync timed out'
    );

    const summary = {
      timestamp: new Date().toISOString(),
      polymarketTrades: results.polymarket,
      kalshiTrades: results.kalshi,
      totalTrades: results.polymarket + results.kalshi,
      success: results.errors.length === 0,
      errors: results.errors.length > 0 ? results.errors : undefined,
    };

    console.log('[Cron] Whale trade sync complete:', summary);

    // Alert on sync errors
    if (results.errors.length > 0) {
      await sendAlertWithRateLimit(
        'cron:sync-whale-trades:error',
        'Whale Trade Sync Errors',
        `${results.errors.length} error(s) during whale trade sync`,
        results.errors.length >= 2 ? 'error' : 'warning',
        { errors: results.errors.slice(0, 5).join('; '), totalTrades: results.polymarket + results.kalshi }
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: summary,
    });
  },
], { errorContext: 'CRON:SyncWhaleTrades' });

// Also support POST for manual triggers
export const POST = GET;
