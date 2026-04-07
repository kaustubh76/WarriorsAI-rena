/**
 * GET /api/topics/trending
 *
 * Returns markets flagged as trending (cross-platform disagreement).
 * Joins with MatchedMarketPair to include both Polymarket and Kalshi prices.
 *
 * Query params:
 *   category — filter by topic category (optional)
 *   limit    — max results (default 20, max 100)
 *   offset   — pagination offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { marketDataCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'topics-trending', ...RateLimitPresets.moderateReads }),
  async (request: NextRequest) => {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const cacheKey = `topics:trending:${category || 'all'}:${limit}:${offset}`;
    const cached = marketDataCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    try {
      const where: Prisma.ExternalMarketWhereInput = {
        isTrending: true,
        status: 'active',
        curatedForArena: true,
        endTime: { gt: new Date() },
      };

      if (category) {
        where.topicCategory = category;
      }

      // Fetch trending markets
      const markets = await prisma.externalMarket.findMany({
        where,
        orderBy: { battleScore: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          source: true,
          question: true,
          category: true,
          topicCategory: true,
          yesPrice: true,
          noPrice: true,
          volume: true,
          endTime: true,
          battleScore: true,
          isTrending: true,
          trendingReason: true,
          // Get matched pairs to show cross-platform prices
          polymarketPairs: {
            where: { isActive: true, hasArbitrage: true },
            select: {
              kalshiYesPrice: true,
              kalshiQuestion: true,
              priceDifference: true,
            },
            take: 1,
          },
          kalshiPairs: {
            where: { isActive: true, hasArbitrage: true },
            select: {
              polymarketYesPrice: true,
              polymarketQuestion: true,
              priceDifference: true,
            },
            take: 1,
          },
        },
      });

      const total = await prisma.externalMarket.count({ where });

      // Count active battles for trending markets
      const trendingIds = markets.map((m) => m.id);
      const activeBattleCounts = trendingIds.length > 0
        ? await prisma.predictionBattle.groupBy({
            by: ['externalMarketId'],
            where: {
              externalMarketId: { in: trendingIds },
              status: 'active',
            },
            _count: true,
          })
        : [];

      const battleCountMap = new Map(
        activeBattleCounts.map((b) => [b.externalMarketId, b._count])
      );

      const topics = markets.map((m) => {
        // Determine cross-platform price
        let polymarketPrice: number | undefined;
        let kalshiPrice: number | undefined;

        if (m.source === 'polymarket') {
          polymarketPrice = m.yesPrice / 100;
          const pair = m.polymarketPairs[0];
          if (pair) {
            kalshiPrice = pair.kalshiYesPrice / 100;
          }
        } else {
          kalshiPrice = m.yesPrice / 100;
          const pair = m.kalshiPairs[0];
          if (pair) {
            polymarketPrice = pair.polymarketYesPrice / 100;
          }
        }

        return {
          id: m.id,
          question: m.question,
          category: m.topicCategory ?? m.category,
          isTrending: m.isTrending,
          trendingReason: m.trendingReason,
          polymarketPrice,
          kalshiPrice,
          battleScore: m.battleScore,
          activeBattles: battleCountMap.get(m.id) ?? 0,
          volume: m.volume,
          endTime: m.endTime.toISOString(),
          source: m.source,
        };
      });

      const response = {
        success: true,
        topics,
        total,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      };

      // Cache for 3 minutes (trending data changes more often)
      marketDataCache.set(cacheKey, response, 3 * 60 * 1000);

      return NextResponse.json(response);
    } catch (err) {
      console.error('[/api/topics/trending] Error:', err);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch trending topics' },
        { status: 500 }
      );
    }
  },
]);
