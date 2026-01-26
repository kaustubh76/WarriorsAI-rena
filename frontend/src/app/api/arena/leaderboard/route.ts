import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit } from '@/lib/api';

/**
 * GET /api/arena/leaderboard
 * Get warrior arena leaderboard
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'arena-leaderboard',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
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

    const stats = await prisma.warriorArenaStats.findMany({
      orderBy,
      take: limit,
    });

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
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Leaderboard:GET');
  }
}
