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
 * For arbitrage battles, fetches explicit cross-platform data.
 * For trending markets, auto-discovers cross-platform pair via MatchedMarketPair.
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

    // For arbitrage battles, fetch explicit cross-platform data
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

    // For non-arbitrage battles, auto-discover cross-platform data from MatchedMarketPair
    // This enriches trending topic debates with "expert forecasters disagree" context
    if (!isArbitrageBattle && !marketData.crossPlatformPrice) {
      const matchedPair = source === 'polymarket'
        ? await prisma.matchedMarketPair.findFirst({
            where: { polymarketId: externalMarket.id, isActive: true, hasArbitrage: true },
            select: { kalshiYesPrice: true, priceDifference: true },
          })
        : await prisma.matchedMarketPair.findFirst({
            where: { kalshiId: externalMarket.id, isActive: true, hasArbitrage: true },
            select: { polymarketYesPrice: true, priceDifference: true },
          });

      if (matchedPair) {
        const crossPrice = source === 'polymarket'
          ? (matchedPair as { kalshiYesPrice: number }).kalshiYesPrice
          : (matchedPair as { polymarketYesPrice: number }).polymarketYesPrice;

        marketData.crossPlatformPrice = crossPrice / 100;
        marketData.crossPlatformSource = source === 'polymarket' ? 'kalshi' : 'polymarket';
        marketData.spread = Math.abs(
          (externalMarket.yesPrice - crossPrice) / 100
        );
      }
    }

    return marketData;
  } catch (err) {
    console.warn(`[MarketDataService] Failed to fetch market data for ${externalMarketId}:`, err);
    return undefined;
  }
}
