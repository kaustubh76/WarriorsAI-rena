/**
 * GET /api/topics/[category]
 *
 * Returns curated markets in a specific topic category, sorted by battleScore.
 *
 * Query params:
 *   subcategory — filter by subcategory (optional)
 *   search      — search question text (optional)
 *   limit       — max results (default 50, max 200)
 *   offset      — pagination offset (default 0)
 *   trending    — if "true", only return trending markets
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, RequestContext } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { marketDataCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'topics-category', ...RateLimitPresets.moderateReads }),
  async (request: NextRequest, context: RequestContext) => {
    const category = context.params?.category || '';
    if (!category) {
      return NextResponse.json({ success: false, error: 'Missing category' }, { status: 400 });
    }
    const { searchParams } = request.nextUrl;
    const subcategory = searchParams.get('subcategory') || undefined;
    const search = searchParams.get('search') || undefined;
    const trendingOnly = searchParams.get('trending') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const cacheKey = `topics:${category}:${subcategory || ''}:${search || ''}:${trendingOnly}:${limit}:${offset}`;
    const cached = marketDataCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    try {
      const where: Prisma.ExternalMarketWhereInput = {
        curatedForArena: true,
        status: 'active',
        topicCategory: category,
        endTime: { gt: new Date() },
      };

      if (subcategory) {
        where.topicSubcategory = subcategory;
      }
      if (search) {
        where.question = { contains: search, mode: 'insensitive' };
      }
      if (trendingOnly) {
        where.isTrending = true;
      }

      const [markets, total] = await Promise.all([
        prisma.externalMarket.findMany({
          where,
          orderBy: { battleScore: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            source: true,
            externalId: true,
            question: true,
            category: true,
            topicCategory: true,
            topicSubcategory: true,
            yesPrice: true,
            noPrice: true,
            volume: true,
            liquidity: true,
            endTime: true,
            sourceUrl: true,
            battleScore: true,
            isTrending: true,
            trendingReason: true,
          },
        }),
        prisma.externalMarket.count({ where }),
      ]);

      const topics = markets.map((m) => ({
        id: m.id,
        source: m.source,
        externalId: m.externalId,
        question: m.question,
        category: m.category,
        topicCategory: m.topicCategory,
        topicSubcategory: m.topicSubcategory,
        yesPrice: m.yesPrice / 100,
        noPrice: m.noPrice / 100,
        volume: m.volume,
        liquidity: m.liquidity,
        endTime: m.endTime.toISOString(),
        sourceUrl: m.sourceUrl,
        battleScore: m.battleScore,
        isTrending: m.isTrending,
        trendingReason: m.trendingReason,
      }));

      const response = {
        success: true,
        category,
        topics,
        total,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      };

      marketDataCache.set(cacheKey, response, 5 * 60 * 1000);

      return NextResponse.json(response);
    } catch (err) {
      console.error(`[/api/topics/${category}] Error:`, err);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch category topics' },
        { status: 500 }
      );
    }
  },
]);
