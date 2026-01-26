/**
 * AI Debate API Route
 * POST: Start a new AI debate on a market
 * GET: Get debate history for a market
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiDebateService } from '@/services/aiDebateService';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (AI debates are resource-intensive)
    applyRateLimit(request, {
      prefix: 'ai-debate-post',
      maxRequests: 10,
      windowMs: 60000,
    });

    const body = await request.json();
    const { marketId, question, source } = body;

    if (!marketId || !question) {
      throw ErrorResponses.badRequest('marketId and question are required');
    }

    const debate = await aiDebateService.conductDebate(
      marketId,
      question,
      (source as MarketSource) || MarketSource.NATIVE
    );

    return NextResponse.json({
      success: true,
      data: { debate },
    });
  } catch (error) {
    return handleAPIError(error, 'API:AI:Debate:POST');
  }
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'ai-debate-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');

    if (!marketId) {
      throw ErrorResponses.badRequest('marketId is required');
    }

    const debates = await aiDebateService.getDebateHistory(marketId);

    return NextResponse.json({
      success: true,
      data: { debates },
    });
  } catch (error) {
    return handleAPIError(error, 'API:AI:Debate:GET');
  }
}
