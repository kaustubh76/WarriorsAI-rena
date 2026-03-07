/**
 * Topic Category Service
 *
 * Classifies ExternalMarket questions into topic categories/subcategories
 * and computes composite battleScore for ranking.
 *
 * Called by topicCurationService after flagging curatedForArena.
 */

import { prisma } from '@/lib/prisma';

// ============================================
// TYPES
// ============================================

export type TopicCategory =
  | 'politics'
  | 'economics'
  | 'crypto'
  | 'science'
  | 'geopolitics'
  | 'culture';

export interface ClassificationResult {
  topicCategory: TopicCategory;
  topicSubcategory: string;
}

// ============================================
// KEYWORD CLASSIFIER
// ============================================

/** Category rules: regex patterns → category + subcategory */
const CATEGORY_RULES: Array<{
  category: TopicCategory;
  subcategory: string;
  pattern: RegExp;
}> = [
  // Politics & Governance
  { category: 'politics', subcategory: 'us_elections', pattern: /president|presidential|white\s*house|trump|biden/i },
  { category: 'politics', subcategory: 'us_elections', pattern: /senate|congress|house\s*(of\s*)?rep|governor|midterm/i },
  { category: 'politics', subcategory: 'elections', pattern: /elect|vote|ballot|primary|caucus|campaign/i },
  { category: 'politics', subcategory: 'policy', pattern: /immigra|gun\s*control|healthcare|abortion|supreme\s*court|legislat/i },
  { category: 'politics', subcategory: 'international', pattern: /prime\s*minister|parliament|chancellor|uk\s*pm|french\s*elect/i },

  // Economics & Finance
  { category: 'economics', subcategory: 'fed_decisions', pattern: /\bfed\b|federal\s*reserve|rate\s*cut|rate\s*hike|fomc|interest\s*rate/i },
  { category: 'economics', subcategory: 'inflation', pattern: /\bcpi\b|inflation|deflation|consumer\s*price/i },
  { category: 'economics', subcategory: 'gdp', pattern: /\bgdp\b|recession|economic\s*growth/i },
  { category: 'economics', subcategory: 'markets', pattern: /s&p|nasdaq|dow\s*jones|stock\s*market|treasury|bond\s*yield/i },
  { category: 'economics', subcategory: 'jobs', pattern: /unemploy|jobs?\s*report|nonfarm|payroll|labor\s*market/i },

  // Crypto & Web3
  { category: 'crypto', subcategory: 'bitcoin_price', pattern: /bitcoin|btc/i },
  { category: 'crypto', subcategory: 'ethereum', pattern: /ethereum|eth|pectra|sharding/i },
  { category: 'crypto', subcategory: 'defi', pattern: /defi|tvl|dex|liquidity\s*pool|yield\s*farm/i },
  { category: 'crypto', subcategory: 'regulation', pattern: /\betf\b|stablecoin|crypto\s*reg|sec\s*(crypto|bitcoin|ethereum)/i },
  { category: 'crypto', subcategory: 'general', pattern: /crypto|blockchain|nft|web3|token/i },

  // Science & Technology
  { category: 'science', subcategory: 'ai', pattern: /\bai\b|artificial\s*intelligence|gpt|openai|llm|machine\s*learn/i },
  { category: 'science', subcategory: 'space', pattern: /spacex|nasa|mars|moon|rocket|orbit|starship/i },
  { category: 'science', subcategory: 'climate', pattern: /climate|carbon|global\s*warm|emission|temperature\s*record/i },
  { category: 'science', subcategory: 'tech', pattern: /quantum|fusion|biotech|crispr|fda\s*approv/i },

  // Geopolitics
  { category: 'geopolitics', subcategory: 'conflicts', pattern: /war|conflict|invasion|cease\s*fire|military/i },
  { category: 'geopolitics', subcategory: 'diplomacy', pattern: /nato|treaty|sanction|trade\s*war|tariff|embargo/i },
  { category: 'geopolitics', subcategory: 'international', pattern: /\bun\b|united\s*nations|g7|g20|brics/i },

  // Culture & Society
  { category: 'culture', subcategory: 'awards', pattern: /oscar|grammy|emmy|golden\s*globe|nobel/i },
  { category: 'culture', subcategory: 'sports', pattern: /super\s*bowl|world\s*cup|olympics|champion/i },
  { category: 'culture', subcategory: 'entertainment', pattern: /box\s*office|movie|album|tv\s*show|streaming/i },
];

/**
 * Map raw API category string to our TopicCategory.
 * Returns null if no mapping found.
 */
function mapSourceCategory(apiCategory: string | null | undefined): TopicCategory | null {
  if (!apiCategory) return null;
  const lower = apiCategory.toLowerCase().trim();

  const categoryMap: Record<string, TopicCategory> = {
    'politics': 'politics',
    'political': 'politics',
    'us politics': 'politics',
    'world politics': 'politics',
    'economics': 'economics',
    'economy': 'economics',
    'finance': 'economics',
    'business': 'economics',
    'crypto': 'crypto',
    'cryptocurrency': 'crypto',
    'blockchain': 'crypto',
    'science': 'science',
    'technology': 'science',
    'tech': 'science',
    'ai': 'science',
    'climate': 'science',
    'geopolitics': 'geopolitics',
    'world': 'geopolitics',
    'international': 'geopolitics',
    'culture': 'culture',
    'entertainment': 'culture',
    'sports': 'culture',
    'pop culture': 'culture',
  };

  return categoryMap[lower] ?? null;
}

/**
 * Classify a market question into topic category and subcategory.
 *
 * Strategy:
 *   1. PRIMARY — Use source category from API (if mappable)
 *   2. FALLBACK — Keyword classification from question text
 *   3. DEFAULT — "culture" / "general" if nothing matches
 */
export function classifyMarket(
  question: string,
  apiCategory?: string | null
): ClassificationResult {
  // 1. Try mapping the source category first
  const mappedCategory = mapSourceCategory(apiCategory);

  // 2. Keyword classification from question text
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(question)) {
      return {
        topicCategory: mappedCategory ?? rule.category,
        topicSubcategory: rule.subcategory,
      };
    }
  }

  // 3. If source category mapped but no keyword match, use source category
  if (mappedCategory) {
    return {
      topicCategory: mappedCategory,
      topicSubcategory: 'general',
    };
  }

  // 4. Default fallback
  return {
    topicCategory: 'culture',
    topicSubcategory: 'general',
  };
}

// ============================================
// BATTLE SCORE COMPUTATION
// ============================================

/**
 * Parse volume string to numeric USD value.
 * Handles: "1234567", "1.5M", "200K", "$1,234,567"
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
 * Compute composite battle worthiness score (0-100).
 *
 * Components:
 *   volumeScore    × 0.30 — Higher volume = more reliable
 *   balanceScore   × 0.25 — Closer to 50/50 = better debate
 *   timeScore      × 0.20 — More time = more rounds possible
 *   trendingBonus  × 0.25 — Cross-platform match = interesting
 */
export function computeBattleScore(market: {
  volume: string;
  yesPrice: number; // 0-10000 basis points
  endTime: Date;
  hasCrossPlatformMatch: boolean;
}): number {
  // Volume score: log scale, max at $10M
  const volumeUsd = parseVolume(market.volume);
  const volumeScore = volumeUsd > 0 ? Math.min(1, Math.log10(volumeUsd) / 7) : 0;

  // Balance score: 1.0 at 50%, 0.0 at 0% or 100%
  // yesPrice is in basis points (0-10000), convert to 0-100
  const yesPct = market.yesPrice / 100;
  const balanceScore = 1 - Math.abs(yesPct - 50) / 50;

  // Time score: linear, max at 30 days (720 hours)
  const hoursRemaining = Math.max(0, (market.endTime.getTime() - Date.now()) / (1000 * 60 * 60));
  const timeScore = Math.min(1, hoursRemaining / 720);

  // Trending bonus: 1.0 if cross-platform match exists
  const trendingBonus = market.hasCrossPlatformMatch ? 1.0 : 0.0;

  const score = (
    volumeScore * 0.30 +
    balanceScore * 0.25 +
    timeScore * 0.20 +
    trendingBonus * 0.25
  ) * 100;

  return Math.round(score * 100) / 100; // 2 decimal places
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Assign topicCategory, topicSubcategory, and battleScore to a market.
 * Also checks for cross-platform matches to set hasCrossPlatformMatch.
 */
export async function assignTopicFields(marketId: string): Promise<void> {
  const market = await prisma.externalMarket.findUnique({
    where: { id: marketId },
    select: {
      id: true,
      question: true,
      category: true,
      volume: true,
      yesPrice: true,
      endTime: true,
      polymarketPairs: { select: { id: true }, take: 1 },
      kalshiPairs: { select: { id: true }, take: 1 },
    },
  });

  if (!market) return;

  const { topicCategory, topicSubcategory } = classifyMarket(market.question, market.category);

  const hasCrossPlatformMatch =
    market.polymarketPairs.length > 0 || market.kalshiPairs.length > 0;

  const battleScore = computeBattleScore({
    volume: market.volume,
    yesPrice: market.yesPrice,
    endTime: market.endTime,
    hasCrossPlatformMatch,
  });

  await prisma.externalMarket.update({
    where: { id: marketId },
    data: { topicCategory, topicSubcategory, battleScore },
  });
}

/**
 * Batch assign topic fields to multiple markets.
 * More efficient than calling assignTopicFields() in a loop.
 */
export async function batchAssignTopicFields(marketIds: string[]): Promise<number> {
  if (marketIds.length === 0) return 0;

  const markets = await prisma.externalMarket.findMany({
    where: { id: { in: marketIds } },
    select: {
      id: true,
      question: true,
      category: true,
      volume: true,
      yesPrice: true,
      endTime: true,
      polymarketPairs: { select: { id: true }, take: 1 },
      kalshiPairs: { select: { id: true }, take: 1 },
    },
  });

  let updated = 0;

  // Batch updates in groups of 20 to avoid overwhelming the DB
  const batchSize = 20;
  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize);

    await prisma.$transaction(
      batch.map((market) => {
        const { topicCategory, topicSubcategory } = classifyMarket(market.question, market.category);
        const hasCrossPlatformMatch =
          market.polymarketPairs.length > 0 || market.kalshiPairs.length > 0;

        const battleScore = computeBattleScore({
          volume: market.volume,
          yesPrice: market.yesPrice,
          endTime: market.endTime,
          hasCrossPlatformMatch,
        });

        return prisma.externalMarket.update({
          where: { id: market.id },
          data: { topicCategory, topicSubcategory, battleScore },
        });
      })
    );

    updated += batch.length;
  }

  return updated;
}
