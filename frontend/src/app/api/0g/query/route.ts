/**
 * API Route: 0G Query
 * Query historical battle data stored on 0G Storage Network
 * Supports RAG-style queries for AI agent analysis
 */

import { NextRequest, NextResponse } from 'next/server';

// Battle query parameters
interface BattleQuery {
  warriorIds?: string[];
  dateRange?: {
    start: number;
    end: number;
  };
  outcome?: 'warrior1' | 'warrior2' | 'draw';
  minVolume?: string;
  limit?: number;
  offset?: number;
}

// Warrior analytics response
interface WarriorAnalytics {
  warriorId: string;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  preferredMoves: {
    move: string;
    percentage: number;
  }[];
  strongAgainst: string[];
  weakAgainst: string[];
}

// Matchup history response
interface MatchupHistory {
  warrior1Id: string;
  warrior2Id: string;
  totalMatches: number;
  warrior1Wins: number;
  warrior2Wins: number;
  draws: number;
  recentBattles: {
    battleId: string;
    outcome: string;
    timestamp: number;
  }[];
}

// 0G Storage Configuration
const STORAGE_CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001',
  indexerUrl: process.env.NEXT_PUBLIC_0G_INDEXER_URL || '',
  indexerEnabled: process.env.NEXT_PUBLIC_0G_INDEXER_ENABLED === 'true'
};

// In-memory battle index (fallback when 0G indexer is unavailable)
// Production should use 0G's indexing capabilities via NEXT_PUBLIC_0G_INDEXER_URL
const battleIndex = new Map<string, any>();
const warriorBattles = new Map<string, string[]>();

/**
 * Query battles from 0G indexer if enabled, otherwise use local index
 */
async function queryBattlesFromSource(query: BattleQuery): Promise<{ battles: any[]; total: number; fromIndexer: boolean }> {
  // Try 0G indexer first if enabled
  if (STORAGE_CONFIG.indexerEnabled && STORAGE_CONFIG.indexerUrl) {
    try {
      const response = await fetch(`${STORAGE_CONFIG.indexerUrl}/battles/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        return {
          battles: data.battles || [],
          total: data.total || 0,
          fromIndexer: true
        };
      }
    } catch (indexerError) {
      console.warn('0G Indexer query failed, falling back to local index:', indexerError);
    }
  }

  // Fallback to local in-memory index
  return {
    battles: Array.from(battleIndex.values()),
    total: battleIndex.size,
    fromIndexer: false
  };
}

/**
 * POST: Query battles based on criteria
 */
export async function POST(request: NextRequest) {
  try {
    const body: BattleQuery = await request.json();
    const { warriorIds, dateRange, outcome, minVolume, limit = 50, offset = 0 } = body;

    // Query battles from 0G indexer or local index
    const { battles: allBattles, fromIndexer } = await queryBattlesFromSource(body);
    let results = allBattles;

    // Filter by warrior IDs
    if (warriorIds && warriorIds.length > 0) {
      results = results.filter(battle =>
        battle.warriors.some((w: any) =>
          warriorIds.includes(w.id)
        )
      );
    }

    // Filter by date range
    if (dateRange) {
      results = results.filter(battle =>
        battle.timestamp >= dateRange.start &&
        battle.timestamp <= dateRange.end
      );
    }

    // Filter by outcome
    if (outcome) {
      results = results.filter(battle => battle.outcome === outcome);
    }

    // Filter by minimum volume
    if (minVolume) {
      const minVol = BigInt(minVolume);
      results = results.filter(battle =>
        battle.marketData && BigInt(battle.marketData.totalVolume || '0') >= minVol
      );
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const total = results.length;
    results = results.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      total,
      offset,
      limit,
      battles: results
    });
  } catch (error) {
    console.error('Battle query error:', error);
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
 * GET: Get warrior analytics or matchup history
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryType = searchParams.get('type');
    const warrior1Id = searchParams.get('warrior1Id');
    const warrior2Id = searchParams.get('warrior2Id');

    if (queryType === 'analytics' && warrior1Id) {
      // Get warrior analytics
      const analytics = await calculateWarriorAnalytics(warrior1Id);
      return NextResponse.json({
        success: true,
        analytics
      });
    }

    if (queryType === 'matchup' && warrior1Id && warrior2Id) {
      // Get matchup history
      const matchup = await calculateMatchupHistory(warrior1Id, warrior2Id);
      return NextResponse.json({
        success: true,
        matchup
      });
    }

    if (queryType === 'context' && warrior1Id && warrior2Id) {
      // Get battle context for AI predictions (RAG)
      const maxBattles = parseInt(searchParams.get('maxBattles') || '10');
      const context = await getBattleContext(warrior1Id, warrior2Id, maxBattles);
      return NextResponse.json({
        success: true,
        context
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid query type or missing parameters' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Query error:', error);
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
 * PUT: Index a battle (called after battle storage)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { rootHash, battle } = body;

    if (!rootHash || !battle) {
      return NextResponse.json(
        { success: false, error: 'rootHash and battle data required' },
        { status: 400 }
      );
    }

    // Store in index
    battleIndex.set(rootHash, {
      ...battle,
      rootHash,
      indexedAt: Date.now()
    });

    // Update warrior index
    for (const warrior of battle.warriors) {
      const key = warrior.id;
      const existing = warriorBattles.get(key) || [];
      if (!existing.includes(rootHash)) {
        existing.push(rootHash);
        warriorBattles.set(key, existing);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Battle ${battle.battleId} indexed successfully`,
      rootHash,
      totalIndexed: battleIndex.size
    });
  } catch (error) {
    console.error('Index error:', error);
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
 * Calculate comprehensive warrior statistics
 */
async function calculateWarriorAnalytics(warriorId: string): Promise<WarriorAnalytics> {
  // Get all battles for this warrior
  const rootHashes = warriorBattles.get(warriorId) || [];
  const battles = rootHashes.map(h => battleIndex.get(h)).filter(Boolean);

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
  const opponentStats = new Map<string, { wins: number; losses: number }>();

  for (const battle of battles) {
    const warriorIndex = battle.warriors.findIndex((w: any) => w.id === warriorId);
    if (warriorIndex === -1) continue;

    const opponentIndex = warriorIndex === 0 ? 1 : 0;
    const opponentId = battle.warriors[opponentIndex]?.id || 'unknown';

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
      ? battle.totalDamage.warrior2
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
      move,
      percentage: totalMoves > 0 ? Math.round((count / totalMoves) * 100) : 0
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // Find strong/weak against
  const strongAgainst: string[] = [];
  const weakAgainst: string[] = [];

  for (const [oppId, stats] of opponentStats) {
    const totalMatches = stats.wins + stats.losses;
    if (totalMatches >= 2) {
      if (stats.losses > stats.wins) {
        strongAgainst.push(oppId);
      } else if (stats.wins > stats.losses) {
        weakAgainst.push(oppId);
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
    winRate: totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0,
    avgDamageDealt: totalBattles > 0 ? Math.round(totalDamageDealt / totalBattles) : 0,
    avgDamageTaken: totalBattles > 0 ? Math.round(totalDamageTaken / totalBattles) : 0,
    preferredMoves,
    strongAgainst,
    weakAgainst
  };
}

/**
 * Calculate matchup history between two warriors
 */
async function calculateMatchupHistory(
  warrior1Id: string,
  warrior2Id: string
): Promise<MatchupHistory> {
  // Get battles for both warriors
  const w1Battles = new Set(warriorBattles.get(warrior1Id) || []);
  const w2Battles = new Set(warriorBattles.get(warrior2Id) || []);

  // Find common battles
  const commonHashes = [...w1Battles].filter(h => w2Battles.has(h));
  const battles = commonHashes.map(h => battleIndex.get(h)).filter(Boolean);

  let warrior1Wins = 0;
  let warrior2Wins = 0;
  let draws = 0;

  const recentBattles: { battleId: string; outcome: string; timestamp: number }[] = [];

  for (const battle of battles) {
    const w1Index = battle.warriors.findIndex((w: any) => w.id === warrior1Id);

    if (battle.outcome === 'draw') {
      draws++;
      recentBattles.push({ battleId: battle.battleId, outcome: 'draw', timestamp: battle.timestamp });
    } else if (
      (battle.outcome === 'warrior1' && w1Index === 0) ||
      (battle.outcome === 'warrior2' && w1Index === 1)
    ) {
      warrior1Wins++;
      recentBattles.push({ battleId: battle.battleId, outcome: 'warrior1', timestamp: battle.timestamp });
    } else {
      warrior2Wins++;
      recentBattles.push({ battleId: battle.battleId, outcome: 'warrior2', timestamp: battle.timestamp });
    }
  }

  // Sort recent battles by timestamp
  recentBattles.sort((a, b) => b.timestamp - a.timestamp);

  return {
    warrior1Id,
    warrior2Id,
    totalMatches: battles.length,
    warrior1Wins,
    warrior2Wins,
    draws,
    recentBattles: recentBattles.slice(0, 10)
  };
}

/**
 * Get battle context for AI predictions (RAG)
 */
async function getBattleContext(
  warrior1Id: string,
  warrior2Id: string,
  maxBattles: number
): Promise<any[]> {
  const context: any[] = [];

  // Get direct matchup history
  const matchup = await calculateMatchupHistory(warrior1Id, warrior2Id);

  // Add matchup battles first (most relevant)
  const matchupHashes = [...(warriorBattles.get(warrior1Id) || [])]
    .filter(h => (warriorBattles.get(warrior2Id) || []).includes(h));

  for (const hash of matchupHashes.slice(0, Math.floor(maxBattles / 2))) {
    const battle = battleIndex.get(hash);
    if (battle) context.push(battle);
  }

  // Add recent battles for each warrior
  const w1Hashes = (warriorBattles.get(warrior1Id) || []).slice(0, Math.floor(maxBattles / 4));
  const w2Hashes = (warriorBattles.get(warrior2Id) || []).slice(0, Math.floor(maxBattles / 4));

  for (const hash of [...w1Hashes, ...w2Hashes]) {
    if (context.length >= maxBattles) break;
    const battle = battleIndex.get(hash);
    if (battle && !context.some(b => b.battleId === battle.battleId)) {
      context.push(battle);
    }
  }

  return context.slice(0, maxBattles);
}
