/**
 * POST /api/cron/execute-strategy-cycles
 *
 * Cron job to execute yield cycles for all active strategy battles.
 * For each active battle with currentRound < 5:
 *   1. Execute one cycle (both warriors rebalance)
 *   2. Score and record results
 *   3. Auto-settle at cycle 5
 *
 * Schedule: Every 4 hours (5 cycles over ~20 hours for demo drama)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { strategyArenaService } from '@/services/arena/strategyArenaService';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';
import { sendAlert } from '@/lib/monitoring/alerts';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'cron-execute-strategy-cycles', ...RateLimitPresets.cronJobs }),
  withCronAuth(),
  async () => {
    console.log('[Cron] Starting strategy battle cycle execution...');
    const startTime = Date.now();

    // Find all active strategy battles that need a cycle
    const activeBattles = await prisma.predictionBattle.findMany({
      where: {
        isStrategyBattle: true,
        status: 'active',
        currentRound: { lt: 5 },
      },
      take: cronConfig.maxBatchSize,
      orderBy: { createdAt: 'asc' },
    });

    if (activeBattles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active strategy battles found',
        executed: 0,
        failed: 0,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[Cron] Processing ${activeBattles.length} active strategy battles`);

    let executed = 0;
    let failed = 0;
    const errors: string[] = [];
    const results: Array<{ battleId: string; round: number; success: boolean; error?: string }> = [];

    for (const battle of activeBattles) {
      try {
        const cycleResult = await withCronTimeout(
          strategyArenaService.executeCycle(battle.id),
          cronConfig.battleExecutionTimeout || cronConfig.defaultApiTimeout,
          `Strategy cycle timeout for battle ${battle.id}`
        );

        executed++;
        results.push({
          battleId: battle.id,
          round: cycleResult.roundNumber,
          success: true,
        });

        console.log(`[Cron] Battle ${battle.id} cycle ${cycleResult.roundNumber} complete${cycleResult.settled ? ' (SETTLED)' : ''}`);
      } catch (error) {
        failed++;
        const errMsg = `Battle ${battle.id}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errMsg);
        results.push({
          battleId: battle.id,
          round: battle.currentRound + 1,
          success: false,
          error: errMsg,
        });
        console.error(`[Cron] Strategy cycle failed:`, errMsg);
      }
    }

    const duration = Date.now() - startTime;

    // Alert on failures
    if (failed > 0) {
      try {
        await sendAlert(
          'Strategy Battle Cycle Failures',
          `${failed} strategy battle cycles failed during cron execution`,
          failed >= 3 ? 'critical' : 'warning',
          { executed, failed, errors, duration }
        );
      } catch (alertError) {
        console.error('[Cron] Failed to send strategy cycle alert:', alertError);
      }
    }

    console.log(`[Cron] Strategy cycles completed: ${executed} executed, ${failed} failed, ${duration}ms`);

    return NextResponse.json({
      success: true,
      executed,
      failed,
      results,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  },
], { errorContext: 'CRON:ExecuteStrategyCycles' });

// GET handler for manual trigger in development
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'cron-execute-strategy-cycles-get', ...RateLimitPresets.cronJobs }),
  withCronAuth({ allowDevBypass: true }),
  async () => {
    console.log('[Cron] Manual strategy cycle trigger');

    const activeBattles = await prisma.predictionBattle.findMany({
      where: {
        isStrategyBattle: true,
        status: 'active',
        currentRound: { lt: 5 },
      },
      take: 3, // smaller batch for manual
      orderBy: { createdAt: 'asc' },
    });

    const results = [];
    for (const battle of activeBattles) {
      try {
        const result = await strategyArenaService.executeCycle(battle.id);
        results.push({ battleId: battle.id, round: result.roundNumber, success: true, settled: result.settled });
      } catch (error) {
        results.push({ battleId: battle.id, success: false, error: String(error) });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Manual strategy cycle execution completed',
      battlesProcessed: activeBattles.length,
      results,
    });
  },
], { errorContext: 'CRON:ExecuteStrategyCycles:GET' });
