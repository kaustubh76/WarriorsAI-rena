/**
 * Matched Markets API Route
 * Finds markets on both Polymarket and Kalshi with similar topics
 * Enables arbitrage opportunities and cross-platform warrior battles
 */

import { NextRequest, NextResponse } from 'next/server';
import { polymarketService } from '@/services/externalMarkets/polymarketService';
import { kalshiService } from '@/services/externalMarkets/kalshiService';
import { UnifiedMarket } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit, validateBoolean } from '@/lib/api';

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

// Common term normalizations for prediction markets
const TERM_NORMALIZATIONS: Record<string, string> = {
  'trump': 'trump',
  'donald trump': 'trump',
  'president trump': 'trump',
  'biden': 'biden',
  'joe biden': 'biden',
  'president biden': 'biden',
  'gop': 'republican',
  'republicans': 'republican',
  'democrats': 'democrat',
  'dem': 'democrat',
  'dems': 'democrat',
  'presidential': 'president',
  'election': 'election',
  'elections': 'election',
  'win': 'win',
  'wins': 'win',
  'winner': 'win',
  '2024': '2024',
  '2025': '2025',
  'btc': 'bitcoin',
  'eth': 'ethereum',
  'crypto': 'cryptocurrency',
  'fed': 'federal reserve',
  'rate': 'interest rate',
  'rates': 'interest rate',
  'gdp': 'gdp',
  'inflation': 'inflation',
  'cpi': 'inflation',
};

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
 * Extract normalized keywords from market question
 */
function extractKeywords(question: string): Set<string> {
  // Convert to lowercase and extract words
  let text = question.toLowerCase();

  // Apply normalizations
  for (const [term, normalized] of Object.entries(TERM_NORMALIZATIONS)) {
    text = text.replace(new RegExp(`\\b${term}\\b`, 'gi'), normalized);
  }

  // Split into words and filter
  const words = text.split(/\W+/).filter(word =>
    word.length > 2 && !STOP_WORDS.has(word)
  );

  return new Set(words);
}

/**
 * Calculate enhanced similarity between two market questions
 */
function calculateEnhancedSimilarity(question1: string, question2: string): number {
  const keywords1 = extractKeywords(question1);
  const keywords2 = extractKeywords(question2);

  if (keywords1.size === 0 || keywords2.size === 0) return 0;

  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);

  // Jaccard similarity
  const jaccard = intersection.size / union.size;

  // Boost score if key terms match (names, years, specific events)
  const keyTerms = ['trump', 'biden', 'election', '2024', '2025', 'bitcoin', 'ethereum', 'federal reserve'];
  let keyTermBoost = 0;
  for (const term of keyTerms) {
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
  minSimilarity: number = 0.4
): Promise<MatchedMarketPair[]> {
  // Fetch markets from both sources in parallel
  const [polymarketRaw, kalshiResponse] = await Promise.all([
    polymarketService.getActiveMarkets(100, 0),
    kalshiService.getMarkets('open', 100),
  ]);

  const polymarkets = polymarketService.normalizeMarkets(polymarketRaw);
  const kalshiMarkets = kalshiService.normalizeMarkets(kalshiResponse.markets);

  console.log(`[Matched Markets] Comparing ${polymarkets.length} Polymarket vs ${kalshiMarkets.length} Kalshi markets`);

  const matchedPairs: MatchedMarketPair[] = [];

  for (const poly of polymarkets) {
    for (const kalshi of kalshiMarkets) {
      const similarity = calculateEnhancedSimilarity(poly.question, kalshi.question);

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
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting (30/min due to heavy computation)
    applyRateLimit(request, {
      prefix: 'matched-markets',
      maxRequests: 30,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);

    // Parse and validate parameters
    const minSimilarityParam = parseFloat(searchParams.get('minSimilarity') || '0.4');
    const minSimilarity = isNaN(minSimilarityParam) ? 0.4 : Math.min(Math.max(0, minSimilarityParam), 1);

    const onlyArbitrageParam = searchParams.get('onlyArbitrage');
    const onlyArbitrage = onlyArbitrageParam === 'true';

    const limitParam = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(isNaN(limitParam) ? 50 : Math.max(1, limitParam), 100);

    const matchedPairs = await findMatchedMarkets(minSimilarity);

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
  } catch (error) {
    return handleAPIError(error, 'API:MatchedMarkets:GET');
  }
}
