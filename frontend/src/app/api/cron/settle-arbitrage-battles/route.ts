/**
 * POST /api/cron/settle-arbitrage-battles
 * Cron job to settle completed arbitrage battles when markets resolve
 * Schedule: Daily at noon UTC (0 12 * * *)
 */

import { NextRequest, NextResponse } from 'next/server';
import { arbitrageBattleSettlementService } from '@/services/arena/arbitrageBattleSettlement';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';
import { sendAlertWithRateLimit } from '@/lib/monitoring/alerts';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'cron-settle-arbitrage', ...RateLimitPresets.cronJobs }),
  withCronAuth(),
  async (req, ctx) => {
    console.log('[Cron] Starting arbitrage battle settlement...');
    const startTime = Date.now();

    let results: Awaited<ReturnType<typeof arbitrageBattleSettlementService.settleAllReadyBattles>>;

    // Settle all ready battles with timeout protection + alerting
    try {
      results = await withCronTimeout(
        arbitrageBattleSettlementService.settleAllReadyBattles(),
        cronConfig.defaultApiTimeout,
        'Arbitrage battle settlement timed out'
      );
    } catch (timeoutError) {
      // Alert on timeout — this is critical since settlements may be partially applied
      const duration = Date.now() - startTime;
      try {
        await sendAlertWithRateLimit(
          'cron:settle-arbitrage:timeout',
          'Arbitrage Settlement Timeout',
          'Settlement process exceeded max allowed time — partial settlements may exist',
          'critical',
          { timeout: cronConfig.defaultApiTimeout, duration, error: (timeoutError as Error).message }
        );
      } catch (alertErr) {
        console.error('[Cron] Failed to send timeout alert:', alertErr);
      }
      throw timeoutError; // Let composeMiddleware handle the 500
    }

    const duration = Date.now() - startTime;

    console.log('[Cron] Settlement completed:', {
      settled: results.settled,
      failed: results.failed,
      totalReady: results.totalReady,
      duration: `${duration}ms`,
    });

    if (results.errors.length > 0) {
      console.error('[Cron] Settlement errors:', results.errors);
    }

    // Alert on settlement failures
    if (results.failed > 0) {
      try {
        await sendAlertWithRateLimit(
          'cron:settle-arbitrage:failure',
          'Arbitrage Settlement Failures',
          `${results.failed} battles failed to settle during cron job`,
          results.failed >= 3 ? 'critical' : 'warning',
          {
            settled: results.settled,
            failed: results.failed,
            totalReady: results.totalReady,
            errors: results.errors,
            duration,
          }
        );
      } catch (alertError) {
        console.error('[Cron] Failed to send settlement alert:', alertError);
      }
    }

    return NextResponse.json({
      success: true,
      settledCount: results.settled,
      failedCount: results.failed,
      totalReady: results.totalReady,
      errors: results.errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  },
], { errorContext: 'CRON:SettleArbitrageBattles' });

// GET handler for health check / manual trigger in development
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'cron-settle-arbitrage-get', ...RateLimitPresets.cronJobs }),
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
