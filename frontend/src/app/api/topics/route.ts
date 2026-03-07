/**
 * GET /api/topics
 *
 * Returns topic category aggregates for browsing UI.
 * Each category includes market count, active battles, avg score, top markets.
 *
 * Query params:
 *   includeSubcategories — if "true", include subcategory breakdowns
 */

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { marketDataCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'topics-list', ...RateLimitPresets.moderateReads }),
  async (request: NextRequest) => {
    const { searchParams } = request.nextUrl;
    const includeSubcategories = searchParams.get('includeSubcategories') === 'true';

    const cacheKey = `topics:list:${includeSubcategories}`;
    const cached = marketDataCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const where = includeSubcategories ? {} : { subcategory: null };

    const aggregates = await prisma.topicAggregate.findMany({
      where,
      orderBy: { marketCount: 'desc' },
    });

    const categories = aggregates.map((agg) => ({
      category: agg.category,
      subcategory: agg.subcategory,
      marketCount: agg.marketCount,
      activeBattles: agg.activeBattles,
      totalVolume: agg.totalVolume,
      avgBattleScore: agg.avgBattleScore,
      topMarketIds: JSON.parse(agg.topMarketIds) as string[],
      updatedAt: agg.updatedAt.toISOString(),
    }));

    const response = {
      success: true,
      categories,
      total: categories.length,
      timestamp: new Date().toISOString(),
    };

    // Cache for 5 minutes
    marketDataCache.set(cacheKey, response, 5 * 60 * 1000);

    return NextResponse.json(response);
  },
]);
