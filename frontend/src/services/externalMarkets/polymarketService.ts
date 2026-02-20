/**
 * Polymarket Service
 * Integrates with Polymarket APIs for market data and trading
 *
 * APIs:
 * - Gamma API (https://gamma-api.polymarket.com) - Market discovery & metadata
 * - CLOB API (https://clob.polymarket.com) - Trading, orderbooks, prices
 * - WebSocket (wss://ws-subscriptions-clob.polymarket.com) - Real-time updates
 *
 * Robustness Features:
 * - Schema validation with Zod
 * - Adaptive rate limiting
 * - Production-ready WebSocket with reconnection
 * - Monitoring integration
 */

import {
  UnifiedMarket,
  MarketSource,
  ExternalMarketStatus,
  PolymarketMarket,
  PolymarketOrderbook,
  PolymarketTrade,
  WhaleTrade,
} from '@/types/externalMarket';
import {
  polymarketRateLimiter,
  polymarketCircuit,
  withRetry,
} from '@/lib/rateLimiter';
import { polymarketAdaptiveRateLimiter } from '@/lib/adaptiveRateLimiter';
import { polymarketWS, type PriceCallback } from './polymarketWebSocket';
import { monitoredCall } from './monitoring';
import {
  PolymarketMarketsResponseSchema,
  PolymarketMarketSchema,
  PolymarketOrderbookSchema,
  PolymarketTradesResponseSchema,
  safeValidatePolymarket,
} from './schemas/polymarketSchemas';
import { fetchWithTimeout } from './utils';

// ============================================
// CONSTANTS
// ============================================

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const CLOB_API_BASE = 'https://clob.polymarket.com';
const WS_BASE = 'wss://ws-subscriptions-clob.polymarket.com';

const WHALE_THRESHOLD = 10000; // $10k USD

// ============================================
// POLYMARKET SERVICE CLASS
// ============================================

class PolymarketService {
  // Legacy WebSocket (kept for backward compatibility)
  private wsConnection: WebSocket | null = null;
  private priceCallbacks: Map<string, ((price: number) => void)[]> = new Map();

  // ============================================
  // MARKET DATA (Gamma API)
  // ============================================

  /**
   * Get active markets from Polymarket
   * Uses schema validation and adaptive rate limiting
   */
  async getActiveMarkets(
    limit: number = 100,
    offset: number = 0
  ): Promise<PolymarketMarket[]> {
    return monitoredCall(
      'polymarket',
      'getActiveMarkets',
      async () => {
        return polymarketCircuit.execute(async () => {
          await polymarketAdaptiveRateLimiter.acquire();

          const response = await withRetry(() =>
            fetchWithTimeout(
              `${GAMMA_API_BASE}/markets?` +
                new URLSearchParams({
                  limit: limit.toString(),
                  offset: offset.toString(),
                  active: 'true',
                  closed: 'false',
                })
            )
          );

          polymarketAdaptiveRateLimiter.updateFromHeaders(response.headers);

          if (!response.ok) {
            throw new Error(`Polymarket API error: ${response.status}`);
          }

          const data = await response.json();

          // Gamma API returns a direct array; validate each market individually
          const markets = Array.isArray(data) ? data : data.markets || [];
          const validated: PolymarketMarket[] = [];
          for (const m of markets) {
            const result = safeValidatePolymarket(m, PolymarketMarketSchema, 'getActiveMarkets');
            if (result) {
              validated.push(result as unknown as PolymarketMarket);
            } else {
              console.warn('[getActiveMarkets] Dropping invalid market item:', (m as any)?.conditionId || 'unknown');
            }
          }
          return validated;
        });
      },
      { limit, offset }
    );
  }

  /**
   * Get a single market by condition ID
   * Uses the CLOB API which properly supports condition ID lookups
   */
  async getMarket(conditionId: string): Promise<PolymarketMarket | null> {
    return monitoredCall(
      'polymarket',
      'getMarket',
      async () => {
        return polymarketCircuit.execute(async () => {
          await polymarketAdaptiveRateLimiter.acquire();

          const response = await withRetry(() =>
            fetchWithTimeout(`${CLOB_API_BASE}/markets/${conditionId}`)
          );

          polymarketAdaptiveRateLimiter.updateFromHeaders(response.headers);

          if (response.status === 404) {
            return null;
          }

          if (!response.ok) {
            throw new Error(`Polymarket API error: ${response.status}`);
          }

          const data = await response.json();

          // Map CLOB API response to PolymarketMarket shape
          const mapped = {
            id: data.condition_id || conditionId,
            conditionId: data.condition_id || conditionId,
            question: data.question || '',
            description: data.description || '',
            slug: data.market_slug || '',
            outcomes: data.tokens?.map((t: any) => t.outcome) || ['Yes', 'No'],
            outcomePrices: data.tokens?.map((t: any) => String(t.price ?? '0')) || ['0', '0'],
            clobTokenIds: data.tokens?.map((t: any) => t.token_id) || [],
            active: data.active ?? false,
            closed: data.closed ?? false,
            resolved: data.closed === true && data.tokens?.some((t: any) => t.winner === true),
            volume: '0',
            volumeNum: 0,
            liquidity: '0',
            liquidityNum: 0,
            startDate: '',
            endDate: data.end_date_iso || '',
            image: data.image || '',
            icon: data.icon || '',
            category: data.tags?.[0] || '',
            tags: data.tags || [],
            // Carry CLOB tokens for outcome resolution
            _clobTokens: data.tokens,
          } as PolymarketMarket & { _clobTokens?: any[] };

          return mapped;
        });
      },
      { conditionId }
    );
  }

  /**
   * Get market outcome for a resolved market
   * Fetches market details and determines which outcome won
   */
  async getMarketOutcome(conditionId: string): Promise<{
    resolved: boolean;
    outcome?: 'yes' | 'no';
    resolvedAt?: Date;
  }> {
    return monitoredCall(
      'polymarket',
      'getMarketOutcome',
      async () => {
        return polymarketCircuit.execute(async () => {
          const market = await this.getMarket(conditionId);

          if (!market) {
            return { resolved: false };
          }

          if (!market.resolved) {
            return { resolved: false };
          }

          // Determine outcome using CLOB token winner field if available
          let outcome: 'yes' | 'no' | undefined;

          const clobTokens = (market as any)._clobTokens;
          if (clobTokens && Array.isArray(clobTokens)) {
            const winnerToken = clobTokens.find((t: any) => t.winner === true);
            if (winnerToken) {
              outcome = winnerToken.outcome?.toLowerCase() === 'yes' ? 'yes' : 'no';
            }
          }

          // Fallback: infer from outcome prices (only for resolved/closed markets)
          if (!outcome && market.outcomes && market.outcomes.length >= 2) {
            const yesPriceStr = market.outcomePrices?.[0] || '0';
            const noPriceStr = market.outcomePrices?.[1] || '0';
            let yesPrice = parseFloat(yesPriceStr);
            let noPrice = parseFloat(noPriceStr);

            if (isNaN(yesPrice)) yesPrice = 0;
            if (isNaN(noPrice)) noPrice = 0;

            // Tighter thresholds (0.95/0.05) to reduce false inferences
            if (yesPrice > 0.95) {
              outcome = 'yes';
            } else if (noPrice > 0.95) {
              outcome = 'no';
            } else if (yesPrice < 0.05) {
              outcome = 'no';
            } else if (noPrice < 0.05) {
              outcome = 'yes';
            }

            if (outcome) {
              console.warn(
                `[getMarketOutcome] Used price-based fallback for ${conditionId}: ` +
                `yesPrice=${yesPrice}, noPrice=${noPrice} → ${outcome}`
              );
            }
          }

          const resolvedAt = market.endDate ? new Date(market.endDate) : undefined;

          return {
            resolved: true,
            outcome,
            resolvedAt,
          };
        });
      },
      { conditionId }
    );
  }

  /**
   * Search markets by query
   */
  async searchMarkets(query: string): Promise<PolymarketMarket[]> {
    return polymarketCircuit.execute(async () => {
      await polymarketRateLimiter.acquire();

      const response = await withRetry(() =>
        fetchWithTimeout(
          `${GAMMA_API_BASE}/markets?` +
            new URLSearchParams({
              search: query,
              active: 'true',
            })
        )
      );

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
      }

      return response.json();
    });
  }

  /**
   * Get markets by category/tag
   */
  async getMarketsByCategory(category: string): Promise<PolymarketMarket[]> {
    return polymarketCircuit.execute(async () => {
      await polymarketRateLimiter.acquire();

      const response = await withRetry(() =>
        fetchWithTimeout(
          `${GAMMA_API_BASE}/markets?` +
            new URLSearchParams({
              tag_id: category,
              active: 'true',
            })
        )
      );

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
      }

      return response.json();
    });
  }

  // ============================================
  // PRICING (CLOB API)
  // ============================================

  /**
   * Get orderbook for a token
   */
  async getOrderbook(tokenId: string): Promise<PolymarketOrderbook> {
    return polymarketCircuit.execute(async () => {
      await polymarketRateLimiter.acquire();

      const response = await withRetry(() =>
        fetchWithTimeout(`${CLOB_API_BASE}/book?token_id=${tokenId}`)
      );

      if (!response.ok) {
        throw new Error(`CLOB API error: ${response.status}`);
      }

      return response.json();
    });
  }

  /**
   * Get midpoint price for a token
   * @returns Price as 0-100 percentage (matching UnifiedMarket.yesPrice convention)
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const orderbook = await this.getOrderbook(tokenId);

    const bestBid = orderbook.bids[0]?.price
      ? parseFloat(orderbook.bids[0].price)
      : 0;
    const bestAsk = orderbook.asks[0]?.price
      ? parseFloat(orderbook.asks[0].price)
      : 1;

    // Polymarket prices are 0-1 decimals, convert to 0-100 percentage
    return ((bestBid + bestAsk) / 2) * 100;
  }

  /**
   * Get prices for multiple markets
   */
  async getPrices(
    tokenIds: string[]
  ): Promise<Map<string, { bid: number; ask: number; mid: number }>> {
    const prices = new Map<
      string,
      { bid: number; ask: number; mid: number }
    >();

    // Batch requests to respect rate limits
    for (const tokenId of tokenIds) {
      try {
        const orderbook = await this.getOrderbook(tokenId);
        const bid = orderbook.bids[0]?.price
          ? parseFloat(orderbook.bids[0].price)
          : 0;
        const ask = orderbook.asks[0]?.price
          ? parseFloat(orderbook.asks[0].price)
          : 1;

        prices.set(tokenId, {
          bid,
          ask,
          mid: (bid + ask) / 2,
        });
      } catch (error) {
        console.error(`Error fetching price for ${tokenId}:`, error);
      }
    }

    return prices;
  }

  // ============================================
  // TRADES & WHALE TRACKING
  // ============================================

  /**
   * Get recent trades for a market
   */
  async getRecentTrades(
    tokenId: string,
    limit: number = 100
  ): Promise<PolymarketTrade[]> {
    return polymarketCircuit.execute(async () => {
      await polymarketRateLimiter.acquire();

      const response = await withRetry(() =>
        fetchWithTimeout(
          `${CLOB_API_BASE}/trades?` +
            new URLSearchParams({
              asset_id: tokenId,
              limit: limit.toString(),
            })
        )
      );

      if (!response.ok) {
        throw new Error(`CLOB API error: ${response.status}`);
      }

      const data = await response.json();
      return data.trades || data;
    });
  }

  /**
   * Detect whale trades from recent trades
   */
  async detectWhaleTrades(
    tokenId: string,
    market: PolymarketMarket,
    thresholdUsd: number = WHALE_THRESHOLD
  ): Promise<WhaleTrade[]> {
    const trades = await this.getRecentTrades(tokenId);
    const whaleTrades: WhaleTrade[] = [];

    for (const trade of trades) {
      const price = parseFloat(trade.price);
      const size = parseFloat(trade.size);
      const amountUsd = price * size;

      if (amountUsd >= thresholdUsd) {
        whaleTrades.push({
          id: trade.id,
          source: MarketSource.POLYMARKET,
          marketId: `poly_${market.conditionId}`,
          marketQuestion: market.question,
          traderAddress: trade.taker,
          side: trade.side === 'BUY' ? 'buy' : 'sell',
          outcome: trade.outcome === 'Yes' ? 'yes' : 'no',
          amountUsd: amountUsd.toFixed(2),
          shares: size.toFixed(4),
          price: Math.round(price * 10000), // Store as basis points
          timestamp: new Date(trade.timestamp).getTime(),
          txHash: trade.transaction_hash,
        });
      }
    }

    return whaleTrades;
  }

  // ============================================
  // WEBSOCKET (Real-time Prices)
  // ============================================

  /**
   * Connect to WebSocket for real-time price updates
   * Uses robust WebSocket manager with reconnection support
   */
  connectPriceStream(
    tokenIds: string[],
    callback: (tokenId: string, price: number) => void
  ): void {
    // Disconnect legacy connection if exists
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    this.priceCallbacks.clear();

    // Use robust WebSocket manager
    polymarketWS.connect().then(() => {
      for (const tokenId of tokenIds) {
        const unsubscribe = polymarketWS.subscribe(tokenId, (data) => {
          if (data.price) {
            const price = parseFloat(data.price);
            callback(tokenId, price);
          } else if (data.last_price) {
            const price = parseFloat(data.last_price);
            callback(tokenId, price);
          }
        });

        // Store unsubscribe function (for backward compatibility tracking)
        if (!this.priceCallbacks.has(tokenId)) {
          this.priceCallbacks.set(tokenId, []);
        }
      }
    }).catch((err) => {
      console.error('[Polymarket] WebSocket connection failed:', err);
    });
  }

  /**
   * Connect using robust WebSocket with type-safe callback
   * Preferred method for new code
   */
  connectRobustPriceStream(
    tokenIds: string[],
    callback: PriceCallback
  ): () => void {
    const unsubscribers: (() => void)[] = [];

    polymarketWS.connect().then(() => {
      for (const tokenId of tokenIds) {
        const unsub = polymarketWS.subscribe(tokenId, callback);
        unsubscribers.push(unsub);
      }
    }).catch((err) => {
      console.error('[Polymarket] Robust WebSocket connection failed:', err);
    });

    // Return cleanup function
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnectPriceStream(): void {
    // Disconnect legacy
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    this.priceCallbacks.clear();

    // Disconnect robust WebSocket
    polymarketWS.disconnect();
  }

  /**
   * Check WebSocket connection state
   */
  isWebSocketConnected(): boolean {
    return polymarketWS.isConnected();
  }

  // ============================================
  // NORMALIZATION
  // ============================================

  /**
   * Convert Polymarket market to unified format
   */
  normalizeMarket(poly: PolymarketMarket): UnifiedMarket {
    // Parse outcome prices with validation
    const yesPriceStr = poly.outcomePrices?.[0] || '0.5';
    const noPriceStr = poly.outcomePrices?.[1] || '0.5';

    // Parse and validate - default to 50 if NaN or invalid
    let yesPrice = parseFloat(yesPriceStr) * 100;
    let noPrice = parseFloat(noPriceStr) * 100;

    // Handle NaN cases - default to 50/50
    if (isNaN(yesPrice) || !isFinite(yesPrice)) {
      yesPrice = 50;
    }
    if (isNaN(noPrice) || !isFinite(noPrice)) {
      noPrice = 50;
    }

    // Ensure prices are within valid range [0, 100]
    yesPrice = Math.max(0, Math.min(100, yesPrice));
    noPrice = Math.max(0, Math.min(100, noPrice));

    // Determine status
    let status: ExternalMarketStatus;
    if (poly.resolved) {
      status = ExternalMarketStatus.RESOLVED;
    } else if (poly.closed) {
      status = ExternalMarketStatus.CLOSED;
    } else if (poly.active) {
      status = ExternalMarketStatus.ACTIVE;
    } else {
      status = ExternalMarketStatus.UNOPENED;
    }

    return {
      id: `poly_${poly.conditionId}`,
      source: MarketSource.POLYMARKET,
      externalId: poly.conditionId,

      question: poly.question,
      description: poly.description,
      category: poly.category,
      tags: poly.tags,

      yesPrice: Math.round(yesPrice * 100) / 100,
      noPrice: Math.round(noPrice * 100) / 100,

      volume: poly.volume || '0',
      liquidity: poly.liquidity || '0',

      // Parse dates with validation - default to 1 year from now if invalid
      endTime: (() => {
        const date = new Date(poly.endDate);
        return isNaN(date.getTime()) ? Date.now() + 365 * 24 * 60 * 60 * 1000 : date.getTime();
      })(),
      createdAt: (() => {
        const date = new Date(poly.startDate);
        return isNaN(date.getTime()) ? Date.now() : date.getTime();
      })(),

      status,
      outcome: undefined, // Would need to resolve from outcomes array

      sourceUrl: `https://polymarket.com/event/${poly.slug}`,
      sourceMetadata: {
        conditionId: poly.conditionId,
        clobTokenIds: poly.clobTokenIds,
        outcomes: poly.outcomes,
        image: poly.image,
      },

      lastSyncAt: Date.now(),
    };
  }

  /**
   * Normalize multiple markets
   */
  normalizeMarkets(markets: PolymarketMarket[]): UnifiedMarket[] {
    return markets.map((m) => this.normalizeMarket(m));
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Check if service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(`${GAMMA_API_BASE}/markets?limit=1`, {}, 5000);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get YES token ID from market
   */
  getYesTokenId(market: PolymarketMarket): string | null {
    return market.clobTokenIds?.[0] || null;
  }

  /**
   * Get NO token ID from market
   */
  getNoTokenId(market: PolymarketMarket): string | null {
    return market.clobTokenIds?.[1] || null;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const polymarketService = new PolymarketService();
export default polymarketService;
