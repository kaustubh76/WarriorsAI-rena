/**
 * Mirror Portfolio API Route
 * GET: Get user's mirror market positions (Polymarket/Kalshi)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress, createPublicClient, http } from 'viem';
import { chainsToContracts, getFlowRpcUrl, getFlowFallbackRpcUrl } from '@/constants';
import { MarketSource } from '@/types/externalMarket';

const RPC_TIMEOUT = 60000;

const FLOW_CHAIN = {
  id: 545,
  name: 'Flow Testnet',
  network: 'flow-testnet',
  nativeCurrency: { decimals: 18, name: 'Flow', symbol: 'FLOW' },
  rpcUrls: {
    default: { http: [getFlowRpcUrl()] },
    public: { http: [getFlowRpcUrl()] },
  },
} as const;

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

const flowClient = createPublicClient({
  chain: FLOW_CHAIN,
  transport: http(getFlowRpcUrl(), { timeout: RPC_TIMEOUT }),
});

const flowFallbackClient = createPublicClient({
  chain: FLOW_CHAIN,
  transport: http(getFlowFallbackRpcUrl(), { timeout: RPC_TIMEOUT }),
});

async function executeWithFallback<T>(
  operation: (client: typeof flowClient) => Promise<T>
): Promise<T> {
  try {
    return await operation(flowClient);
  } catch (error) {
    const errMsg = (error as Error).message || '';
    if (errMsg.includes('timeout') || errMsg.includes('timed out')) {
      return await operation(flowFallbackClient);
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    // Validate address
    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing address parameter' },
        { status: 400 }
      );
    }

    // Get mirror trades from database (trades with mirrorKey)
    const trades = await prisma.mirrorTrade.findMany({
      where: {
        traderAddress: address.toLowerCase(),
        mirrorKey: { not: null },
        NOT: { mirrorKey: '' },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Get mirror market metadata
    const mirrorKeys = [...new Set(trades.map((t) => t.mirrorKey).filter(Boolean))];
    const mirrorMarkets = await prisma.mirrorMarket.findMany({
      where: {
        mirrorKey: { in: mirrorKeys as string[] },
      },
    });

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
          onChainData = await executeWithFallback((client) =>
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
  } catch (error) {
    console.error('[API] Mirror portfolio error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch mirror portfolio',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
