/**
 * API Route: Event Listener Status
 * Get detailed status of event tracking system
 *
 * GET /api/events/status
 *
 * Returns:
 * - Last synced block
 * - Total events processed
 * - Event breakdown by type
 * - Recent events
 * - System health
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, applyRateLimit } from '@/lib/api';
import { getLastSyncedBlock } from '@/lib/eventListeners';
import { createFlowPublicClient } from '@/lib/flowClient';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'events-status',
      maxRequests: 60,
      windowMs: 60000,
    });

    const client = createFlowPublicClient();

    // Get blockchain data
    const [currentBlock, lastSyncedBlock] = await Promise.all([
      client.getBlockNumber(),
      getLastSyncedBlock(),
    ]);

    // Get database statistics
    const [
      totalTrades,
      totalMarkets,
      recentTrades,
      totalVolume,
      resolvedMarkets,
    ] = await Promise.all([
      prisma.mirrorTrade.count(),
      prisma.mirrorMarket.count(),
      prisma.mirrorTrade.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        select: {
          mirrorKey: true,
          trader: true,
          isYes: true,
          amount: true,
          txHash: true,
          blockNumber: true,
          timestamp: true,
        },
      }),
      prisma.mirrorMarket.aggregate({
        _sum: { totalVolume: true },
      }),
      prisma.mirrorMarket.count({
        where: { resolved: true },
      }),
    ]);

    // Calculate sync status
    const blocksBehind = Number(currentBlock - lastSyncedBlock);
    const isSynced = blocksBehind <= 10; // Within 10 blocks is considered synced
    const syncPercentage = lastSyncedBlock > 0n
      ? ((Number(lastSyncedBlock) / Number(currentBlock)) * 100).toFixed(2)
      : '0.00';

    return NextResponse.json({
      success: true,
      blockchain: {
        currentBlock: currentBlock.toString(),
        lastSyncedBlock: lastSyncedBlock.toString(),
        blocksBehind,
        isSynced,
        syncPercentage: `${syncPercentage}%`,
      },
      statistics: {
        totalMarkets,
        totalTrades,
        resolvedMarkets,
        activeMarkets: totalMarkets - resolvedMarkets,
        totalVolume: totalVolume._sum.totalVolume || '0',
      },
      recentActivity: recentTrades.map(trade => ({
        mirrorKey: trade.mirrorKey.slice(0, 10) + '...',
        trader: trade.trader.slice(0, 10) + '...',
        direction: trade.isYes ? 'YES' : 'NO',
        amount: trade.amount,
        blockNumber: trade.blockNumber,
        txHash: trade.txHash.slice(0, 10) + '...',
        timestamp: trade.timestamp.toISOString(),
      })),
      health: {
        status: isSynced ? 'healthy' : 'syncing',
        message: isSynced
          ? 'Event tracking is up to date'
          : `Behind by ${blocksBehind} blocks`,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return handleAPIError(error, 'API:Events:Status');
  }
}
