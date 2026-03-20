/**
 * API Route: Strategy Battle Micro-Markets
 * Fetches micro-markets associated with a strategy battle's on-chain ID.
 * Uses MicroMarketService to read from MicroMarketFactory contract.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { microMarketService } from '@/services/microMarketService';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'strategy-micro-markets', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const id = (ctx as { params: { id: string } }).params.id;

    if (!id) {
      throw ErrorResponses.badRequest('Battle ID is required');
    }

    // Get the battle and its on-chain ID
    const battle = await prisma.predictionBattle.findUnique({
      where: { id },
      select: { onChainBattleId: true, warrior1Id: true, warrior2Id: true },
    });

    if (!battle) {
      throw ErrorResponses.notFound('Battle');
    }

    if (!battle.onChainBattleId) {
      return NextResponse.json({
        markets: [],
        message: 'No on-chain battle ID — micro-markets not available',
      });
    }

    try {
      const onChainId = BigInt(battle.onChainBattleId);
      const roundMarkets = await microMarketService.getMarketsByRound(onChainId);

      return NextResponse.json({
        battleId: id,
        onChainBattleId: battle.onChainBattleId,
        rounds: roundMarkets,
        totalMarkets: roundMarkets.reduce((sum, r) => sum + r.markets.length, 0),
      });
    } catch (err) {
      console.error(`[MicroMarkets] Failed to fetch for battle ${id}:`, err);
      return NextResponse.json({
        markets: [],
        error: 'Failed to fetch micro-markets from chain',
      });
    }
  },
], { errorContext: 'API:StrategyMicroMarkets:GET' });
