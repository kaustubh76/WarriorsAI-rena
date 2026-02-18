/**
 * Top Whales API Route
 * GET: Fetch top whale traders by 24h volume
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MarketSource } from '@/types/externalMarket';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { userDataCache } from '@/lib/cache/hashedCache';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'whale-top-whales', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    try {
      const { searchParams } = new URL(req.url);
      // Parse and validate limit with max constraints
      const rawLimit = parseInt(searchParams.get('limit') || '5');
      const limit = Math.min(Math.max(rawLimit, 1), 100); // Clamp between 1 and 100

      // Check cache first (5-minute TTL for whale rankings)
      const cacheKey = `whale-top-whales:${limit}`;
      const cached = userDataCache.get(cacheKey);
      if (cached) {
        return NextResponse.json({ success: true, data: cached });
      }

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

      const responseData = {
        topWhales,
        count: topWhales.length,
      };

      // Cache for 5 minutes
      userDataCache.set(cacheKey, responseData, 300_000);

      return NextResponse.json({
        success: true,
        data: responseData,
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
      throw error; // Re-throw for composeMiddleware to handle
    }
  },
], { errorContext: 'API:WhaleTopWhales:GET' });
