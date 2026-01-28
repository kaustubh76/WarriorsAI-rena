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

export function useScheduledBattles(): UseScheduledBattlesReturn {
  const [pendingBattles, setPendingBattles] = useState<ScheduledBattle[]>([]);
  const [readyBattles, setReadyBattles] = useState<ScheduledBattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [executing, setExecuting] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const mountedRef = useRef(true);

  // Fetch pending battles
  const fetchPendingBattles = useCallback(async () => {
    try {
      const battles = await cadenceClient.getPendingBattles();
      if (mountedRef.current) {
        setPendingBattles(battles);
      }
    } catch (error: any) {
      console.error('[useScheduledBattles] Failed to fetch pending battles:', error);
      if (mountedRef.current) {
        setError(error.message || 'Failed to load pending battles');
      }
    }
  }, []);

  // Fetch ready battles
  const fetchReadyBattles = useCallback(async () => {
    try {
      const battles = await cadenceClient.getReadyBattles();
      if (mountedRef.current) {
        setReadyBattles(battles);
      }
    } catch (error: any) {
      console.error('[useScheduledBattles] Failed to fetch ready battles:', error);
      // Don't set error state for ready battles fetch failure
    }
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchPendingBattles(), fetchReadyBattles()]);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchPendingBattles, fetchReadyBattles]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll for updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPendingBattles();
      fetchReadyBattles();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchPendingBattles, fetchReadyBattles]);

  // Subscribe to events
  useEffect(() => {
    const unsubscribe = cadenceClient.subscribeToEvents((event) => {
      if (event.type.includes('BattleScheduled')) {
        toast.success('New battle scheduled!');
        fetchPendingBattles();
      } else if (event.type.includes('BattleExecuted')) {
        toast.success('Battle executed!');
        fetchPendingBattles();
        fetchReadyBattles();
      } else if (event.type.includes('BattleCancelled')) {
        toast.info('Battle cancelled');
        fetchPendingBattles();
      }
    });

    return unsubscribe;
  }, [fetchPendingBattles, fetchReadyBattles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Schedule a new battle
  const scheduleBattle = useCallback(
    async (params: ScheduleBattleParams): Promise<string> => {
      setScheduling(true);
      try {
        const txId = await cadenceClient.scheduleBattle(params);
        toast.success(`Battle scheduled! TX: ${txId.slice(0, 8)}...`);

        // Refresh data after scheduling
        await fetchPendingBattles();
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
    [fetchPendingBattles]
  );

  // Execute a ready battle
  const executeBattle = useCallback(
    async (battleId: number): Promise<string> => {
      setExecuting(battleId);
      try {
        const txId = await cadenceClient.executeBattle(battleId);
        toast.success(`Battle executed! TX: ${txId.slice(0, 8)}...`);

        // Refresh data after execution
        await Promise.all([fetchPendingBattles(), fetchReadyBattles()]);
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
    [fetchPendingBattles, fetchReadyBattles]
  );

  // Cancel a pending battle
  const cancelBattle = useCallback(
    async (battleId: number): Promise<string> => {
      setCancelling(battleId);
      try {
        const txId = await cadenceClient.cancelBattle(battleId);
        toast.success(`Battle cancelled! TX: ${txId.slice(0, 8)}...`);

        // Refresh data after cancellation
        await fetchPendingBattles();
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
    [fetchPendingBattles]
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
