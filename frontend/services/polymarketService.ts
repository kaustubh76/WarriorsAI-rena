/**
 * Polymarket API Integration Service
 *
 * Provides integration with Polymarket prediction markets API.
 * Polymarket is a decentralized information markets platform built on Polygon.
 *
 * API Documentation: https://docs.polymarket.com/
 */

interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  end_date_iso: string;
  game_start_time: string;
  question_id: string;
  market_slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  submitted_by: string;
  liquidity: string;
  volume_24hr: string;
}

interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  markets: PolymarketMarket[];
  icon: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
}

interface PolymarketTrade {
  id: string;
  market: string;
  asset_id: string;
  outcome: string;
  price: string;
  side: 'BUY' | 'SELL';
  size: string;
  timestamp: string;
  trader_address: string;
}

interface PolymarketOrderbook {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

export class PolymarketService {
  private readonly baseUrl: string;
  private readonly clobApiUrl: string;

  constructor() {
    this.baseUrl = process.env.POLYMARKET_API_URL || 'https://gamma-api.polymarket.com';
    this.clobApiUrl = process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com';
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Fetch active markets from Polymarket
   *
   * @param options - Filter options
   * @returns Array of active Polymarket markets
   */
  async getMarkets(options?: {
    limit?: number;
    offset?: number;
    active?: boolean;
    closed?: boolean;
  }): Promise<PolymarketMarket[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());
      if (options?.active !== undefined) params.append('active', options.active.toString());
      if (options?.closed !== undefined) params.append('closed', options.closed.toString());

      const url = `${this.baseUrl}/markets?${params.toString()}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
      }

      const markets = await response.json();
      return Array.isArray(markets) ? markets : [];
    } catch (error) {
      console.error('[PolymarketService] Error fetching markets:', error);
      throw error;
    }
  }

  /**
   * Get a specific market by ID
   *
   * @param marketId - Market ID or slug
   * @returns Market details or null if not found
   */
  async getMarket(marketId: string): Promise<PolymarketMarket | null> {
    try {
      const url = `${this.baseUrl}/markets/${marketId}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[PolymarketService] Error fetching market:', error);
      throw error;
    }
  }

  /**
   * Get recent trades for a market
   *
   * @param marketId - Market ID
   * @param limit - Number of trades to fetch
   * @returns Array of recent trades
   */
  async getMarketTrades(marketId: string, limit: number = 100): Promise<PolymarketTrade[]> {
    try {
      const url = `${this.clobApiUrl}/trades?market=${marketId}&limit=${limit}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Polymarket CLOB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('[PolymarketService] Error fetching market trades:', error);
      throw error;
    }
  }

  /**
   * Get market orderbook
   *
   * @param assetId - Asset/token ID for the outcome
   * @returns Orderbook data with bids and asks
   */
  async getOrderbook(assetId: string): Promise<PolymarketOrderbook> {
    try {
      const url = `${this.clobApiUrl}/book?token_id=${assetId}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Polymarket CLOB API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[PolymarketService] Error fetching orderbook:', error);
      throw error;
    }
  }

  /**
   * Get event details (collection of related markets)
   *
   * @param eventSlug - Event slug (e.g., "presidential-election-2024")
   * @returns Event details with all associated markets
   */
  async getEvent(eventSlug: string): Promise<PolymarketEvent | null> {
    try {
      const url = `${this.baseUrl}/events/${eventSlug}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[PolymarketService] Error fetching event:', error);
      throw error;
    }
  }

  /**
   * Convert Polymarket market to ExternalMarketMirror format
   *
   * @param polymarketMarket - Polymarket market object
   * @returns Standardized market format for mirroring
   */
  convertToMirrorFormat(polymarketMarket: PolymarketMarket): {
    externalId: string;
    title: string;
    yesPrice: number;
    noPrice: number;
    volume: bigint;
    liquidity: bigint;
    resolvedOutcome?: boolean;
    isResolved: boolean;
  } {
    // Polymarket uses binary outcomes: typically ["Yes", "No"]
    // outcomes and outcomePrices might be strings or arrays, handle both
    const outcomes = Array.isArray(polymarketMarket.outcomes)
      ? polymarketMarket.outcomes
      : typeof polymarketMarket.outcomes === 'string'
      ? JSON.parse(polymarketMarket.outcomes)
      : ['Yes', 'No'];

    const outcomePrices = Array.isArray(polymarketMarket.outcomePrices)
      ? polymarketMarket.outcomePrices
      : typeof polymarketMarket.outcomePrices === 'string'
      ? JSON.parse(polymarketMarket.outcomePrices)
      : ['0.5', '0.5'];

    // Find yes/no indices
    const yesIndex = outcomes.findIndex(
      (o: string) => o.toLowerCase() === 'yes' || o.toLowerCase() === 'true'
    );
    const noIndex = outcomes.findIndex(
      (o: string) => o.toLowerCase() === 'no' || o.toLowerCase() === 'false'
    );

    // Use index 0 for yes, 1 for no if not found
    const yesPriceDecimal = parseFloat(
      outcomePrices[yesIndex !== -1 ? yesIndex : 0] || '0.5'
    );
    const noPriceDecimal = parseFloat(
      outcomePrices[noIndex !== -1 ? noIndex : 1] || '0.5'
    );

    // Convert to cents (0-10000 for precision)
    const yesPriceCents = Math.round(yesPriceDecimal * 10000);
    const noPriceCents = Math.round(noPriceDecimal * 10000);

    // Convert volume and liquidity to wei (assuming USDC with 6 decimals)
    const volumeWei = BigInt(Math.round(parseFloat(polymarketMarket.volume || '0') * 1e6));
    const liquidityWei = BigInt(Math.round(parseFloat(polymarketMarket.liquidity || '0') * 1e6));

    return {
      externalId: `polymarket:${polymarketMarket.id}`,
      title: polymarketMarket.question,
      yesPrice: yesPriceCents,
      noPrice: noPriceCents,
      volume: volumeWei,
      liquidity: liquidityWei,
      resolvedOutcome: undefined, // Polymarket doesn't expose resolution in market object
      isResolved: polymarketMarket.closed && polymarketMarket.archived,
    };
  }

  /**
   * Search markets by query string
   *
   * @param query - Search query
   * @param limit - Maximum number of results
   * @returns Array of matching markets
   */
  async searchMarkets(query: string, limit: number = 20): Promise<PolymarketMarket[]> {
    try {
      const markets = await this.getMarkets({ limit: 100, active: true });

      // Filter by query
      const queryLower = query.toLowerCase();
      return markets
        .filter((market: PolymarketMarket) =>
          market.question?.toLowerCase().includes(queryLower) ||
          market.description?.toLowerCase().includes(queryLower) ||
          market.market_slug?.toLowerCase().includes(queryLower)
        )
        .slice(0, limit);
    } catch (error) {
      console.error('[PolymarketService] Error searching markets:', error);
      throw error;
    }
  }

  /**
   * Get trending markets (by 24h volume)
   *
   * @param limit - Number of markets to return
   * @returns Array of trending markets sorted by 24h volume
   */
  async getTrendingMarkets(limit: number = 10): Promise<PolymarketMarket[]> {
    try {
      const markets = await this.getMarkets({ limit: 100, active: true });

      // Sort by 24h volume descending
      return markets
        .filter((m) => m.volume_24hr && parseFloat(m.volume_24hr) > 0)
        .sort((a, b) => parseFloat(b.volume_24hr || '0') - parseFloat(a.volume_24hr || '0'))
        .slice(0, limit);
    } catch (error) {
      console.error('[PolymarketService] Error fetching trending markets:', error);
      throw error;
    }
  }

  /**
   * Get featured markets
   *
   * @param limit - Number of markets to return
   * @returns Array of featured markets
   */
  async getFeaturedMarkets(limit: number = 10): Promise<PolymarketMarket[]> {
    try {
      const markets = await this.getMarkets({ limit: 100, active: true });

      return markets
        .filter((m) => m.featured)
        .slice(0, limit);
    } catch (error) {
      console.error('[PolymarketService] Error fetching featured markets:', error);
      throw error;
    }
  }

  /**
   * Check if Polymarket API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/markets?limit=1`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
        method: 'GET',
      });

      return response.ok;
    } catch (error) {
      console.error('[PolymarketService] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get market statistics
   *
   * @param marketId - Market ID
   * @returns Market statistics including volume, liquidity, etc.
   */
  async getMarketStats(marketId: string): Promise<{
    volume: string;
    volume24hr: string;
    liquidity: string;
    traders: number;
  } | null> {
    try {
      const market = await this.getMarket(marketId);

      if (!market) {
        return null;
      }

      return {
        volume: market.volume,
        volume24hr: market.volume_24hr,
        liquidity: market.liquidity,
        traders: 0, // Not exposed in API
      };
    } catch (error) {
      console.error('[PolymarketService] Error fetching market stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const polymarketService = new PolymarketService();
