import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  ZEROG_RPC,
  ZEROG_CONTRACTS,
  AI_AGENT_INFT_ABI,
} from '@/lib/apiConfig';

// Extended ABI for PnL calculations
const EXTENDED_ABI = [
  ...AI_AGENT_INFT_ABI,
  'function totalSupply() view returns (uint256)',
  'function getAgentPerformance(uint256 tokenId) view returns (tuple(uint256 totalTrades, uint256 winningTrades, uint256 totalPnL, uint256 lastTradeTimestamp))',
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
}

/**
 * GET /api/copy-trade/pnl?address=0x...
 * Calculate copy trading PnL for a user by reading from 0G chain
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing address parameter' },
        { status: 400 }
      );
    }

    // Setup 0G provider
    const zeroGProvider = new ethers.JsonRpcProvider(ZEROG_RPC);

    const inftContract = new ethers.Contract(
      ZEROG_CONTRACTS.aiAgentINFT,
      EXTENDED_ABI,
      zeroGProvider
    );

    // Get total supply to iterate through all agents
    let totalSupply: bigint;
    try {
      totalSupply = await inftContract.totalSupply();
    } catch {
      totalSupply = BigInt(10); // Fallback to checking first 10 agents
    }

    // Find agents that this user is following by checking copy configs
    const followedAgentIds: bigint[] = [];
    for (let i = 1; i <= Number(totalSupply); i++) {
      try {
        const config = await inftContract.getCopyTradeConfig(userAddress, BigInt(i));
        // Check if config exists and has been started (startedAt > 0)
        if (config && config.startedAt > BigInt(0)) {
          followedAgentIds.push(BigInt(i));
        }
      } catch {
        // Agent doesn't exist or no config
        continue;
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
    let activeCount = 0;

    for (const tokenId of followedAgentIds) {
      try {
        // Get copy config
        const config: CopyTradeConfig = await inftContract.getCopyTradeConfig(userAddress, tokenId);

        // Get agent performance
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

        // Estimate user's PnL based on their copy amount and agent's performance
        // This is an approximation: (user's total copied / agent's total trades) * agent's PnL
        let estimatedPnL = BigInt(0);
        if (performance.totalTrades > BigInt(0) && config.totalCopied > BigInt(0)) {
          // Rough estimate based on agent's win rate applied to user's copied amount
          const winRate = Number(performance.winningTrades) / Number(performance.totalTrades);
          const avgReturn = winRate * 0.9 - (1 - winRate); // 90% payout on wins, full loss on losses
          estimatedPnL = BigInt(Math.floor(Number(config.totalCopied) * avgReturn));
        }
        estimatedTotalPnL += estimatedPnL;

        const winRate = Number(performance.totalTrades) > 0
          ? (Number(performance.winningTrades) / Number(performance.totalTrades)) * 100
          : 0;

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
          estimatedPnL: ethers.formatEther(estimatedPnL)
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
        followedAgents
      },
      chains: {
        copyTradeData: '0G Galileo Testnet (16602)',
        marketData: 'Flow Testnet (545)'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('Copy trade PnL calculation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
