'use client';

import { useEffect, useCallback, useState } from 'react';
import { useWatchContractEvent, usePublicClient } from 'wagmi';
import { type Address, decodeEventLog } from 'viem';
import { ArenaAbi, chainsToContracts, getChainId } from '@/constants';
import type { BattleDataIndex, WarriorData } from '@/types/zeroG';

interface BattleFinishedEvent {
  warriorOneId: bigint;
  warriorTwoId: bigint;
  damageOnWarriorOne: bigint;
  damageOnWarriorTwo: bigint;
}

interface UseBattleDataSyncOptions {
  arenaAddress?: Address;
  chainId?: number;
  autoSync?: boolean;
  onBattleStored?: (battleId: string, rootHash: string | null) => void;
  onError?: (error: Error) => void;
}

interface BattleDataSyncState {
  isSyncing: boolean;
  lastSyncedBattleId: string | null;
  lastSyncTime: number | null;
  pendingBattles: string[];
  errors: string[];
}

/**
 * Hook to automatically sync battle data to 0G Storage when battles finish
 */
export function useBattleDataSync({
  arenaAddress,
  chainId = getChainId(),
  autoSync = true,
  onBattleStored,
  onError
}: UseBattleDataSyncOptions = {}) {
  const publicClient = usePublicClient({ chainId });
  const [state, setState] = useState<BattleDataSyncState>({
    isSyncing: false,
    lastSyncedBattleId: null,
    lastSyncTime: null,
    pendingBattles: [],
    errors: []
  });

  /**
   * Store battle data to 0G Storage
   */
  const storeBattleData = useCallback(async (
    battleId: string,
    warrior1Id: bigint,
    warrior2Id: bigint,
    damage1: bigint,
    damage2: bigint
  ): Promise<string | null> => {
    setState(prev => ({
      ...prev,
      isSyncing: true,
      pendingBattles: [...prev.pendingBattles, battleId]
    }));

    try {
      // Determine winner based on damage (lower damage = winner)
      const outcome = damage1 < damage2 ? 'warrior1' : damage1 > damage2 ? 'warrior2' : 'draw';

      // Build battle data index
      const battleData: BattleDataIndex = {
        battleId: BigInt(battleId.replace('battle_', '')),
        timestamp: Date.now(),
        warriors: [
          {
            id: warrior1Id,
            name: `Warrior #${warrior1Id}`,
            traits: { strength: 50, wit: 50, charisma: 50, defence: 50, luck: 50 },
            totalBattles: 0,
            wins: outcome === 'warrior1' ? 1 : 0,
            losses: outcome === 'warrior2' ? 1 : 0
          },
          {
            id: warrior2Id,
            name: `Warrior #${warrior2Id}`,
            traits: { strength: 50, wit: 50, charisma: 50, defence: 50, luck: 50 },
            totalBattles: 0,
            wins: outcome === 'warrior2' ? 1 : 0,
            losses: outcome === 'warrior1' ? 1 : 0
          }
        ],
        rounds: [],
        outcome,
        totalDamage: {
          warrior1: Number(damage1),
          warrior2: Number(damage2)
        },
        totalRounds: 5
      };

      // Store to 0G via API
      const response = await fetch('/api/0g/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle: battleData })
      });

      if (!response.ok) {
        throw new Error(`Failed to store battle: ${response.statusText}`);
      }

      const result = await response.json();
      const rootHash = result.rootHash || null;

      setState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncedBattleId: battleId,
        lastSyncTime: Date.now(),
        pendingBattles: prev.pendingBattles.filter(id => id !== battleId)
      }));

      onBattleStored?.(battleId, rootHash);
      return rootHash;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      setState(prev => ({
        ...prev,
        isSyncing: false,
        pendingBattles: prev.pendingBattles.filter(id => id !== battleId),
        errors: [...prev.errors.slice(-4), errorMessage] // Keep last 5 errors
      }));

      onError?.(error instanceof Error ? error : new Error(errorMessage));
      return null;
    }
  }, [onBattleStored, onError]);

  /**
   * Handle GameFinished event
   */
  const handleGameFinished = useCallback(async (logs: any[]) => {
    if (!autoSync) return;

    for (const log of logs) {
      try {
        // Extract event data
        const warrior1Id = log.args?.warriorOneId || log.args?.[0];
        const warrior2Id = log.args?.warriorTwoId || log.args?.[1];
        const damage1 = log.args?.damageOnWarriorOne || log.args?.[2];
        const damage2 = log.args?.damageOnWarriorTwo || log.args?.[3];

        if (warrior1Id && warrior2Id) {
          const battleId = `battle_${warrior1Id}_${warrior2Id}_${Date.now()}`;
          await storeBattleData(battleId, warrior1Id, warrior2Id, damage1 || BigInt(0), damage2 || BigInt(0));
        }
      } catch (error) {
        console.error('Error processing GameFinished event:', error);
      }
    }
  }, [autoSync, storeBattleData]);

  // Watch for GameFinished events
  useWatchContractEvent({
    address: arenaAddress,
    abi: ArenaAbi,
    eventName: 'GameFinished',
    onLogs: handleGameFinished,
    enabled: !!arenaAddress && autoSync
  });

  /**
   * Manually sync a specific battle
   */
  const syncBattle = useCallback(async (
    battleId: string,
    warrior1Id: bigint,
    warrior2Id: bigint,
    damage1: bigint,
    damage2: bigint
  ) => {
    return storeBattleData(battleId, warrior1Id, warrior2Id, damage1, damage2);
  }, [storeBattleData]);

  /**
   * Clear errors
   */
  const clearErrors = useCallback(() => {
    setState(prev => ({ ...prev, errors: [] }));
  }, []);

  return {
    // State
    isSyncing: state.isSyncing,
    lastSyncedBattleId: state.lastSyncedBattleId,
    lastSyncTime: state.lastSyncTime,
    pendingBattles: state.pendingBattles,
    errors: state.errors,

    // Actions
    syncBattle,
    clearErrors,

    // Helpers
    hasPendingBattles: state.pendingBattles.length > 0,
    hasErrors: state.errors.length > 0
  };
}

/**
 * Hook to sync all battles from an arena's history
 */
export function useBattleHistorySync(arenaAddress?: Address, chainId: number = getChainId()) {
  const publicClient = usePublicClient({ chainId });
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState({ synced: 0, total: 0 });

  const syncAllBattles = useCallback(async () => {
    if (!arenaAddress || !publicClient) return;

    setIsSyncing(true);
    setProgress({ synced: 0, total: 0 });

    try {
      // Get current block and calculate safe range (Flow limits to 10,000 blocks)
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock > BigInt(5000) ? currentBlock - BigInt(5000) : BigInt(0);

      // Get GameFinished events from the arena (limited range to avoid RPC errors)
      const logs = await publicClient.getLogs({
        address: arenaAddress,
        event: {
          type: 'event',
          name: 'GameFinished',
          inputs: [
            { type: 'uint256', name: 'warriorOneId', indexed: true },
            { type: 'uint256', name: 'warriorTwoId', indexed: true },
            { type: 'uint256', name: 'damageOnWarriorOne', indexed: false },
            { type: 'uint256', name: 'damageOnWarriorTwo', indexed: false }
          ]
        },
        fromBlock,
        toBlock: 'latest'
      });

      setProgress({ synced: 0, total: logs.length });

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const warrior1Id = log.args?.warriorOneId;
        const warrior2Id = log.args?.warriorTwoId;
        const damage1 = log.args?.damageOnWarriorOne || BigInt(0);
        const damage2 = log.args?.damageOnWarriorTwo || BigInt(0);

        if (warrior1Id && warrior2Id) {
          const battleId = `battle_${warrior1Id}_${warrior2Id}_${log.blockNumber}`;

          // Store to 0G
          await fetch('/api/0g/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              battle: {
                battleId: BigInt(i),
                timestamp: Date.now(),
                warriors: [
                  { id: warrior1Id, name: `Warrior #${warrior1Id}`, traits: { strength: 50, wit: 50, charisma: 50, defence: 50, luck: 50 }, totalBattles: 0, wins: 0, losses: 0 },
                  { id: warrior2Id, name: `Warrior #${warrior2Id}`, traits: { strength: 50, wit: 50, charisma: 50, defence: 50, luck: 50 }, totalBattles: 0, wins: 0, losses: 0 }
                ],
                rounds: [],
                outcome: damage1 < damage2 ? 'warrior1' : damage1 > damage2 ? 'warrior2' : 'draw',
                totalDamage: { warrior1: Number(damage1), warrior2: Number(damage2) },
                totalRounds: 5
              }
            })
          });
        }

        setProgress({ synced: i + 1, total: logs.length });
      }
    } catch (error) {
      console.error('Error syncing battle history:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [arenaAddress, publicClient]);

  return {
    syncAllBattles,
    isSyncing,
    progress
  };
}

export default useBattleDataSync;
