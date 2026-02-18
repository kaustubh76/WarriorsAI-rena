/**
 * Single AI Debate API Route
 * GET: Get a specific debate by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiDebateService } from '@/services/aiDebateService';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const handler = composeMiddleware([
    withRateLimit({ prefix: 'ai-debate-id', ...RateLimitPresets.apiQueries }),
    async (req, ctx) => {
      const debate = await aiDebateService.getDebate(id);

      if (!debate) {
        throw ErrorResponses.notFound('Debate not found');
      }

      return NextResponse.json({
        success: true,
        data: { debate },
      });
    },
  ], { errorContext: 'API:AI:Debate:ID:GET' });

  return handler(request);
}
