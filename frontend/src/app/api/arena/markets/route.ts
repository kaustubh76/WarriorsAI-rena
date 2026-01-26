import { NextRequest, NextResponse } from 'next/server';
import { polymarketService } from '@/services/externalMarkets/polymarketService';
import { kalshiService } from '@/services/externalMarkets/kalshiService';
import { UnifiedMarket } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit, RateLimitPresets, validateEnum } from '@/lib/api';

// In-memory cache with TTL and size limit
interface CacheEntry {
  data: UnifiedMarket[];
  timestamp: number;
}

const MAX_CACHE_SIZE = 100;
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(search?: string, source?: string, limit?: number): string {
  return `markets:${source || 'all'}:${search || 'default'}:${limit || 50}`;
}

function setCache(key: string, data: CacheEntry): void {
  // LRU eviction: remove oldest entry if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, data);
}

// Helper functions for parallel market fetching
async function fetchPolymarketData(search?: string): Promise<{ markets: UnifiedMarket[]; error?: string }> {
  try {
    let rawMarkets;
    if (search) {
      rawMarkets = await polymarketService.searchMarkets(search);
    } else {
      rawMarkets = await polymarketService.getActiveMarkets(100, 0);
    }
    const normalizedMarkets = polymarketService.normalizeMarkets(rawMarkets);
    console.log(`[API] Fetched ${normalizedMarkets.length} markets from Polymarket`);
    return { markets: normalizedMarkets };
  } catch (err) {
    console.error('[API] Polymarket error:', err);
    return { markets: [], error: `Polymarket: ${(err as Error).message}` };
  }
}

async function fetchKalshiData(search?: string): Promise<{ markets: UnifiedMarket[]; error?: string }> {
  try {
    let rawMarkets;
    if (search) {
      rawMarkets = await kalshiService.searchMarkets(search);
    } else {
      const response = await kalshiService.getMarkets('open', 100);
      rawMarkets = response.markets;
    }
    const normalizedMarkets = kalshiService.normalizeMarkets(rawMarkets);
    console.log(`[API] Fetched ${normalizedMarkets.length} markets from Kalshi`);
    return { markets: normalizedMarkets };
  } catch (err) {
    console.error('[API] Kalshi error:', err);
    return { markets: [], error: `Kalshi: ${(err as Error).message}` };
  }
}

/**
 * GET /api/arena/markets
 * Fetch real prediction markets from Polymarket and Kalshi for arena challenges
 *
 * Query params:
 * - search: Optional search query to filter markets
 * - source: Optional source filter ('polymarket' | 'kalshi' | 'all')
 * - limit: Max number of markets to return (default 50, max 200)
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'arena-markets',
      ...RateLimitPresets.apiQueries,
    });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const sourceParam = searchParams.get('source') || 'all';

    // Validate source parameter
    const source = validateEnum(sourceParam, ['all', 'polymarket', 'kalshi'] as const, 'source');

    // Enforce max limit to prevent abuse
    const requestedLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, isNaN(requestedLimit) ? 50 : requestedLimit), 200);

    const cacheKey = getCacheKey(search, source, limit);
    const cached = cache.get(cacheKey);

    // Return cached data if valid
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        data: {
          markets: cached.data.slice(0, limit),
          total: cached.data.length,
          cached: true,
          sources: getSourcesFromMarkets(cached.data),
        },
      });
    }

    const allMarkets: UnifiedMarket[] = [];
    const errors: string[] = [];

    // Fetch from both sources in parallel for better performance
    const fetchPolymarket = source === 'all' || source === 'polymarket';
    const fetchKalshi = source === 'all' || source === 'kalshi';

    const [polymarketResult, kalshiResult] = await Promise.all([
      fetchPolymarket ? fetchPolymarketData(search) : Promise.resolve({ markets: [] }),
      fetchKalshi ? fetchKalshiData(search) : Promise.resolve({ markets: [] }),
    ]);

    // Collect results and errors
    allMarkets.push(...polymarketResult.markets);
    if (polymarketResult.error) {
      errors.push(polymarketResult.error);
    }

    allMarkets.push(...kalshiResult.markets);
    if (kalshiResult.error) {
      errors.push(kalshiResult.error);
    }

    // Sort by volume (descending) for relevance
    allMarkets.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));

    // Update cache using the setCache function with LRU eviction
    setCache(cacheKey, { data: allMarkets, timestamp: Date.now() });

    return NextResponse.json({
      success: true,
      data: {
        markets: allMarkets.slice(0, limit),
        total: allMarkets.length,
        cached: false,
        sources: getSourcesFromMarkets(allMarkets),
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:ArenaMarkets:GET');
  }
}

function getSourcesFromMarkets(markets: UnifiedMarket[]): { polymarket: number; kalshi: number } {
  const sources = { polymarket: 0, kalshi: 0 };
  for (const market of markets) {
    if (market.source === 'polymarket') {
      sources.polymarket++;
    } else if (market.source === 'kalshi') {
      sources.kalshi++;
    }
  }
  return sources;
}
