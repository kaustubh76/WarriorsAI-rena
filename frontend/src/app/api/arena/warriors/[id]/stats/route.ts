import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/arena/warriors/[id]/stats
 * Get arena statistics for a specific warrior
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const warriorId = parseInt(id);

    if (isNaN(warriorId)) {
      return NextResponse.json(
        { error: 'Invalid warrior ID' },
        { status: 400 }
      );
    }

    const stats = await prisma.warriorArenaStats.findUnique({
      where: { warriorId },
    });

    if (!stats) {
      return NextResponse.json(
        { error: 'No arena stats found for this warrior' },
        { status: 404 }
      );
    }

    // Calculate additional stats
    const winRate = stats.totalBattles > 0
      ? ((stats.wins / stats.totalBattles) * 100).toFixed(1)
      : '0.0';

    // Get recent battles
    const recentBattles = await prisma.predictionBattle.findMany({
      where: {
        OR: [
          { warrior1Id: warriorId },
          { warrior2Id: warriorId },
        ],
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
      take: 5,
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    // Calculate streak from recent battles
    let currentStreak = 0;
    for (const battle of recentBattles) {
      const isWarrior1 = battle.warrior1Id === warriorId;
      const won = isWarrior1
        ? battle.warrior1Score > battle.warrior2Score
        : battle.warrior2Score > battle.warrior1Score;

      if (won) {
        currentStreak++;
      } else {
        break;
      }
    }

    return NextResponse.json({
      ...stats,
      winRate,
      currentStreak,
      recentBattles: recentBattles.map(b => ({
        id: b.id,
        question: b.question,
        source: b.source,
        warrior1Score: b.warrior1Score,
        warrior2Score: b.warrior2Score,
        wasWarrior1: b.warrior1Id === warriorId,
        won: b.warrior1Id === warriorId
          ? b.warrior1Score > b.warrior2Score
          : b.warrior2Score > b.warrior1Score,
        completedAt: b.completedAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching warrior stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch warrior stats' },
      { status: 500 }
    );
  }
}
