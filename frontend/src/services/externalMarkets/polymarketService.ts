/**
 * Polymarket Service
 * Integrates with Polymarket APIs for market data and trading
 *
 * APIs:
 * - Gamma API (https://gamma-api.polymarket.com) - Market discovery & metadata
 * - CLOB API (https://clob.polymarket.com) - Trading, orderbooks, prices
 * - WebSocket (wss://ws-subscriptions-clob.polymarket.com) - Real-time updates
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
  private wsConnection: WebSocket | null = null;
  private priceCallbacks: Map<string, ((price: number) => void)[]> = new Map();

  // ============================================
  // MARKET DATA (Gamma API)
  // ============================================

  /**
   * Get active markets from Polymarket
   */
  async getActiveMarkets(
    limit: number = 100,
    offset: number = 0
  ): Promise<PolymarketMarket[]> {
    return polymarketCircuit.execute(async () => {
      await polymarketRateLimiter.acquire();

      const response = await withRetry(() =>
        fetch(
          `${GAMMA_API_BASE}/markets?` +
            new URLSearchParams({
              limit: limit.toString(),
              offset: offset.toString(),
              active: 'true',
              closed: 'false',
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
   * Get a single market by condition ID
   */
  async getMarket(conditionId: string): Promise<PolymarketMarket | null> {
    return polymarketCircuit.execute(async () => {
      await polymarketRateLimiter.acquire();

      const response = await withRetry(() =>
        fetch(`${GAMMA_API_BASE}/markets/${conditionId}`)
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
      }

      return response.json();
    });
  }

  /**
   * Search markets by query
   */
  async searchMarkets(query: string): Promise<PolymarketMarket[]> {
    return polymarketCircuit.execute(async () => {
      await polymarketRateLimiter.acquire();

      const response = await withRetry(() =>
        fetch(
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
        fetch(
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
        fetch(`${CLOB_API_BASE}/book?token_id=${tokenId}`)
      );

      if (!response.ok) {
        throw new Error(`CLOB API error: ${response.status}`);
      }

      return response.json();
    });
  }

  /**
   * Get midpoint price for a token
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const orderbook = await this.getOrderbook(tokenId);

    const bestBid = orderbook.bids[0]?.price
      ? parseFloat(orderbook.bids[0].price)
      : 0;
    const bestAsk = orderbook.asks[0]?.price
      ? parseFloat(orderbook.asks[0].price)
      : 1;

    return (bestBid + bestAsk) / 2;
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
        fetch(
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
   */
  connectPriceStream(
    tokenIds: string[],
    callback: (tokenId: string, price: number) => void
  ): void {
    if (this.wsConnection) {
      this.disconnectPriceStream();
    }

    try {
      this.wsConnection = new WebSocket(WS_BASE);

      this.wsConnection.onopen = () => {
        console.log('[Polymarket WS] Connected');

        // Subscribe to price channels for each token
        for (const tokenId of tokenIds) {
          this.wsConnection?.send(
            JSON.stringify({
              type: 'subscribe',
              channel: 'market',
              markets: [tokenId],
            })
          );

          // Store callback for this token
          if (!this.priceCallbacks.has(tokenId)) {
            this.priceCallbacks.set(tokenId, []);
          }
          this.priceCallbacks.get(tokenId)!.push((price) =>
            callback(tokenId, price)
          );
        }
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'price_change' && data.asset_id) {
            const callbacks = this.priceCallbacks.get(data.asset_id);
            if (callbacks) {
              const price = parseFloat(data.price);
              callbacks.forEach((cb) => cb(price));
            }
          }
        } catch (error) {
          console.error('[Polymarket WS] Error parsing message:', error);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('[Polymarket WS] Error:', error);
      };

      this.wsConnection.onclose = () => {
        console.log('[Polymarket WS] Disconnected');
        this.wsConnection = null;
      };
    } catch (error) {
      console.error('[Polymarket WS] Connection error:', error);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectPriceStream(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
      this.priceCallbacks.clear();
    }
  }

  // ============================================
  // NORMALIZATION
  // ============================================

  /**
   * Convert Polymarket market to unified format
   */
  normalizeMarket(poly: PolymarketMarket): UnifiedMarket {
    // Parse outcome prices
    const yesPriceStr = poly.outcomePrices?.[0] || '0.5';
    const noPriceStr = poly.outcomePrices?.[1] || '0.5';
    const yesPrice = parseFloat(yesPriceStr) * 100;
    const noPrice = parseFloat(noPriceStr) * 100;

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

      endTime: new Date(poly.endDate).getTime(),
      createdAt: new Date(poly.startDate).getTime(),

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
      const response = await fetch(`${GAMMA_API_BASE}/markets?limit=1`);
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
