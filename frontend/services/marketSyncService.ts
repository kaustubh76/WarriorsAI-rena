/**
 * Market Sync Service
 *
 * Unified service for synchronizing external prediction markets (Kalshi, Polymarket)
 * with the ExternalMarketMirror contract on Flow blockchain.
 *
 * Features:
 * - Fetch markets from Kalshi and Polymarket APIs
 * - Mirror markets to Flow blockchain via ExternalMarketMirror contract
 * - Schedule automatic market resolution using Cadence scheduled transactions
 * - Sync market prices and volumes periodically
 */

import { kalshiService } from './kalshiService';
import { polymarketService } from './polymarketService';
import { createFlowPublicClient, createFlowWalletClient, executeWithFlowFallback } from '@/lib/flowClient';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis';
import { FLOW_TESTNET_CONTRACTS } from '@/constants';
import { type Address, type Account, parseEther } from 'viem';
import { prisma } from '@/lib/prisma';

interface MirroredMarket {
  id: string;
  externalId: string;
  source: 'kalshi' | 'polymarket';
  title: string;
  mirrorMarketId: number;
  lastSyncedAt: Date;
  isResolved: boolean;
}

export class MarketSyncService {
  private syncInterval?: NodeJS.Timeout;
  private readonly syncIntervalMs: number;

  constructor(syncIntervalMs: number = 60000) {
    // Default: sync every 60 seconds
    this.syncIntervalMs = syncIntervalMs;
  }

  /**
   * Fetch markets from all sources
   *
   * @param options - Filter options
   * @returns Combined markets from Kalshi and Polymarket
   */
  async fetchAllMarkets(options?: {
    limit?: number;
    sources?: ('kalshi' | 'polymarket')[];
  }): Promise<Array<{
    source: 'kalshi' | 'polymarket';
    externalId: string;
    title: string;
    yesPrice: number;
    noPrice: number;
    volume: bigint;
    liquidity: bigint;
    isResolved: boolean;
  }>> {
    const markets: Array<{
      source: 'kalshi' | 'polymarket';
      externalId: string;
      title: string;
      yesPrice: number;
      noPrice: number;
      volume: bigint;
      liquidity: bigint;
      isResolved: boolean;
    }> = [];

    const sources = options?.sources || ['kalshi', 'polymarket'];
    const limitPerSource = options?.limit ? Math.ceil(options.limit / sources.length) : 20;

    try {
      // Fetch Kalshi markets
      if (sources.includes('kalshi')) {
        try {
          const kalshiMarkets = await kalshiService.getMarkets({ limit: limitPerSource });
          markets.push(
            ...kalshiMarkets.map((m) => ({
              source: 'kalshi' as const,
              ...kalshiService.convertToMirrorFormat(m),
            }))
          );
        } catch (error) {
          console.error('[MarketSync] Error fetching Kalshi markets:', error);
        }
      }

      // Fetch Polymarket markets
      if (sources.includes('polymarket')) {
        try {
          const polymarketMarkets = await polymarketService.getMarkets({
            limit: limitPerSource,
            active: true,
          });
          markets.push(
            ...polymarketMarkets.map((m) => ({
              source: 'polymarket' as const,
              ...polymarketService.convertToMirrorFormat(m),
            }))
          );
        } catch (error) {
          console.error('[MarketSync] Error fetching Polymarket markets:', error);
        }
      }

      return markets;
    } catch (error) {
      console.error('[MarketSync] Error fetching all markets:', error);
      throw error;
    }
  }

  /**
   * Mirror a market to the Flow blockchain
   *
   * @param market - Market data to mirror
   * @param account - Wallet account to sign the transaction
   * @returns Mirror market ID from the contract
   */
  async mirrorMarket(
    market: {
      source: 'kalshi' | 'polymarket';
      externalId: string;
      title: string;
      yesPrice: number;
      noPrice: number;
      volume: bigint;
      liquidity: bigint;
    },
    account: Account
  ): Promise<number> {
    try {
      console.log(`[MarketSync] Mirroring market: ${market.title} (${market.externalId})`);

      const walletClient = createFlowWalletClient(account);
      const publicClient = createFlowPublicClient();

      // Create mirror market on-chain
      const hash = await walletClient.writeContract({
        address: FLOW_TESTNET_CONTRACTS.EXTERNAL_MARKET_MIRROR as Address,
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        functionName: 'createMirrorMarket',
        args: [
          market.externalId,
          market.title,
          BigInt(market.yesPrice),
          BigInt(market.noPrice),
        ],
      });

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Extract mirror market ID from event logs
      const createEvent = receipt.logs.find((log) => {
        try {
          const decoded = publicClient.decodeEventLog({
            abi: EXTERNAL_MARKET_MIRROR_ABI,
            data: log.data,
            topics: log.topics,
          });
          return decoded.eventName === 'MirrorMarketCreated';
        } catch {
          return false;
        }
      });

      if (!createEvent) {
        throw new Error('MirrorMarketCreated event not found in transaction logs');
      }

      const decoded = publicClient.decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: createEvent.data,
        topics: createEvent.topics,
      });

      const mirrorMarketId = Number(decoded.args.mirrorMarketId);

      // Store in database
      await prisma.mirroredMarket.create({
        data: {
          externalId: market.externalId,
          source: market.source,
          title: market.title,
          mirrorMarketId,
          lastSyncedAt: new Date(),
          isResolved: false,
        },
      });

      console.log(`[MarketSync] ✅ Market mirrored with ID: ${mirrorMarketId}`);

      return mirrorMarketId;
    } catch (error) {
      console.error('[MarketSync] Error mirroring market:', error);
      throw error;
    }
  }

  /**
   * Update prices for an existing mirrored market
   *
   * @param mirrorMarketId - On-chain mirror market ID
   * @param yesPrice - New YES price
   * @param noPrice - New NO price
   * @param account - Wallet account to sign the transaction
   */
  async updateMarketPrices(
    mirrorMarketId: number,
    yesPrice: number,
    noPrice: number,
    account: Account
  ): Promise<void> {
    try {
      console.log(`[MarketSync] Updating prices for mirror market #${mirrorMarketId}`);

      const walletClient = createFlowWalletClient(account);
      const publicClient = createFlowPublicClient();

      const hash = await walletClient.writeContract({
        address: FLOW_TESTNET_CONTRACTS.EXTERNAL_MARKET_MIRROR as Address,
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        functionName: 'updateMirrorPrice',
        args: [BigInt(mirrorMarketId), BigInt(yesPrice), BigInt(noPrice)],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Update database
      await prisma.mirroredMarket.updateMany({
        where: { mirrorMarketId },
        data: { lastSyncedAt: new Date() },
      });

      console.log(`[MarketSync] ✅ Prices updated for mirror market #${mirrorMarketId}`);
    } catch (error) {
      console.error('[MarketSync] Error updating market prices:', error);
      throw error;
    }
  }

  /**
   * Sync all mirrored markets with latest prices from external APIs
   *
   * @param account - Wallet account to sign transactions
   * @returns Number of markets successfully synced
   */
  async syncAllMarkets(account: Account): Promise<number> {
    try {
      console.log('[MarketSync] Starting market sync...');

      // Get all mirrored markets from database
      const mirroredMarkets = await prisma.mirroredMarket.findMany({
        where: { isResolved: false },
      });

      let syncedCount = 0;

      for (const market of mirroredMarkets) {
        try {
          // Fetch latest data from external source
          let latestData: { yesPrice: number; noPrice: number } | null = null;

          if (market.source === 'kalshi') {
            // Extract ticker from external ID (format: "kalshi:TICKER")
            const ticker = market.externalId.replace('kalshi:', '');
            const kalshiMarket = await kalshiService.getMarket(ticker);

            if (kalshiMarket) {
              const converted = kalshiService.convertToMirrorFormat(kalshiMarket);
              latestData = { yesPrice: converted.yesPrice, noPrice: converted.noPrice };
            }
          } else if (market.source === 'polymarket') {
            // Extract ID from external ID (format: "polymarket:ID")
            const marketId = market.externalId.replace('polymarket:', '');
            const polymarketMarket = await polymarketService.getMarket(marketId);

            if (polymarketMarket) {
              const converted = polymarketService.convertToMirrorFormat(polymarketMarket);
              latestData = { yesPrice: converted.yesPrice, noPrice: converted.noPrice };
            }
          }

          if (latestData) {
            await this.updateMarketPrices(
              market.mirrorMarketId,
              latestData.yesPrice,
              latestData.noPrice,
              account
            );
            syncedCount++;
          }

          // Add small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`[MarketSync] Error syncing market ${market.externalId}:`, error);
          // Continue with other markets
        }
      }

      console.log(`[MarketSync] ✅ Synced ${syncedCount} / ${mirroredMarkets.length} markets`);

      return syncedCount;
    } catch (error) {
      console.error('[MarketSync] Error in syncAllMarkets:', error);
      throw error;
    }
  }

  /**
   * Start automatic market sync on an interval
   *
   * @param account - Wallet account to sign transactions
   */
  startAutoSync(account: Account): void {
    if (this.syncInterval) {
      console.warn('[MarketSync] Auto-sync already running');
      return;
    }

    console.log(`[MarketSync] Starting auto-sync (interval: ${this.syncIntervalMs}ms)`);

    // Run immediately
    this.syncAllMarkets(account).catch((error) => {
      console.error('[MarketSync] Initial sync failed:', error);
    });

    // Then run on interval
    this.syncInterval = setInterval(() => {
      this.syncAllMarkets(account).catch((error) => {
        console.error('[MarketSync] Scheduled sync failed:', error);
      });
    }, this.syncIntervalMs);
  }

  /**
   * Stop automatic market sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      console.log('[MarketSync] Auto-sync stopped');
    }
  }

  /**
   * Get mirrored market from database
   *
   * @param externalId - External market ID (e.g., "kalshi:TICKER" or "polymarket:ID")
   * @returns Mirrored market data or null if not found
   */
  async getMirroredMarket(externalId: string): Promise<MirroredMarket | null> {
    return await prisma.mirroredMarket.findUnique({
      where: { externalId },
    });
  }

  /**
   * Get all mirrored markets from database
   *
   * @param options - Filter options
   * @returns Array of mirrored markets
   */
  async getAllMirroredMarkets(options?: {
    source?: 'kalshi' | 'polymarket';
    isResolved?: boolean;
  }): Promise<MirroredMarket[]> {
    return await prisma.mirroredMarket.findMany({
      where: {
        source: options?.source,
        isResolved: options?.isResolved,
      },
      orderBy: { lastSyncedAt: 'desc' },
    });
  }

  /**
   * Search for external markets across all sources
   *
   * @param query - Search query
   * @param limit - Maximum results per source
   * @returns Combined search results
   */
  async searchExternalMarkets(query: string, limit: number = 10): Promise<Array<{
    source: 'kalshi' | 'polymarket';
    externalId: string;
    title: string;
    yesPrice: number;
    noPrice: number;
    isMirrored: boolean;
  }>> {
    const results: Array<{
      source: 'kalshi' | 'polymarket';
      externalId: string;
      title: string;
      yesPrice: number;
      noPrice: number;
      isMirrored: boolean;
    }> = [];

    try {
      // Search Kalshi
      const kalshiResults = await kalshiService.searchMarkets(query, limit);
      for (const market of kalshiResults) {
        const converted = kalshiService.convertToMirrorFormat(market);
        const mirrored = await this.getMirroredMarket(converted.externalId);

        results.push({
          source: 'kalshi',
          externalId: converted.externalId,
          title: converted.title,
          yesPrice: converted.yesPrice,
          noPrice: converted.noPrice,
          isMirrored: !!mirrored,
        });
      }

      // Search Polymarket
      const polymarketResults = await polymarketService.searchMarkets(query, limit);
      for (const market of polymarketResults) {
        const converted = polymarketService.convertToMirrorFormat(market);
        const mirrored = await this.getMirroredMarket(converted.externalId);

        results.push({
          source: 'polymarket',
          externalId: converted.externalId,
          title: converted.title,
          yesPrice: converted.yesPrice,
          noPrice: converted.noPrice,
          isMirrored: !!mirrored,
        });
      }

      return results;
    } catch (error) {
      console.error('[MarketSync] Error searching external markets:', error);
      throw error;
    }
  }

  /**
   * Health check for all external APIs
   *
   * @returns Status of each external API
   */
  async healthCheck(): Promise<{
    kalshi: boolean;
    polymarket: boolean;
  }> {
    const [kalshiOk, polymarketOk] = await Promise.all([
      kalshiService.healthCheck(),
      polymarketService.healthCheck(),
    ]);

    return {
      kalshi: kalshiOk,
      polymarket: polymarketOk,
    };
  }
}

// Export singleton instance
export const marketSyncService = new MarketSyncService();
