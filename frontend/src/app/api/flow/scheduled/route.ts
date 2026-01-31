import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, ErrorResponses, handleFlowError } from '@/lib/api';
import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';
import { withTimeout } from '@/lib/flow/cadenceClient';
import { prisma } from '@/lib/prisma';
import { verifyToken, extractAddressFromHeader } from '@/lib/auth';

const AUTH_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-dev-secret';

/**
 * Verify user authentication from request headers
 * Returns user ID/address or null if not authenticated
 */
async function verifyAuth(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return null;
  }

  // Option 1: JWT token verification
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token, AUTH_SECRET);

    if (payload && typeof payload.address === 'string') {
      return payload.address;
    }

    if (payload && typeof payload.userId === 'string') {
      return payload.userId;
    }
  }

  // Option 2: Direct address (for server-side or admin operations)
  const address = extractAddressFromHeader(authHeader);
  if (address) {
    // Validate it's a valid address format
    if (address.startsWith('0x') && address.length >= 10) {
      return address;
    }
  }

  return null;
}

// Configure FCL for server-side operations
fcl.config({
  'flow.network': 'testnet',
  'accessNode.api': process.env.FLOW_RPC_URL || 'https://rest-testnet.onflow.org',
});

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FLOW_TESTNET_ADDRESS;
const PRIVATE_KEY = process.env.FLOW_TESTNET_PRIVATE_KEY;
const SERVER_ADDRESS = process.env.FLOW_TESTNET_ADDRESS;

// Warn at module load if Flow config is missing (skip during build)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
if (!isBuildTime && (!CONTRACT_ADDRESS || !PRIVATE_KEY || !SERVER_ADDRESS)) {
  console.warn(
    '[Flow Scheduled API] Missing Flow config: ' +
    `CONTRACT_ADDRESS=${!!CONTRACT_ADDRESS}, PRIVATE_KEY=${!!PRIVATE_KEY}, SERVER_ADDRESS=${!!SERVER_ADDRESS}. ` +
    'Server-side Flow operations will fail until these are configured.'
  );
}

/**
 * Server-side authorization function using private key
 * Required for automated battle scheduling/execution without user wallet
 */
function serverAuthorizationFunction(account: any) {
  return {
    ...account,
    tempId: `${SERVER_ADDRESS}-0`,
    addr: fcl.sansPrefix(SERVER_ADDRESS!),
    keyId: 0,
    signingFunction: async (signable: any) => {
      const { SHA3 } = await import('sha3');
      // @ts-ignore - elliptic has no bundled types
      const { ec: EC } = await import('elliptic');
      const ec = new EC('p256');

      const sha3 = new SHA3(256);
      sha3.update(Buffer.from(signable.message, 'hex'));
      const digest = sha3.digest();

      const key = ec.keyFromPrivate(Buffer.from(PRIVATE_KEY!, 'hex'));
      const sig = key.sign(digest);

      const n = 32;
      const r = sig.r.toArrayLike(Buffer, 'be', n);
      const s = sig.s.toArrayLike(Buffer, 'be', n);
      const signature = Buffer.concat([r, s]).toString('hex');

      return {
        addr: fcl.sansPrefix(SERVER_ADDRESS!),
        keyId: 0,
        signature,
      };
    },
  };
}

/**
 * Extract battle ID from transaction events
 * Looks for BattleScheduled event and extracts the ID
 */
function extractBattleIdFromEvents(events: any[]): number {
  for (const event of events) {
    if (event.type.includes('BattleScheduled')) {
      // Event data structure: { id: UInt64, ... }
      return parseInt(event.data.id || event.data.battleId || '0');
    }
  }
  // Fallback: return timestamp-based ID if event parsing fails
  return Date.now();
}

interface ScheduledBattle {
  id: string;
  warrior1Id: string;
  warrior2Id: string;
  betAmount: string;
  scheduledTime: string;
  creator: string;
  executed: boolean;
  cancelled: boolean;
}

/**
 * GET /api/flow/scheduled
 * Query all pending and ready scheduled battles
 */
export async function GET(request: NextRequest) {
  applyRateLimit(request, { prefix: 'flow-scheduled', maxRequests: 60, windowMs: 60000 });

  try {
    if (!CONTRACT_ADDRESS) {
      return NextResponse.json(
        ErrorResponses.serviceUnavailable('Flow testnet not configured'),
        { status: 503 }
      );
    }

    // Query pending battles with timeout
    const pendingBattles = await withTimeout(
      fcl.query({
        cadence: `
          import ScheduledBattle from ${CONTRACT_ADDRESS}

          access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
            return ScheduledBattle.getPendingTransactions()
          }
        `,
      }),
      30000,
      'Query pending battles timed out'
    );

    // Query ready battles with timeout
    const readyBattles = await withTimeout(
      fcl.query({
        cadence: `
          import ScheduledBattle from ${CONTRACT_ADDRESS}

          access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
            return ScheduledBattle.getReadyTransactions()
          }
        `,
      }),
      30000,
      'Query ready battles timed out'
    );

    return NextResponse.json({
      success: true,
      data: {
        pending: pendingBattles || [],
        ready: readyBattles || [],
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    const apiError = handleFlowError(error, 'fetching scheduled battles');

    console.error('[Flow Scheduled API] GET error:', {
      error: apiError,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: apiError.message,
        code: apiError.code,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          details: error,
        }),
      },
      { status: apiError.statusCode }
    );
  }
}

/**
 * POST /api/flow/scheduled
 * Schedule a new battle (server-side with private key)
 */
export async function POST(request: NextRequest) {
  applyRateLimit(request, { prefix: 'flow-scheduled', maxRequests: 60, windowMs: 60000 });

  let warrior1Id: number | undefined;
  let warrior2Id: number | undefined;
  let scheduledTime: number | undefined;

  try {
    // Verify authentication
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Authentication required to schedule battles'),
        { status: 401 }
      );
    }

    if (!CONTRACT_ADDRESS || !PRIVATE_KEY || !SERVER_ADDRESS) {
      return NextResponse.json(
        ErrorResponses.serviceUnavailable('Flow testnet not configured'),
        { status: 503 }
      );
    }

    const body = await request.json();
    warrior1Id = body.warrior1Id;
    warrior2Id = body.warrior2Id;
    const betAmount = body.betAmount;
    scheduledTime = body.scheduledTime;

    // Validation
    if (!warrior1Id || !warrior2Id || !betAmount || !scheduledTime) {
      return NextResponse.json(
        ErrorResponses.badRequest('Missing required fields: warrior1Id, warrior2Id, betAmount, scheduledTime'),
        { status: 400 }
      );
    }

    if (typeof warrior1Id !== 'number' || typeof warrior2Id !== 'number') {
      return NextResponse.json(
        ErrorResponses.badRequest('warrior1Id and warrior2Id must be numbers'),
        { status: 400 }
      );
    }

    if (typeof betAmount !== 'number' || betAmount <= 0) {
      return NextResponse.json(
        ErrorResponses.badRequest('betAmount must be a positive number'),
        { status: 400 }
      );
    }

    if (typeof scheduledTime !== 'number' || scheduledTime <= Date.now() / 1000) {
      return NextResponse.json(
        ErrorResponses.badRequest('scheduledTime must be a future Unix timestamp'),
        { status: 400 }
      );
    }

    // Schedule battle on-chain with timeout
    // Uses Scheduler resource — must borrow from signer's storage
    const transactionId = await withTimeout(
      fcl.mutate({
        cadence: `
          import ScheduledBattle from ${CONTRACT_ADDRESS}

          transaction(warrior1Id: UInt64, warrior2Id: UInt64, betAmount: UFix64, scheduledTime: UFix64) {
            let scheduler: &ScheduledBattle.Scheduler

            prepare(signer: auth(Storage, SaveValue, LoadValue, BorrowValue) &Account) {
              // Create Scheduler resource if it doesn't exist
              if signer.storage.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath) == nil {
                let newScheduler <- ScheduledBattle.createScheduler()
                signer.storage.save(<-newScheduler, to: ScheduledBattle.SchedulerStoragePath)
              }
              self.scheduler = signer.storage.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath)
                ?? panic("Could not borrow Scheduler")
            }

            execute {
              let battleId = self.scheduler.scheduleBattle(
                warrior1Id: warrior1Id,
                warrior2Id: warrior2Id,
                betAmount: betAmount,
                scheduledTime: scheduledTime
              )
              log("Battle scheduled with ID: ".concat(battleId.toString()))
            }
          }
        `,
        args: (arg: any, t: any) => [
          arg(String(warrior1Id), types.UInt64),
          arg(String(warrior2Id), types.UInt64),
          arg(betAmount.toFixed(1), types.UFix64),
          arg((scheduledTime as number).toFixed(1), types.UFix64),
        ],
        proposer: serverAuthorizationFunction,
        payer: serverAuthorizationFunction,
        authorizations: [serverAuthorizationFunction],
        limit: 1000,
      }),
      30000,
      'Schedule battle transaction timed out'
    );

    // Wait for transaction to seal with extended timeout
    const txResult = await withTimeout(
      fcl.tx(transactionId).onceSealed(),
      60000,
      'Transaction sealing timed out'
    );

    // Extract battle ID from transaction events
    const battleId = extractBattleIdFromEvents(txResult.events || []);

    console.log('[Flow Scheduled API] Battle scheduled:', {
      battleId,
      transactionId,
      status: txResult.status,
      warrior1Id,
      warrior2Id,
      scheduledTime: new Date((scheduledTime as number) * 1000).toISOString(),
    });

    // Save to database for tracking and history
    try {
      await prisma.scheduledTransaction.create({
        data: {
          battleId,
          warrior1Id: warrior1Id as number,
          warrior2Id: warrior2Id as number,
          betAmount,
          scheduledTime: new Date((scheduledTime as number) * 1000),
          status: 'pending',
          scheduleTransactionId: transactionId,
          creator: userId,
          attempts: 0,
        },
      });
      console.log('[Flow Scheduled API] Battle saved to database:', battleId);
    } catch (dbError: any) {
      // Log database error but don't fail the request since on-chain scheduling succeeded
      console.error('[Flow Scheduled API] Failed to save to database:', {
        error: dbError.message,
        battleId,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        battleId,
        transactionId,
        status: txResult.status,
        explorerUrl: `https://testnet.flowdiver.io/tx/${transactionId}`,
      },
    });
  } catch (error: any) {
    const apiError = handleFlowError(error, 'battle scheduling');

    console.error('[Flow Scheduled API] POST error:', {
      error: apiError,
      context: { warrior1Id, warrior2Id, scheduledTime },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: apiError.message,
        code: apiError.code,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          details: error,
        }),
      },
      { status: apiError.statusCode }
    );
  }
}

/**
 * PUT /api/flow/scheduled/execute
 * Execute a ready battle (automated executor)
 */
export async function PUT(request: NextRequest) {
  applyRateLimit(request, { prefix: 'flow-scheduled', maxRequests: 60, windowMs: 60000 });

  let battleId: number | undefined;
  let dbBattle: any = null;

  try {
    // Verify authentication
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Authentication required to execute battles'),
        { status: 401 }
      );
    }

    if (!CONTRACT_ADDRESS || !PRIVATE_KEY || !SERVER_ADDRESS) {
      return NextResponse.json(
        ErrorResponses.serviceUnavailable('Flow testnet not configured'),
        { status: 503 }
      );
    }

    const body = await request.json();
    battleId = body.battleId;

    if (typeof battleId !== 'number') {
      return NextResponse.json(
        ErrorResponses.badRequest('battleId must be a number'),
        { status: 400 }
      );
    }

    // Check database for battle status
    dbBattle = await prisma.scheduledTransaction.findFirst({
      where: { battleId },
    });

    if (dbBattle) {
      // Check ownership - only creator can execute their battles (unless they're an admin)
      const isOwner = dbBattle.creator === userId;
      const isAdmin = userId.toLowerCase().includes('admin') || userId === 'server';

      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          ErrorResponses.forbidden('You can only execute your own scheduled battles'),
          { status: 403 }
        );
      }

      // Check if already completed
      if (dbBattle.status === 'completed') {
        return NextResponse.json(
          ErrorResponses.conflict('Battle has already been executed'),
          { status: 409 }
        );
      }

      // Update status to executing
      await prisma.scheduledTransaction.update({
        where: { id: dbBattle.id },
        data: {
          status: 'executing',
          attempts: dbBattle.attempts + 1,
          lastAttemptAt: new Date(),
        },
      });
    }

    // Double-check on-chain status before executing (idempotency)
    const onChainStatus = await withTimeout(
      fcl.query({
        cadence: `
          import ScheduledBattle from ${CONTRACT_ADDRESS}

          access(all) fun main(battleId: UInt64): Bool {
            let battle = ScheduledBattle.scheduledTransactions[battleId]
            return battle != nil && !battle!.executed
          }
        `,
        args: (arg: any, t: any) => [arg(String(battleId), types.UInt64)],
      }),
      30000,
      'On-chain status check timed out'
    );

    if (!onChainStatus) {
      console.log('[Flow Scheduled API] Battle already executed on-chain:', battleId);

      // Update database if out of sync
      if (dbBattle && dbBattle.status !== 'completed') {
        await prisma.scheduledTransaction.update({
          where: { id: dbBattle.id },
          data: { status: 'completed' },
        });
      }

      return NextResponse.json(
        ErrorResponses.conflict('Battle has already been executed'),
        { status: 409 }
      );
    }

    // Execute battle on-chain with timeout
    // Note: `signer` is only available in the `prepare` block in Cadence,
    // so we capture the address there and use it in `execute`
    const transactionId = await withTimeout(
      fcl.mutate({
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
        proposer: serverAuthorizationFunction,
        payer: serverAuthorizationFunction,
        authorizations: [serverAuthorizationFunction],
        limit: 1000,
      }),
      30000,
      'Execute battle transaction timed out'
    );

    // Wait for transaction to seal with extended timeout
    const txResult = await withTimeout(
      fcl.tx(transactionId).onceSealed(),
      60000,
      'Transaction sealing timed out'
    );

    console.log('[Flow Scheduled API] Battle executed:', {
      battleId,
      transactionId,
      status: txResult.status,
    });

    // Update database on successful execution
    if (dbBattle) {
      try {
        await prisma.scheduledTransaction.update({
          where: { id: dbBattle.id },
          data: {
            status: 'completed',
            executeTransactionId: transactionId,
            executedAt: new Date(),
            executor: userId,
          },
        });
        console.log('[Flow Scheduled API] Database updated for battle:', battleId);
      } catch (dbError: any) {
        // Log database error but don't fail the request since on-chain execution succeeded
        console.error('[Flow Scheduled API] Failed to update database:', {
          error: dbError.message,
          battleId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        battleId,
        transactionId,
        status: txResult.status,
        explorerUrl: `https://testnet.flowdiver.io/tx/${transactionId}`,
      },
    });
  } catch (error: any) {
    // Update database with failure if record exists
    if (dbBattle) {
      try {
        await prisma.scheduledTransaction.update({
          where: { id: dbBattle.id },
          data: {
            status: 'failed',
            error: error.message,
            lastAttemptAt: new Date(),
          },
        });
      } catch (dbError: any) {
        // Log but don't throw - we want to return the original error
        console.error('[Flow Scheduled API] Failed to update database with error:', {
          error: dbError.message,
          battleId,
        });
      }
    }

    const apiError = handleFlowError(error, 'battle execution');

    console.error('[Flow Scheduled API] PUT error:', {
      error: apiError,
      context: { battleId },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: apiError.message,
        code: apiError.code,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          details: error,
        }),
      },
      { status: apiError.statusCode }
    );
  }
}

/**
 * DELETE /api/flow/scheduled
 * Cancel a pending battle
 */
export async function DELETE(request: NextRequest) {
  applyRateLimit(request, { prefix: 'flow-scheduled', maxRequests: 60, windowMs: 60000 });

  let battleId: number | undefined;
  let dbBattle: any = null;

  try {
    // Verify authentication
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json(
        ErrorResponses.unauthorized('Authentication required to cancel battles'),
        { status: 401 }
      );
    }

    if (!CONTRACT_ADDRESS || !PRIVATE_KEY || !SERVER_ADDRESS) {
      return NextResponse.json(
        ErrorResponses.serviceUnavailable('Flow testnet not configured'),
        { status: 503 }
      );
    }

    const body = await request.json();
    battleId = body.battleId;

    if (typeof battleId !== 'number') {
      return NextResponse.json(
        ErrorResponses.badRequest('battleId must be a number'),
        { status: 400 }
      );
    }

    // Check database for battle status
    dbBattle = await prisma.scheduledTransaction.findFirst({
      where: { battleId },
    });

    if (dbBattle) {
      // Check ownership - only creator can cancel their battles (unless they're an admin)
      const isOwner = dbBattle.creator === userId;
      const isAdmin = userId.toLowerCase().includes('admin') || userId === 'server';

      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          ErrorResponses.forbidden('You can only cancel your own scheduled battles'),
          { status: 403 }
        );
      }

      // Check if already completed or cancelled
      if (dbBattle.status === 'completed' || dbBattle.status === 'cancelled') {
        return NextResponse.json(
          ErrorResponses.conflict(`Battle has already been ${dbBattle.status}`),
          { status: 409 }
        );
      }
    }

    // Cancel battle on-chain with timeout
    // Uses Scheduler resource — must borrow from signer's storage
    const transactionId = await withTimeout(
      fcl.mutate({
        cadence: `
          import ScheduledBattle from ${CONTRACT_ADDRESS}

          transaction(battleId: UInt64) {
            let scheduler: &ScheduledBattle.Scheduler

            prepare(signer: auth(Storage, BorrowValue) &Account) {
              self.scheduler = signer.storage.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath)
                ?? panic("Scheduler not found")
            }

            execute {
              self.scheduler.cancelBattle(transactionId: battleId)
              log("Battle cancelled: ".concat(battleId.toString()))
            }
          }
        `,
        args: (arg: any, t: any) => [arg(String(battleId), types.UInt64)],
        proposer: serverAuthorizationFunction,
        payer: serverAuthorizationFunction,
        authorizations: [serverAuthorizationFunction],
        limit: 1000,
      }),
      30000,
      'Cancel battle transaction timed out'
    );

    // Wait for transaction to seal with extended timeout
    const txResult = await withTimeout(
      fcl.tx(transactionId).onceSealed(),
      60000,
      'Transaction sealing timed out'
    );

    console.log('[Flow Scheduled API] Battle cancelled:', {
      battleId,
      transactionId,
      status: txResult.status,
    });

    // Update database on successful cancellation
    if (dbBattle) {
      try {
        await prisma.scheduledTransaction.update({
          where: { id: dbBattle.id },
          data: {
            status: 'cancelled',
            executeTransactionId: transactionId,
            executedAt: new Date(),
            executor: userId,
          },
        });
        console.log('[Flow Scheduled API] Database updated - battle cancelled:', battleId);
      } catch (dbError: any) {
        // Log database error but don't fail the request since on-chain cancellation succeeded
        console.error('[Flow Scheduled API] Failed to update database:', {
          error: dbError.message,
          battleId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        battleId,
        transactionId,
        status: txResult.status,
        explorerUrl: `https://testnet.flowdiver.io/tx/${transactionId}`,
      },
    });
  } catch (error: any) {
    // Update database with failure if record exists
    if (dbBattle) {
      try {
        await prisma.scheduledTransaction.update({
          where: { id: dbBattle.id },
          data: {
            error: `Cancellation failed: ${error.message}`,
            lastAttemptAt: new Date(),
          },
        });
      } catch (dbError: any) {
        // Log but don't throw - we want to return the original error
        console.error('[Flow Scheduled API] Failed to update database with cancellation error:', {
          error: dbError.message,
          battleId,
        });
      }
    }

    const apiError = handleFlowError(error, 'battle cancellation');

    console.error('[Flow Scheduled API] DELETE error:', {
      error: apiError,
      context: { battleId },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: apiError.message,
        code: apiError.code,
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          details: error,
        }),
      },
      { status: apiError.statusCode }
    );
  }
}
