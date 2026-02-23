import { useState, useEffect, useCallback, useRef } from 'react';
import {
  cadenceClient,
  ScheduledBattle,
  ScheduleBattleParams,
} from '@/lib/flow/cadenceClient';
import { toast } from 'sonner';

export interface UseScheduledBattlesReturn {
  pendingBattles: ScheduledBattle[];
  readyBattles: ScheduledBattle[];
  allBattles: ScheduledBattle[];
  loading: boolean;
  error: string | null;
  scheduling: boolean;
  executing: number | null;
  cancelling: number | null;
  scheduleBattle: (params: ScheduleBattleParams) => Promise<string>;
  executeBattle: (battleId: number) => Promise<string>;
  cancelBattle: (battleId: number) => Promise<string>;
  refresh: () => Promise<void>;
}

/**
 * Parse on-chain battle data into ScheduledBattle format.
 * The API returns raw Cadence struct fields as strings.
 */
function parseOnChainBattle(raw: any): ScheduledBattle {
  return {
    id: parseInt(raw.id || '0'),
    warrior1Id: parseInt(raw.warrior1Id || raw.warrior1_id || '0'),
    warrior2Id: parseInt(raw.warrior2Id || raw.warrior2_id || '0'),
    betAmount: parseFloat(raw.betAmount || raw.bet_amount || '0'),
    scheduledTime: new Date(parseFloat(raw.scheduledTime || raw.scheduled_time || '0') * 1000),
    creator: raw.creator || '',
    executed: raw.executed === true || raw.executed === 'true',
    cancelled: raw.cancelled === true || raw.cancelled === 'true',
    transactionId: raw.transactionId,
  };
}

export function useScheduledBattles(): UseScheduledBattlesReturn {
  const [pendingBattles, setPendingBattles] = useState<ScheduledBattle[]>([]);
  const [readyBattles, setReadyBattles] = useState<ScheduledBattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [executing, setExecuting] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const mountedRef = useRef(true);

  /**
   * Fetch battles via the API route, which queries the blockchain
   * and provides database-tracked status information.
   */
  const fetchBattles = useCallback(async () => {
    try {
      const response = await fetch('/api/flow/scheduled');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 503) {
          throw new Error(
            errorData.code === 'CONTRACT_NOT_DEPLOYED'
              ? 'Flow scheduled battles contract is being deployed. Check back soon.'
              : 'Flow blockchain service is temporarily unavailable. Please try again later.'
          );
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!mountedRef.current) return;

      // Log warnings from API (e.g. contract not deployed)
      if (data.data?.warning) {
        console.warn('[useScheduledBattles]', data.data.warning);
      }

      const pending = (data.data?.pending || []).map(parseOnChainBattle);
      const ready = (data.data?.ready || []).map(parseOnChainBattle);

      setPendingBattles(pending);
      setReadyBattles(ready);
      setError(null);
    } catch (error: any) {
      console.error('[useScheduledBattles] Failed to fetch battles:', error);
      if (mountedRef.current) {
        setError(error.message || 'Failed to load battles');
      }
    }
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchBattles();
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchBattles]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll for updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBattles();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchBattles]);

  // Subscribe to on-chain events for real-time updates
  useEffect(() => {
    const unsubscribe = cadenceClient.subscribeToEvents((event) => {
      if (event.type.includes('BattleScheduled')) {
        toast.success('New battle scheduled!');
        fetchBattles();
      } else if (event.type.includes('BattleExecuted')) {
        toast.success('Battle executed!');
        fetchBattles();
      } else if (event.type.includes('BattleCancelled')) {
        toast.info('Battle cancelled');
        fetchBattles();
      }
    });

    return unsubscribe;
  }, [fetchBattles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Schedule a new battle.
   * Uses the client-side Flow wallet for the user to sign the transaction,
   * then persists to the database via the API route.
   */
  const scheduleBattle = useCallback(
    async (params: ScheduleBattleParams): Promise<string> => {
      setScheduling(true);
      try {
        // Step 1: User signs the on-chain schedule transaction via Flow wallet
        const txId = await cadenceClient.scheduleBattle(params);
        toast.success(`Battle scheduled on-chain! TX: ${txId.slice(0, 8)}...`);

        // Step 2: Persist to database via API for tracking
        try {
          await fetch('/api/flow/scheduled', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              warrior1Id: params.warrior1Id,
              warrior2Id: params.warrior2Id,
              betAmount: params.betAmount,
              scheduledTime: params.scheduledTime,
            }),
          });
        } catch (dbError: any) {
          // Don't fail the user-facing operation if DB sync fails
          console.warn('[useScheduledBattles] DB sync failed (on-chain tx succeeded):', dbError.message);
        }

        // Step 3: Refresh data to include the new battle
        await fetchBattles();
        return txId;
      } catch (error: any) {
        console.error('[useScheduledBattles] Failed to schedule battle:', error);
        const errorMessage = error.message || 'Failed to schedule battle';
        toast.error(errorMessage);
        throw error;
      } finally {
        if (mountedRef.current) {
          setScheduling(false);
        }
      }
    },
    [fetchBattles]
  );

  /**
   * Execute a ready battle via server-side API.
   * The API route uses server-side authorization (no user wallet needed).
   */
  const executeBattle = useCallback(
    async (battleId: number): Promise<string> => {
      setExecuting(battleId);
      try {
        const response = await fetch('/api/flow/scheduled', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ battleId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Execution failed (HTTP ${response.status})`);
        }

        const txId = data.data?.transactionId || '';
        toast.success(`Battle executed! TX: ${txId.slice(0, 8)}...`);

        // Refresh data after execution
        await fetchBattles();
        return txId;
      } catch (error: any) {
        console.error('[useScheduledBattles] Failed to execute battle:', error);
        const errorMessage = error.message || 'Failed to execute battle';
        toast.error(errorMessage);
        throw error;
      } finally {
        if (mountedRef.current) {
          setExecuting(null);
        }
      }
    },
    [fetchBattles]
  );

  /**
   * Cancel a pending battle via server-side API.
   * The API route uses server-side authorization.
   */
  const cancelBattle = useCallback(
    async (battleId: number): Promise<string> => {
      setCancelling(battleId);
      try {
        const response = await fetch('/api/flow/scheduled', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ battleId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Cancellation failed (HTTP ${response.status})`);
        }

        const txId = data.data?.transactionId || '';
        toast.success(`Battle cancelled! TX: ${txId.slice(0, 8)}...`);

        // Refresh data after cancellation
        await fetchBattles();
        return txId;
      } catch (error: any) {
        console.error('[useScheduledBattles] Failed to cancel battle:', error);
        const errorMessage = error.message || 'Failed to cancel battle';
        toast.error(errorMessage);
        throw error;
      } finally {
        if (mountedRef.current) {
          setCancelling(null);
        }
      }
    },
    [fetchBattles]
  );

  // Combine all battles
  const allBattles = [...pendingBattles, ...readyBattles].sort((a, b) => {
    return b.scheduledTime.getTime() - a.scheduledTime.getTime();
  });

  return {
    pendingBattles,
    readyBattles,
    allBattles,
    loading,
    error,
    scheduling,
    executing,
    cancelling,
    scheduleBattle,
    executeBattle,
    cancelBattle,
    refresh,
  };
}
