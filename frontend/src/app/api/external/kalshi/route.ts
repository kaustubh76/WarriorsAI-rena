/**
 * Kalshi API Proxy Route
 * GET: Fetch markets directly from Kalshi (bypasses local DB)
 * Includes circuit breaker and retry logic for resilience
 */

import { NextRequest, NextResponse } from 'next/server';
import { kalshiService } from '@/services/externalMarkets';
import {
  handleAPIError,
  applyRateLimit,
  ErrorResponses,
  createAPILogger,
  circuitBreakers,
  CircuitBreakerPresets,
  CircuitBreakerError,
} from '@/lib/api';

// Get or create circuit breaker for Kalshi
const kalshiBreaker = circuitBreakers.getBreaker('kalshi', {
  ...CircuitBreakerPresets.standard,
  onOpen: (failures) => {
    console.warn(`[Kalshi] Circuit breaker opened after ${failures} failures - service may be down`);
  },
});

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  logger.start();

  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'external-kalshi',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'markets';

    // Wrap all Kalshi calls in circuit breaker
    const result = await kalshiBreaker.call(async () => {
      switch (action) {
        case 'markets': {
          const status = searchParams.get('status') || 'open';
          const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);

          const response = await kalshiService.getMarkets(status, limit);
          const normalizedMarkets = kalshiService.normalizeMarkets(response.markets);

          return {
            markets: normalizedMarkets,
            count: response.markets.length,
            cursor: response.cursor,
            raw: process.env.NODE_ENV === 'development' ? response.markets : undefined,
          };
        }

        case 'market': {
          const ticker = searchParams.get('ticker');
          if (!ticker) {
            throw ErrorResponses.badRequest('ticker required');
          }

          const market = await kalshiService.getMarket(ticker);
          if (!market) {
            throw ErrorResponses.notFound('Market not found');
          }

          return {
            market: kalshiService.normalizeMarket(market),
            raw: process.env.NODE_ENV === 'development' ? market : undefined,
          };
        }

        case 'search': {
          const query = searchParams.get('q');
          if (!query) {
            throw ErrorResponses.badRequest('Search query required');
          }

          const markets = await kalshiService.searchMarkets(query);
          return {
            markets: kalshiService.normalizeMarkets(markets),
            count: markets.length,
          };
        }

        case 'orderbook': {
          const ticker = searchParams.get('ticker');
          if (!ticker) {
            throw ErrorResponses.badRequest('ticker required');
          }

          const orderbook = await kalshiService.getOrderbook(ticker);
          return orderbook;
        }

        case 'trades': {
          const ticker = searchParams.get('ticker');
          if (!ticker) {
            throw ErrorResponses.badRequest('ticker required');
          }

          const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);
          const response = await kalshiService.getTrades(ticker, limit);
          return response;
        }

        case 'events': {
          const status = searchParams.get('status') || 'open';
          const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);

          const events = await kalshiService.getEvents(status, limit);
          return {
            events,
            count: events.length,
          };
        }

        case 'health': {
          const healthy = await kalshiService.healthCheck();
          return { healthy };
        }

        default:
          throw ErrorResponses.badRequest(`Unknown action: ${action}`);
      }
    });

    logger.complete(200);

    const response = NextResponse.json({
      success: true,
      data: result,
    });

    // Add cache headers for market data
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=15');
    response.headers.set('X-Request-ID', logger.requestId);

    return response;
  } catch (error) {
    // Handle circuit breaker errors specially
    if (error instanceof CircuitBreakerError) {
      logger.warn('Circuit breaker open for Kalshi');
      return NextResponse.json(
        {
          success: false,
          error: 'Kalshi service temporarily unavailable',
          retryAfter: Math.ceil(error.retryAfter / 1000),
        },
        {
          status: 503,
          headers: {
            'Retry-After': Math.ceil(error.retryAfter / 1000).toString(),
            'X-Request-ID': logger.requestId,
          },
        }
      );
    }

    logger.error('Kalshi request failed', error);
    return handleAPIError(error, 'API:External:Kalshi:GET');
  }
}
