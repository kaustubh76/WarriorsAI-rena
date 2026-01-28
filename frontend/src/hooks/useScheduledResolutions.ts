import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface ScheduledResolution {
  id: string;
  flowResolutionId: bigint;
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
        flowResolutionId: BigInt(r.flowResolutionId || 0),
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

  // Schedule new resolution
  const scheduleResolution = useCallback(async (params: ScheduleParams): Promise<string> => {
    try {
      setScheduling(true);
      setError(null);

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

      toast.success('Resolution scheduled successfully!');

      // Refresh data
      await fetchResolutions();

      return data.transactionId || data.resolution?.scheduleTransactionHash || '';
    } catch (err: any) {
      console.error('Error scheduling resolution:', err);
      toast.error(`Failed to schedule: ${err.message}`);
      throw err;
    } finally {
      setScheduling(false);
    }
  }, [fetchResolutions]);

  // Execute resolution
  const executeResolution = useCallback(async (id: string): Promise<void> => {
    try {
      setExecuting(true);
      setError(null);

      const response = await fetch('/api/flow/scheduled-resolutions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionId: id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to execute resolution');
      }

      toast.success('Resolution executed successfully!');

      // Refresh data
      await fetchResolutions();
    } catch (err: any) {
      console.error('Error executing resolution:', err);
      toast.error(`Failed to execute: ${err.message}`);
      throw err;
    } finally {
      setExecuting(false);
    }
  }, [fetchResolutions]);

  // Cancel resolution
  const cancelResolution = useCallback(async (id: string): Promise<void> => {
    try {
      setCancelling(true);
      setError(null);

      const response = await fetch('/api/flow/scheduled-resolutions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionId: id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel resolution');
      }

      toast.success('Resolution cancelled successfully!');

      // Refresh data
      await fetchResolutions();
    } catch (err: any) {
      console.error('Error cancelling resolution:', err);
      toast.error(`Failed to cancel: ${err.message}`);
      throw err;
    } finally {
      setCancelling(false);
    }
  }, [fetchResolutions]);

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
        flowResolutionId: BigInt(data.resolution.flowResolutionId || 0),
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
