/**
 * Cron Job: Sync External Markets
 *
 * This endpoint is called by Vercel Cron to periodically sync
 * external markets from Polymarket and Kalshi.
 *
 * Configured to run every 6 hours in vercel.json
 */

import { NextRequest, NextResponse } from 'next/server';
import { externalMarketsService } from '@/services/externalMarkets';
import { curateTopics } from '@/services/externalMarkets/topicCurationService';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';
import { sendAlert } from '@/lib/monitoring/alerts';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'cron-sync-markets', ...RateLimitPresets.cronJobs }),
  withCronAuth({ allowDevBypass: true }),
  async (req, ctx) => {
    console.log('[Cron] Starting external markets sync...');

    // Execute with timeout protection
    const results = await withCronTimeout(
      externalMarketsService.syncAllMarkets(),
      cronConfig.defaultApiTimeout,
      'Market sync timed out'
    );

    const summary = {
      timestamp: new Date().toISOString(),
      results: results.map(r => ({
        source: r.source,
        success: r.success,
        added: r.marketsAdded,
        updated: r.marketsUpdated,
        duration: `${r.duration}ms`,
        error: r.error || null,
      })),
      totalAdded: results.reduce((sum, r) => sum + r.marketsAdded, 0),
      totalUpdated: results.reduce((sum, r) => sum + r.marketsUpdated, 0),
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
    };

    console.log('[Cron] Sync complete:', summary);

    // Run topic curation after sync
    let curation = { flagged: 0, unflagged: 0, totalActive: 0 };
    try {
      curation = await curateTopics();
      console.log('[Cron] Topic curation:', curation);
    } catch (curationError) {
      console.error('[Cron] Topic curation failed:', curationError);
    }

    // Alert on sync failures
    if (summary.failureCount > 0) {
      try {
        await sendAlert(
          'Market Sync Failures',
          `${summary.failureCount} market source(s) failed to sync`,
          summary.failureCount >= 2 ? 'critical' : 'warning',
          {
            failureCount: summary.failureCount,
            successCount: summary.successCount,
            failedSources: results.filter(r => !r.success).map(r => r.source).join(', '),
            duration: summary.totalDuration,
          }
        );
      } catch (alertError) {
        console.error('[Cron] Failed to send sync alert:', alertError);
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...summary, curation },
    });
  },
], { errorContext: 'CRON:SyncMarkets' });

// Also support POST for manual triggers
export const POST = GET;
