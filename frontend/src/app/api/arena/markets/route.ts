import { NextResponse } from 'next/server';
import { polymarketService } from '@/services/externalMarkets/polymarketService';
import { kalshiService } from '@/services/externalMarkets/kalshiService';
import { externalMarketsService } from '@/services/externalMarkets';
import { UnifiedMarket, MarketSource, ExternalMarketStatus } from '@/types/externalMarket';
import { RateLimitPresets, validateEnum } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { marketDataCache } from '@/lib/cache/hashedCache';

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
    console.warn(`[API] Fetched ${normalizedMarkets.length} markets from Polymarket`);
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
    console.warn(`[API] Fetched ${normalizedMarkets.length} markets from Kalshi`);
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
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-markets', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const sourceParam = searchParams.get('source') || 'all';

    // Validate source parameter
    const source = validateEnum(sourceParam, ['all', 'polymarket', 'kalshi'] as const, 'source');

    // Enforce max limit to prevent abuse
    const requestedLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, isNaN(requestedLimit) ? 50 : requestedLimit), 200);

    const cacheKey = `arena-markets:${source || 'all'}:${search || 'default'}:${limit || 50}`;
    const cached = marketDataCache.get(cacheKey) as UnifiedMarket[] | undefined;

    // Return cached data if valid
    if (cached) {
      const response = NextResponse.json({
        success: true,
        data: {
          markets: cached.slice(0, limit),
          total: cached.length,
          cached: true,
          sources: getSourcesFromMarkets(cached),
        },
      });
      response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return response;
    }

    const allMarkets: UnifiedMarket[] = [];
    const errors: string[] = [];

    // Fetch from both sources in parallel for better performance
    const fetchPolymarket = source === 'all' || source === 'polymarket';
    const fetchKalshi = source === 'all' || source === 'kalshi';

    const [polymarketResult, kalshiResult] = await Promise.all([
      fetchPolymarket ? fetchPolymarketData(search) : Promise.resolve({ markets: [] as UnifiedMarket[], error: undefined }),
      fetchKalshi ? fetchKalshiData(search) : Promise.resolve({ markets: [] as UnifiedMarket[], error: undefined }),
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

    // If live APIs returned no markets, fall back to database
    if (allMarkets.length === 0) {
      console.warn('[API] Live APIs returned no markets, falling back to database');
      const sourceFilters: MarketSource[] | undefined =
        source === 'all' ? undefined : [source as MarketSource];
      // Fetch a larger pool since DB sorts volume as string (lexicographic);
      // we re-sort numerically in memory then slice to requested limit
      const dbMarkets = await externalMarketsService.getAllMarkets({
        search: search,
        source: sourceFilters,
        status: ExternalMarketStatus.ACTIVE,
        pageSize: Math.max(limit, 200),
      });
      if (dbMarkets.length > 0) {
        // Sort by numeric volume descending (DB stores volume as string)
        dbMarkets.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));
        const sliced = dbMarkets.slice(0, limit);
        marketDataCache.set(cacheKey, sliced);
        return NextResponse.json({
          success: true,
          data: {
            markets: sliced,
            total: dbMarkets.length,
            cached: false,
            fallback: true,
            sources: getSourcesFromMarkets(sliced),
          },
        });
      }
    }

    // Sort by volume (descending) for relevance
    allMarkets.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));

    // Store in hash-distributed cache (5-minute TTL from marketDataCache default)
    marketDataCache.set(cacheKey, allMarkets);

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
  },
], { errorContext: 'API:ArenaMarkets:GET' });

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
