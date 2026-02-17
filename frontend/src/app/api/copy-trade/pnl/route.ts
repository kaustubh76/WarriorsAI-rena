import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  ZEROG_RPC,
  ZEROG_CONTRACTS,
  AI_AGENT_INFT_ABI,
} from '@/lib/apiConfig';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit, ErrorResponses, validateAddress, RateLimitPresets } from '@/lib/api';

// Extended ABI for PnL calculations
const EXTENDED_ABI = [
  ...AI_AGENT_INFT_ABI,
  'function totalSupply() view returns (uint256)',
  'function getAgentPerformance(uint256 tokenId) view returns (tuple(uint256 totalTrades, uint256 winningTrades, int256 totalPnL, uint256 lastTradeTimestamp))',
  'function getUserFollowing(address user) view returns (uint256[])',
];


// Copy trade config from 0G
interface CopyTradeConfig {
  tokenId: bigint;
  maxAmountPerTrade: bigint;
  totalCopied: bigint;
  startedAt: bigint;
  isActive: boolean;
}

// Agent performance from 0G
interface AgentPerformance {
  totalTrades: bigint;
  winningTrades: bigint;
  totalPnL: bigint;
  lastTradeTimestamp: bigint;
}

interface TradeRecord {
  id: string;
  agentId: string;
  marketId: string;
  isYes: boolean;
  amount: string;
  outcome: string | null;
  won: boolean | null;
  pnl: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

interface FollowedAgentSummary {
  tokenId: number;
  isActive: boolean;
  maxAmountPerTrade: string;
  totalCopied: string;
  followedSince: string;
  agentPerformance: {
    totalTrades: number;
    winningTrades: number;
    winRate: number;
    totalPnL: string;
  };
  estimatedPnL: string;
  recentTrades: TradeRecord[];
  realizedPnL: string;
  unrealizedPnL: string;
}

/**
 * GET /api/copy-trade/pnl?address=0x...
 * Calculate copy trading PnL for a user by reading from 0G chain and database
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'copy-trade-pnl',
      ...RateLimitPresets.moderateReads,
    });

    const searchParams = request.nextUrl.searchParams;
    const addressParam = searchParams.get('address');

    // Validate address
    const userAddress = validateAddress(addressParam || '', 'address');

    // Setup 0G provider
    const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);

    const inftContract = new ethers.Contract(
      ZEROG_CONTRACTS.aiAgentINFT,
      EXTENDED_ABI,
      zeroGProvider
    );

    // Get user's followed agents directly from contract
    let followedAgentIds: bigint[] = [];
    try {
      const following = await inftContract.getUserFollowing(userAddress);
      followedAgentIds = following.map((id: bigint) => id);
    } catch {
      // Fallback: iterate through agents
      let totalSupply: bigint;
      try {
        totalSupply = await inftContract.totalSupply();
      } catch {
        totalSupply = BigInt(10);
      }

      for (let i = 1; i <= Number(totalSupply); i++) {
        try {
          const config = await inftContract.getCopyTradeConfig(userAddress, BigInt(i));
          if (config && config.startedAt > BigInt(0)) {
            followedAgentIds.push(BigInt(i));
          }
        } catch {
          continue;
        }
      }
    }

    if (followedAgentIds.length === 0) {
      return NextResponse.json({
        success: true,
        user: userAddress,
        summary: {
          totalFollowedAgents: 0,
          activeFollowing: 0,
          totalCopied: '0',
          estimatedTotalPnL: '0',
          realizedTotalPnL: '0',
          unrealizedTotalPnL: '0',
          followedAgents: []
        },
        chains: {
          copyTradeData: '0G Galileo Testnet (16602)',
          marketData: 'Flow Testnet (545)'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get details for each followed agent
    const followedAgents: FollowedAgentSummary[] = [];
    let totalCopied = BigInt(0);
    let estimatedTotalPnL = BigInt(0);
    let realizedTotalPnL = BigInt(0);
    let unrealizedTotalPnL = BigInt(0);
    let activeCount = 0;

    for (const tokenId of followedAgentIds) {
      try {
        // Get copy config from 0G chain
        const config: CopyTradeConfig = await inftContract.getCopyTradeConfig(userAddress, tokenId);

        // Get agent performance from 0G chain
        let performance: AgentPerformance;
        try {
          performance = await inftContract.getAgentPerformance(tokenId);
        } catch {
          performance = {
            totalTrades: BigInt(0),
            winningTrades: BigInt(0),
            totalPnL: BigInt(0),
            lastTradeTimestamp: BigInt(0)
          };
        }

        if (config.isActive) {
          activeCount++;
        }

        totalCopied += config.totalCopied;

        // Get actual trades from database for this agent
        const agentIdStr = tokenId.toString();
        const trades = await prisma.agentTrade.findMany({
          where: { agentId: agentIdStr },
          orderBy: { createdAt: 'desc' },
          take: 20, // Last 20 trades
        });

        // Calculate realized PnL (from resolved trades)
        const resolvedTrades = trades.filter(t => t.resolvedAt !== null && t.pnl !== null);
        let agentRealizedPnL = BigInt(0);
        for (const trade of resolvedTrades) {
          if (trade.pnl) {
            agentRealizedPnL += BigInt(trade.pnl);
          }
        }

        // Calculate unrealized PnL (from pending trades - estimate based on current market)
        const pendingTrades = trades.filter(t => t.resolvedAt === null);
        let agentUnrealizedPnL = BigInt(0);
        for (const trade of pendingTrades) {
          // For pending trades, estimate potential PnL at 0 (break even until resolved)
          // In a more sophisticated system, we'd check current market prices
          agentUnrealizedPnL += BigInt(0);
        }

        // Calculate estimated PnL based on agent's overall performance
        let estimatedPnL = BigInt(0);
        if (performance.totalTrades > BigInt(0) && config.totalCopied > BigInt(0)) {
          const winRate = Number(performance.winningTrades) / Number(performance.totalTrades);
          const avgReturn = winRate * 0.9 - (1 - winRate);
          estimatedPnL = BigInt(Math.floor(Number(config.totalCopied) * avgReturn));
        }

        // Use actual PnL from contract if available, otherwise use estimated
        const actualPnL = performance.totalPnL;
        const effectivePnL = actualPnL !== BigInt(0) ? actualPnL : estimatedPnL;

        estimatedTotalPnL += effectivePnL;
        realizedTotalPnL += agentRealizedPnL;
        unrealizedTotalPnL += agentUnrealizedPnL;

        const winRate = Number(performance.totalTrades) > 0
          ? (Number(performance.winningTrades) / Number(performance.totalTrades)) * 100
          : 0;

        // Format recent trades for response
        const recentTrades: TradeRecord[] = trades.slice(0, 5).map(t => ({
          id: t.id,
          agentId: t.agentId,
          marketId: t.marketId,
          isYes: t.isYes,
          amount: t.amount,
          outcome: t.outcome,
          won: t.won,
          pnl: t.pnl,
          createdAt: t.createdAt,
          resolvedAt: t.resolvedAt,
        }));

        followedAgents.push({
          tokenId: Number(tokenId),
          isActive: config.isActive,
          maxAmountPerTrade: ethers.formatEther(config.maxAmountPerTrade),
          totalCopied: ethers.formatEther(config.totalCopied),
          followedSince: config.startedAt > BigInt(0)
            ? new Date(Number(config.startedAt) * 1000).toISOString()
            : 'Unknown',
          agentPerformance: {
            totalTrades: Number(performance.totalTrades),
            winningTrades: Number(performance.winningTrades),
            winRate: Math.round(winRate * 10) / 10,
            totalPnL: ethers.formatEther(performance.totalPnL)
          },
          estimatedPnL: ethers.formatEther(effectivePnL),
          recentTrades,
          realizedPnL: ethers.formatEther(agentRealizedPnL),
          unrealizedPnL: ethers.formatEther(agentUnrealizedPnL),
        });

      } catch (err) {
        console.error(`Error processing agent ${tokenId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      user: userAddress,
      summary: {
        totalFollowedAgents: followedAgentIds.length,
        activeFollowing: activeCount,
        totalCopied: ethers.formatEther(totalCopied),
        estimatedTotalPnL: ethers.formatEther(estimatedTotalPnL),
        realizedTotalPnL: ethers.formatEther(realizedTotalPnL),
        unrealizedTotalPnL: ethers.formatEther(unrealizedTotalPnL),
        followedAgents
      },
      chains: {
        copyTradeData: '0G Galileo Testnet (16602)',
        marketData: 'Flow Testnet (545)'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleAPIError(error, 'API:CopyTrade:PnL:GET');
  }
}
