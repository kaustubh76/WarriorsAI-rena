/**
 * API Route: Metrics Endpoint
 *
 * Exports Prometheus-compatible metrics for monitoring
 *
 * GET /api/metrics
 * GET /api/metrics?format=json
 */

import { NextRequest, NextResponse } from 'next/server';
import { FlowMetrics } from '@/lib/metrics';
import { globalErrorHandler } from '@/lib/errorRecovery';
import { prisma } from '@/lib/prisma';
import { createFlowPublicClient } from '@/lib/flowClient';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';
import { rpcResponseCache } from '@/lib/cache/hashedCache';

export async function GET(request: NextRequest) {
  try {
    applyRateLimit(request, { prefix: 'metrics', ...RateLimitPresets.readOperations });
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'prometheus';

    // Update real-time metrics before export
    await updateRealTimeMetrics();

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        metrics: FlowMetrics.exportJSON(),
        timestamp: new Date().toISOString(),
      });
    }

    // Prometheus format
    const prometheusData = FlowMetrics.exportPrometheus();

    return new NextResponse(prometheusData, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    });

  } catch (error: any) {
    console.error('[Metrics] Error generating metrics:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate metrics',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

async function updateRealTimeMetrics() {
  try {
    // Update circuit breaker metrics (cheap, no caching needed)
    const circuitMetrics = globalErrorHandler.getCircuitBreakerMetrics();
    FlowMetrics.setRPCCircuitBreakerState('rpc', circuitMetrics.rpc.state);

    // Cache blockchain block number (30s TTL via rpcResponseCache)
    const currentBlock = await rpcResponseCache.getOrSet(
      'metrics:flow-block',
      async () => {
        const client = createFlowPublicClient();
        return await client.getBlockNumber();
      }
    ) as bigint;

    // Cache last synced block from DB (30s TTL)
    const lastSyncedBlock = await rpcResponseCache.getOrSet(
      'metrics:last-synced-block',
      async () => {
        const lastTrade = await prisma.mirrorTrade.findFirst({
          orderBy: { blockNumber: 'desc' },
          select: { blockNumber: true },
        });
        return lastTrade ? BigInt(lastTrade.blockNumber) : 0n;
      }
    ) as bigint;

    const blocksBehind = Number(currentBlock - lastSyncedBlock);
    FlowMetrics.setEventsSynced(Number(lastSyncedBlock));
    FlowMetrics.setBlocksBehind(blocksBehind);

    // Cache business metrics (30s TTL)
    const [marketCount, activeMarkets, tradeCount] = await rpcResponseCache.getOrSet(
      'metrics:business-counts',
      async () => {
        return await Promise.all([
          prisma.mirrorMarket.count(),
          prisma.mirrorMarket.count({ where: { isActive: true } }),
          prisma.mirrorTrade.count(),
        ]);
      }
    ) as [number, number, number];

    FlowMetrics.setTotalMarkets(marketCount);
    FlowMetrics.setActiveMarkets(activeMarkets);
    FlowMetrics.setTotalTrades(tradeCount);

  } catch (error) {
    console.error('[Metrics] Error updating real-time metrics:', error);
  }
}
