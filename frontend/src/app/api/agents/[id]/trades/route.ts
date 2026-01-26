/**
 * API Route: Get trade history for an agent
 * Returns all trades executed by the agent on native prediction markets
 */

import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ethers } from 'ethers';
import { handleAPIError, applyRateLimit } from '@/lib/api';

interface TradeWithPnL {
  id: string;
  agentId: string;
  marketId: string;
  isYes: boolean;
  amount: string;
  amountFormatted: string;
  txHash: string;
  isCopyTrade: boolean;
  copiedFrom: string | null;
  outcome: string | null;
  won: boolean | null;
  pnl: string | null;
  pnlFormatted: string | null;
  recordedOn0G: boolean;
  recordTxHash: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  status: 'pending' | 'won' | 'lost' | 'invalid';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'agent-trades',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { id } = await params;
    const agentId = id;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status') as 'pending' | 'resolved' | 'all' | null;

    // Build where clause
    const whereClause: Record<string, unknown> = { agentId };
    if (status === 'pending') {
      whereClause.resolvedAt = null;
    } else if (status === 'resolved') {
      whereClause.resolvedAt = { not: null };
    }

    // Get total count for pagination
    const totalCount = await prisma.agentTrade.count({
      where: whereClause,
    });

    // Get trades for this agent
    const trades = await prisma.agentTrade.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Format trades with computed fields
    const formattedTrades: TradeWithPnL[] = trades.map((trade) => {
      let tradeStatus: 'pending' | 'won' | 'lost' | 'invalid' = 'pending';
      if (trade.resolvedAt) {
        if (trade.outcome === 'invalid') {
          tradeStatus = 'invalid';
        } else if (trade.won === true) {
          tradeStatus = 'won';
        } else if (trade.won === false) {
          tradeStatus = 'lost';
        }
      }

      return {
        id: trade.id,
        agentId: trade.agentId,
        marketId: trade.marketId,
        isYes: trade.isYes,
        amount: trade.amount,
        amountFormatted: ethers.formatEther(BigInt(trade.amount)),
        txHash: trade.txHash,
        isCopyTrade: trade.isCopyTrade,
        copiedFrom: trade.copiedFrom,
        outcome: trade.outcome,
        won: trade.won,
        pnl: trade.pnl,
        pnlFormatted: trade.pnl ? ethers.formatEther(BigInt(trade.pnl)) : null,
        recordedOn0G: trade.recordedOn0G,
        recordTxHash: trade.recordTxHash,
        createdAt: trade.createdAt,
        resolvedAt: trade.resolvedAt,
        status: tradeStatus,
      };
    });

    // Calculate summary statistics
    const resolvedTrades = formattedTrades.filter(t => t.resolvedAt !== null);
    const pendingTrades = formattedTrades.filter(t => t.resolvedAt === null);
    const wins = resolvedTrades.filter(t => t.won === true);
    const losses = resolvedTrades.filter(t => t.won === false);

    // Calculate PnL totals
    let realizedPnL = BigInt(0);
    let totalTraded = BigInt(0);

    for (const trade of formattedTrades) {
      totalTraded += BigInt(trade.amount);
      if (trade.pnl) {
        realizedPnL += BigInt(trade.pnl);
      }
    }

    // Unrealized is just pending trade volume (could go either way)
    let unrealizedVolume = BigInt(0);
    for (const trade of pendingTrades) {
      unrealizedVolume += BigInt(trade.amount);
    }

    return NextResponse.json({
      success: true,
      agentId,
      trades: formattedTrades,
      total: totalCount,
      limit,
      offset,
      hasMore: offset + trades.length < totalCount,
      summary: {
        totalTrades: totalCount,
        resolvedTrades: resolvedTrades.length,
        pendingTrades: pendingTrades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: resolvedTrades.length > 0
          ? ((wins.length / resolvedTrades.length) * 100).toFixed(1)
          : '0',
        totalTraded: ethers.formatEther(totalTraded),
        realizedPnL: ethers.formatEther(realizedPnL),
        unrealizedVolume: ethers.formatEther(unrealizedVolume),
        pnlIsPositive: realizedPnL >= BigInt(0),
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Agents:Trades:GET');
  }
}
