/**
 * Opinion Service
 * Integrates with Opinion (opinion.trade) API for prediction market data
 *
 * API: https://openapi.opinion.trade/openapi
 * Docs: https://docs.opinion.trade
 *
 * Authentication: API key via 'apikey' header (optional)
 *
 * Robustness Features:
 * - Schema validation with Zod
 * - Adaptive rate limiting
 * - Circuit breaker protection
 * - Monitoring integration
 */

import {
  UnifiedMarket,
  MarketSource,
  ExternalMarketStatus,
  OpinionMarket,
  OpinionPrice,
  WhaleTrade,
} from '@/types/externalMarket';
import { opinionRateLimiter, opinionCircuit, withRetry } from '@/lib/rateLimiter';
import { opinionAdaptiveRateLimiter } from '@/lib/adaptiveRateLimiter';
import { monitoredCall } from './monitoring';
import {
  OpinionMarketsResponseSchema,
  OpinionMarketDetailResponseSchema,
  OpinionPriceResponseSchema,
  OpinionPriceHistoryResponseSchema,
  safeValidateOpinion,
} from './schemas/opinionSchemas';

// ============================================
// CONSTANTS
// ============================================

const OPINION_API_BASE = 'https://openapi.opinion.trade/openapi';
const WHALE_THRESHOLD = 10000; // $10k USD

// Opinion status codes
const OPINION_STATUS = {
  CREATED: 1,
  ACTIVATED: 2,
  RESOLVING: 3,
  RESOLVED: 4,
  FAILED: 5,
  DELETED: 6,
} as const;

// ============================================
// TYPES
// ============================================

interface OpinionMarketsResponse {
  code: number;
  msg: string;
  result: {
    total: number;
    list: OpinionMarket[];
  };
}

// ============================================
// OPINION SERVICE CLASS
// ============================================

class OpinionService {
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private priceCacheTTL = 30000; // 30 seconds

  // ============================================
  // HEADERS
  // ============================================

  /**
   * Get request headers with optional API key
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Support optional API key from environment
    const apiKey = process.env.OPINION_API_KEY;
    if (apiKey) {
      headers['apikey'] = apiKey;
    }

    return headers;
  }

  // ============================================
  // MARKET DATA
  // ============================================

  /**
   * Get active markets from Opinion
   * Uses schema validation and adaptive rate limiting
   */
  async getActiveMarkets(
    limit: number = 20,
    page: number = 1
  ): Promise<OpinionMarket[]> {
    return monitoredCall(
      'opinion',
      'getActiveMarkets',
      async () => {
        return opinionCircuit.execute(async () => {
          await opinionAdaptiveRateLimiter.acquire();

          const params = new URLSearchParams({
            page: page.toString(),
            limit: Math.min(limit, 20).toString(), // API max is 20
            status: 'activated',
            marketType: '0', // Binary markets only
            sortBy: '3', // Sort by volume
          });

          const response = await withRetry(() =>
            fetch(`${OPINION_API_BASE}/market?${params}`, {
              headers: this.getHeaders(),
            })
          );

          opinionAdaptiveRateLimiter.updateFromHeaders(response.headers);

          if (!response.ok) {
            throw new Error(`Opinion API error: ${response.status}`);
          }

          const data = await response.json();

          // Validate response (soft validation - returns raw on failure)
          const validated = safeValidateOpinion(
            data,
            OpinionMarketsResponseSchema,
            'getActiveMarkets'
          );

          if (validated && validated.code === 0) {
            return validated.result.list;
          }

          // Fallback to raw data
          return data?.result?.list || [];
        });
      },
      { limit, page }
    );
  }

  /**
   * Get all active markets with pagination
   */
  async getAllActiveMarkets(maxMarkets: number = 200): Promise<OpinionMarket[]> {
    const allMarkets: OpinionMarket[] = [];
    let page = 1;
    const limit = 20; // API max per page

    while (allMarkets.length < maxMarkets) {
      const markets = await this.getActiveMarkets(limit, page);

      if (markets.length === 0) break;

      allMarkets.push(...markets);
      page++;

      // Safety limit to prevent infinite loops
      if (page > 20) break;
    }

    return allMarkets.slice(0, maxMarkets);
  }

  /**
   * Get a single market by ID
   */
  async getMarket(marketId: number): Promise<OpinionMarket | null> {
    return monitoredCall(
      'opinion',
      'getMarket',
      async () => {
        return opinionCircuit.execute(async () => {
          await opinionAdaptiveRateLimiter.acquire();

          const response = await withRetry(() =>
            fetch(`${OPINION_API_BASE}/market/${marketId}`, {
              headers: this.getHeaders(),
            })
          );

          opinionAdaptiveRateLimiter.updateFromHeaders(response.headers);

          if (response.status === 404) {
            return null;
          }

          if (!response.ok) {
            throw new Error(`Opinion API error: ${response.status}`);
          }

          const data = await response.json();
          const validated = safeValidateOpinion(
            data,
            OpinionMarketDetailResponseSchema,
            'getMarket'
          );

          if (validated && validated.code === 0 && validated.result) {
            return validated.result;
          }

          return data?.result || null;
        });
      },
      { marketId }
    );
  }

  /**
   * Search markets by query
   * Note: Opinion API doesn't have a direct search endpoint,
   * so we filter locally from active markets
   */
  async searchMarkets(query: string): Promise<OpinionMarket[]> {
    const markets = await this.getAllActiveMarkets(200);

    const queryLower = query.toLowerCase();
    return markets.filter(
      (m) =>
        m.marketTitle.toLowerCase().includes(queryLower) ||
        m.yesLabel?.toLowerCase().includes(queryLower) ||
        m.noLabel?.toLowerCase().includes(queryLower)
    );
  }

  // ============================================
  // PRICING
  // ============================================

  /**
   * Get latest price for a token
   */
  async getLatestPrice(tokenId: string): Promise<OpinionPrice | null> {
    return opinionCircuit.execute(async () => {
      await opinionRateLimiter.acquire();

      const response = await withRetry(() =>
        fetch(
          `${OPINION_API_BASE}/token/latest-price?token_id=${tokenId}`,
          {
            headers: this.getHeaders(),
          }
        )
      );

      if (!response.ok) {
        throw new Error(`Opinion API error: ${response.status}`);
      }

      const data = await response.json();
      const validated = safeValidateOpinion(
        data,
        OpinionPriceResponseSchema,
        'getLatestPrice'
      );

      if (validated && validated.code === 0 && validated.result) {
        return validated.result as OpinionPrice;
      }

      return data?.result || null;
    });
  }

  /**
   * Get price for a market (with caching)
   */
  async getMarketPrice(market: OpinionMarket): Promise<number> {
    const cacheKey = market.yesTokenId;
    const cached = this.priceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.priceCacheTTL) {
      return cached.price;
    }

    try {
      const priceData = await this.getLatestPrice(market.yesTokenId);
      if (priceData) {
        const price = parseFloat(priceData.price) * 100; // Convert to percentage
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }
    } catch (error) {
      console.warn(`[Opinion] Failed to fetch price for ${market.marketId}:`, error);
    }

    // Default to 50% if price fetch fails
    return 50;
  }

  /**
   * Get price history for a token
   */
  async getPriceHistory(
    tokenId: string,
    interval: string = '1d'
  ): Promise<Array<{ price: string; timestamp: number }>> {
    return opinionCircuit.execute(async () => {
      await opinionRateLimiter.acquire();

      const params = new URLSearchParams({
        token_id: tokenId,
        interval,
      });

      const response = await withRetry(() =>
        fetch(`${OPINION_API_BASE}/token/price-history?${params}`, {
          headers: this.getHeaders(),
        })
      );

      if (!response.ok) {
        throw new Error(`Opinion API error: ${response.status}`);
      }

      const data = await response.json();
      const validated = safeValidateOpinion(
        data,
        OpinionPriceHistoryResponseSchema,
        'getPriceHistory'
      );

      if (validated && validated.code === 0 && validated.result) {
        return validated.result.prices;
      }

      return data?.result?.prices || [];
    });
  }

  // ============================================
  // WHALE TRACKING
  // ============================================

  /**
   * Detect whale trades from price history changes
   * Note: Opinion API doesn't expose individual trades,
   * so we estimate from large price movements
   */
  async detectWhaleTrades(
    market: OpinionMarket,
    thresholdUsd: number = WHALE_THRESHOLD
  ): Promise<WhaleTrade[]> {
    // Opinion doesn't expose trade history, return empty for now
    // This could be enhanced with WebSocket data if available
    return [];
  }

  // ============================================
  // NORMALIZATION
  // ============================================

  /**
   * Convert Opinion market to unified format
   */
  async normalizeMarket(opinion: OpinionMarket): Promise<UnifiedMarket> {
    // Map Opinion status to unified status
    const statusMap: Record<number, ExternalMarketStatus> = {
      [OPINION_STATUS.CREATED]: ExternalMarketStatus.UNOPENED,
      [OPINION_STATUS.ACTIVATED]: ExternalMarketStatus.ACTIVE,
      [OPINION_STATUS.RESOLVING]: ExternalMarketStatus.CLOSED,
      [OPINION_STATUS.RESOLVED]: ExternalMarketStatus.RESOLVED,
      [OPINION_STATUS.FAILED]: ExternalMarketStatus.CLOSED,
      [OPINION_STATUS.DELETED]: ExternalMarketStatus.CLOSED,
    };

    // Get current price
    const yesPrice = await this.getMarketPrice(opinion);
    const noPrice = 100 - yesPrice;

    return {
      id: `opinion_${opinion.marketId}`,
      source: MarketSource.OPINION,
      externalId: opinion.marketId.toString(),

      question: opinion.marketTitle,
      description: undefined, // Opinion doesn't provide descriptions in market list
      category: undefined,
      tags: opinion.chainId ? [opinion.chainId] : undefined,

      yesPrice: Math.round(yesPrice * 100) / 100,
      noPrice: Math.round(noPrice * 100) / 100,

      volume: opinion.volume || '0',
      liquidity: '0', // Opinion doesn't expose liquidity

      endTime: opinion.cutoffAt ? new Date(opinion.cutoffAt).getTime() : 0,
      createdAt: opinion.createdAt ? new Date(opinion.createdAt).getTime() : Date.now(),

      status: statusMap[opinion.status] || ExternalMarketStatus.UNOPENED,
      outcome: opinion.status === OPINION_STATUS.RESOLVED
        ? undefined // Would need to check resolution data
        : undefined,

      sourceUrl: `https://opinion.trade/market/${opinion.marketId}`,
      sourceMetadata: {
        chainId: opinion.chainId,
        yesTokenId: opinion.yesTokenId,
        noTokenId: opinion.noTokenId,
        marketType: opinion.marketType,
        quoteToken: opinion.quoteToken,
        volume24h: opinion.volume24h,
        volume7d: opinion.volume7d,
      },

      lastSyncAt: Date.now(),
    };
  }

  /**
   * Normalize multiple markets
   * Note: This is async because we fetch prices
   */
  async normalizeMarkets(markets: OpinionMarket[]): Promise<UnifiedMarket[]> {
    const results: UnifiedMarket[] = [];

    // Process in batches to avoid rate limiting
    for (const market of markets) {
      try {
        const normalized = await this.normalizeMarket(market);
        results.push(normalized);
      } catch (error) {
        console.warn(`[Opinion] Failed to normalize market ${market.marketId}:`, error);
      }
    }

    return results;
  }

  /**
   * Normalize market without fetching price (faster, for bulk sync)
   */
  normalizeMarketSync(opinion: OpinionMarket, yesPrice: number = 50): UnifiedMarket {
    const statusMap: Record<number, ExternalMarketStatus> = {
      [OPINION_STATUS.CREATED]: ExternalMarketStatus.UNOPENED,
      [OPINION_STATUS.ACTIVATED]: ExternalMarketStatus.ACTIVE,
      [OPINION_STATUS.RESOLVING]: ExternalMarketStatus.CLOSED,
      [OPINION_STATUS.RESOLVED]: ExternalMarketStatus.RESOLVED,
      [OPINION_STATUS.FAILED]: ExternalMarketStatus.CLOSED,
      [OPINION_STATUS.DELETED]: ExternalMarketStatus.CLOSED,
    };

    const noPrice = 100 - yesPrice;

    return {
      id: `opinion_${opinion.marketId}`,
      source: MarketSource.OPINION,
      externalId: opinion.marketId.toString(),

      question: opinion.marketTitle,
      description: undefined,
      category: undefined,
      tags: opinion.chainId ? [opinion.chainId] : undefined,

      yesPrice: Math.round(yesPrice * 100) / 100,
      noPrice: Math.round(noPrice * 100) / 100,

      volume: opinion.volume || '0',
      liquidity: '0',

      endTime: opinion.cutoffAt ? new Date(opinion.cutoffAt).getTime() : 0,
      createdAt: opinion.createdAt ? new Date(opinion.createdAt).getTime() : Date.now(),

      status: statusMap[opinion.status] || ExternalMarketStatus.UNOPENED,
      outcome: undefined,

      sourceUrl: `https://opinion.trade/market/${opinion.marketId}`,
      sourceMetadata: {
        chainId: opinion.chainId,
        yesTokenId: opinion.yesTokenId,
        noTokenId: opinion.noTokenId,
        marketType: opinion.marketType,
        quoteToken: opinion.quoteToken,
        volume24h: opinion.volume24h,
        volume7d: opinion.volume7d,
      },

      lastSyncAt: Date.now(),
    };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Check if service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const markets = await this.getActiveMarkets(1, 1);
      return markets.length >= 0;
    } catch {
      return false;
    }
  }

  /**
   * Clear price cache
   */
  clearPriceCache(): void {
    this.priceCache.clear();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const opinionService = new OpinionService();
export default opinionService;
