/**
 * EVMBridge Test API Route
 *
 * GET  — Health check: is bridge deployed? COA created? COA funded?
 * POST — Execute a test bridge call: create COA → schedule → execute EVM call
 *
 * Protected by cron auth (admin/server-side only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { verifyCronAuth, cronAuthErrorResponse } from '@/lib/api/cronAuth';
import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';
import { withTimeout } from '@/lib/flow/cadenceClient';
import {
  createServerAuthorization,
  configureServerFCL,
  isServerFlowConfigured,
  getContractAddress,
  getServerAddress,
} from '@/lib/flow/serverAuth';

// Configure FCL for server-side
configureServerFCL();

const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
if (!isBuildTime && !isServerFlowConfigured()) {
  console.warn(
    '[Bridge Test] Missing Flow config. Bridge test will fail until credentials are configured.'
  );
}

// CrownToken address on Flow Testnet EVM (used for read-only test call)
const CROWN_TOKEN_EVM = process.env.NEXT_PUBLIC_CRWN_TOKEN_ADDRESS || '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6';

/**
 * GET /api/flow/bridge-test
 *
 * Health check for EVMBridge deployment status.
 * Returns: bridge deployed, COA status, pending/ready calls, operator status.
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'flow-bridge-test', ...RateLimitPresets.apiQueries }),
  async (request: NextRequest) => {
    // Require cron auth in production
    const auth = verifyCronAuth(request, { allowDevBypass: true });
    if (!auth.authorized) {
      return cronAuthErrorResponse(auth);
    }

    if (!isServerFlowConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Flow server config not available',
          bridge: {
            deployed: false,
            coaCreated: false,
            coaAddress: null,
            pendingCalls: 0,
            readyCalls: 0,
            isOperator: false,
          },
        },
        { status: 503 }
      );
    }

    try {
      const contractAddress = getContractAddress();
      const serverAddress = getServerAddress();

      // Query bridge status via Cadence script
      const bridgeStatus = await withTimeout(
        fcl.query({
          cadence: `
            import EVMBridge from ${contractAddress}

            access(all) fun main(address: Address): {String: AnyStruct} {
              let isOperator = EVMBridge.isBridgeOperator(address: address)
              let pendingCalls = EVMBridge.getPendingCalls()
              let readyCalls = EVMBridge.getReadyCalls()

              return {
                "isOperator": isOperator,
                "pendingCalls": pendingCalls.length,
                "readyCalls": readyCalls.length,
                "nextCallId": EVMBridge.nextCallId
              }
            }
          `,
          args: (arg: typeof fcl.arg, t: typeof types) => [
            arg(serverAddress, t.Address),
          ],
        }),
        30000,
        'Bridge status query timed out'
      );

      // Try to get COA address via a separate query (requires Bridge resource)
      let coaAddress: string | null = null;
      let hasBridge = false;

      try {
        const coaResult = await withTimeout(
          fcl.query({
            cadence: `
              import EVMBridge from ${contractAddress}

              access(all) fun main(address: Address): String {
                let account = getAccount(address)
                // We can't borrow from another account's storage in a script,
                // but we can check if the Bridge resource type exists.
                // Return empty string if we can't determine.
                return ""
              }
            `,
            args: (arg: typeof fcl.arg, t: typeof types) => [
              arg(serverAddress, t.Address),
            ],
          }),
          10000,
          'COA query timed out'
        );
        coaAddress = coaResult || null;
      } catch {
        // Non-fatal — COA address is best-effort
      }

      return NextResponse.json({
        success: true,
        bridge: {
          deployed: true,
          contractAddress,
          serverAddress,
          coaCreated: !!coaAddress,
          coaAddress,
          pendingCalls: Number(bridgeStatus?.pendingCalls ?? 0),
          readyCalls: Number(bridgeStatus?.readyCalls ?? 0),
          isOperator: Boolean(bridgeStatus?.isOperator),
          nextCallId: Number(bridgeStatus?.nextCallId ?? 0),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[Bridge Test] Health check failed:', error.message);

      // Distinguish "contract not deployed" from other errors
      const isNotDeployed =
        error.message?.includes('cannot find contract') ||
        error.message?.includes('Could not find') ||
        error.message?.includes('not found');

      return NextResponse.json(
        {
          success: false,
          error: isNotDeployed
            ? 'EVMBridge contract not deployed on testnet'
            : `Bridge query failed: ${error.message}`,
          bridge: {
            deployed: !isNotDeployed,
            coaCreated: false,
            coaAddress: null,
            pendingCalls: 0,
            readyCalls: 0,
            isOperator: false,
          },
        },
        { status: isNotDeployed ? 404 : 500 }
      );
    }
  },
]);

/**
 * POST /api/flow/bridge-test
 *
 * Execute the full bridge test flow:
 * 1. Ensure Bridge resource exists (create if missing)
 * 2. Ensure COA exists (create if missing)
 * 3. Schedule a test EVM call (CrownToken.name() — read-only, zero value)
 * 4. Execute the scheduled call immediately
 * 5. Return results with txHashes and timing
 */
export const POST = composeMiddleware([
  withRateLimit({ prefix: 'flow-bridge-test-write', ...RateLimitPresets.battleCreation }),
  async (request: NextRequest) => {
    // Always require cron auth for POST (destructive)
    const auth = verifyCronAuth(request);
    if (!auth.authorized) {
      return cronAuthErrorResponse(auth);
    }

    if (!isServerFlowConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Flow server config not available' },
        { status: 503 }
      );
    }

    const startTime = Date.now();
    const results: Record<string, any> = {
      steps: [],
      success: false,
    };

    try {
      const contractAddress = getContractAddress();
      const serverAuthz = createServerAuthorization();

      // ─── Step 1: Create Bridge + COA (if needed) ───
      // Single transaction that creates Bridge resource and COA atomically
      const step1Start = Date.now();
      try {
        const setupTxId = await withTimeout(
          fcl.mutate({
            cadence: `
              import EVMBridge from ${contractAddress}

              transaction {
                prepare(signer: auth(BorrowValue, SaveValue) &Account) {
                  // Create Bridge resource if it doesn't exist
                  if signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath) == nil {
                    let bridge <- EVMBridge.createBridge()
                    signer.storage.save(<-bridge, to: EVMBridge.BridgeStoragePath)
                    log("Bridge resource created")
                  }

                  let bridge = signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath)
                    ?? panic("Could not borrow Bridge resource")

                  // Get EVM address — if empty, COA doesn't exist yet
                  let evmAddr = bridge.getEVMAddress()
                  if evmAddr == "" {
                    bridge.createCOA()
                    log("COA created")
                  } else {
                    log("COA already exists at: ".concat(evmAddr))
                  }
                }
              }
            `,
            proposer: serverAuthz,
            payer: serverAuthz,
            authorizations: [serverAuthz],
            limit: 1000,
          }),
          30000,
          'Bridge+COA setup transaction timed out'
        );

        // Wait for transaction to be sealed
        const setupResult = await withTimeout(
          fcl.tx(setupTxId).onceSealed(),
          60000,
          'Bridge+COA setup transaction sealing timed out'
        );

        results.steps.push({
          step: 1,
          name: 'Bridge + COA Setup',
          txId: setupTxId,
          status: setupResult.statusCode === 0 ? 'success' : 'failed',
          explorerUrl: `https://testnet.flowdiver.io/tx/${setupTxId}`,
          durationMs: Date.now() - step1Start,
          events: setupResult.events?.map((e: any) => ({
            type: e.type,
            data: e.data,
          })),
        });

        if (setupResult.statusCode !== 0) {
          results.error = 'Bridge+COA setup failed';
          return NextResponse.json(results, { status: 500 });
        }
      } catch (error: any) {
        // If COA already exists, the createCOA() precondition will fire.
        // Our Cadence checks for empty address first, so this should be rare.
        // Check if it's just "COA already exists" which is fine.
        if (error.message?.includes('COA already exists')) {
          results.steps.push({
            step: 1,
            name: 'Bridge + COA Setup',
            status: 'skipped (COA already exists)',
            durationMs: Date.now() - step1Start,
          });
        } else {
          throw error;
        }
      }

      // ─── Step 2: Get COA EVM Address ───
      const step2Start = Date.now();
      let coaAddress = '';

      try {
        // Query the bridge for the COA address via a mutation that logs it
        // (Scripts can't borrow from storage, so we use a read-only TX)
        const addrTxId = await withTimeout(
          fcl.mutate({
            cadence: `
              import EVMBridge from ${contractAddress}

              transaction {
                prepare(signer: auth(BorrowValue) &Account) {
                  let bridge = signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath)
                    ?? panic("Bridge not found")
                  let addr = bridge.getEVMAddress()
                  log("COA EVM Address: ".concat(addr))
                }
              }
            `,
            proposer: serverAuthz,
            payer: serverAuthz,
            authorizations: [serverAuthz],
            limit: 100,
          }),
          30000,
          'COA address query timed out'
        );

        const addrResult = await withTimeout(
          fcl.tx(addrTxId).onceSealed(),
          60000,
          'COA address query sealing timed out'
        );

        // Extract COA address from COACreated event or transaction logs
        for (const event of addrResult.events || []) {
          if (event.type.includes('COACreated')) {
            coaAddress = event.data?.evmAddress || '';
          }
        }

        results.steps.push({
          step: 2,
          name: 'Get COA Address',
          txId: addrTxId,
          coaAddress: coaAddress || '(check explorer for logs)',
          explorerUrl: `https://testnet.flowdiver.io/tx/${addrTxId}`,
          durationMs: Date.now() - step2Start,
        });
      } catch (error: any) {
        results.steps.push({
          step: 2,
          name: 'Get COA Address',
          status: 'failed',
          error: error.message,
          durationMs: Date.now() - step2Start,
        });
      }

      // ─── Step 3: Schedule a test EVM call ───
      // Call CrownToken.name() — a read-only EVM call with zero value
      // ABI for name(): 0x06fdde03
      const step3Start = Date.now();
      let scheduledCallId: number | null = null;

      // name() function selector: keccak256("name()") first 4 bytes = 0x06fdde03
      const nameCallData = [0x06, 0xfd, 0xde, 0x03];

      // Schedule for 1 second in the future (minimum for testnet)
      const scheduledTxId = await withTimeout(
        fcl.mutate({
          cadence: `
            import EVMBridge from ${contractAddress}

            transaction(
              evmContractAddress: String,
              callData: [UInt8],
              scheduledTime: UFix64
            ) {
              prepare(signer: auth(BorrowValue) &Account) {
                let bridge = signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath)
                  ?? panic("Bridge not found")

                let callId = bridge.scheduleEVMCall(
                  evmContractAddress: evmContractAddress,
                  functionSignature: "name()",
                  callData: callData,
                  value: 0,
                  scheduledTime: scheduledTime
                )

                log("Scheduled EVM call with ID: ".concat(callId.toString()))
              }
            }
          `,
          args: (arg: typeof fcl.arg, t: typeof types) => [
            arg(CROWN_TOKEN_EVM, t.String),
            arg(nameCallData.map(b => b.toString()), t.Array(t.UInt8)),
            // Schedule 5 seconds in the future — enough time for the TX to seal
            arg(
              (Math.floor(Date.now() / 1000) + 5).toFixed(8),
              t.UFix64
            ),
          ],
          proposer: serverAuthz,
          payer: serverAuthz,
          authorizations: [serverAuthz],
          limit: 500,
        }),
        30000,
        'Schedule EVM call transaction timed out'
      );

      const scheduleTxResult = await withTimeout(
        fcl.tx(scheduledTxId).onceSealed(),
        60000,
        'Schedule EVM call sealing timed out'
      );

      // Extract call ID from EVMCallScheduled event
      for (const event of scheduleTxResult.events || []) {
        if (event.type.includes('EVMCallScheduled')) {
          scheduledCallId = parseInt(event.data?.id || '0');
        }
      }

      results.steps.push({
        step: 3,
        name: 'Schedule Test EVM Call',
        txId: scheduledTxId,
        callId: scheduledCallId,
        target: CROWN_TOKEN_EVM,
        functionSignature: 'name()',
        status: scheduleTxResult.statusCode === 0 ? 'success' : 'failed',
        explorerUrl: `https://testnet.flowdiver.io/tx/${scheduledTxId}`,
        durationMs: Date.now() - step3Start,
      });

      if (scheduleTxResult.statusCode !== 0 || scheduledCallId === null) {
        results.error = 'Failed to schedule EVM call';
        return NextResponse.json(results, { status: 500 });
      }

      // ─── Step 4: Wait and Execute the call ───
      const step4Start = Date.now();

      // Wait for scheduled time to arrive (5 seconds + buffer)
      await new Promise(resolve => setTimeout(resolve, 7000));

      const executeTxId = await withTimeout(
        fcl.mutate({
          cadence: `
            import EVMBridge from ${contractAddress}

            transaction(callId: UInt64) {
              prepare(signer: auth(BorrowValue) &Account) {
                let bridge = signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath)
                  ?? panic("Bridge not found")

                let success = bridge.executeEVMCall(callId: callId)
                log("EVM call execution success: ".concat(success ? "true" : "false"))
              }
            }
          `,
          args: (arg: typeof fcl.arg, t: typeof types) => [
            arg(scheduledCallId!.toString(), t.UInt64),
          ],
          proposer: serverAuthz,
          payer: serverAuthz,
          authorizations: [serverAuthz],
          limit: 500,
        }),
        30000,
        'Execute EVM call transaction timed out'
      );

      const executeResult = await withTimeout(
        fcl.tx(executeTxId).onceSealed(),
        60000,
        'Execute EVM call sealing timed out'
      );

      // Check for EVMCallExecuted event
      let evmCallSuccess = false;
      for (const event of executeResult.events || []) {
        if (event.type.includes('EVMCallExecuted')) {
          evmCallSuccess = event.data?.success === true || event.data?.success === 'true';
        }
      }

      results.steps.push({
        step: 4,
        name: 'Execute EVM Call',
        txId: executeTxId,
        callId: scheduledCallId,
        evmCallSuccess,
        status: executeResult.statusCode === 0 ? 'success' : 'failed',
        explorerUrl: `https://testnet.flowdiver.io/tx/${executeTxId}`,
        durationMs: Date.now() - step4Start,
        events: executeResult.events?.map((e: any) => ({
          type: e.type,
          data: e.data,
        })),
      });

      // ─── Final result ───
      results.success = executeResult.statusCode === 0 && evmCallSuccess;
      results.totalDurationMs = Date.now() - startTime;
      results.coaAddress = coaAddress || undefined;
      results.summary = results.success
        ? 'EVMBridge test PASSED — Cadence → COA → EVM call executed successfully'
        : 'EVMBridge test completed but EVM call may have failed (check events)';

      return NextResponse.json(results, {
        status: results.success ? 200 : 500,
      });
    } catch (error: any) {
      console.error('[Bridge Test] Test execution failed:', error);

      results.error = error.message;
      results.totalDurationMs = Date.now() - startTime;

      return NextResponse.json(results, { status: 500 });
    }
  },
]);
