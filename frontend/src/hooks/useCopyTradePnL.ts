/**
 * useCopyTradePnL Hook
 * Calculate and display PnL from copy trading activities
 *
 * IMPORTANT: This hook now uses the /api/copy-trade/pnl endpoint which:
 * - Reads copy trade configs from 0G Galileo Testnet (Chain ID: 16602)
 * - Calculates estimated PnL based on agent performance
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { formatEther, parseEther, type Address } from 'viem';

// ============================================================================
// Types
// ============================================================================

export interface TradeRecord {
  id: string;
  agentId: string;
  marketId: string;
  isYes: boolean;
  amount: string;
  outcome: string | null;
  won: boolean | null;
  pnl: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface FollowedAgentSummary {
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
  recentTrades?: TradeRecord[];
  realizedPnL?: string;
  unrealizedPnL?: string;
}

export interface CopyTradePnLResult {
  totalFollowedAgents: number;
  activeFollowing: number;
  totalCopied: bigint;
  totalPnL: bigint;
  realizedPnL: bigint;
  unrealizedPnL: bigint;
  followedAgents: FollowedAgentSummary[];
}

export interface UseCopyTradePnLResult {
  pnl: CopyTradePnLResult | null;
  totalPnL: bigint;
  realizedPnL: bigint;
  unrealizedPnL: bigint;
  pnlFormatted: string;
  realizedPnLFormatted: string;
  unrealizedPnLFormatted: string;
  winRate: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook to calculate PnL from copy trading activities
 * Uses the /api/copy-trade/pnl endpoint which reads from 0G chain
 */
export function useCopyTradePnL(): UseCopyTradePnLResult {
  const { address } = useAccount();
  const [pnl, setPnl] = useState<CopyTradePnLResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const calculatePnL = useCallback(async () => {
    if (!address) {
      setPnl(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call the API endpoint that reads from 0G chain
      const response = await fetch(`/api/copy-trade/pnl?address=${address}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch PnL data');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'API returned unsuccessful response');
      }

      // Parse the response into our format
      const { summary } = data;

      setPnl({
        totalFollowedAgents: summary.totalFollowedAgents,
        activeFollowing: summary.activeFollowing,
        totalCopied: parseEther(summary.totalCopied),
        totalPnL: parseEther(summary.estimatedTotalPnL),
        realizedPnL: parseEther(summary.realizedTotalPnL || '0'),
        unrealizedPnL: parseEther(summary.unrealizedTotalPnL || '0'),
        followedAgents: summary.followedAgents,
      });
    } catch (err) {
      console.error('Error calculating copy trade PnL:', err);
      setError(err instanceof Error ? err : new Error('Failed to calculate PnL'));
      // Set empty result instead of null for better UX
      setPnl({
        totalFollowedAgents: 0,
        activeFollowing: 0,
        totalCopied: BigInt(0),
        totalPnL: BigInt(0),
        realizedPnL: BigInt(0),
        unrealizedPnL: BigInt(0),
        followedAgents: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Initial fetch
  useEffect(() => {
    calculatePnL();
  }, [calculatePnL]);

  // Computed values
  const totalPnL = pnl?.totalPnL ?? BigInt(0);
  const realizedPnL = pnl?.realizedPnL ?? BigInt(0);
  const unrealizedPnL = pnl?.unrealizedPnL ?? BigInt(0);
  const pnlFormatted = formatPnL(totalPnL);
  const realizedPnLFormatted = formatPnL(realizedPnL);
  const unrealizedPnLFormatted = formatPnL(unrealizedPnL);

  // Calculate win rate from followed agents' performance
  const totalTrades = pnl?.followedAgents.reduce(
    (sum, agent) => sum + agent.agentPerformance.totalTrades,
    0
  ) ?? 0;
  const winningTrades = pnl?.followedAgents.reduce(
    (sum, agent) => sum + agent.agentPerformance.winningTrades,
    0
  ) ?? 0;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return {
    pnl,
    totalPnL,
    realizedPnL,
    unrealizedPnL,
    pnlFormatted,
    realizedPnLFormatted,
    unrealizedPnLFormatted,
    winRate,
    isLoading,
    error,
    refetch: calculatePnL,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format PnL to human-readable string
 */
export function formatPnL(pnl: bigint): string {
  const value = Number(formatEther(pnl));
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}`;
}

/**
 * Get PnL color class based on value
 */
export function getPnLColorClass(pnl: bigint): string {
  if (pnl > BigInt(0)) return 'text-green-400';
  if (pnl < BigInt(0)) return 'text-red-400';
  return 'text-gray-400';
}

export default useCopyTradePnL;
