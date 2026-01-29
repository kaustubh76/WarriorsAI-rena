import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  scheduleNativeResolution,
  resolveMarket,
  cancelResolution as cancelOnChain,
  waitForSealed,
  OracleSource,
} from '@/lib/flow/marketResolutionClient';

export interface ScheduledResolution {
  id: string;
  flowResolutionId: bigint | null;
  scheduledTime: Date;
  externalMarketId: string;
  externalMarket: {
    id: string;
    question: string;
    source: string;
    outcome?: string;
    resolvedAt?: Date;
    marketId: string;
  };
  mirrorKey?: string;
  mirrorMarket?: {
    marketKey: string;
    question: string;
    endTime: Date;
  };
  oracleSource: string;
  status: string;
  outcome?: boolean;
  executedAt?: Date;
  lastError?: string;
  attempts: number;
  creator: string;
  scheduleTransactionHash?: string;
  executeTransactionHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ScheduleParams {
  externalMarketId: string;
  mirrorKey?: string;
  scheduledTime: Date;
  oracleSource: 'polymarket' | 'kalshi' | 'internal';
}

interface UseScheduledResolutionsReturn {
  // Data
  resolutions: ScheduledResolution[];
  pendingResolutions: ScheduledResolution[];
  readyResolutions: ScheduledResolution[];
  executingResolutions: ScheduledResolution[];
  completedResolutions: ScheduledResolution[];
  failedResolutions: ScheduledResolution[];
  cancelledResolutions: ScheduledResolution[];

  // Stats
  stats: {
    pending: number;
    ready: number;
    executing: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  };

  // Loading states
  loading: boolean;
  scheduling: boolean;
  executing: boolean;
  cancelling: boolean;

  // Error
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  scheduleResolution: (params: ScheduleParams) => Promise<string>;
  executeResolution: (id: string) => Promise<void>;
  cancelResolution: (id: string) => Promise<void>;
  getResolution: (id: string) => Promise<ScheduledResolution | null>;
}

export function useScheduledResolutions(
  statusFilter?: string,
  autoRefresh: boolean = true
): UseScheduledResolutionsReturn {
  const [resolutions, setResolutions] = useState<ScheduledResolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  // Fetch resolutions from API
  const fetchResolutions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter) {
        params.append('status', statusFilter);
      }

      const url = `/api/flow/scheduled-resolutions${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch resolutions');
      }

      const data = await response.json();

      if (!isMounted.current) return;

      // Parse dates and bigints
      const parsedResolutions = (data.resolutions || []).map((r: any) => ({
        ...r,
        flowResolutionId: r.flowResolutionId ? BigInt(r.flowResolutionId) : null,
        scheduledTime: new Date(r.scheduledTime),
        executedAt: r.executedAt ? new Date(r.executedAt) : undefined,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
        externalMarket: {
          ...r.externalMarket,
          resolvedAt: r.externalMarket?.resolvedAt ? new Date(r.externalMarket.resolvedAt) : undefined,
        },
        mirrorMarket: r.mirrorMarket ? {
          ...r.mirrorMarket,
          endTime: new Date(r.mirrorMarket.endTime),
        } : undefined,
      }));

      setResolutions(parsedResolutions);
    } catch (err: any) {
      console.error('Error fetching resolutions:', err);
      if (isMounted.current) {
        setError(err.message);
        toast.error(`Failed to fetch resolutions: ${err.message}`);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [statusFilter]);

  // Schedule new resolution: saves to DB then submits on-chain via Flow Wallet
  const scheduleResolution = useCallback(async (params: ScheduleParams): Promise<string> => {
    try {
      setScheduling(true);
      setError(null);

      // Step 1: Save to database
      const response = await fetch('/api/flow/scheduled-resolutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to schedule resolution');
      }

      const data = await response.json();
      const resolutionId = data.resolution?.id;

      toast.success('Resolution saved! Submitting to Flow blockchain...');

      // Step 2: Submit on-chain via Flow Wallet (user signs)
      let txHash = '';
      try {
        const oracleSourceMap: Record<string, OracleSource> = {
          polymarket: OracleSource.POLYMARKET,
          kalshi: OracleSource.KALSHI,
          internal: OracleSource.INTERNAL,
        };

        const txId = await scheduleNativeResolution({
          marketId: parseInt(data.resolution?.externalMarket?.marketId || '0') || Date.now(),
          scheduledTime: Math.floor(params.scheduledTime.getTime() / 1000),
          oracleSource: oracleSourceMap[params.oracleSource] || OracleSource.INTERNAL,
        });

        toast.info('Waiting for Flow transaction to be sealed...');
        await waitForSealed(txId);
        txHash = txId;

        // Step 3: Update DB with transaction hash
        if (resolutionId && txHash) {
          await fetch('/api/flow/scheduled-resolutions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resolutionId,
              scheduleTransactionHash: txHash,
            }),
          });
        }

        toast.success('Resolution scheduled on Flow blockchain!');
      } catch (chainErr: any) {
        // User may have rejected the wallet popup - DB record still exists
        console.warn('On-chain scheduling failed (DB record kept):', chainErr.message);
        toast.warning('Resolution saved to database. On-chain submission was cancelled or failed.');
      }

      await fetchResolutions();
      return txHash || data.resolution?.scheduleTransactionHash || '';
    } catch (err: any) {
      console.error('Error scheduling resolution:', err);
      toast.error(`Failed to schedule: ${err.message}`);
      throw err;
    } finally {
      setScheduling(false);
    }
  }, [fetchResolutions]);

  // Execute resolution: updates DB then resolves on-chain via Flow Wallet
  const executeResolution = useCallback(async (id: string): Promise<void> => {
    try {
      setExecuting(true);
      setError(null);

      // Step 1: Update DB status
      const response = await fetch('/api/flow/scheduled-resolutions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionId: id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to execute resolution');
      }

      const data = await response.json();

      // Step 2: Submit resolve transaction on-chain via Flow Wallet
      try {
        if (data.resolution?.flowResolutionId && data.resolution?.outcome !== undefined) {
          toast.info('Submitting resolution to Flow blockchain...');
          const txId = await resolveMarket(
            Number(data.resolution.flowResolutionId),
            data.resolution.outcome === true
          );
          await waitForSealed(txId);
          toast.success('Resolution executed on Flow blockchain!');
        } else {
          toast.success('Resolution executed successfully!');
        }
      } catch (chainErr: any) {
        console.warn('On-chain resolution failed:', chainErr.message);
        toast.warning('DB updated but on-chain resolution failed. You can retry.');
      }

      await fetchResolutions();
    } catch (err: any) {
      console.error('Error executing resolution:', err);
      toast.error(`Failed to execute: ${err.message}`);
      throw err;
    } finally {
      setExecuting(false);
    }
  }, [fetchResolutions]);

  // Cancel resolution: updates DB then cancels on-chain via Flow Wallet
  const cancelResolution = useCallback(async (id: string): Promise<void> => {
    try {
      setCancelling(true);
      setError(null);

      // Get resolution details first for on-chain cancel
      const resolution = await getResolution(id);

      // Step 1: Update DB
      const response = await fetch(`/api/flow/scheduled-resolutions?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel resolution');
      }

      // Step 2: Cancel on-chain via Flow Wallet (50% fee refund)
      try {
        if (resolution?.flowResolutionId) {
          toast.info('Cancelling on Flow blockchain (50% fee refund)...');
          const txId = await cancelOnChain(Number(resolution.flowResolutionId));
          await waitForSealed(txId);
          toast.success('Resolution cancelled on-chain! Fee partially refunded.');
        } else {
          toast.success('Resolution cancelled successfully!');
        }
      } catch (chainErr: any) {
        console.warn('On-chain cancellation failed:', chainErr.message);
        toast.warning('Cancelled in database. On-chain cancellation failed.');
      }

      await fetchResolutions();
    } catch (err: any) {
      console.error('Error cancelling resolution:', err);
      toast.error(`Failed to cancel: ${err.message}`);
      throw err;
    } finally {
      setCancelling(false);
    }
  }, [fetchResolutions, getResolution]);

  // Get single resolution
  const getResolution = useCallback(async (id: string): Promise<ScheduledResolution | null> => {
    try {
      const response = await fetch(`/api/flow/scheduled-resolutions?id=${id}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch resolution');
      }

      const data = await response.json();

      if (!data.resolution) return null;

      // Parse dates and bigints
      return {
        ...data.resolution,
        flowResolutionId: data.resolution.flowResolutionId ? BigInt(data.resolution.flowResolutionId) : null,
        scheduledTime: new Date(data.resolution.scheduledTime),
        executedAt: data.resolution.executedAt ? new Date(data.resolution.executedAt) : undefined,
        createdAt: new Date(data.resolution.createdAt),
        updatedAt: new Date(data.resolution.updatedAt),
        externalMarket: {
          ...data.resolution.externalMarket,
          resolvedAt: data.resolution.externalMarket?.resolvedAt
            ? new Date(data.resolution.externalMarket.resolvedAt)
            : undefined,
        },
        mirrorMarket: data.resolution.mirrorMarket ? {
          ...data.resolution.mirrorMarket,
          endTime: new Date(data.resolution.mirrorMarket.endTime),
        } : undefined,
      };
    } catch (err: any) {
      console.error('Error fetching resolution:', err);
      toast.error(`Failed to fetch resolution: ${err.message}`);
      return null;
    }
  }, []);

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchResolutions();
  }, [fetchResolutions]);

  // Computed values
  const now = new Date();

  const pendingResolutions = resolutions.filter(r =>
    r.status === 'pending' && new Date(r.scheduledTime) > now
  );

  const readyResolutions = resolutions.filter(r =>
    r.status === 'pending' && new Date(r.scheduledTime) <= now
  );

  const executingResolutions = resolutions.filter(r =>
    r.status === 'executing'
  );

  const completedResolutions = resolutions.filter(r =>
    r.status === 'completed'
  );

  const failedResolutions = resolutions.filter(r =>
    r.status === 'failed'
  );

  const cancelledResolutions = resolutions.filter(r =>
    r.status === 'cancelled'
  );

  const stats = {
    pending: pendingResolutions.length,
    ready: readyResolutions.length,
    executing: executingResolutions.length,
    completed: completedResolutions.length,
    failed: failedResolutions.length,
    cancelled: cancelledResolutions.length,
    total: resolutions.length,
  };

  // Initial fetch
  useEffect(() => {
    fetchResolutions();
  }, [fetchResolutions]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (autoRefresh) {
      refreshInterval.current = setInterval(() => {
        fetchResolutions();
      }, 15000); // 15 seconds

      return () => {
        if (refreshInterval.current) {
          clearInterval(refreshInterval.current);
        }
      };
    }
  }, [autoRefresh, fetchResolutions]);

  // Cleanup
  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, []);

  return {
    resolutions,
    pendingResolutions,
    readyResolutions,
    executingResolutions,
    completedResolutions,
    failedResolutions,
    cancelledResolutions,
    stats,
    loading,
    scheduling,
    executing,
    cancelling,
    error,
    refresh,
    scheduleResolution,
    executeResolution,
    cancelResolution,
    getResolution,
  };
}
