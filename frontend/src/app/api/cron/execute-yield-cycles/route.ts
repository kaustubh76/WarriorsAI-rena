/**
 * POST /api/cron/execute-yield-cycles
 * Cron job to execute autonomous yield cycles for all active vaults.
 *
 * For each active vault:
 *   1. Evaluate new allocation via 0G AI (trait-constrained)
 *   2. Execute rebalance on-chain via StrategyVault.rebalance()
 *   3. Record cycle results + P&L in DB
 *
 * Schedule: Daily at 00:00 UTC (matches doc: cycleInterval = 86400)
 */

import { NextResponse } from 'next/server';
import { vaultYieldService } from '@/services/vaultYieldService';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';
import { sendAlertWithRateLimit } from '@/lib/monitoring/alerts';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'cron-execute-yield-cycles', ...RateLimitPresets.cronJobs }),
  withCronAuth(),
  async (req, ctx) => {
    console.log('[Cron] Starting vault yield cycle execution...');
    const startTime = Date.now();

    const results = await withCronTimeout(
      vaultYieldService.executeReadyVaults(cronConfig.maxBatchSize),
      cronConfig.defaultApiTimeout,
      'Vault yield cycle execution timed out'
    );

    const duration = Date.now() - startTime;

    console.log('[Cron] Yield cycles completed:', {
      executed: results.executed,
      failed: results.failed,
      skipped: results.skipped,
      duration: `${duration}ms`,
    });

    if (results.errors.length > 0) {
      console.error('[Cron] Yield cycle errors:', results.errors);
    }

    // Alert on failures
    if (results.failed > 0) {
      try {
        await sendAlertWithRateLimit(
          'cron:yield-cycles:failure',
          'Vault Yield Cycle Failures',
          `${results.failed} vault cycles failed during cron execution`,
          results.failed >= 3 ? 'critical' : 'warning',
          {
            executed: results.executed,
            failed: results.failed,
            errors: results.errors,
            duration,
          }
        );
      } catch (alertError) {
        console.error('[Cron] Failed to send yield cycle alert:', alertError);
      }
    }

    return NextResponse.json({
      success: true,
      executedCount: results.executed,
      failedCount: results.failed,
      skippedCount: results.skipped,
      cadenceSource: results.cadenceSource,
      results: results.results,
      errors: results.errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  },
], { errorContext: 'CRON:ExecuteYieldCycles' });

// GET handler for health check / manual trigger in development
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'cron-execute-yield-cycles-get', ...RateLimitPresets.cronJobs }),
  withCronAuth({ allowDevBypass: true }),
  async (req, ctx) => {
    console.log('[Cron] Manual yield cycle trigger');

    const results = await withCronTimeout(
      vaultYieldService.executeReadyVaults(5), // smaller batch for manual trigger
      cronConfig.defaultApiTimeout,
      'Manual yield cycle execution timed out'
    );

    return NextResponse.json({
      success: true,
      message: 'Manual yield cycle execution completed',
      results,
    });
  },
], { errorContext: 'CRON:ExecuteYieldCycles:GET' });
