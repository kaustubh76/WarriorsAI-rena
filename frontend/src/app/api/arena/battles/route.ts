import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { keccak256, toBytes } from 'viem';
import { prisma } from '@/lib/prisma';
import { handleAPIError, ErrorResponses } from '@/lib/api/errorHandler';
import { validateInteger, validateAddress, validateBigIntString, validateEnum } from '@/lib/api/validation';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';
import { marketDataCache } from '@/lib/cache/hashedCache';
import { arbitrageTradingService } from '@/services/betting/arbitrageTradingService';
import { readContract } from '@wagmi/core';
import { getConfig } from '@/rainbowKitConfig';
import { getContracts, getChainId } from '@/constants';
import { warriorsNFTAbi } from '@/constants';
import { executeDebateRound } from '@/services/arena/debateService';
import { WarriorTraits, MarketSource } from '@/types/predictionArena';

// Helper to determine round winner
function determineRoundWinner(w1Score: number, w2Score: number): 'warrior1' | 'warrior2' | 'draw' {
  if (w1Score > w2Score) return 'warrior1';
  if (w2Score > w1Score) return 'warrior2';
  return 'draw';
}

export type BattleStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface CreateBattleRequest {
  externalMarketId: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  warrior1Id: number;
  warrior1Owner: string;
  stakes: string;
  challengerSideYes: boolean;
  // Arbitrage battle fields
  isArbitrageBattle?: boolean;
  warrior2Id?: number;
  kalshiMarketId?: string;
  totalStake?: string;
}

export interface AcceptBattleRequest {
  challengeId: string;
  warrior2Id: number;
  warrior2Owner: string;
}

/**
 * GET /api/arena/battles
 * List battles with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as BattleStatus | null;
    const warriorId = searchParams.get('warriorId');
    const marketId = searchParams.get('marketId');
    const source = searchParams.get('source');
    // Parse and validate pagination with max limits to prevent DoS
    const rawLimit = parseInt(searchParams.get('limit') || '20');
    const rawOffset = parseInt(searchParams.get('offset') || '0');
    const limit = Math.min(Math.max(rawLimit, 1), 100); // Clamp between 1 and 100
    const offset = Math.max(rawOffset, 0); // Ensure non-negative

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (warriorId) {
      const id = parseInt(warriorId);
      where.OR = [{ warrior1Id: id }, { warrior2Id: id }];
    }

    if (marketId && source) {
      where.externalMarketId = marketId;
      where.source = source;
    }

    const cacheKey = `arena-battles:${status || ''}:${warriorId || ''}:${marketId || ''}:${source || ''}:${limit}:${offset}`;
    const [battles, total] = await marketDataCache.getOrSet(
      cacheKey,
      () => Promise.all([
        prisma.predictionBattle.findMany({
          where,
          include: {
            rounds: {
              orderBy: { roundNumber: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.predictionBattle.count({ where }),
      ]),
      30_000 // 30s TTL — battles update during rounds
    ) as [Awaited<ReturnType<typeof prisma.predictionBattle.findMany>>, number];

    const response = NextResponse.json({
      battles,
      total,
      limit,
      offset,
    });

    // Add cache headers for battles list (cache for 30 seconds - active battles change frequently)
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=15');
    return response;
  } catch (error) {
    return handleAPIError(error, 'API:Battles:GET');
  }
}

/**
 * POST /api/arena/battles
 * Create a new challenge (pending battle) or arbitrage battle
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'battle-create',
      ...RateLimitPresets.battleCreation,
    });

    const body: CreateBattleRequest = await request.json();

    const {
      externalMarketId,
      source,
      question,
      warrior1Id,
      warrior1Owner,
      stakes,
      challengerSideYes,
      isArbitrageBattle,
      warrior2Id,
      kalshiMarketId,
      totalStake,
    } = body;

    // Validate required fields
    if (!externalMarketId || typeof externalMarketId !== 'string') {
      throw ErrorResponses.badRequest('externalMarketId is required');
    }
    if (!question || typeof question !== 'string') {
      throw ErrorResponses.badRequest('question is required');
    }

    // Validate input types
    validateEnum(source, ['polymarket', 'kalshi'] as const, 'source');
    validateInteger(warrior1Id, 'warrior1Id', { min: 0 });
    validateAddress(warrior1Owner, 'warrior1Owner');

    // Handle arbitrage battle creation
    if (isArbitrageBattle) {
      // Validate arbitrage-specific fields
      if (!warrior2Id || warrior2Id <= 0) {
        throw ErrorResponses.badRequest('warrior2Id is required for arbitrage battles');
      }
      if (!kalshiMarketId || typeof kalshiMarketId !== 'string') {
        throw ErrorResponses.badRequest('kalshiMarketId is required for arbitrage battles');
      }
      if (!totalStake || typeof totalStake !== 'string') {
        throw ErrorResponses.badRequest('totalStake is required for arbitrage battles');
      }

      validateInteger(warrior2Id, 'warrior2Id', { min: 0 });
      validateBigIntString(totalStake, 'totalStake');

      // Verify both warriors are owned by the caller
      try {
        const config = getConfig();
        const nftAddress = getContracts().warriorsNFT as `0x${string}`;
        const chainId = getChainId();

        const [w1Owner, w2Owner] = await Promise.all([
          readContract(config, {
            address: nftAddress,
            abi: warriorsNFTAbi,
            functionName: 'ownerOf',
            args: [BigInt(warrior1Id)],
            chainId,
          }),
          readContract(config, {
            address: nftAddress,
            abi: warriorsNFTAbi,
            functionName: 'ownerOf',
            args: [BigInt(warrior2Id)],
            chainId,
          }),
        ]);

        if ((w1Owner as string).toLowerCase() !== warrior1Owner.toLowerCase()) {
          throw ErrorResponses.badRequest('You do not own warrior 1');
        }
        if ((w2Owner as string).toLowerCase() !== warrior1Owner.toLowerCase()) {
          throw ErrorResponses.badRequest('You do not own warrior 2');
        }
      } catch (err: any) {
        // Re-throw our own validation errors
        if (err?.status === 400) throw err;
        // RPC failures should not block battle creation
        console.warn('[Battles] Ownership verification skipped (RPC error):', err.message);
      }

      // Get market data from matched pairs
      const matchedPair = await prisma.matchedMarketPair.findFirst({
        where: {
          OR: [
            { polymarketId: externalMarketId, kalshiId: kalshiMarketId },
            { kalshiId: externalMarketId, polymarketId: kalshiMarketId },
          ],
          hasArbitrage: true,
          isActive: true,
        },
      });

      if (!matchedPair) {
        throw ErrorResponses.badRequest('No active arbitrage opportunity found for these markets');
      }

      // Determine which market is Polymarket and which is Kalshi
      const polymarketId = source === 'polymarket' ? externalMarketId : kalshiMarketId;
      const kalshiId = source === 'kalshi' ? externalMarketId : kalshiMarketId;

      // Create arbitrage opportunity record
      const opportunity = await prisma.arbitrageOpportunity.create({
        data: {
          market1Source: 'polymarket',
          market1Id: polymarketId,
          market1Question: matchedPair.polymarketQuestion,
          market1YesPrice: matchedPair.polymarketYesPrice,
          market1NoPrice: matchedPair.polymarketNoPrice,
          market2Source: 'kalshi',
          market2Id: kalshiId,
          market2Question: matchedPair.kalshiQuestion,
          market2YesPrice: matchedPair.kalshiYesPrice,
          market2NoPrice: matchedPair.kalshiNoPrice,
          spread: Math.floor(matchedPair.priceDifference * 100),
          potentialProfit: matchedPair.priceDifference,
          confidence: matchedPair.similarity,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      // Execute arbitrage trade
      const tradeResult = await arbitrageTradingService.executeArbitrage({
        userId: warrior1Owner,
        opportunityId: opportunity.id,
        investmentAmount: BigInt(totalStake),
      });

      if (!tradeResult.success || !tradeResult.tradeId) {
        throw ErrorResponses.internalServerError(
          `Failed to execute arbitrage trade: ${tradeResult.error}`
        );
      }

      // Create arbitrage battle (status: active, skip pending)
      const battle = await prisma.predictionBattle.create({
        data: {
          externalMarketId: polymarketId,
          source: 'polymarket',
          question: matchedPair.polymarketQuestion,
          warrior1Id,
          warrior1Owner,
          warrior2Id,
          warrior2Owner: warrior1Owner, // Same owner for both warriors
          stakes: totalStake,
          status: 'active', // Skip pending, start immediately
          currentRound: 1, // Start with round 1
          isArbitrageBattle: true,
          kalshiMarketId: kalshiId,
          arbitrageTradeId: tradeResult.tradeId,
        },
      });

      // Execute first round immediately
      let firstRound = null;
      try {
        const defaultTraits: WarriorTraits = {
          strength: 5000,
          wit: 5000,
          charisma: 5000,
          defence: 5000,
          luck: 5000,
        };

        const marketSource = source === 'kalshi' ? MarketSource.KALSHI : MarketSource.POLYMARKET;

        const roundResult = executeDebateRound(
          defaultTraits,
          defaultTraits,
          {
            marketQuestion: matchedPair.polymarketQuestion,
            marketSource,
            roundNumber: 1,
            previousRounds: [],
          }
        );

        firstRound = await prisma.predictionRound.create({
          data: {
            battleId: battle.id,
            roundNumber: 1,
            w1Argument: roundResult.warrior1.argument,
            w1Evidence: JSON.stringify(roundResult.warrior1.evidence),
            w1Move: roundResult.warrior1.move,
            w1Score: roundResult.warrior1Score,
            w2Argument: roundResult.warrior2.argument,
            w2Evidence: JSON.stringify(roundResult.warrior2.evidence),
            w2Move: roundResult.warrior2.move,
            w2Score: roundResult.warrior2Score,
            roundWinner: roundResult.roundWinner,
            judgeReasoning: roundResult.judgeReasoning,
            endedAt: new Date(),
          },
        });

        await prisma.predictionBattle.update({
          where: { id: battle.id },
          data: {
            currentRound: 2,
            warrior1Score: roundResult.warrior1Score,
            warrior2Score: roundResult.warrior2Score,
          },
        });
      } catch (roundErr: any) {
        console.error('[Battles] First round auto-execute failed:', roundErr.message);
      }

      return NextResponse.json({
        success: true,
        battle,
        firstRound,
        arbitrageTradeId: tradeResult.tradeId,
        expectedProfit: tradeResult.expectedProfit,
        message: 'Arbitrage battle created and trade executed successfully',
      });
    }

    // Standard challenge creation (non-arbitrage)
    validateBigIntString(stakes, 'stakes');

    // Generate market key (same as contract)
    const marketKey = keccak256(toBytes(`${source}:${externalMarketId}`));

    // Create pending battle (challenge)
    const battle = await prisma.predictionBattle.create({
      data: {
        externalMarketId,
        source,
        question,
        warrior1Id: challengerSideYes ? warrior1Id : 0, // 0 = placeholder until accepted
        warrior1Owner: challengerSideYes ? warrior1Owner : '',
        warrior2Id: challengerSideYes ? 0 : warrior1Id,
        warrior2Owner: challengerSideYes ? '' : warrior1Owner,
        stakes,
        status: 'pending',
        currentRound: 0,
      },
    });

    return NextResponse.json({
      battle,
      marketKey,
      message: 'Challenge created successfully',
    });
  } catch (error) {
    return handleAPIError(error, 'API:Battles:POST');
  }
}

/**
 * PATCH /api/arena/battles
 * Accept a challenge or update battle state
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'accept') {
      const { battleId, warrior2Id, warrior2Owner } = body as {
        battleId: string;
        warrior2Id: number;
        warrior2Owner: string;
        action: string;
      };

      // Validate inputs
      if (!battleId || typeof battleId !== 'string') {
        throw ErrorResponses.badRequest('battleId is required');
      }
      validateInteger(warrior2Id, 'warrior2Id', { min: 0 });
      validateAddress(warrior2Owner, 'warrior2Owner');

      // Get existing battle
      const existing = await prisma.predictionBattle.findUnique({
        where: { id: battleId },
      });

      if (!existing) {
        throw ErrorResponses.notFound('Battle');
      }

      if (existing.status !== 'pending') {
        throw ErrorResponses.badRequest('Battle is not in pending state');
      }

      // Determine which side needs to be filled
      const updateData: Record<string, unknown> = {
        status: 'active',
        currentRound: 1,
      };

      if (existing.warrior1Id === 0) {
        // Challenger was NO side, acceptor is YES
        updateData.warrior1Id = warrior2Id;
        updateData.warrior1Owner = warrior2Owner;
      } else {
        // Challenger was YES side, acceptor is NO
        updateData.warrior2Id = warrior2Id;
        updateData.warrior2Owner = warrior2Owner;
      }

      const battle = await prisma.predictionBattle.update({
        where: { id: battleId },
        data: updateData,
        include: { rounds: true },
      });

      return NextResponse.json({
        battle,
        message: 'Challenge accepted, battle started!',
      });
    }

    if (action === 'cancel') {
      const { battleId } = body as { battleId: string; action: string };

      if (!battleId || typeof battleId !== 'string') {
        throw ErrorResponses.badRequest('battleId is required');
      }

      const battle = await prisma.predictionBattle.update({
        where: { id: battleId },
        data: { status: 'cancelled' },
      });

      return NextResponse.json({
        battle,
        message: 'Battle cancelled',
      });
    }

    if (action === 'submitRound') {
      const {
        battleId,
        roundNumber,
        w1Argument,
        w1Evidence,
        w1Move,
        w1Score,
        w2Argument,
        w2Evidence,
        w2Move,
        w2Score,
        judgeReasoning,
      } = body;

      // Validate inputs
      if (!battleId || typeof battleId !== 'string') {
        throw ErrorResponses.badRequest('battleId is required');
      }
      validateInteger(roundNumber, 'roundNumber', { min: 1, max: 5 });
      validateInteger(w1Score, 'w1Score', { min: 0, allowZero: true });
      validateInteger(w2Score, 'w2Score', { min: 0, allowZero: true });

      const roundWinner = determineRoundWinner(w1Score, w2Score);
      const isCompleted = roundNumber >= 5;

      // Use transaction to ensure atomic updates for round + battle + stats
      const result = await prisma.$transaction(async (tx) => {
        // Create or update round
        const round = await tx.predictionRound.upsert({
          where: {
            battleId_roundNumber: {
              battleId,
              roundNumber,
            },
          },
          update: {
            w1Argument,
            w1Evidence: JSON.stringify(w1Evidence),
            w1Move,
            w1Score,
            w2Argument,
            w2Evidence: JSON.stringify(w2Evidence),
            w2Move,
            w2Score,
            roundWinner,
            judgeReasoning,
            endedAt: new Date(),
          },
          create: {
            battleId,
            roundNumber,
            w1Argument,
            w1Evidence: JSON.stringify(w1Evidence),
            w1Move,
            w1Score,
            w2Argument,
            w2Evidence: JSON.stringify(w2Evidence),
            w2Move,
            w2Score,
            roundWinner,
            judgeReasoning,
            endedAt: new Date(),
          },
        });

        // Update battle scores and round
        const battle = await tx.predictionBattle.update({
          where: { id: battleId },
          data: {
            warrior1Score: { increment: w1Score },
            warrior2Score: { increment: w2Score },
            currentRound: roundNumber + 1,
            status: isCompleted ? 'completed' : 'active',
            completedAt: isCompleted ? new Date() : undefined,
          },
          include: { rounds: true },
        });

        // Update warrior stats if battle completed (within same transaction)
        if (isCompleted) {
          await updateWarriorStatsInTransaction(tx, battle);
        }

        return { round, battle };
      });

      return NextResponse.json({
        round: result.round,
        battle: result.battle,
        message: `Round ${roundNumber} submitted`,
      });
    }

    throw ErrorResponses.badRequest('Unknown action');
  } catch (error) {
    return handleAPIError(error, 'API:Battles:PATCH');
  }
}

// Type for transaction client
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

interface BattleStats {
  warrior1Id: number;
  warrior2Id: number;
  warrior1Score: number;
  warrior2Score: number;
  stakes: string;
}

// Helper function to update a single warrior's stats
async function upsertWarriorStats(
  tx: TransactionClient,
  warriorId: number,
  isWinner: boolean,
  isLoser: boolean,
  isDraw: boolean
) {
  await tx.warriorArenaStats.upsert({
    where: { warriorId },
    update: {
      totalBattles: { increment: 1 },
      wins: isWinner ? { increment: 1 } : undefined,
      losses: isLoser ? { increment: 1 } : undefined,
      draws: isDraw ? { increment: 1 } : undefined,
    },
    create: {
      warriorId,
      totalBattles: 1,
      wins: isWinner ? 1 : 0,
      losses: isLoser ? 1 : 0,
      draws: isDraw ? 1 : 0,
      arenaRating: 1000,
      peakRating: 1000,
    },
  });
}

// Transaction-aware version for use within $transaction
async function updateWarriorStatsInTransaction(tx: TransactionClient, battle: BattleStats) {
  const winner =
    battle.warrior1Score > battle.warrior2Score
      ? battle.warrior1Id
      : battle.warrior2Score > battle.warrior1Score
      ? battle.warrior2Id
      : null;

  const isDraw = winner === null;

  // Update both warriors' stats atomically within the transaction
  await Promise.all([
    upsertWarriorStats(
      tx,
      battle.warrior1Id,
      winner === battle.warrior1Id,
      winner === battle.warrior2Id,
      isDraw
    ),
    upsertWarriorStats(
      tx,
      battle.warrior2Id,
      winner === battle.warrior2Id,
      winner === battle.warrior1Id,
      isDraw
    ),
  ]);
}

// Standalone version for backward compatibility (wraps in its own transaction)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateWarriorStats(battle: BattleStats) {
  await prisma.$transaction(async (tx) => {
    await updateWarriorStatsInTransaction(tx, battle);
  });
}
