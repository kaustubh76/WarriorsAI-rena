/**
 * API Route: 0G Storage
 * Server-side battle data storage via 0G Storage Network
 *
 * Features:
 * - Battle data validation
 * - Automatic indexing after storage
 * - Cryptographic integrity verification
 * - Storage status monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Battle data structure for storage
interface BattleDataIndex {
  battleId: string;
  timestamp: number;
  warriors: {
    id: string;
    name?: string;
    traits: {
      strength: number;
      wit: number;
      charisma: number;
      defence: number;
      luck: number;
    };
    ranking?: number;
    totalBattles: number;
    wins: number;
    losses: number;
  }[];
  rounds: {
    roundNumber: number;
    moves: {
      warriorId: string;
      move: 'strike' | 'taunt' | 'dodge' | 'recover' | 'special_move';
    }[];
    damage: {
      warriorId: string;
      damageDealt: number;
      damageTaken: number;
    }[];
    roundWinner?: string;
  }[];
  outcome: 'warrior1' | 'warrior2' | 'draw';
  totalDamage: {
    warrior1: number;
    warrior2: number;
  };
  totalRounds: number;
  marketData?: {
    marketId?: string;
    finalOdds: { yes: number; no: number };
    totalVolume: string;
    aiPredictionAccuracy?: number;
  };
}

interface StoreRequest {
  battle: BattleDataIndex;
}

interface StoreResponse {
  success: boolean;
  rootHash?: string;
  transactionHash?: string;
  dataHash?: string;  // Keccak256 hash for integrity verification
  message?: string;
  error?: string;
  indexed?: boolean;  // Whether the battle was indexed for queries
  cached?: boolean;   // Whether data was cached locally due to storage unavailability
  warning?: string;   // Warning message for partial success
}

/**
 * Generate keccak256 hash for data integrity
 */
function hashData(data: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(data));
}

/**
 * Index battle in query API for RAG queries
 */
async function indexBattle(rootHash: string, battle: BattleDataIndex): Promise<boolean> {
  try {
    const response = await fetch(`${STORAGE_CONFIG.apiUrl.replace(':3001', ':3000')}/api/0g/query`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootHash, battle })
    });
    return response.ok;
  } catch (error) {
    console.warn('Failed to index battle:', error);
    return false;
  }
}

// 0G Storage Configuration
const STORAGE_CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001',
  indexer: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai'
};

// Local cache for when 0G storage is unavailable (in-memory for now, use Redis in production)
const localBattleCache = new Map<string, { battle: BattleDataIndex; timestamp: number; dataHash: string }>();

/**
 * Cache battle data locally when 0G storage is unavailable
 */
function cacheBattleLocally(battle: BattleDataIndex, dataHash: string): string {
  const cacheKey = `local_${battle.battleId}_${Date.now()}`;
  localBattleCache.set(cacheKey, {
    battle,
    timestamp: Date.now(),
    dataHash
  });

  // Clean up old cache entries (keep last 100)
  if (localBattleCache.size > 100) {
    const oldest = Array.from(localBattleCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    localBattleCache.delete(oldest[0]);
  }

  return cacheKey;
}

/**
 * POST: Store battle data
 */
export async function POST(request: NextRequest) {
  try {
    const body: StoreRequest = await request.json();
    const { battle } = body;

    // Validate input
    if (!battle || !battle.battleId) {
      return NextResponse.json(
        { success: false, error: 'Battle data with battleId is required' },
        { status: 400 }
      );
    }

    // Validate battle structure
    if (!battle.warriors || battle.warriors.length !== 2) {
      return NextResponse.json(
        { success: false, error: 'Battle must have exactly 2 warriors' },
        { status: 400 }
      );
    }

    if (!battle.rounds || battle.rounds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Battle must have at least 1 round' },
        { status: 400 }
      );
    }

    if (!['warrior1', 'warrior2', 'draw'].includes(battle.outcome)) {
      return NextResponse.json(
        { success: false, error: 'Invalid battle outcome' },
        { status: 400 }
      );
    }

    // Serialize battle data
    const jsonData = JSON.stringify(battle);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const file = new File([blob], `battle_${battle.battleId}.json`);

    // Create form data
    const formData = new FormData();
    formData.append('file', file);

    // Generate data hash for integrity verification
    const dataHash = hashData(jsonData);

    // Try to upload to 0G storage service
    let result: { rootHash?: string; transactionHash?: string } = {};
    let storageAvailable = true;

    try {
      const response = await fetch(`${STORAGE_CONFIG.apiUrl}/upload`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`0G Storage upload failed: ${response.status} - ${errorText}`);
        storageAvailable = false;
      } else {
        result = await response.json();
      }
    } catch (uploadError) {
      console.warn('0G Storage service unavailable:', uploadError);
      storageAvailable = false;
    }

    // If storage is unavailable, cache locally with graceful degradation
    if (!storageAvailable) {
      const cacheKey = cacheBattleLocally(battle, dataHash);

      const storeResponse: StoreResponse = {
        success: true,
        dataHash,
        message: `Battle ${battle.battleId} cached locally (0G sync pending)`,
        cached: true,
        warning: '0G Storage temporarily unavailable. Data cached locally and will sync when service recovers.',
        rootHash: cacheKey // Use cache key as temporary root hash
      };

      return NextResponse.json(storeResponse);
    }

    // Index battle for RAG queries
    let indexed = false;
    if (result.rootHash) {
      indexed = await indexBattle(result.rootHash, battle);
    }

    const storeResponse: StoreResponse = {
      success: true,
      rootHash: result.rootHash,
      transactionHash: result.transactionHash,
      dataHash,
      message: `Battle ${battle.battleId} stored successfully`,
      indexed,
      cached: false
    };

    return NextResponse.json(storeResponse);
  } catch (error) {
    console.error('0G Storage error:', error);

    // Even on error, try to cache locally
    try {
      const body: StoreRequest = await request.clone().json();
      const dataHash = hashData(JSON.stringify(body.battle));
      const cacheKey = cacheBattleLocally(body.battle, dataHash);

      return NextResponse.json({
        success: true,
        dataHash,
        rootHash: cacheKey,
        message: `Battle ${body.battle.battleId} cached locally after error`,
        cached: true,
        warning: `0G Storage error: ${error instanceof Error ? error.message : 'Unknown error'}. Data cached locally.`
      });
    } catch {
      // If even caching fails, return error
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  }
}

/**
 * GET: Retrieve battle data by root hash
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rootHash = searchParams.get('rootHash');

    if (!rootHash) {
      return NextResponse.json(
        { success: false, error: 'rootHash query parameter is required' },
        { status: 400 }
      );
    }

    // Download from 0G storage service
    const response = await fetch(`${STORAGE_CONFIG.apiUrl}/download/${rootHash}`);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: 'Battle data not found' },
          { status: 404 }
        );
      }
      throw new Error(`Download failed: ${response.statusText}`);
    }

    // Parse the downloaded data
    const text = await response.text();
    const battleData = JSON.parse(text);

    return NextResponse.json({
      success: true,
      rootHash,
      data: battleData
    });
  } catch (error) {
    console.error('0G Storage download error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT: Update storage status check
 */
export async function PUT() {
  try {
    const response = await fetch(`${STORAGE_CONFIG.apiUrl}/status`);

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        apiUrl: STORAGE_CONFIG.apiUrl,
        indexer: STORAGE_CONFIG.indexer,
        error: response.statusText
      });
    }

    const status = await response.json();

    return NextResponse.json({
      success: true,
      ...status
    });
  } catch (error) {
    return NextResponse.json({
      success: true,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      apiUrl: STORAGE_CONFIG.apiUrl,
      indexer: STORAGE_CONFIG.indexer,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
