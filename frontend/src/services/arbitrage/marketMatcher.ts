/**
 * Arbitrage Market Matcher Service
 *
 * Background service that:
 * 1. Finds arbitrage opportunities from external markets service
 * 2. Caches opportunities in MatchedMarketPair table
 * 3. Updates similarity scores and price differences
 * 4. Deactivates stale opportunities
 */

import { prisma } from '@/lib/prisma';
import { externalMarketsService } from '@/services/externalMarkets';
import { ArbitrageOpportunity } from '@/types/externalMarket';

// ============================================
// TYPES
// ============================================

interface MatcherResult {
  opportunitiesFound: number;
  pairsCreated: number;
  pairsUpdated: number;
  pairsDeactivated: number;
  duration: number;
  errors: string[];
}

// ============================================
// ARBITRAGE MARKET MATCHER CLASS
// ============================================

export class ArbitrageMarketMatcher {
  /**
   * Find and cache arbitrage opportunities
   * @param minSpread Minimum profit spread percentage (default 5%)
   * @returns Summary of matching results
   */
  async findAndCacheOpportunities(minSpread = 5): Promise<MatcherResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let pairsCreated = 0;
    let pairsUpdated = 0;
    let pairsDeactivated = 0;

    try {
      console.log(`[MarketMatcher] Searching for arbitrage opportunities (min spread: ${minSpread}%)...`);

      // 1. Find opportunities using external markets service
      const opportunities = await externalMarketsService.findArbitrageOpportunities(minSpread);

      console.log(`[MarketMatcher] Found ${opportunities.length} potential opportunities`);

      // Track which pairs we've seen in this run
      const activePairIds = new Set<string>();

      // 2. Upsert each opportunity to MatchedMarketPair table
      for (const opp of opportunities) {
        try {
          const result = await this.upsertOpportunity(opp, minSpread);

          if (result === 'created') pairsCreated++;
          else if (result === 'updated') pairsUpdated++;

          // Track as active
          const pairId = this.generatePairId(
            opp.market1.source,
            opp.market1.marketId,
            opp.market2.source,
            opp.market2.marketId
          );
          activePairIds.add(pairId);
        } catch (error) {
          const errorMsg = `Failed to upsert opportunity ${opp.id}: ${(error as Error).message}`;
          console.error(`[MarketMatcher] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      // 3. Deactivate pairs that no longer meet criteria
      pairsDeactivated = await this.deactivateStalePairs(activePairIds, minSpread);

      const duration = Date.now() - startTime;

      console.log(`[MarketMatcher] Matching complete:`, {
        opportunitiesFound: opportunities.length,
        pairsCreated,
        pairsUpdated,
        pairsDeactivated,
        duration: `${duration}ms`,
        errors: errors.length
      });

      return {
        opportunitiesFound: opportunities.length,
        pairsCreated,
        pairsUpdated,
        pairsDeactivated,
        duration,
        errors
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = `Market matching failed: ${(error as Error).message}`;
      console.error(`[MarketMatcher] ${errorMsg}`);
      errors.push(errorMsg);

      return {
        opportunitiesFound: 0,
        pairsCreated,
        pairsUpdated,
        pairsDeactivated,
        duration,
        errors
      };
    }
  }

  /**
   * Upsert a single arbitrage opportunity to database
   */
  private async upsertOpportunity(
    opp: ArbitrageOpportunity,
    minSpread: number
  ): Promise<'created' | 'updated'> {
    // Use the full market IDs (they are already in format "poly_xxx" or "kalshi_xxx")
    const market1Id = opp.market1.marketId;
    const market2Id = opp.market2.marketId;

    // Determine which is Polymarket and which is Kalshi
    const isMarket1Poly = opp.market1.source === 'polymarket';
    const polymarketId = isMarket1Poly ? market1Id : market2Id;
    const kalshiId = isMarket1Poly ? market2Id : market1Id;
    const polyMarket = isMarket1Poly ? opp.market1 : opp.market2;
    const kalshiMarket = isMarket1Poly ? opp.market2 : opp.market1;

    // Calculate similarity (from the opportunity's confidence)
    const similarity = opp.confidence || 0.8;

    // Determine arbitrage strategy
    const strategy = {
      market1: opp.market1.source,
      side1: opp.market1.yesPrice < opp.market2.yesPrice ? 'YES' : 'NO',
      market2: opp.market2.source,
      side2: opp.market1.yesPrice < opp.market2.yesPrice ? 'NO' : 'YES',
      expectedProfit: opp.potentialProfit,
      spread: opp.spread
    };

    // Market data fields required by Prisma schema
    const marketData = {
      polymarketQuestion: polyMarket.question,
      polymarketYesPrice: polyMarket.yesPrice,
      polymarketNoPrice: polyMarket.noPrice,
      polymarketVolume: polyMarket.volume || '0',
      kalshiQuestion: kalshiMarket.question,
      kalshiYesPrice: kalshiMarket.yesPrice,
      kalshiNoPrice: kalshiMarket.noPrice,
      kalshiVolume: kalshiMarket.volume || '0',
    };

    // Check if pair already exists
    const existing = await prisma.matchedMarketPair.findUnique({
      where: {
        polymarketId_kalshiId: {
          polymarketId,
          kalshiId
        }
      }
    });

    if (!existing) {
      // Create new pair
      await prisma.matchedMarketPair.create({
        data: {
          polymarketId,
          kalshiId,
          ...marketData,
          similarity,
          priceDifference: opp.spread,
          hasArbitrage: true,
          isActive: true,
          arbitrageStrategy: JSON.stringify(strategy),
          minSpread,
          lastChecked: new Date()
        }
      });

      return 'created';
    } else {
      // Update existing pair with fresh prices
      await prisma.matchedMarketPair.update({
        where: {
          polymarketId_kalshiId: {
            polymarketId,
            kalshiId
          }
        },
        data: {
          ...marketData,
          similarity,
          priceDifference: opp.spread,
          hasArbitrage: true,
          isActive: true,
          arbitrageStrategy: JSON.stringify(strategy),
          minSpread,
          lastChecked: new Date()
        }
      });

      return 'updated';
    }
  }

  /**
   * Deactivate pairs that were not found in this scan
   */
  private async deactivateStalePairs(
    activePairIds: Set<string>,
    minSpread: number
  ): Promise<number> {
    try {
      // Get all currently active pairs
      const activePairs = await prisma.matchedMarketPair.findMany({
        where: {
          isActive: true,
          hasArbitrage: true,
          minSpread: { lte: minSpread }
        }
      });

      let deactivated = 0;

      for (const pair of activePairs) {
        const pairId = this.generatePairId(
          'polymarket',
          pair.polymarketId,
          'kalshi',
          pair.kalshiId
        );

        // If not in active set, deactivate
        if (!activePairIds.has(pairId)) {
          await prisma.matchedMarketPair.update({
            where: { id: pair.id },
            data: {
              hasArbitrage: false,
              isActive: false,
              lastChecked: new Date()
            }
          });
          deactivated++;
        }
      }

      if (deactivated > 0) {
        console.log(`[MarketMatcher] Deactivated ${deactivated} stale pairs`);
      }

      return deactivated;
    } catch (error) {
      console.error('[MarketMatcher] Failed to deactivate stale pairs:', error);
      return 0;
    }
  }

  /**
   * Generate consistent pair ID for tracking
   */
  private generatePairId(
    source1: string,
    marketId1: string,
    source2: string,
    marketId2: string
  ): string {
    // Always put polymarket first for consistency
    if (source1 === 'polymarket') {
      return `${marketId1}_${marketId2}`;
    } else {
      return `${marketId2}_${marketId1}`;
    }
  }

  /**
   * Get active arbitrage opportunities from database
   */
  async getActiveOpportunities(minSpread = 5): Promise<any[]> {
    const pairs = await prisma.matchedMarketPair.findMany({
      where: {
        isActive: true,
        hasArbitrage: true,
        priceDifference: { gte: minSpread }
      },
      include: {
        polymarket: true,
        kalshi: true
      },
      orderBy: {
        priceDifference: 'desc'
      }
    });

    return pairs.map(pair => ({
      id: `arb_${pair.polymarketId}_${pair.kalshiId}`,
      question: pair.polymarket?.question || pair.kalshi?.question || 'Unknown',
      polymarket: {
        id: pair.polymarketId,
        yesPrice: (pair.polymarket?.yesPrice || 0) / 100,
        noPrice: (pair.polymarket?.noPrice || 0) / 100,
        volume: pair.polymarket?.volume || '0',
        liquidity: pair.polymarket?.liquidity || '0'
      },
      kalshi: {
        id: pair.kalshiId,
        yesPrice: (pair.kalshi?.yesPrice || 0) / 100,
        noPrice: (pair.kalshi?.noPrice || 0) / 100,
        volume: pair.kalshi?.volume || '0',
        liquidity: pair.kalshi?.liquidity || '0'
      },
      spread: pair.priceDifference,
      potentialProfit: JSON.parse(pair.arbitrageStrategy || '{}').expectedProfit || 0,
      cost: 1 - (JSON.parse(pair.arbitrageStrategy || '{}').expectedProfit || 0) / 100,
      strategy: JSON.parse(pair.arbitrageStrategy || '{}')
    }));
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const arbitrageMarketMatcher = new ArbitrageMarketMatcher();
export default arbitrageMarketMatcher;
