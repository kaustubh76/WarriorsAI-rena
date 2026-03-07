/**
 * Topic Aggregation Service
 *
 * Computes per-category aggregate stats from ExternalMarket records
 * and upserts them into the TopicAggregate table.
 *
 * Called after topicCurationService.curateTopics() completes.
 */

import { prisma } from '@/lib/prisma';

// ============================================
// TYPES
// ============================================

interface AggregateResult {
  categoriesUpdated: number;
  totalMarkets: number;
}

// ============================================
// VOLUME PARSING (shared with topicCategoryService)
// ============================================

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
 * Refresh all TopicAggregate records from current ExternalMarket data.
 *
 * Strategy:
 *   1. Fetch all curated markets grouped by topicCategory
 *   2. Compute per-category stats (count, avg score, volume, top markets)
 *   3. Count active battles per category from PredictionBattle
 *   4. Upsert into TopicAggregate
 */
export async function refreshTopicAggregates(): Promise<AggregateResult> {
  // Fetch all curated markets with topic assignments
  const markets = await prisma.externalMarket.findMany({
    where: {
      curatedForArena: true,
      status: 'active',
      topicCategory: { not: null },
    },
    select: {
      id: true,
      topicCategory: true,
      topicSubcategory: true,
      battleScore: true,
      volume: true,
    },
  });

  // Group by category
  const categoryMap = new Map<string, typeof markets>();
  for (const market of markets) {
    const cat = market.topicCategory!;
    const existing = categoryMap.get(cat) ?? [];
    existing.push(market);
    categoryMap.set(cat, existing);
  }

  // Count active battles per category
  const activeBattles = await prisma.predictionBattle.groupBy({
    by: ['source'],
    where: { status: 'active' },
    _count: true,
  });

  // Build a map of battle counts by looking up market categories
  // Since PredictionBattle doesn't have topicCategory, we correlate via externalMarketId
  const activeBattlesList = await prisma.predictionBattle.findMany({
    where: { status: 'active' },
    select: { externalMarketId: true },
  });

  const battleMarketIds = activeBattlesList.map((b) => b.externalMarketId);
  const battleMarkets = battleMarketIds.length > 0
    ? await prisma.externalMarket.findMany({
        where: { id: { in: battleMarketIds } },
        select: { id: true, topicCategory: true },
      })
    : [];

  const battleCountByCategory = new Map<string, number>();
  for (const bm of battleMarkets) {
    if (bm.topicCategory) {
      battleCountByCategory.set(
        bm.topicCategory,
        (battleCountByCategory.get(bm.topicCategory) ?? 0) + 1
      );
    }
  }

  // Upsert aggregates per category
  let categoriesUpdated = 0;

  for (const [category, catMarkets] of categoryMap) {
    const marketCount = catMarkets.length;
    const avgBattleScore = marketCount > 0
      ? catMarkets.reduce((sum, m) => sum + m.battleScore, 0) / marketCount
      : 0;

    const totalVolumeNum = catMarkets.reduce(
      (sum, m) => sum + parseVolume(m.volume),
      0
    );

    // Top 5 markets by battleScore
    const sorted = [...catMarkets].sort((a, b) => b.battleScore - a.battleScore);
    const topMarketIds = sorted.slice(0, 5).map((m) => m.id);

    // Group subcategories for this category
    const subcategories = new Set(catMarkets.map((m) => m.topicSubcategory).filter(Boolean));

    // Upsert category-level aggregate (null subcategory)
    // Use findFirst + create/update since Prisma composite unique doesn't accept null in upsert
    const catAggData = {
      marketCount,
      activeBattles: battleCountByCategory.get(category) ?? 0,
      totalVolume: Math.round(totalVolumeNum).toString(),
      avgBattleScore: Math.round(avgBattleScore * 100) / 100,
      topMarketIds: JSON.stringify(topMarketIds),
    };

    const existingCatAgg = await prisma.topicAggregate.findFirst({
      where: { category, subcategory: null },
    });

    if (existingCatAgg) {
      await prisma.topicAggregate.update({
        where: { id: existingCatAgg.id },
        data: catAggData,
      });
    } else {
      await prisma.topicAggregate.create({
        data: { category, ...catAggData },
      });
    }

    // Also upsert per-subcategory aggregates
    for (const sub of subcategories) {
      if (!sub) continue;
      const subMarkets = catMarkets.filter((m) => m.topicSubcategory === sub);
      const subAvgScore = subMarkets.length > 0
        ? subMarkets.reduce((s, m) => s + m.battleScore, 0) / subMarkets.length
        : 0;

      const subVolume = subMarkets.reduce(
        (s, m) => s + parseVolume(m.volume),
        0
      );

      const subTopIds = [...subMarkets]
        .sort((a, b) => b.battleScore - a.battleScore)
        .slice(0, 5)
        .map((m) => m.id);

      await prisma.topicAggregate.upsert({
        where: {
          category_subcategory: { category, subcategory: sub },
        },
        create: {
          category,
          subcategory: sub,
          marketCount: subMarkets.length,
          activeBattles: 0,
          totalVolume: Math.round(subVolume).toString(),
          avgBattleScore: Math.round(subAvgScore * 100) / 100,
          topMarketIds: JSON.stringify(subTopIds),
        },
        update: {
          marketCount: subMarkets.length,
          totalVolume: Math.round(subVolume).toString(),
          avgBattleScore: Math.round(subAvgScore * 100) / 100,
          topMarketIds: JSON.stringify(subTopIds),
        },
      });
    }

    categoriesUpdated++;
  }

  // Clean up stale categories that no longer have markets
  const activeCategories = [...categoryMap.keys()];
  if (activeCategories.length > 0) {
    await prisma.topicAggregate.deleteMany({
      where: {
        category: { notIn: activeCategories },
      },
    });
  }

  return { categoriesUpdated, totalMarkets: markets.length };
}
