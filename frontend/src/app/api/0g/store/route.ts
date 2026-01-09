/**
 * API Route: 0G Storage
 * Server-side battle data storage via 0G Storage Network
 */

import { NextRequest, NextResponse } from 'next/server';

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
  message?: string;
  error?: string;
}

// 0G Storage Configuration
const STORAGE_CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001',
  indexer: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai'
};

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

    // Upload to 0G storage service
    const response = await fetch(`${STORAGE_CONFIG.apiUrl}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    const storeResponse: StoreResponse = {
      success: true,
      rootHash: result.rootHash,
      transactionHash: result.transactionHash,
      message: `Battle ${battle.battleId} stored successfully`
    };

    return NextResponse.json(storeResponse);
  } catch (error) {
    console.error('0G Storage error:', error);
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
