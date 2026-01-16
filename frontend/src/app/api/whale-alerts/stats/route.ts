/**
 * Whale Stats API Route
 * GET: Fetch aggregated whale trading statistics
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Get 24h trades
    const trades24h = await prisma.whaleTrade.findMany({
      where: {
        timestamp: { gte: twentyFourHoursAgo },
      },
      select: {
        amountUsd: true,
      },
    });

    // Get previous 24h trades (24-48h ago) for comparison
    const tradesPrev24h = await prisma.whaleTrade.findMany({
      where: {
        timestamp: {
          gte: fortyEightHoursAgo,
          lt: twentyFourHoursAgo,
        },
      },
      select: {
        amountUsd: true,
      },
    });

    // Get tracked trader count
    const trackedTraderCount = await prisma.trackedTrader.count();

    // Calculate current 24h stats
    const totalVolume24h = trades24h.reduce(
      (sum, t) => sum + parseFloat(t.amountUsd),
      0
    );
    const tradeCount24h = trades24h.length;
    const avgTradeSize = tradeCount24h > 0 ? totalVolume24h / tradeCount24h : 0;

    // Calculate previous 24h stats for change comparison
    const prevVolume = tradesPrev24h.reduce(
      (sum, t) => sum + parseFloat(t.amountUsd),
      0
    );
    const prevTradeCount = tradesPrev24h.length;
    const prevAvgTradeSize =
      prevTradeCount > 0 ? prevVolume / prevTradeCount : 0;

    // Calculate percentage changes
    const volumeChange24h =
      prevVolume > 0 ? ((totalVolume24h - prevVolume) / prevVolume) * 100 : 0;
    const tradeCountChange =
      prevTradeCount > 0
        ? ((tradeCount24h - prevTradeCount) / prevTradeCount) * 100
        : 0;
    const avgTradeSizeChange =
      prevAvgTradeSize > 0
        ? ((avgTradeSize - prevAvgTradeSize) / prevAvgTradeSize) * 100
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalVolume24h,
        tradeCount24h,
        avgTradeSize,
        volumeChange24h,
        tradeCountChange,
        avgTradeSizeChange,
        trackedTraderCount,
      },
    });
  } catch (error) {
    console.error('[API] Whale stats error:', error);

    // Return default values if database tables don't exist yet
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('does not exist') || errorMessage.includes('no such table')) {
      return NextResponse.json({
        success: true,
        data: {
          totalVolume24h: 0,
          tradeCount24h: 0,
          avgTradeSize: 0,
          volumeChange24h: 0,
          tradeCountChange: 0,
          avgTradeSizeChange: 0,
          trackedTraderCount: 0,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch whale stats',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
