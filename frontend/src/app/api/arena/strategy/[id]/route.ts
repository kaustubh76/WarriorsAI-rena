/**
 * GET /api/arena/strategy/[id]
 *
 * Get full strategy battle details including all cycle rounds,
 * vault states, yield breakdown, and pool APYs.
 */

import { NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { vaultService } from '@/services/vaultService';
import { classifyStrategyProfile } from '@/constants/defiTraitMapping';
import { formatEther } from 'viem';

function safeJsonParse(str: string | null): Record<string, unknown> | null {
  if (!str) return null;
  try { return JSON.parse(str); }
  catch { return null; }
}

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-strategy-detail', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const params = ctx?.params as { id?: string } | undefined;
    const battleId = params?.id;

    if (!battleId) {
      throw ErrorResponses.badRequest('Battle ID is required');
    }

    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    if (!battle) {
      throw ErrorResponses.notFound('Battle not found');
    }

    if (!battle.isStrategyBattle) {
      throw ErrorResponses.badRequest('Not a strategy battle');
    }

    // Fetch current vault states + traits + images for both warriors
    const [w1Traits, w2Traits, w1VaultState, w2VaultState, poolAPYs, bettingPool, w1Image, w2Image] = await Promise.all([
      vaultService.getNFTTraits(battle.warrior1Id).catch(() => null),
      vaultService.getNFTTraits(battle.warrior2Id).catch(() => null),
      vaultService.getVaultState(battle.warrior1Id).catch(() => null),
      vaultService.getVaultState(battle.warrior2Id).catch(() => null),
      vaultService.getPoolAPYs().catch(() => ({ highYield: 1800, stable: 400, lp: 1200 })),
      prisma.battleBettingPool.findUnique({ where: { battleId } }),
      vaultService.getNFTImageUrl(battle.warrior1Id).catch(() => '/lazered.png'),
      vaultService.getNFTImageUrl(battle.warrior2Id).catch(() => '/lazered.png'),
    ]);

    // Write-through cache: persist fetched image URLs if not already cached
    if (!battle.warrior1ImageUrl && w1Image !== '/lazered.png') {
      prisma.predictionBattle.update({ where: { id: battleId }, data: { warrior1ImageUrl: w1Image } })
        .catch((err) => console.warn(`[Strategy:Detail] Failed to cache w1 image for battle ${battleId}:`, err instanceof Error ? err.message : err));
    }
    if (!battle.warrior2ImageUrl && w2Image !== '/lazered.png') {
      prisma.predictionBattle.update({ where: { id: battleId }, data: { warrior2ImageUrl: w2Image } })
        .catch((err) => console.warn(`[Strategy:Detail] Failed to cache w2 image for battle ${battleId}:`, err instanceof Error ? err.message : err));
    }

    // Classify strategy profiles
    const w1Profile = w1Traits ? classifyStrategyProfile({
      strength: w1Traits.strength,
      defence: w1Traits.defence,
      wit: w1Traits.wit,
      charisma: w1Traits.charisma,
      luck: w1Traits.luck,
    }) : 'UNKNOWN';

    const w2Profile = w2Traits ? classifyStrategyProfile({
      strength: w2Traits.strength,
      defence: w2Traits.defence,
      wit: w2Traits.wit,
      charisma: w2Traits.charisma,
      luck: w2Traits.luck,
    }) : 'UNKNOWN';

    // Format rounds with DeFi cycle data
    const cycles = battle.rounds.map((round) => ({
      roundNumber: round.roundNumber,
      warrior1: {
        move: round.w1Move,
        defiMove: round.w1DeFiMove,
        score: round.w1Score,
        yieldEarned: round.w1YieldEarned,
        yieldFormatted: round.w1YieldEarned ? formatEther(BigInt(round.w1YieldEarned)) : '0',
        allocationBefore: safeJsonParse(round.w1AllocationBefore),
        allocationAfter: safeJsonParse(round.w1AllocationAfter),
        balanceBefore: round.w1BalanceBefore,
        balanceAfter: round.w1BalanceAfter,
        txHash: round.w1TxHash,
      },
      warrior2: {
        move: round.w2Move,
        defiMove: round.w2DeFiMove,
        score: round.w2Score,
        yieldEarned: round.w2YieldEarned,
        yieldFormatted: round.w2YieldEarned ? formatEther(BigInt(round.w2YieldEarned)) : '0',
        allocationBefore: safeJsonParse(round.w2AllocationBefore),
        allocationAfter: safeJsonParse(round.w2AllocationAfter),
        balanceBefore: round.w2BalanceBefore,
        balanceAfter: round.w2BalanceAfter,
        txHash: round.w2TxHash,
      },
      roundWinner: round.roundWinner,
      judgeReasoning: round.judgeReasoning,
      poolAPYs: safeJsonParse(round.poolAPYsSnapshot),
      // VRF hit/miss data
      w1VrfSeed: round.w1VrfSeed,
      w2VrfSeed: round.w2VrfSeed,
      w1IsHit: round.w1IsHit,
      w2IsHit: round.w2IsHit,
      startedAt: round.startedAt,
      endedAt: round.endedAt,
      // Score breakdown for UI visualization
      w1ScoreBreakdown: round.w1ScoreBreakdown ?? null,
      w2ScoreBreakdown: round.w2ScoreBreakdown ?? null,
    }));

    return NextResponse.json({
      success: true,
      battle: {
        id: battle.id,
        status: battle.status,
        currentRound: battle.currentRound,
        question: battle.question,
        stakes: battle.stakes,
        createdAt: battle.createdAt,
        completedAt: battle.completedAt,
        scheduledStartAt: battle.scheduledStartAt,
        lastCycleAt: battle.lastCycleAt,
        nextCycleEstimate: battle.status === 'active' && battle.currentRound < 5
          ? new Date(Math.max(
              (battle.lastCycleAt?.getTime() ?? 0) + 60 * 1000,
              battle.scheduledStartAt?.getTime() ?? 0,
              Date.now(),
            )).toISOString()
          : null,
        warrior1: {
          nftId: battle.warrior1Id,
          owner: battle.warrior1Owner,
          score: battle.warrior1Score,
          totalYield: battle.w1TotalYield || '0',
          totalYieldFormatted: battle.w1TotalYield ? formatEther(BigInt(battle.w1TotalYield)) : '0',
          traits: w1Traits,
          strategyProfile: w1Profile,
          currentAllocation: w1VaultState ? {
            highYield: Number(w1VaultState.allocation[0]),
            stable: Number(w1VaultState.allocation[1]),
            lp: Number(w1VaultState.allocation[2]),
          } : null,
          vaultBalance: w1VaultState ? w1VaultState.depositAmount.toString() : null,
          imageUrl: w1Image,
          ratingAtStart: battle.w1RatingAtStart ?? null,
        },
        warrior2: {
          nftId: battle.warrior2Id,
          owner: battle.warrior2Owner,
          score: battle.warrior2Score,
          totalYield: battle.w2TotalYield || '0',
          totalYieldFormatted: battle.w2TotalYield ? formatEther(BigInt(battle.w2TotalYield)) : '0',
          traits: w2Traits,
          strategyProfile: w2Profile,
          currentAllocation: w2VaultState ? {
            highYield: Number(w2VaultState.allocation[0]),
            stable: Number(w2VaultState.allocation[1]),
            lp: Number(w2VaultState.allocation[2]),
          } : null,
          vaultBalance: w2VaultState ? w2VaultState.depositAmount.toString() : null,
          imageUrl: w2Image,
          ratingAtStart: battle.w2RatingAtStart ?? null,
        },
        cycles,
        poolAPYs: {
          highYield: poolAPYs.highYield / 100,
          stable: poolAPYs.stable / 100,
          lp: poolAPYs.lp / 100,
        },
        betting: bettingPool ? {
          totalWarrior1Bets: bettingPool.totalWarrior1Bets,
          totalWarrior2Bets: bettingPool.totalWarrior2Bets,
          totalBettors: bettingPool.totalBettors,
          bettingOpen: bettingPool.bettingOpen,
        } : null,
      },
    });
  },
], { errorContext: 'API:Arena:Strategy:Detail:GET' });
