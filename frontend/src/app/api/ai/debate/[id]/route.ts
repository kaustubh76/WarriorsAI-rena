/**
 * Single AI Debate API Route
 * GET: Get a specific debate by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiDebateService } from '@/services/aiDebateService';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'ai-debate-id',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { id } = await params;

    const debate = await aiDebateService.getDebate(id);

    if (!debate) {
      throw ErrorResponses.notFound('Debate not found');
    }

    return NextResponse.json({
      success: true,
      data: { debate },
    });
  } catch (error) {
    return handleAPIError(error, 'API:AI:Debate:ID:GET');
  }
}
