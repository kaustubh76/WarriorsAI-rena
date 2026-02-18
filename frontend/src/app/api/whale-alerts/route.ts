/**
 * Whale Alerts API Route
 * GET: Fetch recent whale trades
 */

import { NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'whale-alerts', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);

    // Parse and validate pagination with max limits
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(rawLimit, 1), 500); // Clamp between 1 and 500
    const source = searchParams.get('source') as MarketSource | null;
    const threshold = searchParams.get('threshold');

    // Update threshold if provided (with validation)
    if (threshold) {
      const parsedThreshold = parseInt(threshold);
      // Validate threshold is in reasonable range (100 to 10M USD)
      if (!isNaN(parsedThreshold) && parsedThreshold >= 100 && parsedThreshold <= 10000000) {
        whaleTrackerService.setThreshold(parsedThreshold);
      }
    }

    const trades = await whaleTrackerService.getRecentWhaleTrades(
      limit,
      source || undefined
    );

    const response = NextResponse.json({
      success: true,
      data: {
        trades,
        count: trades.length,
        threshold: whaleTrackerService.getThreshold(),
      },
    });

    // Add cache headers for whale alerts (cache for 30 seconds - trades update frequently)
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=15');
    return response;
  },
], { errorContext: 'API:WhaleAlerts:GET' });
