/**
 * POST /api/cron/execute-strategy-cycles
 *
 * Cron job to execute yield cycles for all active strategy battles.
 * For each active battle with currentRound < 5:
 *   1. Execute one cycle (both warriors rebalance)
 *   2. Score and record results
 *   3. Auto-settle at cycle 5
 *
 * Schedule: Every 1 minute (5 cycles complete in ~5 min)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { strategyArenaService } from '@/services/arena/strategyArenaService';
import { withCronTimeout, cronConfig } from '@/lib/api/cronAuth';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';
import { sendAlertWithRateLimit } from '@/lib/monitoring/alerts';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'cron-execute-strategy-cycles', ...RateLimitPresets.cronJobs }),
  withCronAuth(),
  async () => {
    console.log('[Cron] Starting strategy battle cycle execution...');
    const startTime = Date.now();
    const BUDGET_MS = 270_000; // stop starting new work at 4.5min to stay under Vercel 5min cron limit
    const STUCK_BATTLE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

    // --- Stuck-battle catch-up (P4-11) ---
    // Battles that completed all 5 cycles but whose settleBattle() call failed
    // (e.g. cron killed mid-execution) need to be settled before processing new cycles.
    // Only retry battles created within the last 24h to prevent infinite retry loops.
    const stuckBattles = await prisma.predictionBattle.findMany({
      where: {
        isStrategyBattle: true,
        status: 'active',
        currentRound: { gte: 5 },
        createdAt: { gte: new Date(Date.now() - STUCK_BATTLE_MAX_AGE_MS) },
      },
      include: {
        rounds: { select: { roundNumber: true } },
      },
      take: 5,
    });
    if (stuckBattles.length > 0) {
      console.log(`[Cron] Found ${stuckBattles.length} stuck battles (round >=5 but still active) — settling now`);
      for (const stuck of stuckBattles) {
        if (Date.now() - startTime > BUDGET_MS) {
          console.warn(`[Cron] Budget exhausted (${Date.now() - startTime}ms) — skipping remaining stuck battles`);
          break;
        }
        // Verify actual round count matches DB claim before settling
        if (stuck.rounds.length < 5) {
          console.error(`[Cron] Battle ${stuck.id} claims currentRound=${stuck.currentRound} but only has ${stuck.rounds.length} rounds — skipping (data inconsistency)`);
          await sendAlertWithRateLimit('cron:strategy-cycles:data-inconsistency', 'Battle Round Count Mismatch', `Battle ${stuck.id} has currentRound=${stuck.currentRound} but only ${stuck.rounds.length} rounds in DB`, 'critical', { battleId: stuck.id }).catch(() => {});
          continue;
        }
        try {
          await strategyArenaService.settleBattle(stuck.id);
          console.log(`[Cron] Settled stuck battle ${stuck.id}`);
        } catch (settleErr) {
          console.error(`[Cron] Failed to settle stuck battle ${stuck.id}:`, settleErr);
        }
      }
    }

    // Alert for abandoned battles stuck > 24h that need manual intervention
    const abandonedCount = await prisma.predictionBattle.count({
      where: {
        isStrategyBattle: true,
        status: 'active',
        currentRound: { gte: 5 },
        createdAt: { lt: new Date(Date.now() - STUCK_BATTLE_MAX_AGE_MS) },
      },
    });
    if (abandonedCount > 0) {
      console.error(`[Cron] ${abandonedCount} battles stuck >24h — require manual settlement`);
      await sendAlertWithRateLimit('cron:strategy-cycles:abandoned', 'Abandoned Stuck Battles', `${abandonedCount} battles stuck >24h require manual intervention`, 'critical', { abandonedCount }).catch(() => {});
    }

    // --- Retry on-chain settlement for DB-settled battles where contract call failed ---
    // These are battles that completed in DB (status='completed') but BattleManager.settleBattle()
    // failed, leaving bettors unable to claim. Retry up to 3 per cron run.
    if (Date.now() - startTime < BUDGET_MS) {
      try {
        const unsettledOnChain = await prisma.predictionBattle.findMany({
          where: {
            isStrategyBattle: true,
            status: 'completed',
            onChainBattleId: { not: null },
            createdAt: { gte: new Date(Date.now() - STUCK_BATTLE_MAX_AGE_MS) },
          },
          take: 3,
          orderBy: { completedAt: 'asc' },
        });

        for (const b of unsettledOnChain) {
          const pool = await prisma.battleBettingPool.findFirst({ where: { battleId: b.id } });
          if (pool && !pool.onChainSettled) {
            if (Date.now() - startTime > BUDGET_MS) break;
            const result = await strategyArenaService.retryOnChainSettlement(b.id);
            console.log(`[Cron] On-chain settlement retry for ${b.id}: ${result.success ? 'OK' : result.error}`);
          }
        }
      } catch (retryErr) {
        console.error('[Cron] On-chain settlement retry scan failed:', retryErr);
      }
    }

    // Find active strategy battles that are ready for their next cycle
    // Pacing: at least 45s between cycles to prevent double-execution (cron runs every 1 min)
    const MIN_CYCLE_INTERVAL_MS = 45 * 1000;
    const pacingCutoff = new Date(Date.now() - MIN_CYCLE_INTERVAL_MS);

    const activeBattles = await prisma.predictionBattle.findMany({
      where: {
        isStrategyBattle: true,
        status: 'active',
        currentRound: { lt: 5 },
        AND: [
          // Only execute if scheduled start time has passed (or not set)
          { OR: [{ scheduledStartAt: null }, { scheduledStartAt: { lte: new Date() } }] },
          // Pacing: only if last cycle was at least 45s ago (or never executed)
          { OR: [{ lastCycleAt: null }, { lastCycleAt: { lte: pacingCutoff } }] },
        ],
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
      if (Date.now() - startTime > BUDGET_MS) {
        console.warn(`[Cron] Budget exhausted (${Date.now() - startTime}ms) — skipping remaining battles`);
        break;
      }

      // Run up to 5 remaining cycles per battle so one cron invocation
      // can complete an entire battle (Hobby plan limits cron to daily/hourly)
      const remainingCycles = 5 - battle.currentRound;
      for (let cycle = 0; cycle < remainingCycles; cycle++) {
        if (Date.now() - startTime > BUDGET_MS) {
          console.warn(`[Cron] Budget exhausted mid-battle ${battle.id} — will resume next run`);
          break;
        }
        try {
          const cycleResult = await withCronTimeout(
            strategyArenaService.executeCycle(battle.id),
            cronConfig.battleExecutionTimeout || cronConfig.defaultApiTimeout,
            `Strategy cycle timeout for battle ${battle.id}`
          );

          if (!cycleResult) {
            throw new Error(`executeCycle returned empty result for battle ${battle.id}`);
          }

          executed++;
          results.push({
            battleId: battle.id,
            round: cycleResult.roundNumber,
            success: true,
          });

          console.log(`[Cron] Battle ${battle.id} cycle ${cycleResult.roundNumber} complete${cycleResult.settled ? ' (SETTLED)' : ''}`);

          // If battle settled at cycle 5, stop cycling this battle
          if (cycleResult.settled) break;
        } catch (error) {
          failed++;
          const errMsg = `Battle ${battle.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errMsg);
          results.push({
            battleId: battle.id,
            round: battle.currentRound + cycle + 1,
            success: false,
            error: errMsg,
          });
          console.error(`[Cron] Strategy cycle failed:`, errMsg);
          break; // Stop cycling this battle on error, move to next
        }
      }
    }

    const duration = Date.now() - startTime;

    // Alert on failures
    if (failed > 0) {
      try {
        await sendAlertWithRateLimit(
          'cron:strategy-cycles:failure',
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

    const skipped = activeBattles.length - executed - failed;

    return NextResponse.json({
      success: true,
      executed,
      failed,
      skipped,
      results,
      errors,
      duration,
      budgetExhausted: Date.now() - startTime > BUDGET_MS,
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
      take: 10,
      orderBy: { createdAt: 'desc' }, // newest first so recent battles get cycles
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
