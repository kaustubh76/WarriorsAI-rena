/**
 * React hooks for 0G Storage integration
 * Provides battle data storage and RAG query capabilities
 */

import { useState, useCallback, useEffect } from 'react';
import type {
  BattleDataIndex,
  WarriorAnalytics,
  MatchupHistory,
  BattleQuery,
  StorageStatus
} from '../types/zeroG';

// Types for hook returns
interface UseStoreBattleReturn {
  storeBattle: (battle: BattleDataIndex) => Promise<string | null>;
  rootHash: string | null;
  isStoring: boolean;
  error: string | null;
}

interface UseGetBattleReturn {
  getBattle: (rootHash: string) => Promise<BattleDataIndex | null>;
  battle: BattleDataIndex | null;
  isLoading: boolean;
  error: string | null;
}

interface UseQueryBattlesReturn {
  queryBattles: (query: BattleQuery) => Promise<BattleDataIndex[]>;
  battles: BattleDataIndex[];
  total: number;
  isLoading: boolean;
  error: string | null;
}

interface UseWarriorAnalyticsReturn {
  analytics: WarriorAnalytics | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseMatchupHistoryReturn {
  matchup: MatchupHistory | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseBattleContextReturn {
  context: BattleDataIndex[];
  isLoading: boolean;
  error: string | null;
  fetchContext: (warrior1Id: bigint, warrior2Id: bigint, maxBattles?: number) => Promise<void>;
}

interface UseStorageStatusReturn {
  status: StorageStatus | null;
  isHealthy: boolean;
  isLoading: boolean;
  error: string | null;
  checkStatus: () => Promise<void>;
}

/**
 * Hook for storing battle data on 0G
 */
export function useStoreBattle(): UseStoreBattleReturn {
  const [rootHash, setRootHash] = useState<string | null>(null);
  const [isStoring, setIsStoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeBattle = useCallback(async (
    battle: BattleDataIndex
  ): Promise<string | null> => {
    setIsStoring(true);
    setError(null);

    try {
      // Convert bigint values to strings for JSON
      const serializedBattle = {
        ...battle,
        battleId: battle.battleId.toString(),
        warriors: battle.warriors.map(w => ({
          ...w,
          id: w.id.toString()
        })),
        rounds: battle.rounds.map(r => ({
          ...r,
          moves: r.moves.map(m => ({
            ...m,
            warriorId: m.warriorId.toString()
          })),
          damage: r.damage.map(d => ({
            ...d,
            warriorId: d.warriorId.toString()
          })),
          roundWinner: r.roundWinner?.toString()
        })),
        marketData: battle.marketData ? {
          ...battle.marketData,
          marketId: battle.marketData.marketId?.toString(),
          totalVolume: battle.marketData.totalVolume.toString()
        } : undefined
      };

      const response = await fetch('/api/0g/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle: serializedBattle })
      });

      if (!response.ok) {
        throw new Error(`Storage failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Storage failed');
      }

      setRootHash(data.rootHash);

      // Index the battle
      await fetch('/api/0g/query', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootHash: data.rootHash,
          battle: serializedBattle
        })
      });

      return data.rootHash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setIsStoring(false);
    }
  }, []);

  return {
    storeBattle,
    rootHash,
    isStoring,
    error
  };
}

/**
 * Hook for retrieving battle data from 0G
 */
export function useGetBattle(): UseGetBattleReturn {
  const [battle, setBattle] = useState<BattleDataIndex | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getBattle = useCallback(async (
    rootHash: string
  ): Promise<BattleDataIndex | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/0g/store?rootHash=${encodeURIComponent(rootHash)}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Battle not found');
          return null;
        }
        throw new Error(`Fetch failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Fetch failed');
      }

      // Convert string values back to bigint
      const battleData = deserializeBattle(data.data);
      setBattle(battleData);
      return battleData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    getBattle,
    battle,
    isLoading,
    error
  };
}

/**
 * Hook for querying battles
 */
export function useQueryBattles(): UseQueryBattlesReturn {
  const [battles, setBattles] = useState<BattleDataIndex[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryBattles = useCallback(async (
    query: BattleQuery
  ): Promise<BattleDataIndex[]> => {
    setIsLoading(true);
    setError(null);

    try {
      // Serialize bigint values
      const serializedQuery = {
        ...query,
        warriorIds: query.warriorIds?.map(id => id.toString()),
        minVolume: query.minVolume?.toString()
      };

      const response = await fetch('/api/0g/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializedQuery)
      });

      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Query failed');
      }

      const deserializedBattles = (data.battles || []).map(deserializeBattle);
      setBattles(deserializedBattles);
      setTotal(data.total || 0);
      return deserializedBattles;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    queryBattles,
    battles,
    total,
    isLoading,
    error
  };
}

/**
 * Hook for warrior analytics
 */
export function useWarriorAnalytics(warriorId: bigint | null): UseWarriorAnalyticsReturn {
  const [analytics, setAnalytics] = useState<WarriorAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (warriorId === null) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/0g/query?type=analytics&warrior1Id=${warriorId.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Analytics fetch failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Analytics fetch failed');
      }

      // Convert string values back
      const analyticsData: WarriorAnalytics = {
        ...data.analytics,
        warriorId: BigInt(data.analytics.warriorId),
        strongAgainst: (data.analytics.strongAgainst || []).map((id: string) => BigInt(id)),
        weakAgainst: (data.analytics.weakAgainst || []).map((id: string) => BigInt(id))
      };

      setAnalytics(analyticsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [warriorId]);

  useEffect(() => {
    if (warriorId !== null) {
      refetch();
    }
  }, [warriorId, refetch]);

  return {
    analytics,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for matchup history between two warriors
 */
export function useMatchupHistory(
  warrior1Id: bigint | null,
  warrior2Id: bigint | null
): UseMatchupHistoryReturn {
  const [matchup, setMatchup] = useState<MatchupHistory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (warrior1Id === null || warrior2Id === null) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/0g/query?type=matchup&warrior1Id=${warrior1Id.toString()}&warrior2Id=${warrior2Id.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Matchup fetch failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Matchup fetch failed');
      }

      const matchupData: MatchupHistory = {
        ...data.matchup,
        warrior1Id: BigInt(data.matchup.warrior1Id),
        warrior2Id: BigInt(data.matchup.warrior2Id),
        battles: (data.matchup.battles || []).map(deserializeBattle)
      };

      setMatchup(matchupData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [warrior1Id, warrior2Id]);

  useEffect(() => {
    if (warrior1Id !== null && warrior2Id !== null) {
      refetch();
    }
  }, [warrior1Id, warrior2Id, refetch]);

  return {
    matchup,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for getting battle context for RAG
 */
export function useBattleContext(): UseBattleContextReturn {
  const [context, setContext] = useState<BattleDataIndex[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async (
    warrior1Id: bigint,
    warrior2Id: bigint,
    maxBattles: number = 10
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/0g/query?type=context&warrior1Id=${warrior1Id.toString()}&warrior2Id=${warrior2Id.toString()}&maxBattles=${maxBattles}`
      );

      if (!response.ok) {
        throw new Error(`Context fetch failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Context fetch failed');
      }

      const contextBattles = (data.context || []).map(deserializeBattle);
      setContext(contextBattles);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    context,
    isLoading,
    error,
    fetchContext
  };
}

/**
 * Hook for checking 0G storage status
 */
export function useStorageStatus(): UseStorageStatusReturn {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/0g/store', {
        method: 'PUT'
      });

      const data = await response.json();

      setStatus({
        status: data.status || 'unknown',
        timestamp: data.timestamp || new Date().toISOString(),
        rpc: data.rpc || '',
        indexer: data.indexer || '',
        network: {
          healthy: data.status === 'healthy',
          connectedPeers: data.connectedPeers || 0,
          error: data.error
        }
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStatus({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        rpc: '',
        indexer: '',
        network: {
          healthy: false,
          connectedPeers: 0,
          error: errorMessage
        }
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isHealthy = status?.status === 'healthy';

  return {
    status,
    isHealthy,
    isLoading,
    error,
    checkStatus
  };
}

// Helper function to deserialize battle data
function deserializeBattle(data: any): BattleDataIndex {
  return {
    battleId: BigInt(data.battleId || 0),
    timestamp: data.timestamp || 0,
    warriors: (data.warriors || []).map((w: any) => ({
      ...w,
      id: BigInt(w.id || 0)
    })),
    rounds: (data.rounds || []).map((r: any) => ({
      ...r,
      moves: (r.moves || []).map((m: any) => ({
        ...m,
        warriorId: BigInt(m.warriorId || 0)
      })),
      damage: (r.damage || []).map((d: any) => ({
        ...d,
        warriorId: BigInt(d.warriorId || 0)
      })),
      roundWinner: r.roundWinner ? BigInt(r.roundWinner) : undefined
    })),
    outcome: data.outcome || 'draw',
    totalDamage: data.totalDamage || { warrior1: 0, warrior2: 0 },
    totalRounds: data.totalRounds || 0,
    marketData: data.marketData ? {
      ...data.marketData,
      marketId: data.marketData.marketId ? BigInt(data.marketData.marketId) : undefined,
      totalVolume: BigInt(data.marketData.totalVolume || 0)
    } : undefined,
    rootHash: data.rootHash,
    storedAt: data.storedAt
  };
}

export default {
  useStoreBattle,
  useGetBattle,
  useQueryBattles,
  useWarriorAnalytics,
  useMatchupHistory,
  useBattleContext,
  useStorageStatus
};
