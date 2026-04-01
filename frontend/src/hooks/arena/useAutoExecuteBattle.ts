/**
 * Hook to auto-execute all 5 battle cycles sequentially after creation.
 * Calls the execute-cycle API endpoint one cycle at a time from the frontend.
 * Includes a betting window before the first cycle so users can place bets.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const BETTING_WINDOW_MS = 15_000; // 15s betting window before cycle 1
const MAX_RETRIES = 2;
const MAX_CYCLES = 5;

export type AutoExecutePhase = 'idle' | 'betting-window' | 'executing' | 'done' | 'error';

interface UseAutoExecuteBattleReturn {
  phase: AutoExecutePhase;
  currentCycle: number;
  isExecuting: boolean;
  error: string | null;
  bettingTimeRemaining: number; // seconds
  startExecution: (battleId: string) => void;
}

export function useAutoExecuteBattle(
  onCycleComplete?: () => void
): UseAutoExecuteBattleReturn {
  const [phase, setPhase] = useState<AutoExecutePhase>('idle');
  const [currentCycle, setCurrentCycle] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bettingTimeRemaining, setBettingTimeRemaining] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const executingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const executeSingleCycle = useCallback(async (
    battleId: string,
    signal: AbortSignal
  ): Promise<{ success: boolean; settled: boolean; roundNumber: number }> => {
    const res = await fetch(`/api/arena/strategy/${battleId}/execute-cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Cycle execution failed (${res.status})`);
    }

    const data = await res.json();
    return {
      success: data.success,
      settled: data.settled || false,
      roundNumber: data.roundNumber,
    };
  }, []);

  const startExecution = useCallback(async (battleId: string) => {
    if (executingRef.current) return;
    executingRef.current = true;

    // Abort any previous execution
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setCurrentCycle(0);

    try {
      // Phase 1: Betting window
      setPhase('betting-window');
      const bettingEnd = Date.now() + BETTING_WINDOW_MS;

      // Countdown timer
      while (Date.now() < bettingEnd) {
        if (controller.signal.aborted) return;
        const remaining = Math.ceil((bettingEnd - Date.now()) / 1000);
        setBettingTimeRemaining(remaining);
        await new Promise(r => setTimeout(r, 1000));
      }
      setBettingTimeRemaining(0);

      // Phase 2: Execute cycles 1-5
      setPhase('executing');

      for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
        if (controller.signal.aborted) return;
        setCurrentCycle(cycle);

        let lastError: Error | null = null;
        let result: { success: boolean; settled: boolean; roundNumber: number } | null = null;

        for (let retry = 0; retry <= MAX_RETRIES; retry++) {
          if (controller.signal.aborted) return;
          try {
            result = await executeSingleCycle(battleId, controller.signal);
            lastError = null;
            break;
          } catch (err) {
            if (controller.signal.aborted) return;
            lastError = err instanceof Error ? err : new Error(String(err));
            // If conflict (race condition), skip — cycle was already executed
            if (lastError.message.includes('Race condition') || lastError.message.includes('conflict')) {
              lastError = null;
              break;
            }
            if (retry < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
            }
          }
        }

        if (lastError) {
          setError(`Cycle ${cycle} failed: ${lastError.message}`);
          setPhase('error');
          executingRef.current = false;
          return;
        }

        // Notify parent to refresh battle data
        onCycleComplete?.();

        // If battle settled at cycle 5, we're done
        if (result?.settled) break;
      }

      setPhase('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Execution failed');
      setPhase('error');
    } finally {
      executingRef.current = false;
    }
  }, [executeSingleCycle, onCycleComplete]);

  return {
    phase,
    currentCycle,
    isExecuting: phase === 'executing' || phase === 'betting-window',
    error,
    bettingTimeRemaining,
    startExecution,
  };
}
