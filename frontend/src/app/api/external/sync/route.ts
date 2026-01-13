/**
 * External Markets Sync API Route
 * POST: Trigger market sync from Polymarket and Kalshi
 * GET: Get sync status and logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { externalMarketsService } from '@/services/externalMarkets';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source'); // 'polymarket', 'kalshi', or null for both

    let results;

    if (source === 'polymarket') {
      const result = await externalMarketsService.syncPolymarketMarkets();
      results = [{
        source: 'polymarket',
        success: true,
        ...result,
      }];
    } else if (source === 'kalshi') {
      const result = await externalMarketsService.syncKalshiMarkets();
      results = [{
        source: 'kalshi',
        success: true,
        ...result,
      }];
    } else {
      results = await externalMarketsService.syncAllMarkets();
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('[API] Sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync markets',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get recent sync logs
    const logs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Get market stats
    const stats = await externalMarketsService.getMarketStats();

    return NextResponse.json({
      success: true,
      data: {
        stats,
        recentSyncs: logs.map((log) => ({
          id: log.id,
          source: log.source,
          action: log.action,
          status: log.status,
          count: log.count,
          duration: log.duration,
          error: log.error,
          timestamp: log.createdAt.getTime(),
        })),
      },
    });
  } catch (error) {
    console.error('[API] Sync status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get sync status',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
