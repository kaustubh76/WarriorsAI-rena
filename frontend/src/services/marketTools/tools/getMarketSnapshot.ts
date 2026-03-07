/**
 * Tool: get_market_snapshot
 * Type: READ (no side effects)
 *
 * Fetches live market data with freshness metadata.
 * Wraps polymarketService.getMarket() + staleness computation.
 */

import { prisma } from '@/lib/prisma';
import { polymarketService } from '@/services/externalMarkets';
import { rpcResponseCache } from '@/lib/cache/hashedCache';

export interface MarketSnapshotInput {
  marketId: string; // DB market ID (e.g., "poly_abc123")
  source: 'polymarket' | 'kalshi';
}

export interface MarketSnapshotOutput {
  marketId: string;
  question: string;
  yesPrice: number;   // 0-100
  noPrice: number;     // 0-100
  volume: string;
  liquidity: string;
  lastUpdated: string; // ISO timestamp
  stalenessSeconds: number;
  isStale: boolean;    // true if > 300s
  source: string;
  category: string | null;
  topicCategory: string | null;
  endTime: string;
  isTrending: boolean;
  battleScore: number;
}

const STALENESS_THRESHOLD_SECONDS = 300;

export async function getMarketSnapshot(
  input: MarketSnapshotInput
): Promise<MarketSnapshotOutput> {
  const cacheKey = `snapshot:${input.marketId}`;
  const cached = rpcResponseCache.get(cacheKey) as MarketSnapshotOutput | undefined;
  if (cached) return cached;

  const market = await prisma.externalMarket.findUnique({
    where: { id: input.marketId },
    select: {
      id: true,
      question: true,
      yesPrice: true,
      noPrice: true,
      volume: true,
      liquidity: true,
      lastSyncAt: true,
      source: true,
      category: true,
      topicCategory: true,
      endTime: true,
      isTrending: true,
      battleScore: true,
      metadata: true,
    },
  });

  if (!market) {
    throw new Error(`Market ${input.marketId} not found`);
  }

  // Try to get live price from CLOB if Polymarket
  let yesPrice = market.yesPrice / 100;
  let noPrice = market.noPrice / 100;

  if (input.source === 'polymarket' && market.metadata) {
    try {
      const meta = JSON.parse(market.metadata);
      const tokenId = meta.clobTokenIds?.[0];
      if (tokenId) {
        const liveMid = await polymarketService.getMidpoint(tokenId);
        yesPrice = liveMid;
        noPrice = 100 - liveMid;
      }
    } catch {
      // Fall through to DB price
    }
  }

  const stalenessSeconds = Math.round(
    (Date.now() - market.lastSyncAt.getTime()) / 1000
  );

  const result: MarketSnapshotOutput = {
    marketId: market.id,
    question: market.question,
    yesPrice,
    noPrice,
    volume: market.volume,
    liquidity: market.liquidity,
    lastUpdated: market.lastSyncAt.toISOString(),
    stalenessSeconds,
    isStale: stalenessSeconds > STALENESS_THRESHOLD_SECONDS,
    source: market.source,
    category: market.category,
    topicCategory: market.topicCategory,
    endTime: market.endTime.toISOString(),
    isTrending: market.isTrending,
    battleScore: market.battleScore,
  };

  // Cache for 30 seconds
  rpcResponseCache.set(cacheKey, result, 30 * 1000);

  return result;
}
