/**
 * useVaultCreate Hook
 * Multi-step workflow for creating a strategy vault with on-chain deposit.
 * Follows useCreateMarket.ts pattern (state machine, balance/approval checks).
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWalletClient, useSwitchChain } from 'wagmi';
import { parseEther, formatEther, type Address, keccak256, toHex } from 'viem';
import { flowTestnet } from 'viem/chains';
import { vaultService } from '@/services/vaultService';

// ─── Types ──────────────────────────────────────────────

export type VaultStep =
  | 'idle'
  | 'fetching_allocation'
  | 'reviewing'
  | 'approving'
  | 'depositing'
  | 'recording'
  | 'scheduling'
  | 'success'
  | 'error';

export interface VaultAllocation {
  highYield: number;
  stable: number;
  lp: number;
}

export interface VaultCreateState {
  step: VaultStep;
  error: string | null;
  txHash: string | null;
  schedulingTxHash: string | null;

  // NFT data
  selectedNftId: number | null;
  userNfts: number[];

  // Balance
  balance: string;
  depositAmount: string;

  // AI allocation result
  allocation: VaultAllocation | null;
  traits: Record<string, number> | null;
  poolAPYs: { highYield: number; stable: number; lp: number } | null;
  projectedAPY: number | null;
  riskProfile: string | null;
  proof: object | null;

  isLoading: boolean;
}

const initialState: VaultCreateState = {
  step: 'idle',
  error: null,
  txHash: null,
  schedulingTxHash: null,
  selectedNftId: null,
  userNfts: [],
  balance: '0',
  depositAmount: '',
  allocation: null,
  traits: null,
  poolAPYs: null,
  projectedAPY: null,
  riskProfile: null,
  proof: null,
  isLoading: false,
};

const FLOW_CHAIN_ID = 545;

export function useVaultCreate() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const [state, setState] = useState<VaultCreateState>(initialState);

  // ─── Fetch balance + NFTs on connect ──────────────────

  useEffect(() => {
    if (!address || !isConnected) return;

    const fetchData = async () => {
      try {
        const [balance, nfts] = await Promise.all([
          vaultService.getBalance(address),
          vaultService.getUserNFTs(address),
        ]);
        setState((prev) => ({
          ...prev,
          balance: formatEther(balance),
          userNfts: nfts,
        }));
      } catch (error) {
        console.error('[useVaultCreate] Failed to fetch initial data:', error);
      }
    };

    fetchData();
  }, [address, isConnected]);

  // ─── Chain switching ──────────────────────────────────

  const ensureCorrectChain = useCallback(async () => {
    if (chainId !== FLOW_CHAIN_ID) {
      await switchChainAsync({ chainId: FLOW_CHAIN_ID });
    }
  }, [chainId, switchChainAsync]);

  // ─── Step 1: Fetch AI Allocation ──────────────────────

  const fetchAllocation = useCallback(
    async (nftId: number, amount: string) => {
      if (!address) return;

      setState((prev) => ({
        ...prev,
        step: 'fetching_allocation',
        isLoading: true,
        error: null,
        selectedNftId: nftId,
        depositAmount: amount,
      }));

      try {
        const res = await fetch('/api/vault/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nftId, depositAmount: amount, ownerAddress: address }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to generate allocation');
        }

        const data = await res.json();

        setState((prev) => ({
          ...prev,
          step: 'reviewing',
          isLoading: false,
          allocation: data.allocation,
          traits: data.traits,
          poolAPYs: data.poolAPYs,
          projectedAPY: data.projectedAPY,
          riskProfile: data.riskProfile,
          proof: data.proof,
        }));
      } catch (error: any) {
        setState((prev) => ({
          ...prev,
          step: 'error',
          isLoading: false,
          error: error.message || 'Failed to generate allocation',
        }));
      }
    },
    [address]
  );

  // ─── Step 2: Approve + Deposit ────────────────────────

  const approveAndDeposit = useCallback(async () => {
    if (!walletClient || !address || !state.allocation || !state.selectedNftId) return;

    try {
      await ensureCorrectChain();

      const amount = parseEther(state.depositAmount);

      // Check approval
      setState((prev) => ({ ...prev, step: 'approving', isLoading: true, error: null }));

      const approval = await vaultService.checkApproval(address, state.depositAmount);

      if (!approval.hasApproval) {
        // Approve CRwN for StrategyVault
        const { crownTokenAbi, chainsToContracts: contracts } = await import('@/constants');
        const crwnAddr = contracts[FLOW_CHAIN_ID].crownToken as Address;
        const vaultAddr = contracts[FLOW_CHAIN_ID].strategyVault as Address;

        const approveTx = await walletClient.writeContract({
          address: crwnAddr,
          abi: crownTokenAbi,
          functionName: 'approve',
          args: [vaultAddr, amount],
          account: address,
          chain: flowTestnet,
        });

        // Wait for approval to be mined
        const { createFlowPublicClient } = await import('@/lib/flowClient');
        const publicClient = createFlowPublicClient();
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }

      // Deposit
      setState((prev) => ({ ...prev, step: 'depositing' }));

      const allocationBps: [bigint, bigint, bigint] = [
        BigInt(state.allocation.highYield),
        BigInt(state.allocation.stable),
        BigInt(state.allocation.lp),
      ];

      // Generate proof hash from 0G proof
      const proofHash = state.proof
        ? keccak256(toHex(JSON.stringify(state.proof)))
        : ('0x' + '0'.repeat(64)) as `0x${string}`;

      const { STRATEGY_VAULT_ABI } = await import('@/constants/abis/strategyVaultAbi');
      const { chainsToContracts } = await import('@/constants');

      const vaultAddress = chainsToContracts[FLOW_CHAIN_ID].strategyVault as Address;

      const depositTx = await walletClient.writeContract({
        address: vaultAddress,
        abi: STRATEGY_VAULT_ABI,
        functionName: 'deposit',
        args: [BigInt(state.selectedNftId), amount, allocationBps, proofHash],
        account: address,
        chain: flowTestnet,
      });

      // Record in DB
      setState((prev) => ({ ...prev, step: 'recording', txHash: depositTx }));

      await fetch('/api/vault/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nftId: state.selectedNftId,
          ownerAddress: address,
          txHash: depositTx,
          amount: state.depositAmount,
          allocation: state.allocation,
          proof: state.proof,
        }),
      });

      // Schedule yield cycles on Cadence (non-fatal — vault works via DB fallback)
      setState((prev) => ({ ...prev, step: 'scheduling' }));
      try {
        const { cadenceClient } = await import('@/lib/flow/cadenceClient');
        const { chainsToContracts } = await import('@/constants');
        const vaultAddr = chainsToContracts[FLOW_CHAIN_ID]?.strategyVault;
        if (!vaultAddr || !vaultAddr.startsWith('0x') || vaultAddr.length !== 42) {
          throw new Error('strategyVault address not configured or invalid');
        }

        const schedulingTx = await cadenceClient.scheduleVault({
          nftId: state.selectedNftId!,
          vaultAddress: vaultAddr,
          ownerAddress: address,
          cycleInterval: 86400, // daily
        });

        setState((prev) => ({ ...prev, schedulingTxHash: schedulingTx }));

        // Update DB with scheduledTxId
        await fetch('/api/vault/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nftId: state.selectedNftId,
            scheduledTxId: schedulingTx,
          }),
        });
      } catch (scheduleError) {
        // Non-fatal: vault still works via DB-only cron path
        console.warn('[useVaultCreate] Cadence scheduling failed (non-fatal):', scheduleError);
      }

      setState((prev) => ({
        ...prev,
        step: 'success',
        isLoading: false,
      }));
    } catch (error: any) {
      console.error('[useVaultCreate] Deposit failed:', error);
      setState((prev) => ({
        ...prev,
        step: 'error',
        isLoading: false,
        error: error?.shortMessage || error?.message || 'Transaction failed',
      }));
    }
  }, [walletClient, address, state.allocation, state.selectedNftId, state.depositAmount, state.proof, ensureCorrectChain]);

  // ─── Reset ────────────────────────────────────────────

  const reset = useCallback(() => {
    setState((prev) => ({
      ...initialState,
      balance: prev.balance,
      userNfts: prev.userNfts,
    }));
  }, []);

  // ─── Helpers ──────────────────────────────────────────

  const hasEnoughBalance = useCallback(
    (amount: string) => {
      try {
        return parseEther(state.balance) >= parseEther(amount);
      } catch {
        return false;
      }
    },
    [state.balance]
  );

  return {
    state,
    fetchAllocation,
    approveAndDeposit,
    reset,
    hasEnoughBalance,
    isConnected,
  };
}
