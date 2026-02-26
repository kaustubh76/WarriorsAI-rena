/**
 * GET /api/arena/arbitrage-opportunities
 * Find arbitrage opportunities between Polymarket and Kalshi
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { marketDataCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-arbitrage-opps', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const minSpread = parseFloat(searchParams.get('minSpread') || '5');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Query matched market pairs with arbitrage opportunities
    const where: Prisma.MatchedMarketPairWhereInput = {
      hasArbitrage: true,
      isActive: true,
    };

    // If search query provided, filter by question text
    if (search) {
      where.OR = [
        { polymarketQuestion: { contains: search, mode: 'insensitive' } },
        { kalshiQuestion: { contains: search, mode: 'insensitive' } },
      ];
    }

    const cacheKey = `arena-arb-opps:${search}:${minSpread}:${limit}`;
    const matchedPairs = await marketDataCache.getOrSet(
      cacheKey,
      () => prisma.matchedMarketPair.findMany({
        where,
        orderBy: { priceDifference: 'desc' },
        take: limit,
      }),
      30_000 // 30s TTL
    ) as Awaited<ReturnType<typeof prisma.matchedMarketPair.findMany>>;

    // Calculate profit details for each opportunity
    const opportunities = matchedPairs.map((pair) => {
      // Calculate arbitrage profit
      // Buy YES on cheaper market, NO on the other
      // MatchedMarketPair stores prices as 0-100 (from UnifiedMarket), convert to 0-1 decimal
      const polyYesPrice = pair.polymarketYesPrice / 100;
      const polyNoPrice = pair.polymarketNoPrice / 100;
      const kalshiYesPrice = pair.kalshiYesPrice / 100;
      const kalshiNoPrice = pair.kalshiNoPrice / 100;

      // Strategy: Buy YES + NO across both markets for less than $1
      let strategy;
      let cost;
      let potentialProfit;

      if (polyYesPrice + kalshiNoPrice < 1.0) {
        strategy = { buyYesOn: 'polymarket', buyNoOn: 'kalshi' };
        cost = polyYesPrice + kalshiNoPrice;
        potentialProfit = ((1.0 - cost) / cost) * 100;
      } else if (kalshiYesPrice + polyNoPrice < 1.0) {
        strategy = { buyYesOn: 'kalshi', buyNoOn: 'polymarket' };
        cost = kalshiYesPrice + polyNoPrice;
        potentialProfit = ((1.0 - cost) / cost) * 100;
      } else {
        // No profitable arbitrage
        return null;
      }

      // Filter by minimum spread
      if (potentialProfit < minSpread) {
        return null;
      }

      return {
        id: pair.id,
        question: pair.polymarketQuestion,
        polymarket: {
          id: pair.polymarketId,
          yesPrice: polyYesPrice * 100,
          noPrice: polyNoPrice * 100,
          volume: pair.polymarketVolume,
        },
        kalshi: {
          id: pair.kalshiId,
          yesPrice: kalshiYesPrice * 100,
          noPrice: kalshiNoPrice * 100,
          volume: pair.kalshiVolume,
        },
        spread: pair.priceDifference,
        potentialProfit: parseFloat(potentialProfit.toFixed(2)),
        cost: parseFloat(cost.toFixed(4)),
        strategy,
        similarity: pair.similarity,
      };
    }).filter(Boolean); // Remove null entries

    // Deduplicate: each Polymarket and Kalshi market appears at most once
    // Sorted by profit descending, greedily pick pairs where neither side is already used
    type Opp = NonNullable<(typeof opportunities)[number]>;
    const sorted = (opportunities.filter(Boolean) as Opp[])
      .sort((a, b) => b.potentialProfit - a.potentialProfit);
    const usedPoly = new Set<string>();
    const usedKalshi = new Set<string>();
    const dedupedOpportunities: Opp[] = [];
    for (const opp of sorted) {
      if (usedPoly.has(opp.polymarket.id) || usedKalshi.has(opp.kalshi.id)) continue;
      usedPoly.add(opp.polymarket.id);
      usedKalshi.add(opp.kalshi.id);
      dedupedOpportunities.push(opp);
    }

    return NextResponse.json({
      success: true,
      opportunities: dedupedOpportunities,
      count: dedupedOpportunities.length,
    });
  },
], { errorContext: 'API:Arena:ArbitrageOpportunities:GET' });
