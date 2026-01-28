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

export async function GET(request: NextRequest) {
  try {
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
    // Update circuit breaker metrics
    const circuitMetrics = globalErrorHandler.getCircuitBreakerMetrics();
    FlowMetrics.setRPCCircuitBreakerState('rpc', circuitMetrics.rpc.state);

    // Update blockchain sync metrics
    const client = createFlowPublicClient();
    const currentBlock = await client.getBlockNumber();

    const lastTrade = await prisma.mirrorTrade.findFirst({
      orderBy: { blockNumber: 'desc' },
      select: { blockNumber: true },
    });

    const lastSyncedBlock = lastTrade ? BigInt(lastTrade.blockNumber) : 0n;
    const blocksBehind = Number(currentBlock - lastSyncedBlock);

    FlowMetrics.setEventsSynced(Number(lastSyncedBlock));
    FlowMetrics.setBlocksBehind(blocksBehind);

    // Update business metrics
    const [marketCount, activeMarkets, tradeCount] = await Promise.all([
      prisma.mirrorMarket.count(),
      prisma.mirrorMarket.count({ where: { isActive: true } }),
      prisma.mirrorTrade.count(),
    ]);

    FlowMetrics.setTotalMarkets(marketCount);
    FlowMetrics.setActiveMarkets(activeMarkets);
    FlowMetrics.setTotalTrades(tradeCount);

  } catch (error) {
    console.error('[Metrics] Error updating real-time metrics:', error);
  }
}
