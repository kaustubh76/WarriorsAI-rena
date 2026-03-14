'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface VaultAllocation {
  highYield: number;
  stable: number;
  lp: number;
}

interface WarriorTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

interface CycleWarriorData {
  move: string | null;
  defiMove: string | null;
  score: number;
  yieldEarned: string | null;
  yieldFormatted: string;
  allocationBefore: VaultAllocation | null;
  allocationAfter: VaultAllocation | null;
  balanceBefore: string | null;
  balanceAfter: string | null;
  txHash: string | null;
}

interface CycleData {
  roundNumber: number;
  warrior1: CycleWarriorData;
  warrior2: CycleWarriorData;
  roundWinner: string | null;
  judgeReasoning: string | null;
  poolAPYs: { highYield: number; stable: number; lp: number } | null;
  // VRF data at cycle level
  w1IsHit: boolean | null;
  w2IsHit: boolean | null;
  w1VrfSeed: string | null;
  w2VrfSeed: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface WarriorBattleData {
  nftId: number;
  owner: string;
  score: number;
  totalYield: string;
  totalYieldFormatted: string;
  traits: WarriorTraits | null;
  strategyProfile: string;
  currentAllocation: VaultAllocation | null;
  vaultBalance: string | null;
  imageUrl: string;
}

interface BattleData {
  id: string;
  status: string;
  currentRound: number;
  question: string;
  stakes: string;
  createdAt: string;
  completedAt: string | null;
  // Scheduling fields
  scheduledStartAt: string | null;
  lastCycleAt: string | null;
  nextCycleEstimate: string | null;
  warrior1: WarriorBattleData;
  warrior2: WarriorBattleData;
  cycles: CycleData[];
  poolAPYs: { highYield: number; stable: number; lp: number };
  betting: {
    totalWarrior1Bets: string;
    totalWarrior2Bets: string;
    totalBettors: number;
    bettingOpen: boolean;
  } | null;
}

interface UseStrategyBattleReturn {
  battle: BattleData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStrategyBattle(battleId: string): UseStrategyBattleReturn {
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBattle = useCallback(async () => {
    try {
      const res = await fetch(`/api/arena/strategy/${battleId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch battle: ${res.status}`);
      }
      const data = await res.json();
      setBattle(data.battle);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load battle');
    } finally {
      setLoading(false);
    }
  }, [battleId]);

  const refresh = useCallback(async () => {
    await fetchBattle();
  }, [fetchBattle]);

  // Initial fetch
  useEffect(() => {
    fetchBattle();
  }, [fetchBattle]);

  // Poll every 10s while battle is active (spectator mode)
  useEffect(() => {
    if (battle?.status === 'active') {
      pollingRef.current = setInterval(fetchBattle, 10_000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [battle?.status, fetchBattle]);

  return { battle, loading, error, refresh };
}
