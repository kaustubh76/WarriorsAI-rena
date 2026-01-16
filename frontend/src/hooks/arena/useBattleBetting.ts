/**
 * Hook for spectator betting on prediction battles
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';

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
}

// Contract ABI for betting functions
const PREDICTION_ARENA_BETTING_ABI = [
  {
    name: 'placeBet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_battleId', type: 'uint256' },
      { name: '_betOnWarrior1', type: 'bool' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'claimBet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_battleId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getBettingOdds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_battleId', type: 'uint256' }],
    outputs: [
      { name: 'warrior1Odds', type: 'uint256' },
      { name: 'warrior2Odds', type: 'uint256' },
      { name: 'totalPool', type: 'uint256' },
    ],
  },
  {
    name: 'getUserBet',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_battleId', type: 'uint256' },
      { name: '_bettor', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'bettor', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'betOnWarrior1', type: 'bool' },
          { name: 'claimed', type: 'bool' },
        ],
      },
    ],
  },
] as const;

// ============================================
// HOOK
// ============================================

export function useBattleBetting(
  battleId: string | null,
  contractAddress?: `0x${string}`
): UseBattleBettingReturn {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [pool, setPool] = useState<BettingPool | null>(null);
  const [userBet, setUserBet] = useState<UserBet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

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

      const res = await fetch(`/api/arena/betting?${params.toString()}`);

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
   * Place a bet on the battle
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
    setError(null);

    try {
      // If contract address provided, do on-chain bet
      if (contractAddress) {
        await writeContractAsync({
          address: contractAddress,
          abi: PREDICTION_ARENA_BETTING_ABI,
          functionName: 'placeBet',
          args: [BigInt(battleId), betOnWarrior1, parseEther(amount)],
        });
      }

      // Record bet in API
      const res = await fetch('/api/arena/betting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId,
          bettorAddress: address,
          betOnWarrior1,
          amount: parseEther(amount).toString(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to place bet');
      }

      // Refresh data
      await fetchBettingInfo();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bet');
      return false;
    } finally {
      setIsPlacingBet(false);
    }
  }, [battleId, address, contractAddress, writeContractAsync, fetchBettingInfo]);

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
      // If contract address provided, do on-chain claim
      if (contractAddress) {
        await writeContractAsync({
          address: contractAddress,
          abi: PREDICTION_ARENA_BETTING_ABI,
          functionName: 'claimBet',
          args: [BigInt(battleId)],
        });
      }

      // Claim via API
      const res = await fetch('/api/arena/betting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId,
          bettorAddress: address,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to claim');
      }

      const data = await res.json();

      // Refresh data
      await fetchBettingInfo();

      return {
        won: data.won,
        payout: data.payout,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim');
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
