import { NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/external/sync-history
 * Returns price synchronization history for mirror markets
 *
 * Query params:
 * - mirrorKey: Filter by specific mirror market
 * - limit: Number of records to return (default: 100)
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'external-sync-history', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const mirrorKey = searchParams.get('mirrorKey');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Build where clause
    const where = mirrorKey ? { mirrorKey } : {};

    // Fetch sync history with mirror market details
    const syncEvents = await prisma.priceSyncHistory.findMany({
      where,
      orderBy: { syncedAt: 'desc' },
      take: Math.min(limit, 500), // Cap at 500
    });

    // For each sync event, get the mirror market details
    const eventsWithMarketInfo = await Promise.all(
      syncEvents.map(async (event) => {
        const mirrorMarket = await prisma.mirrorMarket.findUnique({
          where: { mirrorKey: event.mirrorKey },
          select: {
            question: true,
            source: true,
            externalId: true,
          },
        });

        return {
          id: event.id,
          mirrorKey: event.mirrorKey,
          marketQuestion: mirrorMarket?.question || 'Unknown Market',
          source: mirrorMarket?.source || 'unknown',
          externalId: mirrorMarket?.externalId || '',
          oldPrice: event.oldPrice,
          newPrice: event.newPrice,
          priceDifference: Math.abs(event.newPrice - event.oldPrice),
          timestamp: event.syncedAt.toISOString(),
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        events: eventsWithMarketInfo,
        total: eventsWithMarketInfo.length,
      },
    });
  },
], { errorContext: 'API:External:SyncHistory:GET' });
