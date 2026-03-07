/**
 * Topic Curation Service
 *
 * Flags ExternalMarket records as "curated for arena" based on criteria
 * that make them suitable for AI warrior debate battles:
 * - Active status
 * - Resolution at least 48 hours away (enough time for debate)
 * - Balanced odds (15%-85% YES price — not foregone conclusions)
 * - Meaningful volume (> $10,000)
 *
 * After flagging, assigns topic categories, battle scores, trending status,
 * and refreshes aggregate stats.
 *
 * Called after sync-markets cron completes.
 */

import { prisma } from '@/lib/prisma';
import { batchAssignTopicFields } from '@/services/topics/topicCategoryService';
import { refreshTopicAggregates } from '@/services/topics/topicAggregationService';

/** Minimum hours until resolution for a market to be battle-worthy */
const MIN_HOURS_UNTIL_RESOLUTION = 48;

/** YES price range in basis points (0-10000) — maps to 15%-85% */
const MIN_YES_PRICE_BP = 1500;
const MAX_YES_PRICE_BP = 8500;

/** Minimum volume in dollars */
const MIN_VOLUME_USD = 10_000;

/** Categories excluded from curation (sports parlays, entertainment trivia) */
const EXCLUDED_CATEGORIES = new Set([
  'sports',
  'entertainment',
  'gaming',
  'memes',
]);

export interface CurationResult {
  flagged: number;
  unflagged: number;
  totalActive: number;
  categorized: number;
  trendingMarked: number;
  categoriesUpdated: number;
}

/**
 * Parse volume string to numeric USD value.
 * Handles formats: "1234567", "1.5M", "200K", "$1,234,567"
 */
function parseVolume(volume: string): number {
  if (!volume) return 0;
  const cleaned = volume.replace(/[$,]/g, '').trim();

  const multiplierMatch = cleaned.match(/^([\d.]+)\s*([KkMmBb])?$/);
  if (multiplierMatch) {
    const num = parseFloat(multiplierMatch[1]);
    const suffix = (multiplierMatch[2] || '').toUpperCase();
    switch (suffix) {
      case 'K': return num * 1_000;
      case 'M': return num * 1_000_000;
      case 'B': return num * 1_000_000_000;
      default: return num;
    }
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Mark markets as trending based on MatchedMarketPair data.
 * Markets that appear in active cross-platform pairs get isTrending=true.
 */
async function markTrendingMarkets(): Promise<number> {
  // Reset all trending flags first
  await prisma.externalMarket.updateMany({
    where: { isTrending: true },
    data: { isTrending: false, trendingReason: null },
  });

  // Find all active matched pairs with arbitrage
  const pairs = await prisma.matchedMarketPair.findMany({
    where: { isActive: true, hasArbitrage: true },
    select: {
      polymarketId: true,
      kalshiId: true,
      priceDifference: true,
    },
  });

  if (pairs.length === 0) return 0;

  let marked = 0;

  // Batch update in groups
  const batchSize = 20;
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);

    await prisma.$transaction(
      batch.flatMap((pair) => {
        const reason = `Markets disagree by ${Math.round(pair.priceDifference)}% — hot debate topic!`;
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

  return marked;
}

/**
 * Flag battle-worthy markets as curatedForArena, then:
 *   1. Assign topic categories + battle scores
 *   2. Mark trending markets from MatchedMarketPair data
 *   3. Refresh TopicAggregate stats
 *
 * Strategy: clean-slate approach — unflag all, then flag matches.
 * This ensures markets that no longer meet criteria get un-curated.
 */
export async function curateTopics(): Promise<CurationResult> {
  const now = new Date();
  const minEndTime = new Date(now.getTime() + MIN_HOURS_UNTIL_RESOLUTION * 60 * 60 * 1000);

  // Step 1: Unflag all previously curated markets
  const { count: unflagged } = await prisma.externalMarket.updateMany({
    where: { curatedForArena: true },
    data: { curatedForArena: false },
  });

  // Step 2: Find markets that meet curation criteria
  // Use Prisma WHERE for DB-level filters, then JS for volume parsing
  const candidates = await prisma.externalMarket.findMany({
    where: {
      status: 'active',
      endTime: { gt: minEndTime },
      yesPrice: { gte: MIN_YES_PRICE_BP, lte: MAX_YES_PRICE_BP },
    },
    select: {
      id: true,
      category: true,
      volume: true,
    },
  });

  // Step 3: Filter by volume and excluded categories in JS
  const idsToFlag: string[] = [];

  for (const market of candidates) {
    // Skip excluded categories
    const cat = market.category?.toLowerCase();
    if (cat && EXCLUDED_CATEGORIES.has(cat)) continue;

    // Check volume threshold
    const volumeUsd = parseVolume(market.volume);
    if (volumeUsd < MIN_VOLUME_USD) continue;

    idsToFlag.push(market.id);
  }

  // Step 4: Flag matching markets
  let flagged = 0;
  if (idsToFlag.length > 0) {
    const result = await prisma.externalMarket.updateMany({
      where: { id: { in: idsToFlag } },
      data: { curatedForArena: true },
    });
    flagged = result.count;
  }

  // Step 5: Assign topic categories + battle scores to flagged markets
  const categorized = await batchAssignTopicFields(idsToFlag);

  // Step 6: Mark trending markets from cross-platform pairs
  const trendingMarked = await markTrendingMarkets();

  // Step 7: Refresh TopicAggregate stats
  const { categoriesUpdated } = await refreshTopicAggregates();

  // Count total active for reporting
  const totalActive = await prisma.externalMarket.count({
    where: { status: 'active' },
  });

  return { flagged, unflagged, totalActive, categorized, trendingMarked, categoriesUpdated };
}
