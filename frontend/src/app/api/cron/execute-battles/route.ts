import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, withCronAuth } from '@/lib/api/middleware';
import { cronConfig } from '@/lib/api/cronAuth';
import { getBattleMonitor } from '@/lib/monitoring/battleMonitor';
import { alertHighQueueDepth, sendAlert, alertBridgeFailure } from '@/lib/monitoring/alerts';
import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';
import {
  createServerAuthorization,
  configureServerFCL,
  isServerFlowConfigured,
} from '@/lib/flow/serverAuth';

// Configure FCL for server-side
configureServerFCL();

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FLOW_CADENCE_ADDRESS || process.env.NEXT_PUBLIC_FLOW_TESTNET_ADDRESS;
const CRON_SECRET = process.env.CRON_SECRET;

// Validate required config at module load time (skip during build)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
if (!isBuildTime && (!CRON_SECRET || CRON_SECRET.length < 32)) {
  throw new Error(
    'CRON_SECRET must be set in environment variables and be at least 32 characters long. ' +
    'Generate a secure secret with: openssl rand -base64 32'
  );
}
if (!isBuildTime && !isServerFlowConfigured()) {
  console.warn(
    '[Execute Battles Cron] Missing Flow Cadence config. ' +
    'Cron job will reject requests until FLOW_CADENCE_ACCOUNT_ADDRESS, FLOW_CADENCE_PRIVATE_KEY, and NEXT_PUBLIC_FLOW_CADENCE_ADDRESS are configured.'
  );
}

/**
 * POST /api/cron/execute-battles
 * Automated cron job to execute ready battles
 *
 * Usage with Vercel Cron:
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/execute-battles",
 *     "schedule": "* * * * *"  // Every minute
 *   }]
 * }
 *
 * Or call manually: curl -X POST http://localhost:3000/api/cron/execute-battles \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export const POST = composeMiddleware([
  withRateLimit({ prefix: 'cron-execute-battles', ...RateLimitPresets.cronJobs }),
  withCronAuth(),
  async (req, ctx) => {
    if (!isServerFlowConfigured() || !CONTRACT_ADDRESS) {
      return NextResponse.json(
        ErrorResponses.serviceUnavailable('Flow testnet not configured'),
        { status: 503 }
      );
    }

    // Create server authorization for transaction signing
    const serverAuthz = createServerAuthorization();

    console.log('[Execute Battles Cron] Starting execution check...');

    // Query ready battles (graceful if contract not deployed)
    let readyBattles;
    try {
      readyBattles = await fcl.query({
        cadence: `
          import ScheduledBattle from ${CONTRACT_ADDRESS}

          access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
            return ScheduledBattle.getReadyTransactions()
          }
        `,
      });
    } catch (queryError: any) {
      const msg = queryError?.message || '';
      if (msg.includes('cannot find declaration') || msg.includes('cannot import') || msg.includes('could not import')) {
        console.warn('[Execute Battles Cron] ScheduledBattle contract not deployed yet at', CONTRACT_ADDRESS);
        return NextResponse.json({
          success: true,
          data: {
            message: 'ScheduledBattle contract not deployed — skipping execution',
            executed: 0,
            timestamp: new Date().toISOString(),
          },
        });
      }
      throw queryError;
    }

    if (!readyBattles || readyBattles.length === 0) {
      console.log('[Execute Battles Cron] No battles ready for execution');
      return NextResponse.json({
        success: true,
        data: {
          message: 'No battles ready for execution',
          executed: 0,
          timestamp: new Date().toISOString(),
        },
      });
    }

    console.log(`[Execute Battles Cron] Found ${readyBattles.length} battles ready for execution`);

    // Batch size limit: prevent exceeding Vercel timeout (60s)
    const battlesToProcess = readyBattles.slice(0, cronConfig.maxBatchSize);
    const skipped = readyBattles.length - battlesToProcess.length;
    if (skipped > 0) {
      console.warn(`[Execute Battles Cron] Processing ${battlesToProcess.length} of ${readyBattles.length} battles (${skipped} deferred to next run)`);
    }

    // Get monitor for tracking
    const monitor = getBattleMonitor();

    // Check queue depth and alert if high
    if (readyBattles.length > 20) {
      try {
        await alertHighQueueDepth(readyBattles.length, 20);
      } catch (error) {
        console.error('[Execute Battles Cron] Failed to send queue depth alert:', error);
      }
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Execute each ready battle (batch-limited)
    for (const battle of battlesToProcess) {
      const startTime = Date.now();
      try {
        const battleId = parseInt(battle.id);
        console.log(`[Execute Battles Cron] Executing battle ${battleId}...`);

        // Execute battle transaction with server-side auth
        const transactionId = await fcl.mutate({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            transaction(battleId: UInt64) {
              let executorAddress: Address

              prepare(signer: auth(Storage) &Account) {
                self.executorAddress = signer.address
              }

              execute {
                let winner = ScheduledBattle.executeBattle(
                  transactionId: battleId,
                  executor: self.executorAddress
                )
                log("Battle executed, winner: ".concat(winner.toString()))
              }
            }
          `,
          args: (arg: any, t: any) => [arg(String(battleId), types.UInt64)],
          proposer: serverAuthz,
          payer: serverAuthz,
          authorizations: [serverAuthz],
          limit: 1000,
        });

        // Wait for transaction to seal (with timeout)
        const txResult = await Promise.race([
          fcl.tx(transactionId).onceSealed(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Transaction timeout')), 30000)
          ),
        ]);

        console.log(`[Execute Battles Cron] Battle ${battleId} executed successfully`, {
          transactionId,
          status: (txResult as any).status,
        });

        // Record successful execution in monitor
        const executionTime = Date.now() - startTime;
        await monitor.recordExecution(executionTime);

        results.push({
          battleId,
          status: 'success',
          transactionId,
          executionTimeMs: executionTime,
          explorerUrl: `https://testnet.flowdiver.io/tx/${transactionId}`,
        });

        successCount++;
      } catch (error: any) {
        console.error(`[Execute Battles Cron] Failed to execute battle ${battle.id}:`, error);

        // Record failure in monitor
        await monitor.recordFailure(error.message, parseInt(battle.id));

        // Detect bridge-specific failures and alert immediately (critical)
        const errMsg = error.message || '';
        const isBridgeError = errMsg.includes('COA') ||
          errMsg.includes('EVM') ||
          errMsg.includes('bridge') ||
          errMsg.includes('gas') ||
          errMsg.includes('insufficient');
        if (isBridgeError) {
          try {
            await alertBridgeFailure('battle-execute', errMsg, {
              battleId: String(battle.id),
            });
          } catch {
            // Alert failure is non-fatal
          }
        }

        results.push({
          battleId: parseInt(battle.id),
          status: 'failed',
          error: error.message,
          isBridgeError,
        });

        failureCount++;
      }

      // Small delay between executions to avoid overwhelming the network
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[Execute Battles Cron] Execution complete', {
      total: readyBattles.length,
      success: successCount,
      failed: failureCount,
    });

    // Send alert if any failures
    if (failureCount > 0) {
      try {
        await sendAlert(
          'Battle Execution Failures',
          `${failureCount} out of ${readyBattles.length} battles failed to execute during cron job`,
          failureCount >= 3 ? 'critical' : 'warning',
          {
            successCount,
            failureCount,
            total: readyBattles.length,
            failedBattles: results.filter(r => r.status === 'failed').map(r => r.battleId),
          }
        );
      } catch (error) {
        console.error('[Execute Battles Cron] Failed to send failure alert:', error);
      }
      console.warn(`[Execute Battles Cron] ${failureCount} battles failed to execute`);
    }

    return NextResponse.json({
      success: true,
      data: {
        message: `Executed ${successCount} battles, ${failureCount} failed`,
        executed: successCount,
        failed: failureCount,
        processed: battlesToProcess.length,
        totalReady: readyBattles.length,
        skipped,
        queueDepth: readyBattles.length - successCount,
        results,
        timestamp: new Date().toISOString(),
      },
    });
  },
], { errorContext: 'CRON:ExecuteBattles' });

/**
 * GET /api/cron/execute-battles
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Execute Battles Cron is healthy',
    configured: isServerFlowConfigured(),
    timestamp: new Date().toISOString(),
  });
}
