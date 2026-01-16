/**
 * Flow Agent Positions API Route
 * GET: Get agent's active positions on Flow chain
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { chainsToContracts, getFlowRpcUrl, getFlowFallbackRpcUrl } from '@/constants';
import { prisma } from '@/lib/prisma';

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

// Simplified ABIs
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
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Missing agentId parameter' },
        { status: 400 }
      );
    }

    // Get active (unresolved) trades for this agent
    const activeTrades = await prisma.mirrorTrade.findMany({
      where: {
        agentId: agentId,
        resolvedAt: null,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Get contract addresses
    const contracts = chainsToContracts[545];
    const predictionMarketAddress = contracts?.predictionMarket as `0x${string}`;
    const externalMarketMirrorAddress = contracts?.externalMarketMirror as `0x${string}`;

    // Group by market
    const marketPositions = new Map<
      string,
      {
        marketId: string;
        mirrorKey: string | null;
        isYes: boolean;
        totalShares: bigint;
        totalAmount: bigint;
        trades: typeof activeTrades;
      }
    >();

    for (const trade of activeTrades) {
      const key = trade.mirrorKey
        ? `mirror-${trade.mirrorKey}-${trade.isYes}`
        : `native-${trade.flowMarketId}-${trade.isYes}`;

      if (!marketPositions.has(key)) {
        marketPositions.set(key, {
          marketId: trade.flowMarketId?.toString() || '',
          mirrorKey: trade.mirrorKey,
          isYes: trade.isYes,
          totalShares: 0n,
          totalAmount: 0n,
          trades: [],
        });
      }

      const pos = marketPositions.get(key)!;
      pos.totalShares += BigInt(trade.sharesReceived || '0');
      pos.totalAmount += BigInt(trade.amount || '0');
      pos.trades.push(trade);
    }

    // Fetch current prices for each position
    const positions = [];
    for (const [, pos] of marketPositions) {
      if (pos.totalShares === 0n) continue;

      let marketData = null;
      let currentPrice = 50;

      try {
        if (pos.mirrorKey && externalMarketMirrorAddress) {
          // Mirror market
          const mirrorData = await executeWithFallback((client) =>
            client.readContract({
              address: externalMarketMirrorAddress,
              abi: externalMarketMirrorAbi,
              functionName: 'getMirrorMarket',
              args: [pos.mirrorKey as `0x${string}`],
            })
          );
          currentPrice = Number(mirrorData.externalLink.lastSyncPrice) / 100;
          marketData = {
            question: `Mirror Market (${mirrorData.externalLink.externalId})`,
            source: mirrorData.externalLink.source === 0 ? 'polymarket' : 'kalshi',
            isActive: mirrorData.externalLink.isActive,
          };
        } else if (pos.marketId && predictionMarketAddress) {
          // Native market
          const nativeData = await executeWithFallback((client) =>
            client.readContract({
              address: predictionMarketAddress,
              abi: predictionMarketAbi,
              functionName: 'getMarket',
              args: [BigInt(pos.marketId)],
            })
          );
          currentPrice = Number(pos.isYes ? nativeData.yesPrice : nativeData.noPrice) / 100;
          marketData = {
            question: nativeData.question,
            source: 'native',
            resolved: nativeData.resolved,
          };
        }
      } catch (e) {
        console.warn(`Failed to fetch market data:`, e);
      }

      // Calculate current value and unrealized PnL
      const currentValue = (pos.totalShares * BigInt(Math.floor(currentPrice * 100))) / 100n;
      const unrealizedPnL = currentValue - pos.totalAmount;

      positions.push({
        id: pos.mirrorKey ? `mirror-${pos.mirrorKey}` : `native-${pos.marketId}`,
        marketId: pos.marketId,
        mirrorKey: pos.mirrorKey,
        isYes: pos.isYes,
        shares: pos.totalShares.toString(),
        amount: pos.totalAmount.toString(),
        currentPrice,
        currentValue: currentValue.toString(),
        unrealizedPnL: unrealizedPnL.toString(),
        tradeCount: pos.trades.length,
        lastTradeAt: pos.trades[0]?.timestamp || 0,
        marketData,
      });
    }

    // Count pending trades (unconfirmed)
    const pendingCount = await prisma.mirrorTrade.count({
      where: {
        agentId: agentId,
        txHash: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        agentId,
        positions,
        positionCount: positions.length,
        pendingCount,
        hasActiveMirrorPositions: positions.some((p) => p.mirrorKey),
        totalUnrealizedPnL: positions
          .reduce((sum, p) => sum + BigInt(p.unrealizedPnL), 0n)
          .toString(),
      },
    });
  } catch (error) {
    console.error('[API] Flow agent positions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch agent positions',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
