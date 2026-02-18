import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { userDataCache } from '@/lib/cache/hashedCache';

/**
 * GET /api/arena/leaderboard
 * Get warrior arena leaderboard
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-leaderboard', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get('sortBy') || 'rating';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Determine sort order
    let orderBy: Record<string, 'asc' | 'desc'>;
    switch (sortBy) {
      case 'wins':
        orderBy = { wins: 'desc' };
        break;
      case 'earnings':
        orderBy = { totalEarnings: 'desc' };
        break;
      case 'rating':
      default:
        orderBy = { arenaRating: 'desc' };
        break;
    }

    const cacheKey = `arena-leaderboard:${sortBy}:${limit}`;
    const stats = await userDataCache.getOrSet(
      cacheKey,
      () => prisma.warriorArenaStats.findMany({
        orderBy,
        take: limit,
      }),
      60_000 // 60s TTL — leaderboard data is semi-stale-tolerant
    ) as Awaited<ReturnType<typeof prisma.warriorArenaStats.findMany>>;

    // Add rank
    const leaderboard = stats.map((s, index) => ({
      ...s,
      rank: index + 1,
    }));

    return NextResponse.json({
      leaderboard,
      sortBy,
      total: leaderboard.length,
    });
  },
], { errorContext: 'API:Arena:Leaderboard:GET' });
