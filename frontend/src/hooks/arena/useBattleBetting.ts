/**
 * Hook for spectator betting on prediction battles.
 * Places on-chain CRwN transfer to Strategy Vault as escrow, then records in DB.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import { CRWN_TOKEN_ABI } from '@/constants/abis/crwnTokenAbi';
import { BATTLE_MANAGER_ABI } from '@/constants/abis/battleManagerAbi';
import { FLOW_TESTNET_CONTRACTS } from '@/constants/index';

// ============================================
// TYPES
// ============================================

interface BettingPool {
  totalWarrior1Bets: string;
  totalWarrior2Bets: string;
  totalBettors: number;
  warrior1Odds: number;  // 0-10000 bps
  warrior2Odds: number;
  totalPool: string;
  bettingOpen: boolean;
}

interface UserBet {
  betOnWarrior1: boolean;
  amount: string;
  placedAt: string;
  claimed: boolean;
  payout?: string;
}

type BetStage = 'idle' | 'checking' | 'confirming' | 'recording' | 'done';

interface UseBattleBettingReturn {
  // Pool data
  pool: BettingPool | null;
  userBet: UserBet | null;
  loading: boolean;
  error: string | null;

  // Actions
  placeBet: (betOnWarrior1: boolean, amount: string) => Promise<boolean>;
  claimWinnings: () => Promise<{ won: boolean; payout: string } | null>;
  refetch: () => Promise<void>;

  // State
  isPlacingBet: boolean;
  isClaiming: boolean;
  betStage: BetStage;
}

// On-chain addresses
const CRWN_TOKEN_ADDRESS = FLOW_TESTNET_CONTRACTS.CRWN_TOKEN as `0x${string}`;
const BATTLE_MANAGER_ADDRESS = FLOW_TESTNET_CONTRACTS.BATTLE_MANAGER as `0x${string}`;

// Use BattleManager as the default betting contract when deployed
const DEFAULT_BETTING_CONTRACT = BATTLE_MANAGER_ADDRESS !== '0x0000000000000000000000000000000000000000'
  ? BATTLE_MANAGER_ADDRESS
  : undefined;

// ============================================
// HOOK
// ============================================

export function useBattleBetting(
  battleId: string | null,
  contractAddress?: `0x${string}`,
  onChainBattleId?: number
): UseBattleBettingReturn {
  // Use BattleManager as default when deployed
  const effectiveContract = contractAddress || DEFAULT_BETTING_CONTRACT;
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [pool, setPool] = useState<BettingPool | null>(null);
  const [userBet, setUserBet] = useState<UserBet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [betStage, setBetStage] = useState<BetStage>('idle');

  /**
   * Fetch betting pool and user bet info
   */
  const fetchBettingInfo = useCallback(async () => {
    if (!battleId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ battleId });
      if (address) {
        params.set('userAddress', address);
      }

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`/api/arena/betting?${params.toString()}`, {
        signal: controller.signal,
      });

      clearTimeout(fetchTimeout);

      if (!res.ok) {
        throw new Error('Failed to fetch betting info');
      }

      const data = await res.json();

      setPool(data.pool);
      setUserBet(data.userBet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [battleId, address]);

  /**
   * Place a bet on the battle.
   * 1. Check CRwN balance on-chain
   * 2. Transfer CRwN to escrow (Strategy Vault) — wallet popup
   * 3. Wait for tx confirmation
   * 4. Record bet in API with txHash
   */
  const placeBet = useCallback(async (
    betOnWarrior1: boolean,
    amount: string
  ): Promise<boolean> => {
    if (!battleId || !address) {
      setError('Wallet not connected');
      return false;
    }

    setIsPlacingBet(true);
    setBetStage('checking');
    setError(null);

    try {
      const weiAmount = parseEther(amount);

      // Step 1: Check CRwN balance
      if (publicClient) {
        const balance = await publicClient.readContract({
          address: CRWN_TOKEN_ADDRESS,
          abi: CRWN_TOKEN_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        if (balance < weiAmount) {
          throw new Error(`Insufficient CRwN balance (have ${Number(balance / 10n ** 18n)}, need ${amount})`);
        }
      }

      // Step 2: Transfer CRwN to escrow — triggers wallet popup
      setBetStage('confirming');
      let txHash: `0x${string}` | undefined;

      if (effectiveContract) {
        // On-chain: approve CRwN then call BattleManager.placeBet()
        const approveHash = await writeContractAsync({
          address: CRWN_TOKEN_ADDRESS,
          abi: CRWN_TOKEN_ABI,
          functionName: 'approve',
          args: [effectiveContract, weiAmount],
        });
        if (approveHash && publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 30_000 });
        }

        if (!onChainBattleId) {
          throw new Error('Cannot place on-chain bet: battle has no on-chain ID yet. Wait for the battle to be registered on-chain.');
        }
        const onChainId = BigInt(onChainBattleId);
        txHash = await writeContractAsync({
          address: effectiveContract,
          abi: BATTLE_MANAGER_ABI,
          functionName: 'placeBet',
          args: [onChainId, betOnWarrior1, weiAmount],
        });
      } else {
        // BattleManager not deployed — do NOT fall back to direct transfer (would burn tokens)
        throw new Error('BattleManager contract not deployed — cannot place on-chain bet');
      }

      // Step 3: Wait for on-chain confirmation
      if (txHash && publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
      }

      // Step 4: Record bet in API with tx hash
      setBetStage('recording');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/arena/betting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId,
          bettorAddress: address,
          betOnWarrior1,
          amount: weiAmount.toString(),
          txHash: txHash || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        let errMsg = 'Failed to record bet';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `Failed to record bet (${res.status})`;
        }
        throw new Error(errMsg);
      }

      setBetStage('done');
      // Refresh data — don't block on failure
      fetchBettingInfo().catch(() => {});
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out — please try again');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to place bet');
      }
      return false;
    } finally {
      setIsPlacingBet(false);
      setBetStage('idle');
    }
  }, [battleId, address, contractAddress, writeContractAsync, publicClient, fetchBettingInfo]);

  /**
   * Claim winnings from completed battle
   */
  const claimWinnings = useCallback(async (): Promise<{ won: boolean; payout: string } | null> => {
    if (!battleId || !address) {
      setError('Wallet not connected');
      return null;
    }

    setIsClaiming(true);
    setError(null);

    try {
      // On-chain claim via BattleManager
      let claimTxHash: string | undefined;
      if (effectiveContract) {
        if (!onChainBattleId) {
          throw new Error('Cannot claim on-chain: battle has no on-chain ID');
        }
        const onChainId = BigInt(onChainBattleId);
        claimTxHash = await writeContractAsync({
          address: effectiveContract,
          abi: BATTLE_MANAGER_ABI,
          functionName: 'claimBet',
          args: [onChainId],
        });
      }

      // Sync claim to API (with 15s timeout)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/arena/betting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId,
          bettorAddress: address,
          ...(claimTxHash ? { claimTxHash } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        let errMsg = 'Failed to claim';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `Failed to claim (${res.status})`;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();

      // Refresh data — don't block on failure
      fetchBettingInfo().catch(() => {});

      return {
        won: data.won,
        payout: data.payout,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out — please try again');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to claim');
      }
      return null;
    } finally {
      setIsClaiming(false);
    }
  }, [battleId, address, contractAddress, writeContractAsync, fetchBettingInfo]);

  // Initial fetch
  useEffect(() => {
    fetchBettingInfo();
  }, [fetchBettingInfo]);

  return {
    pool,
    userBet,
    loading,
    error,
    placeBet,
    claimWinnings,
    refetch: fetchBettingInfo,
    isPlacingBet,
    isClaiming,
    betStage,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format odds as percentage string
 */
export function formatOdds(odds: number): string {
  return `${(odds / 100).toFixed(1)}%`;
}

/**
 * Calculate potential payout for a bet amount
 */
export function calculatePotentialPayout(
  betAmount: string,
  betOnWarrior1: boolean,
  pool: BettingPool
): string {
  const amount = BigInt(betAmount);
  const w1Pool = BigInt(pool.totalWarrior1Bets);
  const w2Pool = BigInt(pool.totalWarrior2Bets);

  const winningPool = betOnWarrior1 ? w1Pool + amount : w2Pool + amount;
  const losingPool = betOnWarrior1 ? w2Pool : w1Pool;

  if (winningPool === 0n) return betAmount;

  const share = (amount * 10n ** 18n) / winningPool;
  const winnings = (losingPool * share) / 10n ** 18n;
  const fee = (winnings * 500n) / 10000n; // 5% fee

  const payout = amount + winnings - fee;
  return payout.toString();
}

/**
 * Format multiplier for display (e.g., "1.85x")
 */
export function formatMultiplier(
  betOnWarrior1: boolean,
  pool: BettingPool
): string {
  const w1Pool = BigInt(pool.totalWarrior1Bets || '0');
  const w2Pool = BigInt(pool.totalWarrior2Bets || '0');
  const totalPool = w1Pool + w2Pool;

  if (totalPool === 0n) return '2.00x';

  const myPool = betOnWarrior1 ? w1Pool : w2Pool;
  const oppPool = betOnWarrior1 ? w2Pool : w1Pool;

  if (myPool === 0n) return '∞';

  // Raw multiplier before fees
  const multiplier = Number(totalPool) / Number(myPool);

  // Apply 5% fee on winnings
  const netMultiplier = 1 + (multiplier - 1) * 0.95;

  return `${netMultiplier.toFixed(2)}x`;
}
