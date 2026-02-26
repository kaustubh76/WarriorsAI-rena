/**
 * Matched Markets API Route
 * Finds markets on both Polymarket and Kalshi with similar topics
 * Enables arbitrage opportunities and cross-platform warrior battles
 */

import { NextResponse } from 'next/server';
import { polymarketService } from '@/services/externalMarkets/polymarketService';
import { kalshiService } from '@/services/externalMarkets/kalshiService';
import { UnifiedMarket } from '@/types/externalMarket';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';
import { marketDataCache } from '@/lib/cache/hashedCache';

// Stop words to filter out for better matching
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'will', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'should', 'would',
  'may', 'might', 'must', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
  'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'and', 'but', 'or', 'if', 'what', 'which',
  'who', 'this', 'that', 'these', 'those', 'it', 'its', 'any', 'both',
]);

// Base normalizations for grammar/abbreviation — always needed
const BASE_NORMALIZATIONS: Record<string, string> = {
  'gop': 'republican',
  'republicans': 'republican',
  'democrats': 'democrat',
  'dem': 'democrat',
  'dems': 'democrat',
  'presidential': 'president',
  'elections': 'election',
  'wins': 'win',
  'winner': 'win',
  'btc': 'bitcoin',
  'eth': 'ethereum',
  'crypto': 'cryptocurrency',
  'fed': 'federal reserve',
  'rates': 'interest rate',
  'rate': 'interest rate',
  'cpi': 'inflation',
};

interface MatchConfig {
  normalizations: Record<string, string>;
  keyTerms: string[];
}

/**
 * Build dynamic term normalizations and key terms from active market data.
 * Combines the static base set with category/keyword-driven entries
 * extracted from current ExternalMarket questions.
 */
async function buildDynamicMatchConfig(): Promise<MatchConfig> {
  const activeMarkets = await prisma.externalMarket.findMany({
    where: { status: 'active' },
    select: { question: true, category: true },
  });

  // Count word frequency across all active market questions
  const termFrequency = new Map<string, number>();
  for (const market of activeMarkets) {
    const words = market.question
      .toLowerCase()
      .replace(/[?!.,;:'"()[\]{}]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
    }
  }

  // Key terms = words appearing in 5+ active markets (sorted by frequency)
  const dynamicKeyTerms = [...termFrequency.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([term]) => term);

  // Add plural→singular normalizations for frequent terms
  const dynamicNormalizations: Record<string, string> = {};
  for (const [term, count] of termFrequency.entries()) {
    if (count >= 3 && term.endsWith('s') && term.length > 4) {
      const singular = term.slice(0, -1);
      if (termFrequency.has(singular)) {
        dynamicNormalizations[term] = singular;
      }
    }
  }

  return {
    normalizations: { ...BASE_NORMALIZATIONS, ...dynamicNormalizations },
    keyTerms: dynamicKeyTerms,
  };
}

/** Get cached dynamic match config (10 minute TTL) */
async function getDynamicMatchConfig(): Promise<MatchConfig> {
  return marketDataCache.getOrSet(
    'matched-markets:dynamic-config',
    () => buildDynamicMatchConfig(),
    600_000, // 10 minutes
  ) as Promise<MatchConfig>;
}

interface MatchedMarketPair {
  id: string;
  polymarket: {
    id: string;
    externalId: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
  };
  kalshi: {
    id: string;
    externalId: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
  };
  similarity: number;
  priceDifference: number;
  hasArbitrage: boolean;
  arbitrageStrategy?: {
    action: string;
    buyYesOn: 'polymarket' | 'kalshi';
    buyNoOn: 'polymarket' | 'kalshi';
    potentialProfit: number;
  };
}

/**
 * Extract normalized keywords from market question using dynamic normalizations
 */
function extractKeywords(question: string, normalizations: Record<string, string>): Set<string> {
  let text = question.toLowerCase();

  // Apply normalizations (base + dynamic)
  for (const [term, normalized] of Object.entries(normalizations)) {
    text = text.replace(new RegExp(`\\b${term}\\b`, 'gi'), normalized);
  }

  const words = text.split(/\W+/).filter(word =>
    word.length > 2 && !STOP_WORDS.has(word)
  );

  return new Set(words);
}

/**
 * Calculate enhanced similarity between two market questions using dynamic key terms
 */
function calculateEnhancedSimilarity(
  question1: string,
  question2: string,
  config: MatchConfig,
): number {
  const keywords1 = extractKeywords(question1, config.normalizations);
  const keywords2 = extractKeywords(question2, config.normalizations);

  if (keywords1.size === 0 || keywords2.size === 0) return 0;

  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);

  // Jaccard similarity
  const jaccard = intersection.size / union.size;

  // Boost score if key terms match (dynamically derived from active markets)
  let keyTermBoost = 0;
  for (const term of config.keyTerms) {
    if (keywords1.has(term) && keywords2.has(term)) {
      keyTermBoost += 0.15;
    }
  }

  // Cap boost at 0.3
  keyTermBoost = Math.min(keyTermBoost, 0.3);

  return Math.min(jaccard + keyTermBoost, 1.0);
}

/**
 * Calculate arbitrage opportunity
 */
function calculateArbitrage(polymarket: UnifiedMarket, kalshi: UnifiedMarket): {
  hasArbitrage: boolean;
  strategy?: {
    action: string;
    buyYesOn: 'polymarket' | 'kalshi';
    buyNoOn: 'polymarket' | 'kalshi';
    potentialProfit: number;
  };
} {
  const polyYes = polymarket.yesPrice / 100;
  const polyNo = polymarket.noPrice / 100;
  const kalshiYes = kalshi.yesPrice / 100;
  const kalshiNo = kalshi.noPrice / 100;

  // Strategy 1: Buy YES on Polymarket + NO on Kalshi
  const cost1 = polyYes + kalshiNo;

  // Strategy 2: Buy YES on Kalshi + NO on Polymarket
  const cost2 = kalshiYes + polyNo;

  if (cost1 < 0.98) { // Account for fees
    const profit = (1 - cost1) * 100;
    return {
      hasArbitrage: true,
      strategy: {
        action: `Buy YES on Polymarket at ${(polyYes * 100).toFixed(1)}%, Buy NO on Kalshi at ${(kalshiNo * 100).toFixed(1)}%`,
        buyYesOn: 'polymarket',
        buyNoOn: 'kalshi',
        potentialProfit: profit,
      },
    };
  }

  if (cost2 < 0.98) { // Account for fees
    const profit = (1 - cost2) * 100;
    return {
      hasArbitrage: true,
      strategy: {
        action: `Buy YES on Kalshi at ${(kalshiYes * 100).toFixed(1)}%, Buy NO on Polymarket at ${(polyNo * 100).toFixed(1)}%`,
        buyYesOn: 'kalshi',
        buyNoOn: 'polymarket',
        potentialProfit: profit,
      },
    };
  }

  return { hasArbitrage: false };
}

/**
 * Find matched markets between Polymarket and Kalshi
 */
async function findMatchedMarkets(
  minSimilarity: number = 0.4,
  config: MatchConfig,
): Promise<MatchedMarketPair[]> {
  // Fetch markets from both sources in parallel
  const [polymarketRaw, kalshiResponse] = await Promise.all([
    polymarketService.getActiveMarkets(100, 0),
    kalshiService.getMarkets('open', 100),
  ]);

  const polymarkets = polymarketService.normalizeMarkets(polymarketRaw);
  const kalshiMarkets = kalshiService.normalizeMarkets(kalshiResponse.markets);

  console.warn(`[Matched Markets] Comparing ${polymarkets.length} Polymarket vs ${kalshiMarkets.length} Kalshi markets (${config.keyTerms.length} dynamic key terms)`);

  const matchedPairs: MatchedMarketPair[] = [];

  for (const poly of polymarkets) {
    for (const kalshi of kalshiMarkets) {
      const similarity = calculateEnhancedSimilarity(poly.question, kalshi.question, config);

      if (similarity >= minSimilarity) {
        const priceDifference = Math.abs(poly.yesPrice - kalshi.yesPrice);
        const arbitrage = calculateArbitrage(poly, kalshi);

        matchedPairs.push({
          id: `match_${poly.id}_${kalshi.id}`,
          polymarket: {
            id: poly.id,
            externalId: poly.externalId,
            question: poly.question,
            yesPrice: poly.yesPrice,
            noPrice: poly.noPrice,
            volume: poly.volume,
          },
          kalshi: {
            id: kalshi.id,
            externalId: kalshi.externalId,
            question: kalshi.question,
            yesPrice: kalshi.yesPrice,
            noPrice: kalshi.noPrice,
            volume: kalshi.volume,
          },
          similarity,
          priceDifference,
          hasArbitrage: arbitrage.hasArbitrage,
          arbitrageStrategy: arbitrage.strategy,
        });
      }
    }
  }

  // Sort by similarity (highest first), then by arbitrage opportunity
  return matchedPairs.sort((a, b) => {
    // Prioritize arbitrage opportunities
    if (a.hasArbitrage && !b.hasArbitrage) return -1;
    if (!a.hasArbitrage && b.hasArbitrage) return 1;

    // Then by similarity
    return b.similarity - a.similarity;
  });
}

/**
 * GET /api/arena/matched-markets
 * Find markets that exist on both Polymarket and Kalshi
 *
 * Query params:
 * - minSimilarity: Minimum similarity threshold (0-1, default 0.4)
 * - onlyArbitrage: Only return pairs with arbitrage opportunities (default false)
 * - limit: Max number of pairs to return (default 50)
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'matched-markets', ...RateLimitPresets.moderateReads }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);

    // Parse and validate parameters
    const minSimilarityParam = parseFloat(searchParams.get('minSimilarity') || '0.4');
    const minSimilarity = isNaN(minSimilarityParam) ? 0.4 : Math.min(Math.max(0, minSimilarityParam), 1);

    const onlyArbitrageParam = searchParams.get('onlyArbitrage');
    const onlyArbitrage = onlyArbitrageParam === 'true';

    const limitParam = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(isNaN(limitParam) ? 50 : Math.max(1, limitParam), 100);

    // Build dynamic match config (cached 10 min) from active market data
    const matchConfig = await getDynamicMatchConfig();

    const matchedPairs = await findMatchedMarkets(minSimilarity, matchConfig);

    // Filter for arbitrage only if requested
    let filteredPairs = onlyArbitrage
      ? matchedPairs.filter(p => p.hasArbitrage)
      : matchedPairs;

    // Apply limit
    filteredPairs = filteredPairs.slice(0, limit);

    // Calculate stats
    const stats = {
      totalMatched: matchedPairs.length,
      arbitrageOpportunities: matchedPairs.filter(p => p.hasArbitrage).length,
      avgSimilarity: matchedPairs.length > 0
        ? matchedPairs.reduce((sum, p) => sum + p.similarity, 0) / matchedPairs.length
        : 0,
      avgPriceDifference: matchedPairs.length > 0
        ? matchedPairs.reduce((sum, p) => sum + p.priceDifference, 0) / matchedPairs.length
        : 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        pairs: filteredPairs,
        stats,
        timestamp: Date.now(),
      },
    });
  },
], { errorContext: 'API:MatchedMarkets:GET' });
