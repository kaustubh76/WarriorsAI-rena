import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

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
      return NextResponse.json(
        { error: 'Battle not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ battle });
  } catch (error) {
    console.error('Error fetching battle:', error);
    return NextResponse.json(
      { error: 'Failed to fetch battle' },
      { status: 500 }
    );
  }
}
