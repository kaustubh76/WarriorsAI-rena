/**
 * Hook for 0G Network Services
 * Provides easy access to 0G Compute and Storage functionality
 */

import { useState, useCallback, useEffect } from 'react';
import type { Address } from 'viem';

// ============================================================================
// Types
// ============================================================================

export interface InferenceRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  battleData?: {
    battleId: string;
    warriors: {
      id: string;
      traits: {
        strength: number;
        wit: number;
        charisma: number;
        defence: number;
        luck: number;
      };
    }[];
  };
}

export interface InferenceResult {
  success: boolean;
  chatId?: string;
  response?: string;
  provider?: Address;
  timestamp?: number;
  proof?: {
    signature: string;
    modelHash: string;
    inputHash: string;
    outputHash: string;
    providerAddress: Address;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost: string;
  };
  isVerified?: boolean;
  fallbackMode?: boolean;
  error?: string;
}

export interface ZeroGProvider {
  address: string;
  model: string;
  endpoint: string;
  serviceType: string;
  inputPrice: string;
  outputPrice: string;
  verifiability: string;
}

export interface StorageResult {
  success: boolean;
  rootHash?: string;
  transactionHash?: string;
  dataHash?: string;
  error?: string;
}

export interface ZeroGStatus {
  computeAvailable: boolean;
  storageAvailable: boolean;
  providers: ZeroGProvider[];
  lastChecked: number;
}

// ============================================================================
// Hook: useZeroGInference
// ============================================================================

export function useZeroGInference() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitInference = useCallback(async (request: InferenceRequest): Promise<InferenceResult> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/0g/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
      }

      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return {
        success: false,
        error: message,
        fallbackMode: true,
        isVerified: false
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    submitInference,
    result,
    loading,
    error,
    clearResult,
    isVerified: result?.isVerified ?? false,
    isFallback: result?.fallbackMode ?? false
  };
}

// ============================================================================
// Hook: useZeroGProviders
// ============================================================================

export function useZeroGProviders() {
  const [providers, setProviders] = useState<ZeroGProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/0g/inference');
      const data = await response.json();

      if (data.success && data.providers) {
        setProviders(data.providers);
      } else {
        setProviders([]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch providers');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return {
    providers,
    loading,
    error,
    refetch: fetchProviders,
    hasProviders: providers.length > 0,
    verifiedProviders: providers.filter(p => p.verifiability !== 'none')
  };
}

// ============================================================================
// Hook: useZeroGStorage
// ============================================================================

export function useZeroGStorage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeBattle = useCallback(async (battle: any): Promise<StorageResult> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/0g/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Storage failed: ${response.status}`);
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const getBattle = useCallback(async (rootHash: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/0g/store?rootHash=${encodeURIComponent(rootHash)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Download failed: ${response.status}`);
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    storeBattle,
    getBattle,
    loading,
    error
  };
}

// ============================================================================
// Hook: useZeroGQuery
// ============================================================================

export function useZeroGQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryBattles = useCallback(async (query: {
    warriorIds?: string[];
    dateRange?: { start: number; end: number };
    outcome?: string;
    limit?: number;
    offset?: number;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/0g/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Query failed: ${response.status}`);
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false, error: message, battles: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const getWarriorAnalytics = useCallback(async (warriorId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/0g/query?type=analytics&warrior1Id=${warriorId}`);
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const getMatchupHistory = useCallback(async (warrior1Id: string, warrior2Id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/0g/query?type=matchup&warrior1Id=${warrior1Id}&warrior2Id=${warrior2Id}`);
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const getBattleContext = useCallback(async (warrior1Id: string, warrior2Id: string, maxBattles: number = 10) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/0g/query?type=context&warrior1Id=${warrior1Id}&warrior2Id=${warrior2Id}&maxBattles=${maxBattles}`
      );
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false, error: message, context: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    queryBattles,
    getWarriorAnalytics,
    getMatchupHistory,
    getBattleContext,
    loading,
    error
  };
}

// ============================================================================
// Hook: useZeroGStatus
// ============================================================================

export function useZeroGStatus() {
  const [status, setStatus] = useState<ZeroGStatus>({
    computeAvailable: false,
    storageAvailable: false,
    providers: [],
    lastChecked: 0
  });
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);

    try {
      const [computeRes, storageRes] = await Promise.all([
        fetch('/api/0g/inference').catch(() => null),
        fetch('/api/0g/store', { method: 'PUT' }).catch(() => null)
      ]);

      const computeData = computeRes?.ok ? await computeRes.json() : { success: false };
      const storageData = storageRes?.ok ? await storageRes.json() : { status: 'unhealthy' };

      setStatus({
        computeAvailable: computeData.success && computeData.providers?.length > 0,
        storageAvailable: storageData.status === 'healthy',
        providers: computeData.providers || [],
        lastChecked: Date.now()
      });
    } catch (err) {
      console.error('Status check error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkStatus]);

  return {
    ...status,
    loading,
    refetch: checkStatus,
    isHealthy: status.computeAvailable && status.storageAvailable
  };
}

// Export all hooks as default object
export default {
  useZeroGInference,
  useZeroGProviders,
  useZeroGStorage,
  useZeroGQuery,
  useZeroGStatus
};
