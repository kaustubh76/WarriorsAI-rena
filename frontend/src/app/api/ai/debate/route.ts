/**
 * AI Debate API Route
 * POST: Start a new AI debate on a market
 * GET: Get debate history for a market
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiDebateService } from '@/services/aiDebateService';
import { MarketSource } from '@/types/externalMarket';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'ai-debate-post', ...RateLimitPresets.agentOperations }),
  async (req, ctx) => {
    const body = await req.json();
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
  },
], { errorContext: 'API:AI:Debate:POST' });

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'ai-debate-get', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const marketId = searchParams.get('marketId');

    if (!marketId) {
      throw ErrorResponses.badRequest('marketId is required');
    }

    const debates = await aiDebateService.getDebateHistory(marketId);

    return NextResponse.json({
      success: true,
      data: { debates },
    });
  },
], { errorContext: 'API:AI:Debate:GET' });
