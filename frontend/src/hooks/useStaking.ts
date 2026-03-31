/**
 * Hook for CRwN staking: stake/unstake CRwN, warrior NFT boost, and on-chain reads.
 * Follows the same dual-path pattern as useBattleBetting.ts.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { parseEther, type Address } from 'viem';
import { CRWN_TOKEN_ABI } from '@/constants/abis/crwnTokenAbi';
import { STAKING_ABI, STCRWN_ABI } from '@/constants/abis/stakingAbi';
import { FLOW_TESTNET_CONTRACTS } from '@/constants/index';
import { chainsToContracts, getChainId } from '@/constants';

// ============================================
// TYPES
// ============================================

interface UnstakeRequest {
  crwnAmount: string;
  unlockTime: number; // unix seconds
}

interface WarriorBoostInfo {
  nftId: number;
  boostBps: number; // 10000 = 1x
}

interface UseStakingReturn {
  // State
  exchangeRate: string | null;       // CRwN per stCRwN (scaled 1e18)
  totalStaked: string | null;        // Total CRwN staked
  userStakedBalance: string | null;  // User's CRwN value (with boost)
  userStCrwnBalance: string | null;  // User's raw stCRwN balance
  unstakeRequest: UnstakeRequest | null;
  warriorBoost: WarriorBoostInfo | null;
  loading: boolean;
  error: string | null;

  // Actions
  stake: (amount: string) => Promise<boolean>;
  requestUnstake: (stCrwnAmount: string) => Promise<boolean>;
  completeUnstake: () => Promise<boolean>;
  stakeWarrior: (nftId: number) => Promise<boolean>;
  unstakeWarrior: () => Promise<boolean>;
  refetch: () => Promise<void>;

  // Computed
  isStaking: boolean;
  isUnstaking: boolean;
  canCompleteUnstake: boolean;
  isStakingDeployed: boolean;
}

// On-chain addresses
const CRWN_TOKEN_ADDRESS = FLOW_TESTNET_CONTRACTS.CRWN_TOKEN as Address;
const STAKING_ADDRESS = FLOW_TESTNET_CONTRACTS.STAKING as Address;
const STCRWN_ADDRESS = FLOW_TESTNET_CONTRACTS.STCRWN_TOKEN as Address;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const isStakingDeployed = STAKING_ADDRESS !== ZERO_ADDR && STCRWN_ADDRESS !== ZERO_ADDR;

// ============================================
// HOOK
// ============================================

export function useStaking(): UseStakingReturn {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [exchangeRate, setExchangeRate] = useState<string | null>(null);
  const [totalStaked, setTotalStaked] = useState<string | null>(null);
  const [userStakedBalance, setUserStakedBalance] = useState<string | null>(null);
  const [userStCrwnBalance, setUserStCrwnBalance] = useState<string | null>(null);
  const [unstakeRequest, setUnstakeRequest] = useState<UnstakeRequest | null>(null);
  const [warriorBoost, setWarriorBoost] = useState<WarriorBoostInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStakingAction, setIsStakingAction] = useState(false);
  const [isUnstakingAction, setIsUnstakingAction] = useState(false);

  // ── Fetch on-chain state ──────────────────────────
  const fetchData = useCallback(async () => {
    if (!publicClient || !isStakingDeployed) return;

    try {
      setLoading(true);
      setError(null);

      // Global reads (no user address needed)
      const [rate, total] = await Promise.all([
        publicClient.readContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'getExchangeRate',
        }),
        publicClient.readContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'getTotalStaked',
        }),
      ]);

      setExchangeRate((rate as bigint).toString());
      setTotalStaked((total as bigint).toString());

      // User-specific reads
      if (address) {
        const [stakedBal, stCrwnBal, unstakeReq, boost] = await Promise.all([
          publicClient.readContract({
            address: STAKING_ADDRESS,
            abi: STAKING_ABI,
            functionName: 'getStakedBalance',
            args: [address],
          }),
          publicClient.readContract({
            address: STCRWN_ADDRESS,
            abi: STCRWN_ABI,
            functionName: 'balanceOf',
            args: [address],
          }),
          publicClient.readContract({
            address: STAKING_ADDRESS,
            abi: STAKING_ABI,
            functionName: 'unstakeRequests',
            args: [address],
          }),
          publicClient.readContract({
            address: STAKING_ADDRESS,
            abi: STAKING_ABI,
            functionName: 'getWarriorBoost',
            args: [address],
          }),
        ]);

        setUserStakedBalance((stakedBal as bigint).toString());
        setUserStCrwnBalance((stCrwnBal as bigint).toString());

        // UnstakeRequest: [crwnAmount, unlockTime]
        const reqArr = unstakeReq as [bigint, bigint];
        if (reqArr[0] > 0n) {
          setUnstakeRequest({
            crwnAmount: reqArr[0].toString(),
            unlockTime: Number(reqArr[1]),
          });
        } else {
          setUnstakeRequest(null);
        }

        // WarriorBoost: [nftId, boostBps]
        const boostArr = boost as [bigint, bigint];
        if (boostArr[1] > 0n) {
          setWarriorBoost({
            nftId: Number(boostArr[0]),
            boostBps: Number(boostArr[1]),
          });
        } else {
          setWarriorBoost(null);
        }
      }
    } catch (err) {
      console.error('[useStaking] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch staking data');
    } finally {
      setLoading(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Stake CRwN ──────────────────────────
  const stake = useCallback(async (amount: string): Promise<boolean> => {
    if (!address || !isStakingDeployed) return false;
    setIsStakingAction(true);
    setError(null);

    try {
      const amountWei = parseEther(amount);

      // 1. Approve CRwN to staking contract
      await writeContractAsync({
        address: CRWN_TOKEN_ADDRESS,
        abi: CRWN_TOKEN_ABI,
        functionName: 'approve',
        args: [STAKING_ADDRESS, amountWei],
        gas: 5_000_000n,
      });

      // 2. Stake
      const hash = await writeContractAsync({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'stake',
        args: [amountWei],
        gas: 5_000_000n,
      });

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      }

      await fetchData();
      return true;
    } catch (err) {
      console.error('[useStaking] stake error:', err);
      setError(err instanceof Error ? err.message : 'Stake failed');
      return false;
    } finally {
      setIsStakingAction(false);
    }
  }, [address, writeContractAsync, publicClient, fetchData]);

  // ── Request Unstake ──────────────────────────
  const requestUnstake = useCallback(async (stCrwnAmount: string): Promise<boolean> => {
    if (!address || !isStakingDeployed) return false;
    setIsUnstakingAction(true);
    setError(null);

    try {
      const amountWei = parseEther(stCrwnAmount);

      const hash = await writeContractAsync({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'requestUnstake',
        args: [amountWei],
        gas: 5_000_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      }

      await fetchData();
      return true;
    } catch (err) {
      console.error('[useStaking] requestUnstake error:', err);
      setError(err instanceof Error ? err.message : 'Unstake request failed');
      return false;
    } finally {
      setIsUnstakingAction(false);
    }
  }, [address, writeContractAsync, publicClient, fetchData]);

  // ── Complete Unstake ──────────────────────────
  const completeUnstake = useCallback(async (): Promise<boolean> => {
    if (!address || !isStakingDeployed) return false;
    setIsUnstakingAction(true);
    setError(null);

    try {
      const hash = await writeContractAsync({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'completeUnstake',
        gas: 5_000_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      }

      await fetchData();
      return true;
    } catch (err) {
      console.error('[useStaking] completeUnstake error:', err);
      setError(err instanceof Error ? err.message : 'Complete unstake failed');
      return false;
    } finally {
      setIsUnstakingAction(false);
    }
  }, [address, writeContractAsync, publicClient, fetchData]);

  // ── Stake Warrior NFT ──────────────────────────
  const stakeWarrior = useCallback(async (nftId: number): Promise<boolean> => {
    if (!address || !isStakingDeployed) return false;
    setIsStakingAction(true);
    setError(null);

    try {
      const chainId = getChainId();
      const contracts = chainsToContracts[chainId];
      const nftAddress = contracts?.warriorsNFT as Address | undefined;
      if (!nftAddress || nftAddress === ZERO_ADDR) {
        throw new Error('Warriors NFT contract not configured');
      }

      // 1. Approve NFT to staking contract
      await writeContractAsync({
        address: nftAddress,
        abi: [
          {
            name: 'approve',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'tokenId', type: 'uint256' },
            ],
            outputs: [],
          },
        ] as const,
        functionName: 'approve',
        args: [STAKING_ADDRESS, BigInt(nftId)],
        gas: 5_000_000n,
      });

      // 2. Stake warrior
      const hash = await writeContractAsync({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'stakeWarrior',
        args: [BigInt(nftId)],
        gas: 5_000_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      }

      await fetchData();
      return true;
    } catch (err) {
      console.error('[useStaking] stakeWarrior error:', err);
      setError(err instanceof Error ? err.message : 'Stake warrior failed');
      return false;
    } finally {
      setIsStakingAction(false);
    }
  }, [address, writeContractAsync, publicClient, fetchData]);

  // ── Unstake Warrior NFT ──────────────────────────
  const unstakeWarrior = useCallback(async (): Promise<boolean> => {
    if (!address || !isStakingDeployed) return false;
    setIsStakingAction(true);
    setError(null);

    try {
      const hash = await writeContractAsync({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'unstakeWarrior',
        gas: 5_000_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      }

      await fetchData();
      return true;
    } catch (err) {
      console.error('[useStaking] unstakeWarrior error:', err);
      setError(err instanceof Error ? err.message : 'Unstake warrior failed');
      return false;
    } finally {
      setIsStakingAction(false);
    }
  }, [address, writeContractAsync, publicClient, fetchData]);

  // ── Computed ──────────────────────────
  const canCompleteUnstake = unstakeRequest
    ? Date.now() / 1000 >= unstakeRequest.unlockTime
    : false;

  return {
    exchangeRate,
    totalStaked,
    userStakedBalance,
    userStCrwnBalance,
    unstakeRequest,
    warriorBoost,
    loading,
    error,

    stake,
    requestUnstake,
    completeUnstake,
    stakeWarrior,
    unstakeWarrior,
    refetch: fetchData,

    isStaking: isStakingAction,
    isUnstaking: isUnstakingAction,
    canCompleteUnstake,
    isStakingDeployed,
  };
}
