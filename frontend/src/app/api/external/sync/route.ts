/**
 * External Markets Sync API Route
 * POST: Trigger market sync from Polymarket and Kalshi
 * GET: Get sync status and logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { externalMarketsService } from '@/services/externalMarkets';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (sync is expensive)
    applyRateLimit(request, {
      prefix: 'external-sync-post',
      maxRequests: 5,
      windowMs: 60000,
    });

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
    return handleAPIError(error, 'API:External:Sync:POST');
  }
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'external-sync-get',
      maxRequests: 60,
      windowMs: 60000,
    });

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
    return handleAPIError(error, 'API:External:Sync:GET');
  }
}
