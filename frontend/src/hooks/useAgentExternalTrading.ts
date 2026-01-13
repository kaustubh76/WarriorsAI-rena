/**
 * Hook for managing AI agent external market trading
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { parseEther, createWalletClient } from 'viem';
import { chainsToContracts, getZeroGChainId, getZeroGComputeRpc } from '@/constants';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';
import {
  externalMarketAgentService,
  VerifiedMarketPrediction,
  AgentExternalPerformance,
  ExternalTradeResult,
} from '@/services/externalMarketAgentService';
import { UnifiedMarket, MarketSource } from '@/types/externalMarket';

// ============================================
// CHAIN DEFINITION
// ============================================

const ZEROG_CHAIN = {
  id: 16602,
  name: '0G Galileo Testnet',
  network: '0g-galileo',
  nativeCurrency: { decimals: 18, name: '0G Token', symbol: '0G' },
  rpcUrls: {
    default: { http: [getZeroGComputeRpc()] },
    public: { http: [getZeroGComputeRpc()] },
  },
} as const;

// ============================================
// TYPES
// ============================================

export interface UseAgentExternalTradingReturn {
  // State
  canTradePolymarket: boolean;
  canTradeKalshi: boolean;
  externalPerformance: AgentExternalPerformance | null;
  currentPrediction: VerifiedMarketPrediction | null;
  loading: boolean;
  error: string | null;

  // Actions
  enableExternalTrading: (
    polymarket: boolean,
    kalshi: boolean
  ) => Promise<string | null>;
  getPrediction: (market: UnifiedMarket) => Promise<VerifiedMarketPrediction | null>;
  executeTrade: (
    mirrorKey: string,
    prediction: VerifiedMarketPrediction,
    amount: string
  ) => Promise<ExternalTradeResult>;
  refreshPermissions: () => Promise<void>;
  clearError: () => void;
}

// ============================================
// HOOK
// ============================================

export function useAgentExternalTrading(
  agentId: bigint | null
): UseAgentExternalTradingReturn {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: ZEROG_CHAIN.id });

  // State
  const [canTradePolymarket, setCanTradePolymarket] = useState(false);
  const [canTradeKalshi, setCanTradeKalshi] = useState(false);
  const [externalPerformance, setExternalPerformance] =
    useState<AgentExternalPerformance | null>(null);
  const [currentPrediction, setCurrentPrediction] =
    useState<VerifiedMarketPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch external trading permissions
  const refreshPermissions = useCallback(async () => {
    if (!agentId) return;

    try {
      setLoading(true);
      setError(null);

      const [polymarket, kalshi, performance] = await Promise.all([
        externalMarketAgentService.canAgentTrade(agentId, MarketSource.POLYMARKET),
        externalMarketAgentService.canAgentTrade(agentId, MarketSource.KALSHI),
        externalMarketAgentService.getAgentExternalPerformance(agentId),
      ]);

      setCanTradePolymarket(polymarket);
      setCanTradeKalshi(kalshi);
      setExternalPerformance(performance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Load on mount and when agentId changes
  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  // Enable external trading
  const enableExternalTrading = useCallback(
    async (polymarket: boolean, kalshi: boolean): Promise<string | null> => {
      if (!agentId || !walletClient) {
        setError('Wallet not connected');
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        const hash = await externalMarketAgentService.enableExternalTrading(
          agentId,
          polymarket,
          kalshi,
          walletClient as unknown as ReturnType<typeof createWalletClient>
        );

        // Refresh permissions after enabling
        await refreshPermissions();

        return hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to enable trading';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [agentId, walletClient, refreshPermissions]
  );

  // Get AI prediction for market
  const getPrediction = useCallback(
    async (market: UnifiedMarket): Promise<VerifiedMarketPrediction | null> => {
      if (!agentId) {
        setError('No agent selected');
        return null;
      }

      // Check if agent can trade on this source
      const canTrade =
        market.source === MarketSource.POLYMARKET
          ? canTradePolymarket
          : market.source === MarketSource.KALSHI
          ? canTradeKalshi
          : true; // Native markets always allowed

      if (!canTrade && market.source !== MarketSource.NATIVE) {
        setError(`External trading not enabled for ${market.source}`);
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        const prediction = await externalMarketAgentService.getVerifiedPrediction(
          agentId,
          market
        );

        setCurrentPrediction(prediction);
        return prediction;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get prediction';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [agentId, canTradePolymarket, canTradeKalshi]
  );

  // Execute trade
  const executeTrade = useCallback(
    async (
      mirrorKey: string,
      prediction: VerifiedMarketPrediction,
      amount: string
    ): Promise<ExternalTradeResult> => {
      if (!agentId) {
        return { success: false, error: 'No agent selected' };
      }

      try {
        setLoading(true);
        setError(null);

        const result = await externalMarketAgentService.executeAgentTrade(
          agentId,
          mirrorKey,
          prediction,
          amount
        );

        if (result.success) {
          // Refresh performance after trade
          await refreshPermissions();
        } else {
          setError(result.error || 'Trade failed');
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Trade execution failed';
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [agentId, refreshPermissions]
  );

  return {
    canTradePolymarket,
    canTradeKalshi,
    externalPerformance,
    currentPrediction,
    loading,
    error,
    enableExternalTrading,
    getPrediction,
    executeTrade,
    refreshPermissions,
    clearError,
  };
}

export default useAgentExternalTrading;
