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
import { handleAPIError } from '@/lib/api/errorHandler';
import {
  verifyCronAuth,
  cronAuthErrorResponse,
  withCronTimeout,
  cronConfig,
} from '@/lib/api/cronAuth';

export async function GET(request: NextRequest) {
  try {
    // Verify cron authorization
    const auth = verifyCronAuth(request, { allowDevBypass: true });
    if (!auth.authorized) {
      return cronAuthErrorResponse(auth);
    }

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

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('[Cron] Sync failed:', error);
    return handleAPIError(error, 'CRON:SyncMarkets');
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
