/**
 * Single External Market API Route
 * GET: Fetch a specific market by ID (poly_xxx or kalshi_xxx)
 */

import { NextRequest, NextResponse } from 'next/server';
import { externalMarketsService } from '@/services/externalMarkets';
import { RateLimitPresets, ErrorResponses } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const handler = composeMiddleware([
    withRateLimit({ prefix: 'external-markets-id', ...RateLimitPresets.apiQueries }),
    async (req, ctx) => {
      const market = await externalMarketsService.getMarket(id);

      if (!market) {
        throw ErrorResponses.notFound('Market not found');
      }

      return NextResponse.json({
        success: true,
        data: market,
      });
    },
  ], { errorContext: 'API:External:Markets:ID:GET' });

  return handler(request);
}
