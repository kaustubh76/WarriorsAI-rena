/**
 * Kalshi API Integration Service
 *
 * Provides integration with Kalshi prediction markets API.
 * Kalshi is a US-regulated prediction market platform.
 *
 * API Documentation: https://trading-api.readme.io/reference/getting-started
 */

interface KalshiMarket {
  ticker: string;
  title: string;
  category: string;
  close_time: string;
  expiration_time: string;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  volume: number;
  open_interest: number;
  liquidity: number;
  result?: 'yes' | 'no';
  status: 'open' | 'closed' | 'settled';
}

interface KalshiTrade {
  ticker: string;
  side: 'yes' | 'no';
  price: number;
  count: number;
  created_time: string;
}

interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  series_ticker: string;
  markets: KalshiMarket[];
}

export class KalshiService {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;

  constructor() {
    this.baseUrl = process.env.KALSHI_API_URL || 'https://trading-api.kalshi.com/trade-api/v2';
    this.apiKey = process.env.KALSHI_API_KEY;
    this.apiSecret = process.env.KALSHI_API_SECRET;
  }

  /**
   * Get authentication headers if API credentials are configured
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.apiKey && this.apiSecret) {
      // Kalshi uses Basic Auth with API key and secret
      const credentials = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }

  /**
   * Fetch active markets from Kalshi
   *
   * @param options - Filter options
   * @returns Array of active Kalshi markets
   */
  async getMarkets(options?: {
    category?: string;
    limit?: number;
    cursor?: string;
  }): Promise<KalshiMarket[]> {
    try {
      const params = new URLSearchParams();
      if (options?.category) params.append('category', options.category);
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.cursor) params.append('cursor', options.cursor);
      params.append('status', 'open'); // Only active markets

      const url = `${this.baseUrl}/markets?${params.toString()}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.markets || [];
    } catch (error) {
      console.error('[KalshiService] Error fetching markets:', error);
      throw error;
    }
  }

  /**
   * Get a specific market by ticker
   *
   * @param ticker - Market ticker (e.g., "BIDEN-2024-WINS")
   * @returns Market details or null if not found
   */
  async getMarket(ticker: string): Promise<KalshiMarket | null> {
    try {
      const url = `${this.baseUrl}/markets/${ticker}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.market || null;
    } catch (error) {
      console.error('[KalshiService] Error fetching market:', error);
      throw error;
    }
  }

  /**
   * Get recent trades for a market
   *
   * @param ticker - Market ticker
   * @param limit - Number of trades to fetch (default: 100)
   * @returns Array of recent trades
   */
  async getMarketTrades(ticker: string, limit: number = 100): Promise<KalshiTrade[]> {
    try {
      const url = `${this.baseUrl}/markets/${ticker}/trades?limit=${limit}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.trades || [];
    } catch (error) {
      console.error('[KalshiService] Error fetching market trades:', error);
      throw error;
    }
  }

  /**
   * Get market orderbook (bid/ask prices)
   *
   * @param ticker - Market ticker
   * @returns Orderbook data with bids and asks
   */
  async getMarketOrderbook(ticker: string): Promise<{
    yes: { price: number; size: number }[];
    no: { price: number; size: number }[];
  }> {
    try {
      const url = `${this.baseUrl}/markets/${ticker}/orderbook`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        yes: data.yes || [],
        no: data.no || [],
      };
    } catch (error) {
      console.error('[KalshiService] Error fetching orderbook:', error);
      throw error;
    }
  }

  /**
   * Get event details (collection of related markets)
   *
   * @param eventTicker - Event ticker (e.g., "PRES-2024")
   * @returns Event details with all associated markets
   */
  async getEvent(eventTicker: string): Promise<KalshiEvent | null> {
    try {
      const url = `${this.baseUrl}/events/${eventTicker}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.event || null;
    } catch (error) {
      console.error('[KalshiService] Error fetching event:', error);
      throw error;
    }
  }

  /**
   * Convert Kalshi market to ExternalMarketMirror format
   *
   * @param kalshiMarket - Kalshi market object
   * @returns Standardized market format for mirroring
   */
  convertToMirrorFormat(kalshiMarket: KalshiMarket): {
    externalId: string;
    title: string;
    yesPrice: number;
    noPrice: number;
    volume: bigint;
    liquidity: bigint;
    resolvedOutcome?: boolean;
    isResolved: boolean;
  } {
    // Kalshi uses mid-price between bid and ask
    const yesPrice = (kalshiMarket.yes_bid + kalshiMarket.yes_ask) / 2;
    const noPrice = (kalshiMarket.no_bid + kalshiMarket.no_ask) / 2;

    // Convert to cents (Kalshi prices are 0-100)
    const yesPriceCents = Math.round(yesPrice * 100);
    const noPriceCents = Math.round(noPrice * 100);

    // Convert volume to wei (assuming 18 decimals)
    const volumeWei = BigInt(Math.round(kalshiMarket.volume * 1e18));
    const liquidityWei = BigInt(Math.round(kalshiMarket.liquidity * 1e18));

    return {
      externalId: `kalshi:${kalshiMarket.ticker}`,
      title: kalshiMarket.title,
      yesPrice: yesPriceCents,
      noPrice: noPriceCents,
      volume: volumeWei,
      liquidity: liquidityWei,
      resolvedOutcome: kalshiMarket.result === 'yes' ? true : kalshiMarket.result === 'no' ? false : undefined,
      isResolved: kalshiMarket.status === 'settled',
    };
  }

  /**
   * Search markets by query string
   *
   * @param query - Search query
   * @param limit - Maximum number of results
   * @returns Array of matching markets
   */
  async searchMarkets(query: string, limit: number = 20): Promise<KalshiMarket[]> {
    try {
      const url = `${this.baseUrl}/markets?limit=${limit}&status=open`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const markets = data.markets || [];

      // Filter by query (Kalshi API doesn't have native search)
      const queryLower = query.toLowerCase();
      return markets.filter((market: KalshiMarket) =>
        market.title.toLowerCase().includes(queryLower) ||
        market.ticker.toLowerCase().includes(queryLower)
      );
    } catch (error) {
      console.error('[KalshiService] Error searching markets:', error);
      throw error;
    }
  }

  /**
   * Get trending markets (by volume)
   *
   * @param limit - Number of markets to return
   * @returns Array of trending markets sorted by volume
   */
  async getTrendingMarkets(limit: number = 10): Promise<KalshiMarket[]> {
    try {
      const markets = await this.getMarkets({ limit: 100 });

      // Sort by volume descending
      return markets
        .sort((a, b) => b.volume - a.volume)
        .slice(0, limit);
    } catch (error) {
      console.error('[KalshiService] Error fetching trending markets:', error);
      throw error;
    }
  }

  /**
   * Check if Kalshi API is configured and accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/exchange/status`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      return response.ok;
    } catch (error) {
      console.error('[KalshiService] Health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const kalshiService = new KalshiService();
