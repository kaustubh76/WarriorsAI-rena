/**
 * useCopyTradePnL Hook
 * Calculate and display PnL from copy trading activities
 *
 * IMPORTANT: This hook operates on Flow Testnet (Chain ID: 545)
 * where the AIAgentRegistry contract emits CopyTradeExecuted events
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { formatEther, type Address, parseAbiItem } from 'viem';
import { getPublicClient } from '@/lib/rpcClient';
import { chainsToContracts, getChainId } from '@/constants';
import predictionMarketService, { MarketStatus, MarketOutcome } from '@/services/predictionMarketService';

// ============================================================================
// Types
// ============================================================================

export interface CopyTradeExecution {
  follower: Address;
  agentId: bigint;
  marketId: bigint;
  amount: bigint;
  isYes: boolean;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
}

export interface CopyTradePnLResult {
  totalInvested: bigint;
  totalReturns: bigint;
  totalPnL: bigint;
  winningTrades: number;
  losingTrades: number;
  pendingTrades: number;
  trades: CopyTradeExecution[];
}

export interface UseCopyTradePnLResult {
  pnl: CopyTradePnLResult | null;
  totalPnL: bigint;
  pnlFormatted: string;
  winRate: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const FLOW_CHAIN_ID = getChainId(); // 545 Flow Testnet

// CopyTradeExecuted event from AIAgentRegistry
const COPY_TRADE_EXECUTED_EVENT = parseAbiItem(
  'event CopyTradeExecuted(address indexed follower, uint256 indexed agentId, uint256 marketId, uint256 amount)'
);

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook to calculate PnL from copy trading activities
 */
export function useCopyTradePnL(): UseCopyTradePnLResult {
  const { address } = useAccount();
  const [pnl, setPnl] = useState<CopyTradePnLResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const registryAddress = chainsToContracts[FLOW_CHAIN_ID]?.aiAgentRegistry as Address;

  const calculatePnL = useCallback(async () => {
    if (!address || !registryAddress) {
      setPnl(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const publicClient = getPublicClient();

      // Get current block
      const currentBlock = await publicClient.getBlockNumber();
      // Use larger range for historical trades (10000 blocks ~5 hours on Flow)
      const fromBlock = currentBlock > BigInt(10000) ? currentBlock - BigInt(10000) : BigInt(0);

      // Fetch CopyTradeExecuted events for this user
      const logs = await publicClient.getLogs({
        address: registryAddress,
        event: COPY_TRADE_EXECUTED_EVENT,
        args: { follower: address },
        fromBlock,
        toBlock: 'latest',
      });

      if (logs.length === 0) {
        setPnl({
          totalInvested: BigInt(0),
          totalReturns: BigInt(0),
          totalPnL: BigInt(0),
          winningTrades: 0,
          losingTrades: 0,
          pendingTrades: 0,
          trades: [],
        });
        return;
      }

      // Parse trade executions
      const trades: CopyTradeExecution[] = logs.map((log) => ({
        follower: log.args.follower as Address,
        agentId: log.args.agentId as bigint,
        marketId: log.args.marketId as bigint,
        amount: log.args.amount as bigint,
        isYes: true, // Default - we'll need to check positions for actual side
        timestamp: Math.floor(Date.now() / 1000) - Number(currentBlock - log.blockNumber) * 2,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      }));

      // Get unique market IDs
      const uniqueMarketIds = [...new Set(trades.map((t) => t.marketId.toString()))].map(
        (id) => BigInt(id)
      );

      // Fetch market data and user positions
      let totalInvested = BigInt(0);
      let totalReturns = BigInt(0);
      let winningTrades = 0;
      let losingTrades = 0;
      let pendingTrades = 0;

      for (const marketId of uniqueMarketIds) {
        try {
          const market = await predictionMarketService.getMarket(marketId);
          const position = await predictionMarketService.getPosition(marketId, address);

          if (!market) continue;

          // Sum up invested amount for this market
          const marketTrades = trades.filter((t) => t.marketId === marketId);
          const marketInvested = marketTrades.reduce((sum, t) => sum + t.amount, BigInt(0));
          totalInvested += marketInvested;

          // Check market status
          if (market.status === MarketStatus.Active) {
            // Market still active - positions are pending
            pendingTrades += marketTrades.length;
          } else if (market.status === MarketStatus.Resolved) {
            // Market resolved - calculate returns
            const winningPosition =
              market.outcome === MarketOutcome.Yes ? position.yesTokens : position.noTokens;

            if (winningPosition > BigInt(0)) {
              // User won - each winning token pays 1 CRwN
              totalReturns += winningPosition;
              winningTrades += marketTrades.length;
            } else {
              // User lost
              losingTrades += marketTrades.length;
            }
          } else if (market.status === MarketStatus.Cancelled) {
            // Market cancelled - positions returned (no PnL impact)
            totalReturns += position.totalInvested;
          }
        } catch (err) {
          console.error(`Error processing market ${marketId}:`, err);
        }
      }

      const totalPnL = totalReturns - totalInvested;

      setPnl({
        totalInvested,
        totalReturns,
        totalPnL,
        winningTrades,
        losingTrades,
        pendingTrades,
        trades,
      });
    } catch (err) {
      console.error('Error calculating copy trade PnL:', err);
      setError(err instanceof Error ? err : new Error('Failed to calculate PnL'));
      setPnl(null);
    } finally {
      setIsLoading(false);
    }
  }, [address, registryAddress]);

  // Initial fetch
  useEffect(() => {
    calculatePnL();
  }, [calculatePnL]);

  // Computed values
  const totalPnL = pnl?.totalPnL ?? BigInt(0);
  const pnlFormatted = formatPnL(totalPnL);
  const totalTrades = (pnl?.winningTrades ?? 0) + (pnl?.losingTrades ?? 0);
  const winRate = totalTrades > 0 ? ((pnl?.winningTrades ?? 0) / totalTrades) * 100 : 0;

  return {
    pnl,
    totalPnL,
    pnlFormatted,
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
