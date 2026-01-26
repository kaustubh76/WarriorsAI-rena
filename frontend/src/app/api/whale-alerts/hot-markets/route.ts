/**
 * Hot Markets API Route
 * GET: Fetch markets with most whale activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-hot-markets',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5');

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all 24h whale trades grouped by market
    const trades = await prisma.whaleTrade.findMany({
      where: {
        timestamp: { gte: twentyFourHoursAgo },
      },
      select: {
        marketId: true,
        marketQuestion: true,
        source: true,
        outcome: true,
        amountUsd: true,
      },
    });

    // Aggregate by market
    const marketMap = new Map<
      string,
      {
        marketId: string;
        question: string;
        source: MarketSource;
        tradeCount: number;
        yesCount: number;
        totalVolume: number;
      }
    >();

    for (const trade of trades) {
      const existing = marketMap.get(trade.marketId);
      const amount = parseFloat(trade.amountUsd);

      if (existing) {
        existing.tradeCount += 1;
        existing.yesCount += trade.outcome === 'yes' ? 1 : 0;
        existing.totalVolume += amount;
      } else {
        marketMap.set(trade.marketId, {
          marketId: trade.marketId,
          question: trade.marketQuestion,
          source: trade.source as MarketSource,
          tradeCount: 1,
          yesCount: trade.outcome === 'yes' ? 1 : 0,
          totalVolume: amount,
        });
      }
    }

    // Convert to array and sort by trade count
    const hotMarkets = Array.from(marketMap.values())
      .sort((a, b) => b.tradeCount - a.tradeCount)
      .slice(0, limit)
      .map((m) => ({
        marketId: m.marketId,
        question: m.question,
        source: m.source,
        whaleTradeCount: m.tradeCount,
        bullishPercent:
          m.tradeCount > 0 ? Math.round((m.yesCount / m.tradeCount) * 100) : 50,
        totalVolume: m.totalVolume,
      }));

    return NextResponse.json({
      success: true,
      data: {
        hotMarkets,
        count: hotMarkets.length,
      },
    });
  } catch (error) {
    // Return empty array if database tables don't exist yet
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('does not exist') || errorMessage.includes('no such table')) {
      return NextResponse.json({
        success: true,
        data: {
          hotMarkets: [],
          count: 0,
        },
      });
    }

    return handleAPIError(error, 'API:WhaleHotMarkets:GET');
  }
}
