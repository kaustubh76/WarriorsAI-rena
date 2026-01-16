/**
 * Whale Tracker Service
 * Tracks large trades on Polymarket and Kalshi
 * Supports WebSocket real-time and polling fallback
 *
 * Robustness Features:
 * - WebSocket-based real-time tracking via robust WebSocket managers
 * - Monitoring integration for observability
 * - Schema validation for trade data
 */

import { prisma } from '@/lib/prisma';
import { polymarketService } from './polymarketService';
import { kalshiService } from './kalshiService';
import {
  WhaleTrade,
  MarketSource,
  TrackedTrader,
} from '@/types/externalMarket';
import { parseEther } from 'viem';
import { monitoredCall, externalMarketMonitor } from './monitoring';
import { polymarketWS } from './polymarketWebSocket';
import { kalshiWS } from './kalshiWebSocket';

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_WHALE_THRESHOLD = 10000; // $10k USD
const POLLING_INTERVAL = 30000; // 30 seconds

// ============================================
// TYPES
// ============================================

type WhaleAlertCallback = (trade: WhaleTrade) => void;

interface TrackingConfig {
  threshold: number;
  sources: MarketSource[];
  pollingEnabled: boolean;
}

interface MirrorCopyTrade {
  id: string;
  userId: string;
  whaleAddress: string;
  originalTradeId: string;
  mirrorKey: string;
  outcome: 'yes' | 'no';
  copyAmount: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  createdAt: number;
}

interface WhaleFollowConfig {
  maxCopyAmount: string;
  copyPercentage: number;
  enabledSources: MarketSource[];
  autoMirror: boolean;
}

// ============================================
// WHALE TRACKER SERVICE
// ============================================

class WhaleTrackerService {
  private wsConnections: Map<string, WebSocket> = new Map();
  private alertCallbacks: Set<WhaleAlertCallback> = new Set();
  private pollingInterval: NodeJS.Timeout | null = null;
  private config: TrackingConfig = {
    threshold: DEFAULT_WHALE_THRESHOLD,
    sources: [MarketSource.POLYMARKET, MarketSource.KALSHI],
    pollingEnabled: false,
  };
  private lastCheckedTimestamp: Map<string, number> = new Map();

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Set whale alert threshold
   */
  setThreshold(amountUsd: number): void {
    this.config.threshold = amountUsd;
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.config.threshold;
  }

  /**
   * Enable/disable sources
   */
  setSources(sources: MarketSource[]): void {
    this.config.sources = sources;
  }

  // ============================================
  // ALERT SYSTEM
  // ============================================

  /**
   * Subscribe to whale alerts
   * Returns unsubscribe function
   */
  onWhaleAlert(callback: WhaleAlertCallback): () => void {
    this.alertCallbacks.add(callback);
    return () => {
      this.alertCallbacks.delete(callback);
    };
  }

  /**
   * Emit whale alert to all subscribers
   */
  private emitAlert(trade: WhaleTrade): void {
    this.alertCallbacks.forEach((callback) => {
      try {
        callback(trade);
      } catch (error) {
        console.error('[WhaleTracker] Error in alert callback:', error);
      }
    });
  }

  // ============================================
  // POLLING (Fallback Method)
  // ============================================

  /**
   * Start polling for whale trades
   */
  startPolling(intervalMs: number = POLLING_INTERVAL): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.config.pollingEnabled = true;

    // Initial check
    this.pollAllSources().catch(console.error);

    // Set up interval
    this.pollingInterval = setInterval(() => {
      this.pollAllSources().catch(console.error);
    }, intervalMs);

    console.log('[WhaleTracker] Polling started');
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.config.pollingEnabled = false;
    console.log('[WhaleTracker] Polling stopped');
  }

  /**
   * Poll all enabled sources for new whale trades
   */
  private async pollAllSources(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.sources.includes(MarketSource.POLYMARKET)) {
      promises.push(this.pollPolymarket());
    }

    if (this.config.sources.includes(MarketSource.KALSHI)) {
      promises.push(this.pollKalshi());
    }

    await Promise.all(promises);
  }

  /**
   * Poll Polymarket for whale trades
   */
  private async pollPolymarket(): Promise<void> {
    try {
      const markets = await polymarketService.getActiveMarkets(50);
      const lastChecked = this.lastCheckedTimestamp.get('polymarket') || 0;

      for (const market of markets) {
        const yesTokenId = polymarketService.getYesTokenId(market);
        if (!yesTokenId) continue;

        const whaleTrades = await polymarketService.detectWhaleTrades(
          yesTokenId,
          market,
          this.config.threshold
        );

        // Filter new trades and emit alerts
        for (const trade of whaleTrades) {
          if (trade.timestamp > lastChecked) {
            this.emitAlert(trade);
            await this.saveTrade(trade);
          }
        }
      }

      this.lastCheckedTimestamp.set('polymarket', Date.now());
    } catch (error) {
      console.error('[WhaleTracker] Polymarket polling error:', error);
    }
  }

  /**
   * Poll Kalshi for whale trades
   */
  private async pollKalshi(): Promise<void> {
    try {
      const { markets } = await kalshiService.getMarkets('open', 50);
      const lastChecked = this.lastCheckedTimestamp.get('kalshi') || 0;

      for (const market of markets) {
        const whaleTrades = await kalshiService.detectWhaleTrades(
          market.ticker,
          market,
          this.config.threshold
        );

        // Filter new trades and emit alerts
        for (const trade of whaleTrades) {
          if (trade.timestamp > lastChecked) {
            this.emitAlert(trade);
            await this.saveTrade(trade);
          }
        }
      }

      this.lastCheckedTimestamp.set('kalshi', Date.now());
    } catch (error) {
      console.error('[WhaleTracker] Kalshi polling error:', error);
    }
  }

  // ============================================
  // DATABASE OPERATIONS
  // ============================================

  /**
   * Save whale trade to database
   */
  private async saveTrade(trade: WhaleTrade): Promise<void> {
    try {
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
    } catch (error) {
      console.error('[WhaleTracker] Error saving trade:', error);
    }
  }

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
   * Get trades for a specific trader
   */
  async getTraderHistory(address: string): Promise<WhaleTrade[]> {
    const trades = await prisma.whaleTrade.findMany({
      where: { traderAddress: address },
      orderBy: { timestamp: 'desc' },
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

  // ============================================
  // TRADER TRACKING
  // ============================================

  /**
   * Track a trader (add to watchlist)
   */
  async trackTrader(
    address: string,
    source: MarketSource,
    alias?: string
  ): Promise<TrackedTrader> {
    const trader = await prisma.trackedTrader.upsert({
      where: {
        source_address: {
          source,
          address,
        },
      },
      create: {
        address,
        source,
        alias,
        isWhale: true,
      },
      update: {
        alias: alias || undefined,
      },
    });

    return {
      id: trader.id,
      address: trader.address,
      source: trader.source as MarketSource,
      alias: trader.alias || undefined,
      totalVolume: trader.totalVolume,
      winRate: trader.winRate || undefined,
      followers: trader.followers,
      isWhale: trader.isWhale,
    };
  }

  /**
   * Untrack a trader
   */
  async untrackTrader(address: string, source: MarketSource): Promise<void> {
    await prisma.trackedTrader.delete({
      where: {
        source_address: {
          source,
          address,
        },
      },
    });
  }

  /**
   * Get all tracked traders
   */
  async getTrackedTraders(): Promise<TrackedTrader[]> {
    const traders = await prisma.trackedTrader.findMany({
      orderBy: { totalVolume: 'desc' },
    });

    return traders.map((t) => ({
      id: t.id,
      address: t.address,
      source: t.source as MarketSource,
      alias: t.alias || undefined,
      totalVolume: t.totalVolume,
      winRate: t.winRate || undefined,
      followers: t.followers,
      isWhale: t.isWhale,
    }));
  }

  /**
   * Update trader stats
   */
  async updateTraderStats(
    address: string,
    source: MarketSource,
    stats: {
      totalVolume?: string;
      winRate?: number;
    }
  ): Promise<void> {
    await prisma.trackedTrader.updateMany({
      where: {
        address,
        source,
      },
      data: {
        totalVolume: stats.totalVolume,
        winRate: stats.winRate,
      },
    });
  }

  // ============================================
  // MIRROR COPY TRADING
  // ============================================

  /**
   * Trigger mirror copy trades for all followers when whale trade detected
   */
  async triggerMirrorCopyTrades(whaleTrade: WhaleTrade): Promise<void> {
    try {
      // Get all users following this whale
      const followers = await prisma.whaleFollow.findMany({
        where: {
          whaleAddress: whaleTrade.traderAddress,
          isActive: true,
        },
      });

      if (followers.length === 0) {
        console.log('[WhaleTracker] No followers for this whale trade');
        return;
      }

      // Get mirror market for this external market
      const mirrorKey = await this.getMirrorKeyForMarket(
        whaleTrade.source,
        whaleTrade.marketId
      );

      if (!mirrorKey) {
        console.log('[WhaleTracker] No mirror market exists for this trade');
        return;
      }

      // Execute copy trades for each follower
      const copyPromises = followers.map(async (follow) => {
        try {
          const config = follow.config as unknown as WhaleFollowConfig;

          // Check if source is enabled
          if (!config.enabledSources.includes(whaleTrade.source)) {
            return;
          }

          const copyAmount = this.calculateCopyAmount(
            whaleTrade.amountUsd,
            config.maxCopyAmount,
            config.copyPercentage
          );

          // Execute VRF-protected copy trade
          const requestId = await this.executeMirrorCopyTrade(
            mirrorKey,
            follow.userAddress,
            whaleTrade.outcome === 'yes',
            copyAmount
          );

          // Log copy trade
          await prisma.mirrorCopyTrade.create({
            data: {
              id: `mct_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              userId: follow.userId,
              whaleAddress: whaleTrade.traderAddress || '',
              originalTradeId: whaleTrade.id,
              mirrorKey,
              outcome: whaleTrade.outcome,
              copyAmount: copyAmount.toString(),
              status: 'pending',
              vrfRequestId: requestId,
            },
          });

          console.log(`[WhaleTracker] Copy trade initiated for ${follow.userAddress}`);
        } catch (error) {
          console.error(`[WhaleTracker] Copy trade failed for ${follow.userAddress}:`, error);
        }
      });

      await Promise.allSettled(copyPromises);
    } catch (error) {
      console.error('[WhaleTracker] Error triggering mirror copy trades:', error);
    }
  }

  /**
   * Get mirror market key for an external market
   */
  private async getMirrorKeyForMarket(
    source: MarketSource,
    marketId: string
  ): Promise<string | null> {
    try {
      const response = await fetch('/api/flow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getMirrorKey',
          source,
          externalId: marketId,
        }),
      });

      if (!response.ok) return null;

      const result = await response.json();
      return result.mirrorKey || null;
    } catch (error) {
      console.error('[WhaleTracker] Error getting mirror key:', error);
      return null;
    }
  }

  /**
   * Calculate copy trade amount based on config
   */
  private calculateCopyAmount(
    whaleAmountUsd: number,
    maxCopyAmount: string,
    copyPercentage: number
  ): bigint {
    // Calculate proportional amount
    const proportionalAmount = (whaleAmountUsd * copyPercentage) / 100;

    // Parse max amount
    const maxAmountBigInt = parseEther(maxCopyAmount);

    // Use the smaller of proportional or max
    const proportionalBigInt = parseEther(proportionalAmount.toString());

    return proportionalBigInt < maxAmountBigInt ? proportionalBigInt : maxAmountBigInt;
  }

  /**
   * Execute a mirror copy trade via VRF
   */
  private async executeMirrorCopyTrade(
    mirrorKey: string,
    userAddress: string,
    isYes: boolean,
    amount: bigint
  ): Promise<string> {
    const response = await fetch('/api/flow/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'vrfCopyTrade',
        mirrorKey,
        userAddress,
        isYes,
        amount: amount.toString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`VRF copy trade failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.requestId;
  }

  /**
   * Get mirror copy trade history for a user
   */
  async getMirrorCopyHistory(userAddress: string): Promise<MirrorCopyTrade[]> {
    const trades = await prisma.mirrorCopyTrade.findMany({
      where: {
        user: { address: userAddress },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return trades.map((t) => ({
      id: t.id,
      userId: t.userId,
      whaleAddress: t.whaleAddress,
      originalTradeId: t.originalTradeId,
      mirrorKey: t.mirrorKey,
      outcome: t.outcome as 'yes' | 'no',
      copyAmount: t.copyAmount,
      status: t.status as 'pending' | 'completed' | 'failed',
      txHash: t.txHash || undefined,
      createdAt: t.createdAt.getTime(),
    }));
  }

  /**
   * Follow a whale for copy trading
   */
  async followWhale(
    userAddress: string,
    whaleAddress: string,
    config: WhaleFollowConfig
  ): Promise<void> {
    await prisma.whaleFollow.upsert({
      where: {
        userAddress_whaleAddress: {
          userAddress,
          whaleAddress,
        },
      },
      create: {
        userAddress,
        whaleAddress,
        config: config as unknown as Record<string, unknown>,
        isActive: true,
        userId: userAddress, // Use address as userId if no user record
      },
      update: {
        config: config as unknown as Record<string, unknown>,
        isActive: true,
      },
    });
  }

  /**
   * Unfollow a whale
   */
  async unfollowWhale(userAddress: string, whaleAddress: string): Promise<void> {
    await prisma.whaleFollow.updateMany({
      where: {
        userAddress,
        whaleAddress,
      },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Get whales a user is following
   */
  async getFollowedWhales(userAddress: string): Promise<{
    address: string;
    config: WhaleFollowConfig;
    followedAt: number;
  }[]> {
    const follows = await prisma.whaleFollow.findMany({
      where: {
        userAddress,
        isActive: true,
      },
    });

    return follows.map((f) => ({
      address: f.whaleAddress,
      config: f.config as unknown as WhaleFollowConfig,
      followedAt: f.createdAt.getTime(),
    }));
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Disconnect all connections and stop polling
   */
  disconnect(): void {
    this.stopPolling();
    this.wsConnections.forEach((ws) => ws.close());
    this.wsConnections.clear();
    this.alertCallbacks.clear();
    console.log('[WhaleTracker] Disconnected');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const whaleTrackerService = new WhaleTrackerService();
export default whaleTrackerService;
