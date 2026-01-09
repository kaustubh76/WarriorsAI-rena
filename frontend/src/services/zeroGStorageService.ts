/**
 * 0G Storage Service
 * Handles battle data storage and RAG queries via 0G Storage Network
 */

import type {
  ZeroGConfig,
  BattleDataIndex,
  BattleQuery,
  WarriorAnalytics,
  MatchupHistory,
  StorageUploadResult,
  StorageDownloadResult,
  StorageStatus
} from '../types/zeroG';
import {
  ZERO_G_TESTNET_CONFIG,
  serializeBattleData,
  deserializeBattleData,
  calculateWinRate
} from '../types/zeroG';

// ============================================================================
// Service Class
// ============================================================================

class ZeroGStorageService {
  private config: ZeroGConfig;
  private battleIndex: Map<string, BattleDataIndex> = new Map(); // In-memory index
  private warriorBattles: Map<string, string[]> = new Map(); // warriorId -> rootHashes

  constructor(config: ZeroGConfig = ZERO_G_TESTNET_CONFIG) {
    this.config = config;
  }

  // ============================================================================
  // Storage Operations
  // ============================================================================

  /**
   * Store battle data on 0G storage
   */
  async storeBattleData(battle: BattleDataIndex): Promise<StorageUploadResult> {
    try {
      // Serialize battle data
      const jsonData = serializeBattleData(battle);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const file = new File([blob], `battle_${battle.battleId}.json`);

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload to 0G storage service
      const response = await fetch(`${this.config.storageApiUrl}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json() as StorageUploadResult;

      // Update local index
      battle.rootHash = result.rootHash;
      battle.storedAt = Date.now();
      this.battleIndex.set(result.rootHash, battle);

      // Update warrior index
      for (const warrior of battle.warriors) {
        const key = warrior.id.toString();
        const existing = this.warriorBattles.get(key) || [];
        if (!existing.includes(result.rootHash)) {
          existing.push(result.rootHash);
          this.warriorBattles.set(key, existing);
        }
      }

      return result;
    } catch (error) {
      console.error('Error storing battle data:', error);
      throw error;
    }
  }

  /**
   * Get battle data from 0G storage
   */
  async getBattleData(rootHash: string): Promise<BattleDataIndex | null> {
    // Check local cache first
    if (this.battleIndex.has(rootHash)) {
      return this.battleIndex.get(rootHash) || null;
    }

    try {
      // Download from 0G storage
      const response = await fetch(`${this.config.storageApiUrl}/download/${rootHash}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Parse the downloaded data
      const text = await response.text();
      const battle = deserializeBattleData(text);

      // Update local cache
      battle.rootHash = rootHash;
      this.battleIndex.set(rootHash, battle);

      return battle;
    } catch (error) {
      console.error('Error fetching battle data:', error);
      return null;
    }
  }

  /**
   * Check storage service status
   */
  async getStorageStatus(): Promise<StorageStatus> {
    try {
      const response = await fetch(`${this.config.storageApiUrl}/status`);

      if (!response.ok) {
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          rpc: this.config.computeRpc,
          indexer: this.config.storageIndexer,
          network: {
            healthy: false,
            connectedPeers: 0,
            error: response.statusText
          }
        };
      }

      return await response.json() as StorageStatus;
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        rpc: this.config.computeRpc,
        indexer: this.config.storageIndexer,
        network: {
          healthy: false,
          connectedPeers: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Query battles based on criteria
   */
  async queryBattles(query: BattleQuery): Promise<BattleDataIndex[]> {
    // For now, query from local index
    // In production, this would query 0G storage with indexing
    let results = Array.from(this.battleIndex.values());

    // Filter by warrior IDs
    if (query.warriorIds && query.warriorIds.length > 0) {
      results = results.filter(battle =>
        battle.warriors.some(w =>
          query.warriorIds!.some(id => id === w.id)
        )
      );
    }

    // Filter by date range
    if (query.dateRange) {
      results = results.filter(battle =>
        battle.timestamp >= query.dateRange!.start &&
        battle.timestamp <= query.dateRange!.end
      );
    }

    // Filter by outcome
    if (query.outcome) {
      results = results.filter(battle => battle.outcome === query.outcome);
    }

    // Filter by minimum volume
    if (query.minVolume && query.minVolume > BigInt(0)) {
      results = results.filter(battle =>
        battle.marketData && battle.marketData.totalVolume >= query.minVolume!
      );
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Get warrior matchup history
   */
  async getWarriorMatchupHistory(
    warrior1Id: bigint,
    warrior2Id: bigint
  ): Promise<MatchupHistory> {
    // Query all battles involving both warriors
    const battles = await this.queryBattles({
      warriorIds: [warrior1Id, warrior2Id]
    });

    // Filter to only battles with both warriors
    const matchups = battles.filter(battle =>
      battle.warriors.some(w => w.id === warrior1Id) &&
      battle.warriors.some(w => w.id === warrior2Id)
    );

    // Calculate statistics
    let warrior1Wins = 0;
    let warrior2Wins = 0;
    let draws = 0;

    for (const battle of matchups) {
      const w1Index = battle.warriors.findIndex(w => w.id === warrior1Id);
      const w2Index = battle.warriors.findIndex(w => w.id === warrior2Id);

      if (battle.outcome === 'draw') {
        draws++;
      } else if (
        (battle.outcome === 'warrior1' && w1Index === 0) ||
        (battle.outcome === 'warrior2' && w1Index === 1)
      ) {
        warrior1Wins++;
      } else {
        warrior2Wins++;
      }
    }

    return {
      warrior1Id,
      warrior2Id,
      totalMatches: matchups.length,
      warrior1Wins,
      warrior2Wins,
      draws,
      battles: matchups
    };
  }

  /**
   * Get comprehensive warrior statistics
   */
  async getWarriorStats(warriorId: bigint): Promise<WarriorAnalytics> {
    // Query all battles for this warrior
    const battles = await this.queryBattles({
      warriorIds: [warriorId]
    });

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalDamageDealt = 0;
    let totalDamageTaken = 0;
    const moveCounts: Record<string, number> = {
      strike: 0,
      taunt: 0,
      dodge: 0,
      recover: 0,
      special_move: 0
    };
    const opponentStats: Map<string, { wins: number; losses: number }> = new Map();

    for (const battle of battles) {
      const warriorIndex = battle.warriors.findIndex(w => w.id === warriorId);
      if (warriorIndex === -1) continue;

      const opponentIndex = warriorIndex === 0 ? 1 : 0;
      const opponentId = battle.warriors[opponentIndex]?.id.toString() || 'unknown';

      // Calculate outcome
      if (battle.outcome === 'draw') {
        draws++;
      } else if (
        (battle.outcome === 'warrior1' && warriorIndex === 0) ||
        (battle.outcome === 'warrior2' && warriorIndex === 1)
      ) {
        wins++;
        const opp = opponentStats.get(opponentId) || { wins: 0, losses: 0 };
        opp.losses++;
        opponentStats.set(opponentId, opp);
      } else {
        losses++;
        const opp = opponentStats.get(opponentId) || { wins: 0, losses: 0 };
        opp.wins++;
        opponentStats.set(opponentId, opp);
      }

      // Calculate damage
      totalDamageDealt += warriorIndex === 0
        ? battle.totalDamage.warrior2 // Damage dealt to opponent
        : battle.totalDamage.warrior1;
      totalDamageTaken += warriorIndex === 0
        ? battle.totalDamage.warrior1
        : battle.totalDamage.warrior2;

      // Count moves
      for (const round of battle.rounds) {
        for (const move of round.moves) {
          if (move.warriorId === warriorId && moveCounts[move.move] !== undefined) {
            moveCounts[move.move]++;
          }
        }
      }
    }

    // Calculate preferred moves
    const totalMoves = Object.values(moveCounts).reduce((a, b) => a + b, 0);
    const preferredMoves = Object.entries(moveCounts)
      .map(([move, count]) => ({
        move: move as any,
        percentage: totalMoves > 0 ? Math.round((count / totalMoves) * 100) : 0
      }))
      .sort((a, b) => b.percentage - a.percentage);

    // Find strong/weak against
    const strongAgainst: bigint[] = [];
    const weakAgainst: bigint[] = [];

    for (const [oppId, stats] of opponentStats) {
      const totalMatches = stats.wins + stats.losses;
      if (totalMatches >= 2) {
        if (stats.losses > stats.wins) {
          strongAgainst.push(BigInt(oppId));
        } else if (stats.wins > stats.losses) {
          weakAgainst.push(BigInt(oppId));
        }
      }
    }

    const totalBattles = wins + losses + draws;

    return {
      warriorId,
      totalBattles,
      wins,
      losses,
      draws,
      winRate: calculateWinRate(wins, totalBattles),
      avgDamageDealt: totalBattles > 0 ? Math.round(totalDamageDealt / totalBattles) : 0,
      avgDamageTaken: totalBattles > 0 ? Math.round(totalDamageTaken / totalBattles) : 0,
      preferredMoves,
      strongAgainst,
      weakAgainst
    };
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  /**
   * Load battle index from storage
   * Called on service initialization to populate local cache
   */
  async loadBattleIndex(rootHashes: string[]): Promise<void> {
    for (const rootHash of rootHashes) {
      try {
        await this.getBattleData(rootHash);
      } catch (error) {
        console.error(`Failed to load battle ${rootHash}:`, error);
      }
    }
  }

  /**
   * Get all stored battle root hashes
   */
  getBattleRootHashes(): string[] {
    return Array.from(this.battleIndex.keys());
  }

  /**
   * Get battles for a specific warrior
   */
  async getWarriorBattles(warriorId: bigint): Promise<BattleDataIndex[]> {
    const key = warriorId.toString();
    const rootHashes = this.warriorBattles.get(key) || [];

    const battles: BattleDataIndex[] = [];
    for (const hash of rootHashes) {
      const battle = await this.getBattleData(hash);
      if (battle) {
        battles.push(battle);
      }
    }

    return battles;
  }

  /**
   * Clear local cache
   */
  clearCache(): void {
    this.battleIndex.clear();
    this.warriorBattles.clear();
  }

  // ============================================================================
  // RAG Context Methods
  // ============================================================================

  /**
   * Get battle context for AI predictions
   * Returns relevant historical battles for RAG-enhanced predictions
   */
  async getBattleContext(
    warrior1Id: bigint,
    warrior2Id: bigint,
    maxBattles: number = 10
  ): Promise<BattleDataIndex[]> {
    const context: BattleDataIndex[] = [];

    // Get direct matchup history
    const matchup = await this.getWarriorMatchupHistory(warrior1Id, warrior2Id);
    context.push(...matchup.battles.slice(0, Math.floor(maxBattles / 2)));

    // Get recent battles for each warrior
    const warrior1Battles = await this.queryBattles({
      warriorIds: [warrior1Id],
      limit: Math.floor(maxBattles / 4)
    });
    const warrior2Battles = await this.queryBattles({
      warriorIds: [warrior2Id],
      limit: Math.floor(maxBattles / 4)
    });

    // Add non-duplicate battles
    for (const battle of [...warrior1Battles, ...warrior2Battles]) {
      if (!context.some(b => b.battleId === battle.battleId)) {
        context.push(battle);
      }
      if (context.length >= maxBattles) break;
    }

    return context.slice(0, maxBattles);
  }

  /**
   * Get summary statistics for prediction context
   */
  async getContextSummary(
    warrior1Id: bigint,
    warrior2Id: bigint
  ): Promise<{
    warrior1Stats: WarriorAnalytics;
    warrior2Stats: WarriorAnalytics;
    matchupHistory: MatchupHistory;
    totalBattlesIndexed: number;
  }> {
    const [warrior1Stats, warrior2Stats, matchupHistory] = await Promise.all([
      this.getWarriorStats(warrior1Id),
      this.getWarriorStats(warrior2Id),
      this.getWarriorMatchupHistory(warrior1Id, warrior2Id)
    ]);

    return {
      warrior1Stats,
      warrior2Stats,
      matchupHistory,
      totalBattlesIndexed: this.battleIndex.size
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get configuration
   */
  getConfig(): ZeroGConfig {
    return this.config;
  }

  /**
   * Get indexed battle count
   */
  getIndexedBattleCount(): number {
    return this.battleIndex.size;
  }
}

// Export singleton instance
export const zeroGStorageService = new ZeroGStorageService();
export default zeroGStorageService;
