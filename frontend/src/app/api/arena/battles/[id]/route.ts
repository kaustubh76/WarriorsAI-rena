import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/arena/battles/[id]
 * Get a single battle by ID with all rounds
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const handler = composeMiddleware([
    withRateLimit({ prefix: 'arena-battles-id', ...RateLimitPresets.apiQueries }),
    async (req, ctx) => {
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
    },
  ], { errorContext: 'API:Arena:Battles:ID:GET' });

  return handler(request);
}
