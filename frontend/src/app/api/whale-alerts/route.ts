/**
 * Whale Alerts API Route
 * GET: Fetch recent whale trades
 */

import { NextRequest, NextResponse } from 'next/server';
import { whaleTrackerService } from '@/services/externalMarkets/whaleTrackerService';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-alerts',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);

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
  } catch (error) {
    return handleAPIError(error, 'API:WhaleAlerts:GET');
  }
}
