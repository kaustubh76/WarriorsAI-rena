/**
 * Agent External Breakdown API Route
 * GET: Get agent's external market performance breakdown by source
 */

import { NextRequest, NextResponse } from 'next/server';
import { chainsToContracts, getZeroGChainId } from '@/constants';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';
import { prisma } from '@/lib/prisma';
import { RateLimitPresets, ErrorResponses } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { createZeroGPublicClient } from '@/lib/zeroGClient';

const zeroGClient = createZeroGPublicClient();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const handler = composeMiddleware([
    withRateLimit({ prefix: 'agent-external-breakdown', ...RateLimitPresets.apiQueries }),
    async (req, ctx) => {
      const { id } = await params;
      if (!/^\d+$/.test(id)) {
        throw ErrorResponses.badRequest('Agent ID must be numeric');
      }
      const agentId = BigInt(id);

      // Get contract address
      const contracts = chainsToContracts[getZeroGChainId()];
      const aiAgentINFTAddress = contracts?.aiAgentINFT as `0x${string}`;

      if (!aiAgentINFTAddress || aiAgentINFTAddress === '0x0000000000000000000000000000000000000000') {
        throw ErrorResponses.serviceUnavailable('AI Agent iNFT contract not configured');
      }

      // Get on-chain external trading stats
      let onChainStats = null;
      try {
        onChainStats = await zeroGClient.readContract({
          address: aiAgentINFTAddress,
          abi: AIAgentINFTAbi,
          functionName: 'getExternalTradingStats',
          args: [agentId],
        });
      } catch (e) {
        console.warn(`Failed to fetch on-chain stats for agent ${id}:`, e);
      }

      const [polymarketEnabled, kalshiEnabled, totalExternalTrades, totalExternalPnL] =
        onChainStats as [boolean, boolean, bigint, bigint] || [false, false, 0n, 0n];

      // Get breakdown via 0G collections — manual join of mirrorTrade + mirrorMarket
      const trades = prisma.mirrorTrade.findMany({ where: { agentId: id } });
      const mirrorKeys = [...new Set(trades.map((t: Record<string, unknown>) => t.mirrorKey as string))];
      const markets = mirrorKeys.length > 0
        ? prisma.mirrorMarket.findMany({ where: { mirrorKey: { in: mirrorKeys } } })
        : [];
      const sourceMap = new Map(markets.map((m: Record<string, unknown>) => [m.mirrorKey as string, m.source as string]));

      const groupedBySource = new Map<string, { tradeCount: number; wins: number; totalPnL: number }>();
      for (const trade of trades) {
        const t = trade as Record<string, unknown>;
        const source = sourceMap.get(t.mirrorKey as string);
        if (!source) continue;
        const entry = groupedBySource.get(source) ?? { tradeCount: 0, wins: 0, totalPnL: 0 };
        entry.tradeCount++;
        const pnl = parseFloat(String(t.pnl ?? 0));
        if (pnl > 0) entry.wins++;
        entry.totalPnL += pnl;
        groupedBySource.set(source, entry);
      }

      const dbBreakdown = Array.from(groupedBySource.entries()).map(([source, data]) => ({
        source,
        tradeCount: BigInt(data.tradeCount),
        wins: BigInt(data.wins),
        totalPnL: data.totalPnL.toString(),
      }));

      // Process database results
      const polymarketData = dbBreakdown.find((d) => d.source === 'polymarket');
      const kalshiData = dbBreakdown.find((d) => d.source === 'kalshi');

      const breakdown = {
        polymarket: {
          enabled: polymarketEnabled,
          count: polymarketData ? Number(polymarketData.tradeCount) : 0,
          wins: polymarketData ? Number(polymarketData.wins) : 0,
          pnl: polymarketData?.totalPnL || '0',
          winRate: polymarketData && Number(polymarketData.tradeCount) > 0
            ? (Number(polymarketData.wins) / Number(polymarketData.tradeCount)) * 100
            : 0,
        },
        kalshi: {
          enabled: kalshiEnabled,
          count: kalshiData ? Number(kalshiData.tradeCount) : 0,
          wins: kalshiData ? Number(kalshiData.wins) : 0,
          pnl: kalshiData?.totalPnL || '0',
          winRate: kalshiData && Number(kalshiData.tradeCount) > 0
            ? (Number(kalshiData.wins) / Number(kalshiData.tradeCount)) * 100
            : 0,
        },
      };

      // Calculate totals
      const totalTrades = breakdown.polymarket.count + breakdown.kalshi.count;
      const totalWins = breakdown.polymarket.wins + breakdown.kalshi.wins;

      return NextResponse.json({
        success: true,
        data: {
          agentId: id,
          breakdown,
          totals: {
            externalTrades: Number(totalExternalTrades) || totalTrades,
            externalPnL: totalExternalPnL.toString(),
            wins: totalWins,
            winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
          },
          onChain: {
            polymarketEnabled,
            kalshiEnabled,
            totalExternalTrades: totalExternalTrades.toString(),
            totalExternalPnL: totalExternalPnL.toString(),
          },
        },
      });
    },
  ], { errorContext: 'API:Agents:ExternalBreakdown:GET' });

  return handler(request);
}
