/**
 * POST /api/cron/settle-arbitrage-battles
 * Cron job to settle completed arbitrage battles when markets resolve
 * Schedule: Every 5 minutes
 */

import { NextRequest, NextResponse } from 'next/server';
import { arbitrageBattleSettlementService } from '@/services/arena/arbitrageBattleSettlement';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'cron-settle-arbitrage', ...RateLimitPresets.cronJobs }),
  withCronAuth(),
  async (req, ctx) => {
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
  },
], { errorContext: 'CRON:SettleArbitrageBattles' });

// GET handler for health check / manual trigger in development
export const GET = composeMiddleware([
  withCronAuth({ allowDevBypass: true }),
  async (req, ctx) => {
    console.log('[Cron] Manual settlement trigger');

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
  },
], { errorContext: 'CRON:SettleArbitrageBattles:GET' });
