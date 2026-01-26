import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

const prisma = new PrismaClient();

/**
 * GET /api/arena/battles/[id]
 * Get a single battle by ID with all rounds
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'arena-battles-id',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { id } = await params;

    const battle = await prisma.predictionBattle.findUnique({
      where: { id },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    if (!battle) {
      throw ErrorResponses.notFound('Battle not found');
    }

    return NextResponse.json({ battle });
  } catch (error) {
    return handleAPIError(error, 'API:Arena:Battles:ID:GET');
  }
}
