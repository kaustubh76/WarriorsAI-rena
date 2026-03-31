/**
 * Hook for creating on-chain strategy battles.
 * Handles: CRwN balance check → approve → BattleManager.createBattle() → API record.
 */

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { CRWN_TOKEN_ABI } from '@/constants/abis/crwnTokenAbi';
import { BATTLE_MANAGER_ABI } from '@/constants/abis/battleManagerAbi';
import { FLOW_TESTNET_CONTRACTS } from '@/constants/index';

// ============================================
// TYPES
// ============================================

export type CreateBattleStage =
  | 'idle'
  | 'checking'    // Checking CRwN balance
  | 'approving'   // Waiting for approve tx
  | 'creating'    // Waiting for createBattle tx
  | 'recording'   // Recording in API/DB
  | 'done';

interface CreateBattleResult {
  battleId: string;        // DB battle ID
  onChainBattleId: string; // On-chain battle ID
  txHash: string;          // createBattle tx hash
}

interface UseCreateStrategyBattleReturn {
  createBattle: (params: {
    warrior1Id: number;
    warrior1Owner: string;
    warrior2Id: number;
    warrior2Owner: string;
    stakes: string; // In CRwN (e.g. "100"), NOT wei
    scheduledStartAt?: string;
  }) => Promise<CreateBattleResult | null>;
  stage: CreateBattleStage;
  isCreating: boolean;
  error: string | null;
}

// On-chain addresses
const CRWN_TOKEN_ADDRESS = FLOW_TESTNET_CONTRACTS.CRWN_TOKEN as `0x${string}`;
const BATTLE_MANAGER_ADDRESS = FLOW_TESTNET_CONTRACTS.BATTLE_MANAGER as `0x${string}`;
const IS_DEPLOYED = BATTLE_MANAGER_ADDRESS !== '0x0000000000000000000000000000000000000000';

// ============================================
// HOOK
// ============================================

export function useCreateStrategyBattle(): UseCreateStrategyBattleReturn {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [stage, setStage] = useState<CreateBattleStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createBattle = useCallback(async (params: {
    warrior1Id: number;
    warrior1Owner: string;
    warrior2Id: number;
    warrior2Owner: string;
    stakes: string;
    scheduledStartAt?: string;
  }): Promise<CreateBattleResult | null> => {
    if (!address) {
      setError('Wallet not connected');
      return null;
    }
    if (!IS_DEPLOYED) {
      setError('BattleManager contract not deployed');
      return null;
    }

    setIsCreating(true);
    setStage('checking');
    setError(null);

    try {
      const weiAmount = parseEther(params.stakes);

      // Step 1: Check CRwN balance
      if (publicClient) {
        const balance = await publicClient.readContract({
          address: CRWN_TOKEN_ADDRESS,
          abi: CRWN_TOKEN_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        if (balance < weiAmount) {
          throw new Error(
            `Insufficient CRwN balance (have ${Number(balance / 10n ** 18n)}, need ${params.stakes})`
          );
        }
      }

      // Step 2: Approve BattleManager to spend CRwN
      setStage('approving');
      const approveHash = await writeContractAsync({
        address: CRWN_TOKEN_ADDRESS,
        abi: CRWN_TOKEN_ABI,
        functionName: 'approve',
        args: [BATTLE_MANAGER_ADDRESS, weiAmount],
        gas: 5_000_000n,
      });

      if (approveHash && publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 });
      }

      // Step 3: Simulate createBattle to get the return value (battleId)
      setStage('creating');
      let onChainBattleId: string | null = null;
      const createArgs = [BigInt(params.warrior1Id), BigInt(params.warrior2Id), weiAmount] as const;

      if (publicClient) {
        try {
          const { result } = await publicClient.simulateContract({
            account: address,
            address: BATTLE_MANAGER_ADDRESS,
            abi: BATTLE_MANAGER_ABI,
            functionName: 'createBattle',
            args: createArgs,
            gas: 5_000_000n,
          });
          onChainBattleId = String(result);
        } catch (simErr) {
          console.warn('[CreateBattle] simulateContract failed, will fall back to event logs:', simErr);
        }
      }

      // Step 4: Execute createBattle on-chain
      const createHash = await writeContractAsync({
        address: BATTLE_MANAGER_ADDRESS,
        abi: BATTLE_MANAGER_ABI,
        functionName: 'createBattle',
        args: createArgs,
        gas: 5_000_000n,
      });

      // Step 5: Wait for receipt + fallback event extraction if simulate didn't give us the ID
      if (createHash && publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash, timeout: 60_000 });

        if (!onChainBattleId) {
          // Fallback: extract battleId from BattleCreated event log
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: BATTLE_MANAGER_ABI,
                data: log.data,
                topics: log.topics,
              });
              if (decoded.eventName === 'BattleCreated') {
                onChainBattleId = String((decoded.args as { battleId: bigint }).battleId);
                break;
              }
            } catch {
              // Not our event, skip
            }
          }

          // Last resort: first indexed topic (battleId is topics[1] for BattleCreated)
          if (!onChainBattleId && receipt.logs[0]?.topics?.[1]) {
            onChainBattleId = String(BigInt(receipt.logs[0].topics[1]));
          }
        }
      }

      if (!onChainBattleId) {
        throw new Error('Battle created on-chain but could not extract battleId');
      }

      // Step 4: Record in API/DB
      setStage('recording');
      const stakesWei = weiAmount.toString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/arena/strategy/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warrior1Id: params.warrior1Id,
          warrior1Owner: params.warrior1Owner,
          warrior2Id: params.warrior2Id,
          warrior2Owner: params.warrior2Owner,
          stakes: stakesWei,
          txHash: createHash,
          onChainBattleId,
          ...(params.scheduledStartAt
            ? { scheduledStartAt: new Date(params.scheduledStartAt).toISOString() }
            : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        let errMsg = 'Failed to record battle in database';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `Failed to record battle (${res.status})`;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();

      setStage('done');
      return {
        battleId: data.battle?.id || '',
        onChainBattleId,
        txHash: createHash!,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out — please try again');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create battle');
      }
      return null;
    } finally {
      setIsCreating(false);
      // Reset to idle after a brief delay so UI can show 'done'
      setTimeout(() => setStage('idle'), 2000);
    }
  }, [address, writeContractAsync, publicClient]);

  return { createBattle, stage, isCreating, error };
}
