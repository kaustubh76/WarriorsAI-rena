/**
 * Single External Market API Route
 * GET: Fetch a specific market by ID (poly_xxx or kalshi_xxx)
 */

import { NextRequest, NextResponse } from 'next/server';
import { externalMarketsService } from '@/services/externalMarkets';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'external-markets-id',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { id } = await params;

    const market = await externalMarketsService.getMarket(id);

    if (!market) {
      throw ErrorResponses.notFound('Market not found');
    }

    return NextResponse.json({
      success: true,
      data: market,
    });
  } catch (error) {
    return handleAPIError(error, 'API:External:Markets:ID:GET');
  }
}
