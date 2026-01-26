/**
 * Top Whales API Route
 * GET: Fetch top whale traders by 24h volume
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-top-whales',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    // Parse and validate limit with max constraints
    const rawLimit = parseInt(searchParams.get('limit') || '5');
    const limit = Math.min(Math.max(rawLimit, 1), 100); // Clamp between 1 and 100

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all 24h whale trades with trader addresses
    const trades = await prisma.whaleTrade.findMany({
      where: {
        timestamp: { gte: twentyFourHoursAgo },
        traderAddress: { not: null },
      },
      select: {
        traderAddress: true,
        source: true,
        amountUsd: true,
      },
    });

    // Aggregate by trader address
    const traderMap = new Map<
      string,
      {
        address: string;
        source: MarketSource;
        volume: number;
        tradeCount: number;
      }
    >();

    for (const trade of trades) {
      if (!trade.traderAddress) continue;

      const key = `${trade.traderAddress}-${trade.source}`;
      const existing = traderMap.get(key);
      const amount = parseFloat(trade.amountUsd);

      if (existing) {
        existing.volume += amount;
        existing.tradeCount += 1;
      } else {
        traderMap.set(key, {
          address: trade.traderAddress,
          source: trade.source as MarketSource,
          volume: amount,
          tradeCount: 1,
        });
      }
    }

    // Get tracked trader aliases
    const trackedTraders = await prisma.trackedTrader.findMany({
      select: {
        address: true,
        source: true,
        alias: true,
        winRate: true,
      },
    });

    const aliasMap = new Map<string, { alias?: string; winRate?: number }>();
    for (const t of trackedTraders) {
      aliasMap.set(`${t.address}-${t.source}`, {
        alias: t.alias || undefined,
        winRate: t.winRate || undefined,
      });
    }

    // Convert to array and sort by volume
    const topWhales = Array.from(traderMap.values())
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit)
      .map((w) => {
        const key = `${w.address}-${w.source}`;
        const tracked = aliasMap.get(key);

        return {
          address: w.address,
          alias: tracked?.alias,
          source: w.source,
          volume24h: w.volume,
          winRate: tracked?.winRate ?? 0,
          tradeCount: w.tradeCount,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        topWhales,
        count: topWhales.length,
      },
    });
  } catch (error) {
    // Return empty array if database tables don't exist yet
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('does not exist') || errorMessage.includes('no such table')) {
      return NextResponse.json({
        success: true,
        data: {
          topWhales: [],
          count: 0,
        },
      });
    }

    return handleAPIError(error, 'API:WhaleTopWhales:GET');
  }
}
