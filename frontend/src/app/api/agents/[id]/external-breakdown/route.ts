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

      // Get breakdown from database - query agent trades joined with mirror markets
      const dbBreakdown = await prisma.$queryRaw<
        Array<{
          source: string;
          tradeCount: bigint;
          wins: bigint;
          totalPnL: string;
        }>
      >`
        SELECT
          mm.source as source,
          COUNT(*) as tradeCount,
          SUM(CASE WHEN mt.pnl > 0 THEN 1 ELSE 0 END) as wins,
          COALESCE(SUM(CAST(mt.pnl AS REAL)), 0) as totalPnL
        FROM MirrorTrade mt
        LEFT JOIN MirrorMarket mm ON mt.mirrorKey = mm.mirrorKey
        WHERE mt.agentId = ${id}
        AND mm.source IS NOT NULL
        GROUP BY mm.source
      `;

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
