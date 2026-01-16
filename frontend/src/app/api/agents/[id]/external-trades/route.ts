/**
 * API Route: Get external trade history for an agent
 * Returns trades executed on external markets (Polymarket, Kalshi)
 */

import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MarketSource } from '@/types/externalMarket';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agentId = id;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const source = searchParams.get('source') as 'polymarket' | 'kalshi' | null;

    // Get total count for pagination
    const totalCount = await prisma.mirrorTrade.count({
      where: {
        agentId: agentId,
        mirrorKey: { not: null },
        NOT: { mirrorKey: '' },
      },
    });

    // Get external trades for this agent (trades with mirrorKey)
    const trades = await prisma.mirrorTrade.findMany({
      where: {
        agentId: agentId,
        mirrorKey: { not: null },
        NOT: { mirrorKey: '' },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Get mirror market metadata for these trades
    const mirrorKeys = [...new Set(trades.map((t) => t.mirrorKey).filter(Boolean))];
    const mirrorMarkets = await prisma.mirrorMarket.findMany({
      where: {
        mirrorKey: { in: mirrorKeys as string[] },
      },
    });

    const mirrorMarketMap = new Map(
      mirrorMarkets.map((m) => [m.mirrorKey, m])
    );

    // Format trades with market metadata
    let formattedTrades = trades.map((trade) => {
      const mirrorMarket = trade.mirrorKey
        ? mirrorMarketMap.get(trade.mirrorKey)
        : null;

      const tradeSource =
        mirrorMarket?.source === 'polymarket'
          ? MarketSource.POLYMARKET
          : mirrorMarket?.source === 'kalshi'
          ? MarketSource.KALSHI
          : MarketSource.NATIVE;

      return {
        id: trade.id,
        marketId: trade.flowMarketId?.toString() || '',
        mirrorKey: trade.mirrorKey,
        source: tradeSource,
        marketQuestion: mirrorMarket?.question || 'Unknown Market',
        externalId: mirrorMarket?.externalId || null,
        isYes: trade.isYes,
        amount: trade.amount,
        sharesReceived: trade.sharesReceived,
        pnl: trade.pnl || '0',
        won: trade.pnl ? BigInt(trade.pnl) > 0n : null,
        txHash: trade.txHash,
        timestamp: trade.timestamp,
        resolvedAt: trade.resolvedAt,
      };
    });

    // Filter by source if specified
    if (source) {
      const filterSource =
        source === 'polymarket'
          ? MarketSource.POLYMARKET
          : MarketSource.KALSHI;
      formattedTrades = formattedTrades.filter((t) => t.source === filterSource);
    }

    // Calculate summary stats
    const totalPnL = formattedTrades.reduce(
      (sum, t) => sum + BigInt(t.pnl || '0'),
      0n
    );
    const wins = formattedTrades.filter((t) => t.won === true).length;
    const losses = formattedTrades.filter((t) => t.won === false).length;

    return NextResponse.json({
      success: true,
      agentId,
      trades: formattedTrades,
      total: totalCount,
      limit,
      offset,
      hasMore: offset + trades.length < totalCount,
      summary: {
        totalTrades: formattedTrades.length,
        totalPnL: totalPnL.toString(),
        wins,
        losses,
        winRate: formattedTrades.length > 0
          ? ((wins / formattedTrades.length) * 100).toFixed(1)
          : '0',
        bySource: {
          polymarket: formattedTrades.filter(
            (t) => t.source === MarketSource.POLYMARKET
          ).length,
          kalshi: formattedTrades.filter(
            (t) => t.source === MarketSource.KALSHI
          ).length,
        },
      },
    });
  } catch (error) {
    console.error('[External Trades API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        trades: [],
      },
      { status: 500 }
    );
  }
}
