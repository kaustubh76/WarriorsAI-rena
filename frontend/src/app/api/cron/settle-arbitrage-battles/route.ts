/**
 * POST /api/cron/settle-arbitrage-battles
 * Cron job to settle completed arbitrage battles when markets resolve
 * Schedule: Every 5 minutes
 */

import { NextRequest, NextResponse } from 'next/server';
import { arbitrageBattleSettlementService } from '@/services/arena/arbitrageBattleSettlement';
import {
  verifyCronAuth,
  cronAuthErrorResponse,
  withCronTimeout,
  cronConfig,
} from '@/lib/api/cronAuth';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit cron endpoint (defense-in-depth)
    applyRateLimit(request, { prefix: 'cron-settle-arbitrage', ...RateLimitPresets.cronJobs });

    // Verify cron authorization
    const auth = verifyCronAuth(request);
    if (!auth.authorized) {
      return cronAuthErrorResponse(auth);
    }

    console.log('[Cron] Starting arbitrage battle settlement...');
    const startTime = Date.now();

    // Settle all ready battles with timeout protection
    const results = await withCronTimeout(
      arbitrageBattleSettlementService.settleAllReadyBattles(),
      cronConfig.defaultApiTimeout,
      'Arbitrage battle settlement timed out'
    );

    const duration = Date.now() - startTime;

    console.log('[Cron] Settlement completed:', {
      settled: results.settled,
      failed: results.failed,
      duration: `${duration}ms`,
    });

    if (results.errors.length > 0) {
      console.error('[Cron] Settlement errors:', results.errors);
    }

    return NextResponse.json({
      success: true,
      settledCount: results.settled,
      failedCount: results.failed,
      errors: results.errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Error in settlement cron job:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET handler for health check / manual trigger in development
export async function GET(request: NextRequest) {
  // Use cronAuth with dev bypass for health checks
  const auth = verifyCronAuth(request, { allowDevBypass: true });
  if (!auth.authorized) {
    return cronAuthErrorResponse(auth);
  }

  console.log('[Cron] Manual settlement trigger');

  try {
    const results = await withCronTimeout(
      arbitrageBattleSettlementService.settleAllReadyBattles(),
      cronConfig.defaultApiTimeout,
      'Arbitrage battle settlement timed out'
    );

    return NextResponse.json({
      success: true,
      message: 'Manual settlement completed',
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
