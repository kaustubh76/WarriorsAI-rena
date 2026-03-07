/**
 * GET /api/topics/[category]/leaderboard
 *
 * Returns per-category user leaderboard ranked by correct predictions.
 *
 * Query params:
 *   limit  — max results (default 50, max 100)
 *   offset — pagination offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit, RequestContext } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { marketDataCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'topics-leaderboard', ...RateLimitPresets.moderateReads }),
  async (request: NextRequest, context: RequestContext) => {
    const category = context.params?.category || '';
    if (!category) {
      return NextResponse.json({ success: false, error: 'Missing category' }, { status: 400 });
    }
    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const cacheKey = `topics:leaderboard:${category}:${limit}:${offset}`;
    const cached = marketDataCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const [entries, total] = await Promise.all([
      prisma.userTopicStats.findMany({
        where: { category, predictions: { gt: 0 } },
        orderBy: [{ correct: 'desc' }, { currentStreak: 'desc' }],
        skip: offset,
        take: limit,
      }),
      prisma.userTopicStats.count({
        where: { category, predictions: { gt: 0 } },
      }),
    ]);

    const leaderboard = entries.map((entry, index) => ({
      rank: offset + index + 1,
      userId: entry.userId,
      predictions: entry.predictions,
      correct: entry.correct,
      accuracy: entry.predictions > 0
        ? Math.round((entry.correct / entry.predictions) * 10000) / 100
        : 0,
      currentStreak: entry.currentStreak,
      longestStreak: entry.longestStreak,
      earnings: entry.earnings,
      badge: entry.badge,
    }));

    const response = {
      success: true,
      category,
      leaderboard,
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
