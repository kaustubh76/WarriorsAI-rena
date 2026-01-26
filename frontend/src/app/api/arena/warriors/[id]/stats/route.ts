import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { handleAPIError, applyRateLimit, ErrorResponses, RateLimitPresets } from '@/lib/api';

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
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'arena-warrior-stats',
      ...RateLimitPresets.readOperations,
    });

    const { id } = await params;
    const warriorId = parseInt(id);

    if (isNaN(warriorId)) {
      throw ErrorResponses.badRequest('Invalid warrior ID');
    }

    const stats = await prisma.warriorArenaStats.findUnique({
      where: { warriorId },
    });

    if (!stats) {
      throw ErrorResponses.notFound('No arena stats found for this warrior');
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
    return handleAPIError(error, 'API:Arena:WarriorStats:GET');
  }
}
