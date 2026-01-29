/**
 * GET /api/arena/arbitrage-opportunities
 * Find arbitrage opportunities between Polymarket and Kalshi
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const minSpread = parseFloat(searchParams.get('minSpread') || '5');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Query matched market pairs with arbitrage opportunities
    const where: any = {
      hasArbitrage: true,
      isActive: true,
    };

    // If search query provided, filter by question text
    if (search) {
      where.OR = [
        { polymarketQuestion: { contains: search, mode: 'insensitive' } },
        { kalshiQuestion: { contains: search, mode: 'insensitive' } },
      ];
    }

    const matchedPairs = await prisma.matchedMarketPair.findMany({
      where,
      orderBy: { priceDifference: 'desc' },
      take: limit,
    });

    // Calculate profit details for each opportunity
    const opportunities = matchedPairs.map((pair) => {
      // Calculate arbitrage profit
      // Buy YES on cheaper market, NO on the other
      const polyYesPrice = pair.polymarketYesPrice / 10000; // Convert from bps to decimal
      const polyNoPrice = pair.polymarketNoPrice / 10000;
      const kalshiYesPrice = pair.kalshiYesPrice / 10000;
      const kalshiNoPrice = pair.kalshiNoPrice / 10000;

      // Strategy: Buy YES + NO across both markets for less than $1
      let strategy;
      let cost;
      let potentialProfit;

      if (polyYesPrice + kalshiNoPrice < 1.0) {
        strategy = { buyYesOn: 'polymarket', buyNoOn: 'kalshi' };
        cost = polyYesPrice + kalshiNoPrice;
        potentialProfit = ((1.0 - cost) / cost) * 100;
      } else if (kalshiYesPrice + polyNoPrice < 1.0) {
        strategy = { buyYesOn: 'kalshi', buyNoOn: 'polymarket' };
        cost = kalshiYesPrice + polyNoPrice;
        potentialProfit = ((1.0 - cost) / cost) * 100;
      } else {
        // No profitable arbitrage
        return null;
      }

      // Filter by minimum spread
      if (potentialProfit < minSpread) {
        return null;
      }

      return {
        id: pair.id,
        question: pair.polymarketQuestion,
        polymarket: {
          id: pair.polymarketId,
          yesPrice: polyYesPrice * 100,
          noPrice: polyNoPrice * 100,
          volume: pair.polymarketVolume,
        },
        kalshi: {
          id: pair.kalshiId,
          yesPrice: kalshiYesPrice * 100,
          noPrice: kalshiNoPrice * 100,
          volume: pair.kalshiVolume,
        },
        spread: pair.priceDifference,
        potentialProfit: parseFloat(potentialProfit.toFixed(2)),
        cost: parseFloat(cost.toFixed(4)),
        strategy,
        similarity: pair.similarity,
      };
    }).filter(Boolean); // Remove null entries

    return NextResponse.json({
      success: true,
      opportunities,
      count: opportunities.length,
    });
  } catch (error) {
    console.error('[API] Error fetching arbitrage opportunities:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch arbitrage opportunities',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
