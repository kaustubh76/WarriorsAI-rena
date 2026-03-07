/**
 * Trending Detection Service
 *
 * Marks ExternalMarkets as trending based on MatchedMarketPair data.
 * Markets with active cross-platform price disagreement (arbitrage pairs)
 * get isTrending=true with a user-friendly trendingReason.
 *
 * Called from detect-arbitrage cron after matchMarkets() completes.
 */

import { prisma } from '@/lib/prisma';

interface TrendingResult {
  /** Number of markets marked as trending */
  marked: number;
  /** Number of markets unmarked (no longer trending) */
  unmarked: number;
  /** Number of active matched pairs processed */
  pairsProcessed: number;
}

/**
 * Detect and mark trending markets from MatchedMarketPair data.
 *
 * Strategy:
 *   1. Reset all trending flags
 *   2. Find all active matched pairs with arbitrage
 *   3. Mark both sides of each pair as trending
 *   4. Set trendingReason with user-friendly "markets disagree" framing
 */
export async function detectTrendingTopics(): Promise<TrendingResult> {
  // Step 1: Reset all trending flags
  const { count: unmarked } = await prisma.externalMarket.updateMany({
    where: { isTrending: true },
    data: { isTrending: false, trendingReason: null },
  });

  // Step 2: Find all active matched pairs with arbitrage
  const pairs = await prisma.matchedMarketPair.findMany({
    where: { isActive: true, hasArbitrage: true },
    select: {
      polymarketId: true,
      kalshiId: true,
      priceDifference: true,
      similarity: true,
    },
  });

  if (pairs.length === 0) {
    return { marked: 0, unmarked, pairsProcessed: 0 };
  }

  // Step 3: Batch update in groups of 20
  let marked = 0;
  const batchSize = 20;

  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);

    await prisma.$transaction(
      batch.flatMap((pair) => {
        const spread = Math.round(pair.priceDifference);
        const reason = `Markets disagree by ${spread}% — hot debate topic!`;

        return [
          prisma.externalMarket.update({
            where: { id: pair.polymarketId },
            data: { isTrending: true, trendingReason: reason },
          }),
          prisma.externalMarket.update({
            where: { id: pair.kalshiId },
            data: { isTrending: true, trendingReason: reason },
          }),
        ];
      })
    );

    marked += batch.length * 2;
  }

  return { marked, unmarked, pairsProcessed: pairs.length };
}
