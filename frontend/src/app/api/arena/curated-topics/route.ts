/**
 * GET /api/arena/curated-topics
 *
 * Returns ExternalMarket records flagged as curatedForArena.
 * Supports optional category filter, search, and pagination.
 *
 * Query params:
 *   category  — filter by category (case-insensitive)
 *   search    — search question text
 *   limit     — max results (default 50, max 200)
 *   offset    — pagination offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { marketDataCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-curated-topics', ...RateLimitPresets.moderateReads }),
  async (request: NextRequest) => {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Cache key based on params
    const cacheKey = `curated:${category || 'all'}:${search || ''}:${limit}:${offset}`;
    const cached = marketDataCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Build Prisma WHERE clause — exclude expired markets
    const where: Prisma.ExternalMarketWhereInput = {
      curatedForArena: true,
      status: 'active',
      endTime: { gt: new Date() },
    };

    if (category) {
      where.category = { equals: category, mode: 'insensitive' };
    }

    if (search) {
      where.question = { contains: search, mode: 'insensitive' };
    }

    const [markets, total] = await Promise.all([
      prisma.externalMarket.findMany({
        where,
        select: {
          id: true,
          source: true,
          externalId: true,
          question: true,
          category: true,
          yesPrice: true,
          noPrice: true,
          volume: true,
          liquidity: true,
          endTime: true,
          sourceUrl: true,
          tags: true,
        },
      }),
      prisma.externalMarket.count({ where }),
    ]);

    // Sort by balance (closest to 50/50 first) — Prisma doesn't support ABS() in orderBy
    // Curated markets are typically <100 so in-app sort is fine
    const sorted = markets.sort((a, b) =>
      Math.abs(a.yesPrice - 5000) - Math.abs(b.yesPrice - 5000)
    );

    // Apply pagination after sorting
    const page = sorted.slice(offset, offset + limit);

    // Convert prices from basis points (0-10000) to 0-100 for display
    const topics = page.map(m => ({
      id: m.id,
      source: m.source,
      externalId: m.externalId,
      question: m.question,
      category: m.category,
      yesPrice: m.yesPrice / 100,
      noPrice: m.noPrice / 100,
      volume: m.volume,
      liquidity: m.liquidity,
      endTime: m.endTime.toISOString(),
      sourceUrl: m.sourceUrl,
      tags: m.tags,
    }));

    const response = {
      success: true,
      topics,
      total,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    };

    // Cache for 5 minutes
    marketDataCache.set(cacheKey, response, 5 * 60 * 1000);

    return NextResponse.json(response);
  },
]);
