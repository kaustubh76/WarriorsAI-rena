/**
 * Native Portfolio API Route
 * GET: Get user's native market positions
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';
import { chainsToContracts } from '@/constants';
import { executeWithFlowFallbackForKey } from '@/lib/flowClient';
import { MarketSource } from '@/types/externalMarket';
import { handleAPIError, applyRateLimit, ErrorResponses, RateLimitPresets } from '@/lib/api';
import { userDataCache } from '@/lib/cache/hashedCache';

// Simplified ABI for PredictionMarketAMM
const predictionMarketAbi = [
  {
    type: 'function',
    name: 'getMarket',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'question', type: 'string' },
          { name: 'yesPrice', type: 'uint256' },
          { name: 'noPrice', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'resolved', type: 'bool' },
          { name: 'outcome', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'portfolio-native',
      ...RateLimitPresets.moderateReads,
    });

    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    // Validate address
    if (!address || !isAddress(address)) {
      throw ErrorResponses.badRequest('Invalid or missing address parameter');
    }

    // Get native trades from database (cache 30s via userDataCache)
    const cacheKey = `portfolio-native:${address.toLowerCase()}`;
    const trades = await userDataCache.getOrSet(
      cacheKey,
      () => prisma.mirrorTrade.findMany({
        where: {
          traderAddress: address.toLowerCase(),
          OR: [
            { mirrorKey: null },
            { mirrorKey: '' },
          ],
        },
        orderBy: {
          timestamp: 'desc',
        },
      }),
      30_000 // 30s TTL — portfolio positions change with trades
    ) as Awaited<ReturnType<typeof prisma.mirrorTrade.findMany>>;

    // Group trades by market
    const marketPositions = new Map<
      string,
      {
        marketId: string;
        trades: typeof trades;
        totalShares: bigint;
        totalCost: bigint;
        isYes: boolean;
      }
    >();

    for (const trade of trades) {
      const key = `${trade.flowMarketId}-${trade.isYes}`;
      if (!marketPositions.has(key)) {
        marketPositions.set(key, {
          marketId: trade.flowMarketId?.toString() || '',
          trades: [],
          totalShares: 0n,
          totalCost: 0n,
          isYes: trade.isYes,
        });
      }
      const pos = marketPositions.get(key)!;
      pos.trades.push(trade);
      pos.totalShares += BigInt(trade.sharesReceived || '0');
      pos.totalCost += BigInt(trade.amount || '0');
    }

    // Get contract address
    const contracts = chainsToContracts[545];
    const predictionMarketAddress = contracts?.predictionMarket as `0x${string}`;

    // Fetch current market data for each position
    const positions = [];
    for (const [, pos] of marketPositions) {
      if (!pos.marketId || pos.totalShares === 0n) continue;

      let marketData = null;
      try {
        if (predictionMarketAddress) {
          marketData = await executeWithFlowFallbackForKey(pos.marketId, (client) =>
            client.readContract({
              address: predictionMarketAddress,
              abi: predictionMarketAbi,
              functionName: 'getMarket',
              args: [BigInt(pos.marketId)],
            })
          );
        }
      } catch (e) {
        console.warn(`Failed to fetch market ${pos.marketId}:`, e);
      }

      const currentPrice = marketData
        ? Number(pos.isYes ? marketData.yesPrice : marketData.noPrice) / 100
        : 50;
      const avgPrice =
        pos.totalShares > 0n
          ? Number((pos.totalCost * 100n) / pos.totalShares) / 100
          : 50;

      // Calculate unrealized PnL
      const currentValue = (pos.totalShares * BigInt(Math.floor(currentPrice * 100))) / 100n;
      const unrealizedPnL = currentValue - pos.totalCost;

      positions.push({
        id: `native-${pos.marketId}-${pos.isYes ? 'yes' : 'no'}`,
        marketId: pos.marketId,
        marketQuestion: marketData?.question || 'Unknown Market',
        source: MarketSource.NATIVE,
        isYes: pos.isYes,
        shares: pos.totalShares.toString(),
        avgPrice,
        currentPrice,
        unrealizedPnL: unrealizedPnL.toString(),
        realizedPnL: '0', // Would need resolution data
        entryTimestamp: pos.trades[0]?.timestamp || 0,
        resolved: marketData?.resolved || false,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        positions,
        count: positions.length,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Portfolio:Native:GET');
  }
}
