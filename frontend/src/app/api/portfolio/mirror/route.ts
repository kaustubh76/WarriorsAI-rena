/**
 * Mirror Portfolio API Route
 * GET: Get user's mirror market positions (Polymarket/Kalshi)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';
import { chainsToContracts } from '@/constants';
import { executeWithFlowFallbackForKey } from '@/lib/flowClient';
import { MarketSource } from '@/types/externalMarket';
import { RateLimitPresets, ErrorResponses } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { userDataCache } from '@/lib/cache/hashedCache';

// Simplified ABI for ExternalMarketMirror
const externalMarketMirrorAbi = [
  {
    type: 'function',
    name: 'getMirrorMarket',
    inputs: [{ name: 'mirrorKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'flowMarketId', type: 'uint256' },
          {
            name: 'externalLink',
            type: 'tuple',
            components: [
              { name: 'externalId', type: 'string' },
              { name: 'source', type: 'uint8' },
              { name: 'lastSyncPrice', type: 'uint256' },
              { name: 'lastSyncTime', type: 'uint256' },
              { name: 'isActive', type: 'bool' },
            ],
          },
          { name: 'totalMirrorVolume', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'creator', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'portfolio-mirror', ...RateLimitPresets.moderateReads }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    // Validate address
    if (!address || !isAddress(address)) {
      throw ErrorResponses.badRequest('Invalid or missing address parameter');
    }

    // Get mirror trades + market metadata from DB (cache 30s via userDataCache)
    const cacheKey = `portfolio-mirror:${address.toLowerCase()}`;
    const { trades, mirrorMarkets } = await userDataCache.getOrSet(
      cacheKey,
      async () => {
        const t = await prisma.mirrorTrade.findMany({
          where: {
            traderAddress: address.toLowerCase(),
            mirrorKey: { not: null },
            NOT: { mirrorKey: '' },
          },
          orderBy: {
            timestamp: 'desc',
          },
        });
        const keys = [...new Set(t.map((tr) => tr.mirrorKey).filter(Boolean))];
        const mm = await prisma.mirrorMarket.findMany({
          where: {
            mirrorKey: { in: keys as string[] },
          },
        });
        return { trades: t, mirrorMarkets: mm };
      },
      30_000 // 30s TTL — portfolio positions change with trades
    ) as {
      trades: Awaited<ReturnType<typeof prisma.mirrorTrade.findMany>>;
      mirrorMarkets: Awaited<ReturnType<typeof prisma.mirrorMarket.findMany>>;
    };

    // Get mirror market keys for RPC lookups
    const mirrorKeys = [...new Set(trades.map((t) => t.mirrorKey).filter(Boolean))];

    const mirrorMarketMap = new Map(
      mirrorMarkets.map((m) => [m.mirrorKey, m])
    );

    // Group trades by mirror market and outcome
    const marketPositions = new Map<
      string,
      {
        mirrorKey: string;
        trades: typeof trades;
        totalShares: bigint;
        totalCost: bigint;
        isYes: boolean;
        source: MarketSource;
      }
    >();

    for (const trade of trades) {
      if (!trade.mirrorKey) continue;
      const mirrorMarket = mirrorMarketMap.get(trade.mirrorKey);
      const source = mirrorMarket?.source === 'polymarket'
        ? MarketSource.POLYMARKET
        : mirrorMarket?.source === 'kalshi'
        ? MarketSource.KALSHI
        : MarketSource.NATIVE;

      const key = `${trade.mirrorKey}-${trade.isYes}`;
      if (!marketPositions.has(key)) {
        marketPositions.set(key, {
          mirrorKey: trade.mirrorKey,
          trades: [],
          totalShares: 0n,
          totalCost: 0n,
          isYes: trade.isYes,
          source,
        });
      }
      const pos = marketPositions.get(key)!;
      pos.trades.push(trade);
      pos.totalShares += BigInt(trade.sharesReceived || '0');
      pos.totalCost += BigInt(trade.amount || '0');
    }

    // Get contract address
    const contracts = chainsToContracts[545];
    const externalMarketMirrorAddress = contracts?.externalMarketMirror as `0x${string}`;

    // Fetch current market data for each position
    const positions = [];
    for (const [, pos] of marketPositions) {
      if (pos.totalShares === 0n) continue;

      const mirrorMarket = mirrorMarketMap.get(pos.mirrorKey);

      let onChainData = null;
      try {
        if (externalMarketMirrorAddress) {
          onChainData = await executeWithFlowFallbackForKey(pos.mirrorKey, (client) =>
            client.readContract({
              address: externalMarketMirrorAddress,
              abi: externalMarketMirrorAbi,
              functionName: 'getMirrorMarket',
              args: [pos.mirrorKey as `0x${string}`],
            })
          );
        }
      } catch (e) {
        console.warn(`Failed to fetch mirror market ${pos.mirrorKey}:`, e);
      }

      const currentPrice = onChainData?.externalLink
        ? Number(onChainData.externalLink.lastSyncPrice) / 100
        : 50;
      const avgPrice =
        pos.totalShares > 0n
          ? Number((pos.totalCost * 100n) / pos.totalShares) / 100
          : 50;

      // Calculate unrealized PnL
      const currentValue = (pos.totalShares * BigInt(Math.floor(currentPrice * 100))) / 100n;
      const unrealizedPnL = currentValue - pos.totalCost;

      positions.push({
        id: `mirror-${pos.mirrorKey}-${pos.isYes ? 'yes' : 'no'}`,
        marketId: pos.mirrorKey,
        marketQuestion: mirrorMarket?.question || 'Unknown Market',
        source: pos.source,
        isYes: pos.isYes,
        shares: pos.totalShares.toString(),
        avgPrice,
        currentPrice,
        unrealizedPnL: unrealizedPnL.toString(),
        realizedPnL: '0', // Would need resolution data
        entryTimestamp: pos.trades[0]?.timestamp || 0,
        externalId: mirrorMarket?.externalId || onChainData?.externalLink?.externalId,
        isActive: onChainData?.externalLink?.isActive ?? true,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        positions,
        count: positions.length,
        bySource: {
          polymarket: positions.filter((p) => p.source === MarketSource.POLYMARKET).length,
          kalshi: positions.filter((p) => p.source === MarketSource.KALSHI).length,
        },
      },
    });
  },
], { errorContext: 'API:Portfolio:Mirror:GET' });
