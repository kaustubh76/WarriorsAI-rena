/**
 * Shared Market Data Service
 *
 * Fetches real market data from synced ExternalMarket records for
 * context-enriched debates. Used by both battle creation and execution routes.
 *
 * Returns undefined if market data unavailable (graceful degradation
 * to template-based evidence).
 */

import { prisma } from '@/lib/prisma';
import { RealMarketData, MarketSource } from '@/types/predictionArena';

/**
 * Fetch market data for a battle from the ExternalMarket table.
 * For arbitrage battles, also fetches cross-platform data.
 */
export async function fetchMarketDataForBattle(
  externalMarketId: string,
  source: string,
  isArbitrageBattle: boolean,
  kalshiMarketId: string | null,
): Promise<RealMarketData | undefined> {
  try {
    const externalMarket = await prisma.externalMarket.findFirst({
      where: { externalId: externalMarketId, source },
    });

    if (!externalMarket) return undefined;

    const marketData: RealMarketData = {
      yesPrice: externalMarket.yesPrice / 100,  // basis points → 0-100
      noPrice: externalMarket.noPrice / 100,
      volume: externalMarket.volume,
      liquidity: externalMarket.liquidity,
      endTime: externalMarket.endTime.toISOString(),
      category: externalMarket.category ?? undefined,
      source: source as MarketSource,
    };

    // For arbitrage battles, fetch cross-platform data
    if (isArbitrageBattle && kalshiMarketId) {
      const crossMarket = await prisma.externalMarket.findFirst({
        where: { externalId: kalshiMarketId },
      });

      if (crossMarket) {
        marketData.crossPlatformPrice = crossMarket.yesPrice / 100;
        marketData.crossPlatformSource = crossMarket.source;
        marketData.spread = Math.abs(
          (externalMarket.yesPrice - crossMarket.yesPrice) / 100
        );
      }
    }

    return marketData;
  } catch (err) {
    console.warn(`[MarketDataService] Failed to fetch market data for ${externalMarketId}:`, err);
    return undefined;
  }
}
