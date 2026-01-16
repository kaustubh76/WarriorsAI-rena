/**
 * Copy Trade Mirror History API Route
 * GET: Get user's copy trade execution history
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate address
    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing address parameter' },
        { status: 400 }
      );
    }

    // Get total count
    const total = await prisma.mirrorCopyTrade.count({
      where: {
        userId: address.toLowerCase(),
      },
    });

    // Get copy trades with pagination
    const trades = await prisma.mirrorCopyTrade.findMany({
      where: {
        userId: address.toLowerCase(),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(limit, 100), // Cap at 100
      skip: offset,
    });

    // Get original whale trades for context
    const originalTradeIds = trades
      .map((t) => t.originalTradeId)
      .filter((id) => id);

    const whaleTrades = await prisma.whaleTrade.findMany({
      where: {
        id: { in: originalTradeIds },
      },
    });

    const whaleTradeMap = new Map(whaleTrades.map((t) => [t.id, t]));

    // Get mirror market info
    const mirrorKeys = [...new Set(trades.map((t) => t.mirrorKey))];
    const mirrorMarkets = await prisma.mirrorMarket.findMany({
      where: {
        mirrorKey: { in: mirrorKeys },
      },
    });

    const mirrorMarketMap = new Map(
      mirrorMarkets.map((m) => [m.mirrorKey, m])
    );

    // Format response
    const formattedTrades = trades.map((trade) => {
      const originalTrade = whaleTradeMap.get(trade.originalTradeId);
      const mirrorMarket = mirrorMarketMap.get(trade.mirrorKey);

      return {
        id: trade.id,
        whaleAddress: trade.whaleAddress,
        mirrorKey: trade.mirrorKey,
        outcome: trade.outcome,
        copyAmount: trade.copyAmount,
        status: trade.status,
        txHash: trade.txHash,
        vrfRequestId: trade.vrfRequestId,
        createdAt: trade.createdAt.toISOString(),
        // Original trade info
        originalTrade: originalTrade
          ? {
              id: originalTrade.id,
              marketQuestion: originalTrade.marketQuestion,
              amount: originalTrade.amount,
              source: originalTrade.source,
              timestamp: originalTrade.timestamp,
            }
          : null,
        // Mirror market info
        mirrorMarket: mirrorMarket
          ? {
              question: mirrorMarket.question,
              source: mirrorMarket.source,
              externalId: mirrorMarket.externalId,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        trades: formattedTrades,
        total,
        limit,
        offset,
        hasMore: offset + trades.length < total,
      },
    });
  } catch (error) {
    console.error('[API] Copy trade history error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch copy trade history',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
