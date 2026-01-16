/**
 * External Markets Service - Main Aggregator
 * Unifies Polymarket, Kalshi, and Opinion market data
 *
 * Robustness Features:
 * - Monitoring integration
 * - Schema validation (via underlying services)
 * - Adaptive rate limiting (via underlying services)
 */

import { prisma } from '@/lib/prisma';
import { polymarketService } from './polymarketService';
import { kalshiService } from './kalshiService';
import { opinionService } from './opinionService';
import {
  UnifiedMarket,
  MarketSource,
  ExternalMarketStatus,
  MarketFilters,
  SyncResult,
  ArbitrageOpportunity,
  WhaleTrade,
} from '@/types/externalMarket';
import { monitoredCall, externalMarketMonitor } from './monitoring';

// Re-export monitoring for external access
export { externalMarketMonitor } from './monitoring';

// Re-export robust modules
export { polymarketWS } from './polymarketWebSocket';
export { kalshiAuth, kalshiTrading, kalshiWS, checkKalshiEligibility } from './kalshiService';
export * from './schemas';

// ============================================
// CONSTANTS
// ============================================

const SYNC_BATCH_SIZE = 100;
const ARBITRAGE_MIN_SPREAD = 5; // 5% minimum spread

// ============================================
// EXTERNAL MARKETS SERVICE CLASS
// ============================================

class ExternalMarketsService {
  private syncInterval: NodeJS.Timeout | null = null;

  // ============================================
  // UNIFIED MARKET OPERATIONS
  // ============================================

  /**
   * Get all markets from database with optional filters
   */
  async getAllMarkets(filters?: MarketFilters): Promise<UnifiedMarket[]> {
    const where: Record<string, unknown> = {};

    // Source filter
    if (filters?.source) {
      if (Array.isArray(filters.source)) {
        where.source = { in: filters.source };
      } else {
        where.source = filters.source;
      }
    }

    // Status filter
    if (filters?.status) {
      where.status = filters.status;
    }

    // Category filter
    if (filters?.category) {
      where.category = filters.category;
    }

    // Search filter
    if (filters?.search) {
      where.OR = [
        { question: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    // Volume filter
    if (filters?.minVolume) {
      // SQLite stores volume as string, need to handle comparison
      // For now, filter in memory after fetch
    }

    // End time filter
    if (filters?.maxEndTime) {
      where.endTime = { lte: new Date(filters.maxEndTime) };
    }

    // Determine ordering
    let orderBy: Record<string, 'asc' | 'desc'> = { lastSyncAt: 'desc' };
    if (filters?.sortBy) {
      orderBy = {
        [filters.sortBy]: filters.sortOrder || 'desc',
      };
    }

    // Pagination
    const skip = ((filters?.page || 1) - 1) * (filters?.pageSize || 50);
    const take = filters?.pageSize || 50;

    const dbMarkets = await prisma.externalMarket.findMany({
      where,
      orderBy,
      skip,
      take,
    });

    // Convert to unified format
    return dbMarkets.map((m) => this.dbToUnified(m));
  }

  /**
   * Get a single market by ID
   */
  async getMarket(id: string): Promise<UnifiedMarket | null> {
    const market = await prisma.externalMarket.findUnique({
      where: { id },
    });

    return market ? this.dbToUnified(market) : null;
  }

  /**
   * Search markets across all sources
   */
  async searchMarkets(
    query: string,
    sources?: MarketSource[]
  ): Promise<UnifiedMarket[]> {
    return this.getAllMarkets({
      search: query,
      source: sources,
      status: ExternalMarketStatus.ACTIVE,
    });
  }

  /**
   * Get market stats
   */
  async getMarketStats(): Promise<{
    totalMarkets: number;
    polymarketCount: number;
    kalshiCount: number;
    opinionCount: number;
    activeCount: number;
    totalVolume: string;
    lastSync: number;
  }> {
    const [total, polymarket, kalshi, opinion, active, lastSync] = await Promise.all([
      prisma.externalMarket.count(),
      prisma.externalMarket.count({ where: { source: 'polymarket' } }),
      prisma.externalMarket.count({ where: { source: 'kalshi' } }),
      prisma.externalMarket.count({ where: { source: 'opinion' } }),
      prisma.externalMarket.count({ where: { status: 'active' } }),
      prisma.syncLog.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Calculate total volume
    const markets = await prisma.externalMarket.findMany({
      select: { volume: true },
    });
    const totalVolume = markets
      .reduce((sum, m) => sum + parseFloat(m.volume || '0'), 0)
      .toFixed(2);

    return {
      totalMarkets: total,
      polymarketCount: polymarket,
      kalshiCount: kalshi,
      opinionCount: opinion,
      activeCount: active,
      totalVolume,
      lastSync: lastSync?.createdAt.getTime() || 0,
    };
  }

  // ============================================
  // SYNC OPERATIONS
  // ============================================

  /**
   * Sync all markets from all sources
   */
  async syncAllMarkets(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    // Sync Polymarket
    try {
      const polyResult = await this.syncPolymarketMarkets();
      results.push({
        source: MarketSource.POLYMARKET,
        success: true,
        marketsAdded: polyResult.added,
        marketsUpdated: polyResult.updated,
        duration: polyResult.duration,
      });
    } catch (error) {
      results.push({
        source: MarketSource.POLYMARKET,
        success: false,
        marketsAdded: 0,
        marketsUpdated: 0,
        duration: 0,
        error: (error as Error).message,
      });
    }

    // Sync Kalshi
    try {
      const kalshiResult = await this.syncKalshiMarkets();
      results.push({
        source: MarketSource.KALSHI,
        success: true,
        marketsAdded: kalshiResult.added,
        marketsUpdated: kalshiResult.updated,
        duration: kalshiResult.duration,
      });
    } catch (error) {
      results.push({
        source: MarketSource.KALSHI,
        success: false,
        marketsAdded: 0,
        marketsUpdated: 0,
        duration: 0,
        error: (error as Error).message,
      });
    }

    // Sync Opinion
    try {
      const opinionResult = await this.syncOpinionMarkets();
      results.push({
        source: MarketSource.OPINION,
        success: true,
        marketsAdded: opinionResult.added,
        marketsUpdated: opinionResult.updated,
        duration: opinionResult.duration,
      });
    } catch (error) {
      results.push({
        source: MarketSource.OPINION,
        success: false,
        marketsAdded: 0,
        marketsUpdated: 0,
        duration: 0,
        error: (error as Error).message,
      });
    }

    return results;
  }

  /**
   * Sync Polymarket markets
   */
  async syncPolymarketMarkets(): Promise<{
    added: number;
    updated: number;
    duration: number;
  }> {
    const startTime = Date.now();
    let added = 0;
    let updated = 0;
    let offset = 0;

    try {
      while (true) {
        const markets = await polymarketService.getActiveMarkets(
          SYNC_BATCH_SIZE,
          offset
        );

        if (markets.length === 0) break;

        for (const market of markets) {
          const unified = polymarketService.normalizeMarket(market);
          const result = await this.upsertMarket(unified);

          if (result === 'created') added++;
          else if (result === 'updated') updated++;
        }

        offset += SYNC_BATCH_SIZE;

        // Limit total markets to prevent infinite loops
        if (offset >= 1000) break;
      }

      const duration = Date.now() - startTime;

      // Log sync
      await prisma.syncLog.create({
        data: {
          source: 'polymarket',
          action: 'full_sync',
          status: 'success',
          count: added + updated,
          duration,
        },
      });

      return { added, updated, duration };
    } catch (error) {
      const duration = Date.now() - startTime;

      await prisma.syncLog.create({
        data: {
          source: 'polymarket',
          action: 'full_sync',
          status: 'failed',
          count: added + updated,
          duration,
          error: (error as Error).message,
        },
      });

      throw error;
    }
  }

  /**
   * Sync Kalshi markets
   */
  async syncKalshiMarkets(): Promise<{
    added: number;
    updated: number;
    duration: number;
  }> {
    const startTime = Date.now();
    let added = 0;
    let updated = 0;

    try {
      const markets = await kalshiService.getActiveMarkets(500);

      for (const market of markets) {
        const unified = kalshiService.normalizeMarket(market);
        const result = await this.upsertMarket(unified);

        if (result === 'created') added++;
        else if (result === 'updated') updated++;
      }

      const duration = Date.now() - startTime;

      await prisma.syncLog.create({
        data: {
          source: 'kalshi',
          action: 'full_sync',
          status: 'success',
          count: added + updated,
          duration,
        },
      });

      return { added, updated, duration };
    } catch (error) {
      const duration = Date.now() - startTime;

      await prisma.syncLog.create({
        data: {
          source: 'kalshi',
          action: 'full_sync',
          status: 'failed',
          count: added + updated,
          duration,
          error: (error as Error).message,
        },
      });

      throw error;
    }
  }

  /**
   * Sync Opinion markets
   */
  async syncOpinionMarkets(): Promise<{
    added: number;
    updated: number;
    duration: number;
  }> {
    const startTime = Date.now();
    let added = 0;
    let updated = 0;

    try {
      const markets = await opinionService.getAllActiveMarkets(200);

      for (const market of markets) {
        // Use sync normalization (without fetching individual prices)
        const unified = opinionService.normalizeMarketSync(market);
        const result = await this.upsertMarket(unified);

        if (result === 'created') added++;
        else if (result === 'updated') updated++;
      }

      const duration = Date.now() - startTime;

      await prisma.syncLog.create({
        data: {
          source: 'opinion',
          action: 'full_sync',
          status: 'success',
          count: added + updated,
          duration,
        },
      });

      return { added, updated, duration };
    } catch (error) {
      const duration = Date.now() - startTime;

      await prisma.syncLog.create({
        data: {
          source: 'opinion',
          action: 'full_sync',
          status: 'failed',
          count: added + updated,
          duration,
          error: (error as Error).message,
        },
      });

      throw error;
    }
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(intervalMs: number = 5 * 60 * 1000): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Initial sync
    this.syncAllMarkets().catch(console.error);

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.syncAllMarkets().catch(console.error);
    }, intervalMs);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // ============================================
  // ARBITRAGE DETECTION
  // ============================================

  /**
   * Find arbitrage opportunities between Polymarket, Kalshi, and Opinion
   */
  async findArbitrageOpportunities(
    minSpread: number = ARBITRAGE_MIN_SPREAD
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    // Get active markets from all sources
    const [polyMarkets, kalshiMarkets, opinionMarkets] = await Promise.all([
      this.getAllMarkets({
        source: MarketSource.POLYMARKET,
        status: ExternalMarketStatus.ACTIVE,
      }),
      this.getAllMarkets({
        source: MarketSource.KALSHI,
        status: ExternalMarketStatus.ACTIVE,
      }),
      this.getAllMarkets({
        source: MarketSource.OPINION,
        status: ExternalMarketStatus.ACTIVE,
      }),
    ]);

    // Combine all markets for cross-source comparison
    const allMarketPairs: [UnifiedMarket[], UnifiedMarket[]][] = [
      [polyMarkets, kalshiMarkets],
      [polyMarkets, opinionMarkets],
      [kalshiMarkets, opinionMarkets],
    ];

    // Simple matching by question similarity
    // In production, use AI/embeddings for better matching
    for (const [markets1, markets2] of allMarketPairs) {
      for (const market1 of markets1) {
        for (const market2 of markets2) {
          const similarity = this.calculateSimilarity(
            market1.question,
            market2.question
          );

          if (similarity > 0.7) {
            const spread = Math.abs(market1.yesPrice - market2.yesPrice);

            if (spread >= minSpread) {
              // Check for arbitrage opportunity
              const opportunity = this.calculateArbitrage(market1, market2);

              if (opportunity && opportunity.potentialProfit > 0) {
                opportunities.push(opportunity);
              }
            }
          }
        }
      }
    }

    return opportunities.sort((a, b) => b.potentialProfit - a.potentialProfit);
  }

  /**
   * Calculate arbitrage opportunity between two markets
   */
  private calculateArbitrage(
    market1: UnifiedMarket,
    market2: UnifiedMarket
  ): ArbitrageOpportunity | null {
    const price1Yes = market1.yesPrice / 100;
    const price1No = market1.noPrice / 100;
    const price2Yes = market2.yesPrice / 100;
    const price2No = market2.noPrice / 100;

    // Check if buying YES on market1 and NO on market2 creates arbitrage
    const cost1 = price1Yes + price2No;
    const cost2 = price2Yes + price1No;

    let potentialProfit = 0;
    let strategy = '';

    if (cost1 < 1) {
      potentialProfit = (1 - cost1) * 100;
      strategy = 'buy_yes_1_no_2';
    } else if (cost2 < 1) {
      potentialProfit = (1 - cost2) * 100;
      strategy = 'buy_yes_2_no_1';
    }

    if (potentialProfit <= 0) return null;

    return {
      id: `arb_${market1.id}_${market2.id}`,
      market1: {
        source: market1.source,
        marketId: market1.id,
        question: market1.question,
        yesPrice: market1.yesPrice,
        noPrice: market1.noPrice,
      },
      market2: {
        source: market2.source,
        marketId: market2.id,
        question: market2.question,
        yesPrice: market2.yesPrice,
        noPrice: market2.noPrice,
      },
      spread: Math.abs(market1.yesPrice - market2.yesPrice),
      potentialProfit,
      confidence: 0.8, // Placeholder - should be from AI matching
      detectedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute validity
      status: 'active',
    };
  }

  /**
   * Simple text similarity calculation (Jaccard)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  // ============================================
  // WHALE TRADE TRACKING
  // ============================================

  /**
   * Get recent whale trades from database
   */
  async getRecentWhaleTrades(
    limit: number = 50,
    source?: MarketSource
  ): Promise<WhaleTrade[]> {
    const where: Record<string, unknown> = {};
    if (source) where.source = source;

    const trades = await prisma.whaleTrade.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return trades.map((t) => ({
      id: t.id,
      source: t.source as MarketSource,
      marketId: t.marketId,
      marketQuestion: t.marketQuestion,
      traderAddress: t.traderAddress || undefined,
      side: t.side as 'buy' | 'sell',
      outcome: t.outcome as 'yes' | 'no',
      amountUsd: t.amountUsd,
      shares: t.shares,
      price: t.price,
      timestamp: t.timestamp.getTime(),
      txHash: t.txHash || undefined,
    }));
  }

  /**
   * Save whale trades to database
   */
  async saveWhaleTrades(trades: WhaleTrade[]): Promise<void> {
    for (const trade of trades) {
      await prisma.whaleTrade.upsert({
        where: { id: trade.id },
        create: {
          id: trade.id,
          source: trade.source,
          marketId: trade.marketId,
          marketQuestion: trade.marketQuestion,
          traderAddress: trade.traderAddress,
          side: trade.side,
          outcome: trade.outcome,
          amountUsd: trade.amountUsd,
          shares: trade.shares,
          price: trade.price,
          timestamp: new Date(trade.timestamp),
          txHash: trade.txHash,
        },
        update: {},
      });
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Upsert market to database
   */
  private async upsertMarket(
    market: UnifiedMarket
  ): Promise<'created' | 'updated' | 'unchanged'> {
    const existing = await prisma.externalMarket.findUnique({
      where: { id: market.id },
    });

    if (!existing) {
      await prisma.externalMarket.create({
        data: this.unifiedToDb(market),
      });
      return 'created';
    }

    // Check if update needed
    if (
      existing.yesPrice !== Math.round(market.yesPrice * 100) ||
      existing.noPrice !== Math.round(market.noPrice * 100) ||
      existing.volume !== market.volume ||
      existing.status !== market.status
    ) {
      await prisma.externalMarket.update({
        where: { id: market.id },
        data: this.unifiedToDb(market),
      });
      return 'updated';
    }

    return 'unchanged';
  }

  /**
   * Convert unified market to database format
   */
  private unifiedToDb(market: UnifiedMarket): Record<string, unknown> {
    return {
      id: market.id,
      source: market.source,
      externalId: market.externalId,
      question: market.question,
      description: market.description,
      category: market.category,
      tags: market.tags ? JSON.stringify(market.tags) : null,
      yesPrice: Math.round(market.yesPrice * 100),
      noPrice: Math.round(market.noPrice * 100),
      volume: market.volume,
      liquidity: market.liquidity,
      endTime: new Date(market.endTime),
      status: market.status,
      outcome: market.outcome,
      sourceUrl: market.sourceUrl,
      metadata: market.sourceMetadata
        ? JSON.stringify(market.sourceMetadata)
        : null,
      lastSyncAt: new Date(market.lastSyncAt),
    };
  }

  /**
   * Convert database market to unified format
   */
  private dbToUnified(db: {
    id: string;
    source: string;
    externalId: string;
    question: string;
    description: string | null;
    category: string | null;
    tags: string | null;
    yesPrice: number;
    noPrice: number;
    volume: string;
    liquidity: string;
    endTime: Date;
    createdAt: Date;
    status: string;
    outcome: string | null;
    sourceUrl: string;
    metadata: string | null;
    lastSyncAt: Date;
  }): UnifiedMarket {
    return {
      id: db.id,
      source: db.source as MarketSource,
      externalId: db.externalId,
      question: db.question,
      description: db.description || undefined,
      category: db.category || undefined,
      tags: db.tags ? JSON.parse(db.tags) : undefined,
      yesPrice: db.yesPrice / 100,
      noPrice: db.noPrice / 100,
      volume: db.volume,
      liquidity: db.liquidity,
      endTime: db.endTime.getTime(),
      createdAt: db.createdAt.getTime(),
      status: db.status as ExternalMarketStatus,
      outcome: db.outcome as 'yes' | 'no' | 'invalid' | undefined,
      sourceUrl: db.sourceUrl,
      sourceMetadata: db.metadata ? JSON.parse(db.metadata) : undefined,
      lastSyncAt: db.lastSyncAt.getTime(),
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const externalMarketsService = new ExternalMarketsService();
export default externalMarketsService;

// Re-export individual services
export { polymarketService } from './polymarketService';
export { kalshiService } from './kalshiService';
export { opinionService } from './opinionService';
