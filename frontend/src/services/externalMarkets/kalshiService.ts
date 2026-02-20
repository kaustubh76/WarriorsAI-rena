/**
 * Kalshi Service
 * Integrates with Kalshi Trade API for market data and trading
 *
 * API: https://api.elections.kalshi.com/trade-api/v2
 * Docs: https://docs.kalshi.com
 *
 * Authentication: RSA-PSS per-request signing (3 headers on every request)
 *
 * Robustness Features:
 * - Schema validation with Zod
 * - Adaptive rate limiting with header parsing
 * - RSA-PSS per-request signing
 * - Monitoring integration
 * - Full trading API support
 */

import {
  UnifiedMarket,
  MarketSource,
  ExternalMarketStatus,
  KalshiMarket,
  KalshiTrade,
  KalshiOrderbook,
  WhaleTrade,
} from '@/types/externalMarket';
import { kalshiRateLimiter, kalshiCircuit, withRetry } from '@/lib/rateLimiter';
import { kalshiAdaptiveRateLimiter } from '@/lib/adaptiveRateLimiter';
import { kalshiAuth } from './kalshiAuth';
import { kalshiTrading } from './kalshiTrading';
import { kalshiWS, type KalshiWSMessage } from './kalshiWebSocket';
import { monitoredCall } from './monitoring';
import {
  KalshiMarketsResponseSchema,
  KalshiMarketSchema,
  KalshiTradesResponseSchema,
  safeValidateKalshi,
} from './schemas/kalshiSchemas';
import { fetchWithTimeout } from './utils';

// ============================================
// CONSTANTS
// ============================================

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const WHALE_THRESHOLD = 10000; // $10k USD

// ============================================
// TYPES
// ============================================

interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

interface KalshiTradesResponse {
  trades: KalshiTrade[];
  cursor?: string;
}

// ============================================
// KALSHI SERVICE CLASS
// ============================================

class KalshiService {
  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Check if authenticated (credentials loaded)
   */
  isAuthenticated(): boolean {
    return kalshiAuth.isAuthenticated();
  }

  /**
   * Get signed headers for a request
   * @param method - HTTP method
   * @param path - API path (without query params)
   */
  private getSignedHeaders(method: string, path: string): Record<string, string> {
    if (!kalshiAuth.hasCredentials()) {
      // Return basic headers if no credentials (will fail with 401)
      return { 'Content-Type': 'application/json' };
    }
    return kalshiAuth.signRequest(method, path);
  }

  // ============================================
  // MARKET DATA
  // ============================================

  /**
   * Get markets from Kalshi
   * Uses adaptive rate limiting and schema validation
   */
  async getMarkets(
    status?: string,
    limit: number = 100,
    cursor?: string,
    seriesTicker?: string,
    eventTicker?: string
  ): Promise<KalshiMarketsResponse> {
    return monitoredCall(
      'kalshi',
      'getMarkets',
      async () => {
        return kalshiCircuit.execute(async () => {
          await kalshiAdaptiveRateLimiter.acquire();

          const params = new URLSearchParams({
            limit: limit.toString(),
          });

          if (status) params.append('status', status);
          if (cursor) params.append('cursor', cursor);
          if (seriesTicker) params.append('series_ticker', seriesTicker);
          if (eventTicker) params.append('event_ticker', eventTicker);

          // Sign with path only (no query params)
          const headers = this.getSignedHeaders('GET', '/trade-api/v2/markets');

          const response = await withRetry(() =>
            fetchWithTimeout(`${KALSHI_API_BASE}/markets?${params}`, {
              headers,
            })
          );

          kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

          if (!response.ok) {
            throw new Error(`Kalshi API error: ${response.status}`);
          }

          const data = await response.json();

          // Validate response
          const validated = safeValidateKalshi(
            data,
            KalshiMarketsResponseSchema,
            'getMarkets'
          );

          if (!validated) {
            throw new Error('Kalshi getMarkets: response failed schema validation');
          }

          return validated as unknown as KalshiMarketsResponse;
        });
      },
      { status, limit }
    );
  }

  /**
   * Get all active markets with pagination
   *
   * Strategy: Fetch events first, identify non-sports event tickers,
   * then fetch markets by event_ticker to avoid the KXMVE sports parlay
   * flood that dominates the unfiltered /markets endpoint.
   */
  async getActiveMarkets(maxMarkets: number = 500): Promise<KalshiMarket[]> {
    // Sports categories to exclude — these are parlay-heavy and don't match Polymarket
    const SPORTS_CATEGORIES = new Set(['Sports', 'Sports MVP']);

    // Phase 1: Get events and filter to non-sports
    let events: Array<{ event_ticker: string; category: string; title: string }>;
    try {
      const rawEvents = await this.getEvents('open', 200);
      events = (rawEvents as Array<{ event_ticker: string; category: string; title: string }>)
        .filter(e => !SPORTS_CATEGORIES.has(e.category));
      console.log(`[Kalshi] Found ${events.length} non-sports events (out of ${rawEvents.length} total)`);
    } catch (err) {
      console.error('[Kalshi] Failed to fetch events, falling back to direct market scan:', err);
      // Fallback: scan markets directly with parlay filter
      return this.getActiveMarketsFallback(maxMarkets);
    }

    if (events.length === 0) {
      console.log('[Kalshi] No non-sports events found');
      return [];
    }

    // Phase 2: Fetch markets by series_ticker (one series at a time)
    // Series tickers are derived from events (e.g., KXNEWPOPE from KXNEWPOPE-70)
    const allMarkets: KalshiMarket[] = [];
    const seriesTickers = [...new Set(events.map(e => e.series_ticker))];

    console.log(`[Kalshi] Fetching markets for ${seriesTickers.length} unique series: ${seriesTickers.slice(0, 10).join(', ')}...`);

    for (const series of seriesTickers) {
      if (allMarkets.length >= maxMarkets) break;

      try {
        const response = await this.getMarkets(undefined, 200, undefined, series);
        console.log(`[Kalshi] Series ${series}: ${response.markets.length} markets`);
        allMarkets.push(...response.markets);
      } catch (err) {
        console.error(`[Kalshi] Failed to fetch markets for series ${series}:`, err);
      }
    }

    console.log(`[Kalshi] Fetched ${allMarkets.length} non-sports markets from ${seriesTickers.length} series`);
    return allMarkets.slice(0, maxMarkets);
  }

  /**
   * Fallback: scan markets directly with parlay filter
   */
  private async getActiveMarketsFallback(maxMarkets: number): Promise<KalshiMarket[]> {
    const allMarkets: KalshiMarket[] = [];
    let cursor: string | undefined;
    let pagesScanned = 0;

    while (allMarkets.length < maxMarkets && pagesScanned < 30) {
      const response = await this.getMarkets('open', 200, cursor);
      pagesScanned++;

      for (const m of response.markets) {
        if (!m.ticker.startsWith('KXMVE') && !m.ticker.startsWith('KXSINGLEGAME')) {
          allMarkets.push(m);
        }
      }

      if (!response.cursor || response.markets.length === 0) break;
      cursor = response.cursor;
    }

    return allMarkets.slice(0, maxMarkets);
  }

  /**
   * Get a single market by ticker
   */
  async getMarket(ticker: string): Promise<KalshiMarket | null> {
    return kalshiCircuit.execute(async () => {
      await kalshiRateLimiter.acquire();

      const path = `/trade-api/v2/markets/${ticker}`;
      const headers = this.getSignedHeaders('GET', path);

      const response = await withRetry(() =>
        fetchWithTimeout(`${KALSHI_API_BASE}/markets/${ticker}`, {
          headers,
        })
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return data.market;
    });
  }

  /**
   * Get market with outcome details for resolved markets
   */
  async getMarketWithOutcome(ticker: string): Promise<{
    market: KalshiMarket | null;
    outcome?: 'yes' | 'no';
    resolvedAt?: Date;
  }> {
    return monitoredCall(
      'kalshi',
      'getMarketWithOutcome',
      async () => {
        const market = await this.getMarket(ticker);

        if (!market) {
          return { market: null };
        }

        if (market.status !== 'settled') {
          return { market, outcome: undefined };
        }

        let outcome: 'yes' | 'no' | undefined;
        if (market.result === 'yes') {
          outcome = 'yes';
        } else if (market.result === 'no') {
          outcome = 'no';
        }

        const resolvedAt = market.close_time ? new Date(market.close_time) : undefined;

        return {
          market,
          outcome,
          resolvedAt,
        };
      },
      { ticker }
    );
  }

  /**
   * Search markets
   */
  async searchMarkets(query: string): Promise<KalshiMarket[]> {
    const { markets } = await this.getMarkets('open', 500);

    const queryLower = query.toLowerCase();
    return markets.filter(
      (m) =>
        m.title.toLowerCase().includes(queryLower) ||
        m.subtitle?.toLowerCase().includes(queryLower) ||
        m.ticker.toLowerCase().includes(queryLower)
    );
  }

  // ============================================
  // PRICING
  // ============================================

  /**
   * Get orderbook for a market
   */
  async getOrderbook(ticker: string): Promise<KalshiOrderbook> {
    return kalshiCircuit.execute(async () => {
      await kalshiRateLimiter.acquire();

      const path = `/trade-api/v2/markets/${ticker}/orderbook`;
      const headers = this.getSignedHeaders('GET', path);

      const response = await withRetry(() =>
        fetchWithTimeout(`${KALSHI_API_BASE}/markets/${ticker}/orderbook`, {
          headers,
        })
      );

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return data.orderbook;
    });
  }

  /**
   * Get midpoint price for a market
   */
  async getMidpoint(ticker: string): Promise<number> {
    const market = await this.getMarket(ticker);
    if (!market) return 50;

    return (market.yes_bid + market.yes_ask) / 2;
  }

  // ============================================
  // TRADES & WHALE TRACKING
  // ============================================

  /**
   * Get recent trades for a market
   */
  async getTrades(
    ticker: string,
    limit: number = 100
  ): Promise<KalshiTradesResponse> {
    return kalshiCircuit.execute(async () => {
      await kalshiRateLimiter.acquire();

      const path = `/trade-api/v2/markets/${ticker}/trades`;
      const headers = this.getSignedHeaders('GET', path);

      const response = await withRetry(() =>
        fetchWithTimeout(
          `${KALSHI_API_BASE}/markets/${ticker}/trades?limit=${limit}`,
          {
            headers,
          }
        )
      );

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      return response.json();
    });
  }

  /**
   * Detect whale trades from recent trades
   */
  async detectWhaleTrades(
    ticker: string,
    market: KalshiMarket,
    thresholdUsd: number = WHALE_THRESHOLD
  ): Promise<WhaleTrade[]> {
    const { trades } = await this.getTrades(ticker);
    const whaleTrades: WhaleTrade[] = [];

    for (const trade of trades) {
      const price = trade.price / 100;
      const amountUsd = trade.count * price;

      if (amountUsd >= thresholdUsd) {
        whaleTrades.push({
          id: trade.trade_id,
          source: MarketSource.KALSHI,
          marketId: `kalshi_${ticker}`,
          marketQuestion: market.title,
          traderAddress: undefined,
          side: trade.taker_side === 'yes' ? 'buy' : 'sell',
          outcome: trade.side,
          amountUsd: amountUsd.toFixed(2),
          shares: trade.count.toString(),
          price: trade.price * 100,
          timestamp: new Date(trade.created_time).getTime(),
          txHash: undefined,
        });
      }
    }

    return whaleTrades;
  }

  // ============================================
  // NORMALIZATION
  // ============================================

  /**
   * Convert Kalshi market to unified format
   */
  normalizeMarket(kalshi: KalshiMarket): UnifiedMarket {
    // yes_bid defaults to 0 via Zod schema — use explicit null check, not truthy
    const hasBidAsk = kalshi.yes_bid != null && kalshi.yes_ask != null && (kalshi.yes_bid > 0 || kalshi.yes_ask < 100);
    const yesPrice = hasBidAsk
      ? (kalshi.yes_bid + kalshi.yes_ask) / 2
      : (kalshi.last_price ?? 50);  // fallback to 50 (even odds) if no price data
    const noPrice = 100 - yesPrice;

    let status: ExternalMarketStatus;
    switch (kalshi.status) {
      case 'open':
      case 'active':
        status = ExternalMarketStatus.ACTIVE;
        break;
      case 'closed':
        status = ExternalMarketStatus.CLOSED;
        break;
      case 'settled':
        status = ExternalMarketStatus.RESOLVED;
        break;
      default:
        status = ExternalMarketStatus.UNOPENED;
    }

    return {
      id: `kalshi_${kalshi.ticker}`,
      source: MarketSource.KALSHI,
      externalId: kalshi.ticker,

      question: kalshi.title,
      description: kalshi.subtitle,
      category: kalshi.category,
      tags: kalshi.series_ticker ? [kalshi.series_ticker] : undefined,

      yesPrice: Math.round(yesPrice * 100) / 100,
      noPrice: Math.round(noPrice * 100) / 100,

      volume: kalshi.volume.toString(),
      liquidity: kalshi.open_interest.toString(),

      endTime: new Date(kalshi.close_time).getTime(),
      createdAt: Date.now(),

      status,
      outcome: kalshi.result,

      sourceUrl: `https://kalshi.com/markets/${kalshi.ticker}`,
      sourceMetadata: {
        ticker: kalshi.ticker,
        eventTicker: kalshi.event_ticker,
        marketType: kalshi.market_type,
        volume24h: kalshi.volume_24h,
        openInterest: kalshi.open_interest,
        floorStrike: kalshi.floor_strike,
        capStrike: kalshi.cap_strike,
      },

      lastSyncAt: Date.now(),
    };
  }

  /**
   * Normalize multiple markets
   */
  normalizeMarkets(markets: KalshiMarket[]): UnifiedMarket[] {
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
      const { markets } = await this.getMarkets('open', 1);
      return markets.length >= 0;
    } catch {
      return false;
    }
  }

  /**
   * Get events (groups of related markets)
   */
  async getEvents(
    status?: string,
    limit: number = 50
  ): Promise<unknown[]> {
    return kalshiCircuit.execute(async () => {
      await kalshiRateLimiter.acquire();

      const params = new URLSearchParams({
        limit: limit.toString(),
      });

      if (status) params.append('status', status);

      const headers = this.getSignedHeaders('GET', '/trade-api/v2/events');

      const response = await withRetry(() =>
        fetchWithTimeout(`${KALSHI_API_BASE}/events?${params}`, {
          headers,
        })
      );

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      return data.events || [];
    });
  }

  // ============================================
  // TRADING API (via kalshiTrading)
  // ============================================

  get trading() {
    return kalshiTrading;
  }

  // ============================================
  // WEBSOCKET (via kalshiWS)
  // ============================================

  subscribeToOrderbook(
    ticker: string,
    callback: (msg: KalshiWSMessage) => void
  ): () => void {
    return kalshiWS.subscribeToOrderbook(ticker, callback);
  }

  subscribeToTrades(
    ticker: string,
    callback: (msg: KalshiWSMessage) => void
  ): () => void {
    return kalshiWS.subscribeToTrades(ticker, callback);
  }

  async connectWebSocket(): Promise<void> {
    return kalshiWS.connect();
  }

  disconnectWebSocket(): void {
    kalshiWS.disconnect();
  }

  isWebSocketConnected(): boolean {
    return kalshiWS.isConnected();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const kalshiService = new KalshiService();
export default kalshiService;

// Re-export related modules for convenience
export { kalshiAuth } from './kalshiAuth';
export { kalshiTrading, type KalshiOrderRequest } from './kalshiTrading';
export { kalshiWS, type KalshiWSMessage } from './kalshiWebSocket';
export {
  checkKalshiEligibility,
  requireKalshiEligibility,
  KalshiComplianceError,
} from './kalshiCompliance';
