/**
 * Hook for executing prediction battles with AI debate system
 */

import { useState, useCallback } from 'react';
import {
  WarriorTraits,
  PredictionBattle,
  RoundResult,
} from '../../types/predictionArena';

interface ExecuteRoundResult {
  round: {
    id: string;
    roundNumber: number;
    w1Argument: string;
    w1Move: string;
    w1Score: number;
    w2Argument: string;
    w2Move: string;
    w2Score: number;
    roundWinner: string;
    judgeReasoning: string;
  };
  battle: PredictionBattle;
  result: RoundResult;
}

interface ExecuteFullBattleResult {
  battle: PredictionBattle;
  result: {
    rounds: RoundResult[];
    finalWinner: 'warrior1' | 'warrior2' | 'draw';
    warrior1TotalScore: number;
    warrior2TotalScore: number;
  };
}

interface UseBattleExecutionReturn {
  // State
  isExecuting: boolean;
  currentRound: number | null;
  error: string | null;

  // Actions
  executeRound: (
    battleId: string,
    warrior1Traits: WarriorTraits,
    warrior2Traits: WarriorTraits
  ) => Promise<ExecuteRoundResult | null>;

  executeFullBattle: (
    battleId: string,
    warrior1Traits: WarriorTraits,
    warrior2Traits: WarriorTraits
  ) => Promise<ExecuteFullBattleResult | null>;
}

export function useBattleExecution(): UseBattleExecutionReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Execute a single round
   */
  const executeRound = useCallback(async (
    battleId: string,
    warrior1Traits: WarriorTraits,
    warrior2Traits: WarriorTraits
  ): Promise<ExecuteRoundResult | null> => {
    setIsExecuting(true);
    setError(null);

    try {
      const res = await fetch(`/api/arena/battles/${battleId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'round',
          warrior1Traits,
          warrior2Traits,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to execute round');
      }

      const data: ExecuteRoundResult = await res.json();
      setCurrentRound(data.round.roundNumber);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute round';
      setError(message);
      return null;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  /**
   * Execute all remaining rounds
   */
  const executeFullBattle = useCallback(async (
    battleId: string,
    warrior1Traits: WarriorTraits,
    warrior2Traits: WarriorTraits
  ): Promise<ExecuteFullBattleResult | null> => {
    setIsExecuting(true);
    setError(null);

    try {
      const res = await fetch(`/api/arena/battles/${battleId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'full',
          warrior1Traits,
          warrior2Traits,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to execute battle');
      }

      const data: ExecuteFullBattleResult = await res.json();
      setCurrentRound(5);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute battle';
      setError(message);
      return null;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  return {
    isExecuting,
    currentRound,
    error,
    executeRound,
    executeFullBattle,
  };
}
