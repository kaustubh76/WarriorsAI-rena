/**
 * Single AI Debate API Route
 * GET: Get a specific debate by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiDebateService } from '@/services/aiDebateService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const debate = await aiDebateService.getDebate(id);

    if (!debate) {
      return NextResponse.json(
        { success: false, error: 'Debate not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { debate },
    });
  } catch (error) {
    console.error('[API] Get debate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch debate',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
