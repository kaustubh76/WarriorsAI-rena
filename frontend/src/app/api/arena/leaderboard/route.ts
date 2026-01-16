import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/arena/leaderboard
 * Get warrior arena leaderboard
 */
export async function GET(request: NextRequest) {
  try {
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
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
