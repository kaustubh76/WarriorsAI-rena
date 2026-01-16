/**
 * Kalshi Service
 * Integrates with Kalshi Trade API for market data and trading
 *
 * API: https://api.elections.kalshi.com/trade-api/v2
 * Docs: https://docs.kalshi.com
 *
 * Authentication: API key + JWT (30-min expiry with auto-refresh)
 *
 * Robustness Features:
 * - Schema validation with Zod
 * - Adaptive rate limiting with header parsing
 * - Automatic token refresh
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

// ============================================
// CONSTANTS
// ============================================

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const WHALE_THRESHOLD = 10000; // $10k USD

// ============================================
// TYPES
// ============================================

interface KalshiAuthResponse {
  token: string;
  member_id: string;
}

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
  // Legacy auth state (kept for backward compatibility)
  private authToken: string | null = null;
  private tokenExpiry: number = 0;
  private memberId: string | null = null;

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Authenticate with Kalshi API using API key
   * Uses the robust KalshiAuthManager with auto-refresh
   * Note: For server-side use only - never expose API keys client-side
   */
  async authenticate(apiKeyId: string, privateKey: string): Promise<void> {
    // Use the robust auth manager
    kalshiAuth.setCredentials({ apiKeyId, privateKey });
    await kalshiAuth.authenticate();

    // Also set legacy state for backward compatibility
    const token = await kalshiAuth.getValidToken();
    this.authToken = token;
    this.memberId = kalshiAuth.getUserId();
    this.tokenExpiry = Date.now() + 25 * 60 * 1000;
  }

  /**
   * Refresh token if expired (now uses robust auth manager)
   */
  async refreshToken(): Promise<void> {
    if (!kalshiAuth.hasCredentials()) {
      throw new Error('No credentials configured - please authenticate first');
    }

    // Auth manager handles refresh automatically
    await kalshiAuth.authenticate();

    // Update legacy state
    this.authToken = await kalshiAuth.getValidToken();
    this.tokenExpiry = Date.now() + 25 * 60 * 1000;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return kalshiAuth.isAuthenticated();
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Get authorization headers using robust auth manager
   * Preferred method for new code
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    if (kalshiAuth.isAuthenticated()) {
      return kalshiAuth.getAuthHeaders();
    }
    return this.getHeaders();
  }

  // ============================================
  // MARKET DATA (Public - No Auth Required)
  // ============================================

  /**
   * Get markets from Kalshi
   * Uses adaptive rate limiting and schema validation
   */
  async getMarkets(
    status?: string,
    limit: number = 100,
    cursor?: string
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

          const response = await withRetry(() =>
            fetch(`${KALSHI_API_BASE}/markets?${params}`, {
              headers: this.getHeaders(),
            })
          );

          kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

          if (!response.ok) {
            throw new Error(`Kalshi API error: ${response.status}`);
          }

          const data = await response.json();

          // Validate response (soft validation)
          const validated = safeValidateKalshi(
            data,
            KalshiMarketsResponseSchema,
            'getMarkets'
          );

          return validated || data;
        });
      },
      { status, limit }
    );
  }

  /**
   * Get all active markets with pagination
   */
  async getActiveMarkets(maxMarkets: number = 500): Promise<KalshiMarket[]> {
    const allMarkets: KalshiMarket[] = [];
    let cursor: string | undefined;

    while (allMarkets.length < maxMarkets) {
      const response = await this.getMarkets('open', 100, cursor);
      allMarkets.push(...response.markets);

      if (!response.cursor || response.markets.length === 0) {
        break;
      }

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

      const response = await withRetry(() =>
        fetch(`${KALSHI_API_BASE}/markets/${ticker}`, {
          headers: this.getHeaders(),
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
   * Search markets
   */
  async searchMarkets(query: string): Promise<KalshiMarket[]> {
    // Kalshi doesn't have a direct search API, so we filter locally
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

      const response = await withRetry(() =>
        fetch(`${KALSHI_API_BASE}/markets/${ticker}/orderbook`, {
          headers: this.getHeaders(),
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
    if (!market) return 0.5;

    // Use yes_bid and yes_ask for midpoint
    return (market.yes_bid + market.yes_ask) / 200; // Convert cents to decimal
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

      const response = await withRetry(() =>
        fetch(
          `${KALSHI_API_BASE}/markets/${ticker}/trades?limit=${limit}`,
          {
            headers: this.getHeaders(),
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
      // Kalshi price is in cents (0-100)
      const price = trade.price / 100;
      // Count is number of contracts, each contract is $1 at settlement
      const amountUsd = trade.count * price;

      if (amountUsd >= thresholdUsd) {
        whaleTrades.push({
          id: trade.trade_id,
          source: MarketSource.KALSHI,
          marketId: `kalshi_${ticker}`,
          marketQuestion: market.title,
          traderAddress: undefined, // Kalshi doesn't expose trader addresses
          side: trade.taker_side === 'yes' ? 'buy' : 'sell',
          outcome: trade.side,
          amountUsd: amountUsd.toFixed(2),
          shares: trade.count.toString(),
          price: trade.price * 100, // Store as basis points
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
    // Kalshi prices are in cents (0-100)
    const yesPrice = kalshi.yes_bid
      ? (kalshi.yes_bid + kalshi.yes_ask) / 2
      : kalshi.last_price;
    const noPrice = 100 - yesPrice;

    // Determine status
    let status: ExternalMarketStatus;
    switch (kalshi.status) {
      case 'open':
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
      createdAt: Date.now(), // Kalshi doesn't expose creation time

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

      const response = await withRetry(() =>
        fetch(`${KALSHI_API_BASE}/events?${params}`, {
          headers: this.getHeaders(),
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

  /**
   * Get trading service for order management
   * Use this for placing/canceling orders
   */
  get trading() {
    return kalshiTrading;
  }

  // ============================================
  // WEBSOCKET (via kalshiWS)
  // ============================================

  /**
   * Subscribe to orderbook updates
   */
  subscribeToOrderbook(
    ticker: string,
    callback: (msg: KalshiWSMessage) => void
  ): () => void {
    return kalshiWS.subscribeToOrderbook(ticker, callback);
  }

  /**
   * Subscribe to trade updates
   */
  subscribeToTrades(
    ticker: string,
    callback: (msg: KalshiWSMessage) => void
  ): () => void {
    return kalshiWS.subscribeToTrades(ticker, callback);
  }

  /**
   * Connect to WebSocket
   */
  async connectWebSocket(): Promise<void> {
    return kalshiWS.connect();
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    kalshiWS.disconnect();
  }

  /**
   * Check WebSocket connection state
   */
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
