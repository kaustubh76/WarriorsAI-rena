/**
 * Vault Yield Execution Service
 *
 * Orchestrates the autonomous yield cycle for each vault:
 *   1. Query active vaults from DB
 *   2. For each vault: evaluate → rebalance on-chain → record cycle in DB
 *
 * Called by the execute-yield-cycles cron job.
 */

import { prisma } from '@/lib/prisma';
import { vaultService } from '@/services/vaultService';
import { createPublicClient, createWalletClient, http, type Address, formatEther } from 'viem';
import { flowTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { chainsToContracts } from '@/constants';
import { STRATEGY_VAULT_ABI } from '@/constants/abis/strategyVaultAbi';
import AIAgentINFTAbiJson from '@/constants/aiAgentINFTAbi.json';

const FLOW_CHAIN_ID = 545;
const contracts = chainsToContracts[FLOW_CHAIN_ID];

interface CycleResult {
  nftId: number;
  cycleNumber: number;
  move: string;
  success: boolean;
  error?: string;
  txHash?: string;
  yieldEarned?: string;
}

interface ExecutionResults {
  executed: number;
  failed: number;
  skipped: number;
  cadenceSource: boolean;
  results: CycleResult[];
  errors: string[];
}

class VaultYieldService {
  /**
   * Execute yield cycles for all active vaults that are ready.
   * @param maxBatch Max vaults to process per run (avoid Vercel timeout)
   */
  async executeReadyVaults(maxBatch = 10): Promise<ExecutionResults> {
    const results: ExecutionResults = {
      executed: 0,
      failed: 0,
      skipped: 0,
      cadenceSource: false,
      results: [],
      errors: [],
    };

    // 1. Try Cadence-first query for ready vaults
    let cadenceReady: Array<{ nftId: number; cadenceVaultId: number }> = [];
    let cadenceAvailable = false;
    try {
      const { isVaultSchedulerAvailable, getReadyVaultsFromCadence } =
        await import('@/lib/flow/vaultSchedulerClient');

      const available = await isVaultSchedulerAvailable();
      if (available) {
        cadenceAvailable = true;
        const readyEntries = await getReadyVaultsFromCadence();
        cadenceReady = readyEntries.map((e) => ({ nftId: e.nftId, cadenceVaultId: e.id }));
        if (cadenceReady.length > 0) {
          results.cadenceSource = true;
          console.log(`[VaultYield] Cadence reports ${cadenceReady.length} ready vaults`);
        }
      }
    } catch (error) {
      console.warn('[VaultYield] Cadence query failed, falling back to DB-only:', error);
    }

    // 2. Fetch active vaults from DB
    const dbVaults = await prisma.vault.findMany({
      where: { status: 'active' },
      take: maxBatch * 2, // fetch extra so merge has room
      orderBy: { updatedAt: 'asc' },
    });

    if (dbVaults.length === 0 && cadenceReady.length === 0) {
      console.log('[VaultYield] No active vaults found');
      return results;
    }

    // 3. Merge sources: Cadence-ready first, then DB fallback
    const vaultsToProcess = this.mergeVaultSources(cadenceReady, dbVaults, maxBatch, cadenceAvailable);

    console.log(`[VaultYield] Processing ${vaultsToProcess.length} vaults (cadence: ${results.cadenceSource})`);

    for (const { vault, cadenceVaultId } of vaultsToProcess) {
      try {
        const cycleResult = await this.executeSingleCycle(vault);
        results.results.push(cycleResult);

        if (cycleResult.success) {
          results.executed++;

          // Post-execution: mark cycle on Cadence (non-fatal)
          if (cadenceVaultId !== null) {
            try {
              const { executeVaultCycleOnCadence } =
                await import('@/lib/flow/vaultSchedulerClient');
              await executeVaultCycleOnCadence(cadenceVaultId);
              console.log(`[VaultYield] Cadence cycle marked for vault ${cadenceVaultId}`);
            } catch (cadenceError) {
              console.warn(`[VaultYield] Cadence marking failed for vault ${cadenceVaultId}:`, cadenceError);
            }
          }
        } else {
          results.failed++;
          if (cycleResult.error) results.errors.push(`NFT#${vault.nftId}: ${cycleResult.error}`);
        }
      } catch (error) {
        results.failed++;
        const errMsg = `NFT#${vault.nftId}: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errMsg);
        results.results.push({
          nftId: vault.nftId,
          cycleNumber: vault.cyclesExecuted + 1,
          move: 'ERROR',
          success: false,
          error: errMsg,
        });
      }
    }

    return results;
  }

  /**
   * Merge Cadence-ready vaults with DB vaults.
   * Priority 1: Cadence-ready vaults matched to DB records by nftId
   * Priority 2: DB vaults not yet processed — if Cadence is unavailable, include ALL active
   *             vaults; if Cadence is available, only include vaults without scheduledTxId
   *             (Cadence is authority on timing for scheduled vaults)
   */
  private mergeVaultSources(
    cadenceReady: Array<{ nftId: number; cadenceVaultId: number }>,
    dbVaults: Array<any>,
    maxBatch: number,
    cadenceAvailable: boolean
  ): Array<{ vault: any; cadenceVaultId: number | null }> {
    const merged: Array<{ vault: any; cadenceVaultId: number | null }> = [];
    const usedNftIds = new Set<number>();

    // Priority 1: Cadence-ready vaults matched to DB
    for (const cadenceEntry of cadenceReady) {
      if (merged.length >= maxBatch) break;
      const dbMatch = dbVaults.find((v) => v.nftId === cadenceEntry.nftId);
      if (dbMatch) {
        merged.push({ vault: dbMatch, cadenceVaultId: cadenceEntry.cadenceVaultId });
        usedNftIds.add(cadenceEntry.nftId);
      } else {
        console.warn(`[VaultYield] Cadence vault ${cadenceEntry.cadenceVaultId} (NFT#${cadenceEntry.nftId}) has no DB match — skipping`);
      }
    }

    // Priority 2: DB vaults not already included
    for (const dbVault of dbVaults) {
      if (merged.length >= maxBatch) break;
      if (usedNftIds.has(dbVault.nftId)) continue;

      if (!dbVault.scheduledTxId) {
        // Old vault without Cadence scheduling — always process via DB-only path
        merged.push({ vault: dbVault, cadenceVaultId: null });
        usedNftIds.add(dbVault.nftId);
      } else if (!cadenceAvailable) {
        // Cadence is down — fall back to DB-only for scheduled vaults too
        console.warn(`[VaultYield] Cadence unavailable, falling back to DB for NFT#${dbVault.nftId}`);
        merged.push({ vault: dbVault, cadenceVaultId: null });
        usedNftIds.add(dbVault.nftId);
      }
      // If Cadence IS available but vault isn't in cadenceReady, it's not due yet — skip
    }

    return merged;
  }

  /**
   * Execute a single yield cycle for one vault.
   */
  private async executeSingleCycle(vault: {
    id: string;
    nftId: number;
    ownerAddress: string;
    depositAmount: string;
    allocationHighYield: number;
    allocationStable: number;
    allocationLP: number;
    cyclesExecuted: number;
  }): Promise<CycleResult> {
    const nextCycle = vault.cyclesExecuted + 1;
    console.log(`[VaultYield] NFT#${vault.nftId} — starting cycle ${nextCycle}`);

    // 1. Verify vault still active on-chain
    const isActive = await vaultService.isVaultActive(vault.nftId);
    if (!isActive) {
      await prisma.vault.update({
        where: { id: vault.id },
        data: { status: 'withdrawn' },
      });
      return { nftId: vault.nftId, cycleNumber: nextCycle, move: 'SKIP', success: false, error: 'Vault no longer active on-chain' };
    }

    // 2. Get on-chain vault state (current balance including yield)
    const onChainState = await vaultService.getVaultState(vault.nftId);
    if (!onChainState) {
      return { nftId: vault.nftId, cycleNumber: nextCycle, move: 'SKIP', success: false, error: 'Could not read on-chain vault state' };
    }

    const balanceBefore = onChainState.depositAmount.toString();

    // 3. Call evaluate-cycle API for AI allocation (60s timeout — fits within 240s cron budget)
    const evalAbort = new AbortController();
    const evalTimeout = setTimeout(() => evalAbort.abort(), 60000);
    const evalResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/vault/evaluate-cycle`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nftId: vault.nftId, cycleNumber: nextCycle }),
        signal: evalAbort.signal,
      }
    );
    clearTimeout(evalTimeout);

    if (!evalResponse.ok) {
      const errText = await evalResponse.text();
      return { nftId: vault.nftId, cycleNumber: nextCycle, move: 'EVAL_FAILED', success: false, error: `Evaluate-cycle API failed: ${errText}` };
    }

    const evalData = await evalResponse.json();
    const { move, rationale, newAllocation, poolAPYs, proof } = evalData;

    const currentAllocation = {
      highYield: vault.allocationHighYield,
      stable: vault.allocationStable,
      lp: vault.allocationLP,
    };

    // 4. Validate allocation sum before any on-chain execution
    const allocationSum = newAllocation.highYield + newAllocation.stable + newAllocation.lp;
    if (allocationSum !== 10000) {
      return {
        nftId: vault.nftId, cycleNumber: nextCycle, move: 'EVAL_FAILED', success: false,
        error: `Invalid allocation sum ${allocationSum} (expected 10000)`,
      };
    }

    // 5. If HOLD (no change), just record cycle without on-chain tx
    let txHash: string | undefined;
    let balanceAfter = balanceBefore;

    if (move !== 'HOLD') {
      // Execute rebalance on-chain via server wallet
      try {
        txHash = await this.executeRebalanceOnChain(
          vault.nftId,
          [BigInt(newAllocation.highYield), BigInt(newAllocation.stable), BigInt(newAllocation.lp)]
        );

        // Re-read balance after rebalance (captures yield)
        const stateAfter = await vaultService.getVaultState(vault.nftId);
        if (stateAfter) balanceAfter = stateAfter.depositAmount.toString();
      } catch (error) {
        return {
          nftId: vault.nftId,
          cycleNumber: nextCycle,
          move,
          success: false,
          error: `Rebalance tx failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // 5. Calculate yield earned
    const yieldEarned = (BigInt(balanceAfter) - BigInt(balanceBefore)).toString();

    // 6. Record cycle in DB
    await prisma.$transaction([
      prisma.vaultCycle.create({
        data: {
          vaultId: vault.id,
          cycleNumber: nextCycle,
          move,
          rationale: rationale || null,
          allocationBeforeHY: currentAllocation.highYield,
          allocationBeforeST: currentAllocation.stable,
          allocationBeforeLP: currentAllocation.lp,
          allocationAfterHY: newAllocation.highYield,
          allocationAfterST: newAllocation.stable,
          allocationAfterLP: newAllocation.lp,
          yieldEarned,
          balanceBefore,
          balanceAfter,
          poolAPYHighYield: Math.round(poolAPYs.highYield * 100),
          poolAPYStable: Math.round(poolAPYs.stable * 100),
          poolAPYLP: Math.round(poolAPYs.lp * 100),
          aiProof: proof ? JSON.stringify(proof) : null,
          txHash: txHash || null,
        },
      }),
      prisma.vault.update({
        where: { id: vault.id },
        data: {
          cyclesExecuted: nextCycle,
          allocationHighYield: newAllocation.highYield,
          allocationStable: newAllocation.stable,
          allocationLP: newAllocation.lp,
          depositAmount: balanceAfter,
        },
      }),
    ]);

    // 7. Update on-chain P&L + tier via AIAgentINFT.recordTrade()
    // pnl is in wei (same unit as yieldEarned). won = yield > 0.
    const yieldBig = BigInt(yieldEarned);
    try {
      const serverPrivateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
      if (serverPrivateKey && contracts.aiAgentINFT && contracts.aiAgentINFT !== '0x0000000000000000000000000000000000000000') {
        const account = privateKeyToAccount(serverPrivateKey as `0x${string}`);
        const wc = createWalletClient({ account, chain: flowTestnet, transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org') });
        await wc.writeContract({
          address: contracts.aiAgentINFT as Address,
          abi: AIAgentINFTAbiJson,
          functionName: 'recordTrade',
          args: [BigInt(vault.nftId), yieldBig >= 0n, yieldBig],
        });
        console.log(`[VaultYield] NFT#${vault.nftId} recordTrade called — pnl: ${formatEther(yieldBig)} CRwN`);
      } else {
        console.warn(`[VaultYield] Skipping recordTrade — aiAgentINFT address not configured`);
      }
    } catch (recordError) {
      // Non-fatal: DB cycle is already recorded; log and continue
      console.error(`[VaultYield] NFT#${vault.nftId} recordTrade failed (non-fatal):`, recordError);
    }

    // P3-3: Upload cycle proof to 0G Storage for decentralized audit trail (non-fatal)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const zeroGPayload = {
        battle: {
          battleId: `vault-cycle-${vault.id}-${nextCycle}`,
          timestamp: Date.now(),
          warriors: [
            { id: String(vault.nftId), totalBattles: nextCycle, wins: yieldBig > 0n ? 1 : 0, losses: yieldBig <= 0n ? 1 : 0 },
            { id: 'vault-pool', totalBattles: nextCycle, wins: 0, losses: 0 },
          ],
          rounds: [],
          outcome: yieldBig > 0n ? 'warrior1' : 'warrior2',
          totalDamage: { warrior1: 0, warrior2: 0 },
          totalRounds: nextCycle,
          _predictionData: {
            prediction: move,
            confidence: 1,
            reasoning: `Vault cycle ${nextCycle}: ${move}, yield ${formatEther(yieldBig)} CRwN`,
          },
        },
      };
      const storeAbort = new AbortController();
      const storeTimer = setTimeout(() => storeAbort.abort(), 10_000);
      try {
        await fetch(`${appUrl}/api/0g/store`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zeroGPayload),
          signal: storeAbort.signal,
        });
        console.log(`[VaultYield] NFT#${vault.nftId} cycle ${nextCycle} stored on 0G`);
      } finally {
        clearTimeout(storeTimer);
      }
    } catch (storeErr) {
      console.warn(`[VaultYield] 0G storage upload failed (non-fatal):`, storeErr);
    }

    console.log(`[VaultYield] NFT#${vault.nftId} cycle ${nextCycle} complete: ${move}, yield: ${formatEther(yieldBig)} CRwN`);

    return {
      nftId: vault.nftId,
      cycleNumber: nextCycle,
      move,
      success: true,
      txHash,
      yieldEarned,
    };
  }

  /**
   * Execute rebalance on-chain using server wallet (owner of StrategyVault).
   * The contract allows owner() to rebalance any vault.
   */
  private async executeRebalanceOnChain(
    nftId: number,
    newAllocation: [bigint, bigint, bigint]
  ): Promise<string> {
    const serverPrivateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
    if (!serverPrivateKey) {
      throw new Error('SERVER_WALLET_PRIVATE_KEY not set — cannot execute rebalance');
    }

    const account = privateKeyToAccount(serverPrivateKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain: flowTestnet,
      transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org'),
    });

    // P3-13: Warn if server wallet is not the contract owner — rebalances will revert
    try {
      const ownerAbi = [{ type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }] as const;
      const ownerResult = await publicClient.readContract({
        address: contracts.strategyVault as Address,
        abi: ownerAbi,
        functionName: 'owner',
        args: [],
      }) as string;
      if (ownerResult.toLowerCase() !== account.address.toLowerCase()) {
        console.error(`[VaultYield] CRITICAL: server wallet ${account.address} is NOT StrategyVault owner (${ownerResult}). Rebalance will revert.`);
      }
    } catch {
      // Non-fatal — contract may not expose owner() with this exact signature
    }

    const walletClient = createWalletClient({
      account,
      chain: flowTestnet,
      transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org'),
    });

    const hash = await walletClient.writeContract({
      address: contracts.strategyVault as Address,
      abi: STRATEGY_VAULT_ABI,
      functionName: 'rebalance',
      args: [BigInt(nftId), newAllocation],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 30_000,
    });

    if (receipt.status !== 'success') {
      throw new Error(`Rebalance tx reverted: ${hash}`);
    }

    return hash;
  }
}

export const vaultYieldService = new VaultYieldService();
