/**
 * Polymarket API Proxy Route
 * GET: Fetch markets directly from Polymarket (bypasses local DB)
 * Includes circuit breaker and retry logic for resilience
 */

import { NextResponse } from 'next/server';
import { polymarketService } from '@/services/externalMarkets';
import {
  RateLimitPresets,
  ErrorResponses,
  createAPILogger,
  circuitBreakers,
  CircuitBreakerPresets,
  CircuitBreakerError,
} from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// Get or create circuit breaker for Polymarket
const polymarketBreaker = circuitBreakers.getBreaker('polymarket', {
  ...CircuitBreakerPresets.standard,
  onOpen: (failures) => {
    console.warn(`[Polymarket] Circuit breaker opened after ${failures} failures - service may be down`);
  },
});

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'external-polymarket', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const logger = createAPILogger(req);
    logger.start();

    try {
      const { searchParams } = new URL(req.url);

      const action = searchParams.get('action') || 'markets';

      // Wrap all Polymarket calls in circuit breaker
      const result = await polymarketBreaker.call(async () => {
        switch (action) {
          case 'markets': {
            const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);
            const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

            const markets = await polymarketService.getActiveMarkets(limit, offset);
            const normalizedMarkets = polymarketService.normalizeMarkets(markets);

            return {
              markets: normalizedMarkets,
              count: markets.length,
              raw: process.env.NODE_ENV === 'development' ? markets : undefined,
            };
          }

          case 'market': {
            const conditionId = searchParams.get('conditionId');
            if (!conditionId) {
              throw ErrorResponses.badRequest('conditionId required');
            }

            const market = await polymarketService.getMarket(conditionId);
            if (!market) {
              throw ErrorResponses.notFound('Market not found');
            }

            return {
              market: polymarketService.normalizeMarket(market),
              raw: process.env.NODE_ENV === 'development' ? market : undefined,
            };
          }

          case 'search': {
            const query = searchParams.get('q');
            if (!query) {
              throw ErrorResponses.badRequest('Search query required');
            }

            const markets = await polymarketService.searchMarkets(query);
            return {
              markets: polymarketService.normalizeMarkets(markets),
              count: markets.length,
            };
          }

          case 'orderbook': {
            const tokenId = searchParams.get('tokenId');
            if (!tokenId) {
              throw ErrorResponses.badRequest('tokenId required');
            }

            const orderbook = await polymarketService.getOrderbook(tokenId);
            return orderbook;
          }

          case 'health': {
            const healthy = await polymarketService.healthCheck();
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
        logger.warn('Circuit breaker open for Polymarket');
        return NextResponse.json(
          {
            success: false,
            error: 'Polymarket service temporarily unavailable',
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

      throw error; // Re-throw for composeMiddleware to handle
    }
  },
], { errorContext: 'API:External:Polymarket:GET' });
