/**
 * AI Agent Trading Hook
 * Provides verified AI trading capabilities for prediction markets
 *
 * CRITICAL: All trades are validated against 0G verification before execution
 */

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, type Address } from 'viem';
import aiAgentTradingService, {
  type TradingPrediction,
  type TradeExecutionResult
} from '@/services/aiAgentTradingService';
import { PredictionMarketABI } from '@/services/predictionMarketService';
import { getContracts } from '@/constants';

// ============================================================================
// Types
// ============================================================================

export interface AITradeState {
  prediction: TradingPrediction | null;
  isGenerating: boolean;
  isValidating: boolean;
  isExecuting: boolean;
  error: string | null;
  validation: {
    valid: boolean;
    reasons: string[];
  } | null;
}

// ============================================================================
// Hook: useAIAgentTrading
// ============================================================================

export function useAIAgentTrading(agentId: bigint | null) {
  const { address } = useAccount();
  const [state, setState] = useState<AITradeState>({
    prediction: null,
    isGenerating: false,
    isValidating: false,
    isExecuting: false,
    error: null,
    validation: null
  });

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const contracts = getContracts();

  /**
   * Generate verified AI prediction for a market
   */
  const generatePrediction = useCallback(async (marketId: bigint): Promise<TradingPrediction | null> => {
    if (agentId === null) {
      setState(prev => ({ ...prev, error: 'No agent selected' }));
      return null;
    }

    setState(prev => ({
      ...prev,
      isGenerating: true,
      error: null,
      prediction: null,
      validation: null
    }));

    try {
      const prediction = await aiAgentTradingService.generatePrediction(marketId, agentId);

      if (!prediction) {
        setState(prev => ({
          ...prev,
          isGenerating: false,
          error: 'Failed to generate prediction'
        }));
        return null;
      }

      // Validate the prediction
      const validation = aiAgentTradingService.validatePrediction(prediction);

      setState(prev => ({
        ...prev,
        isGenerating: false,
        prediction,
        validation
      }));

      // Store prediction on 0G for audit trail
      if (prediction.isVerified) {
        await aiAgentTradingService.storePrediction(prediction);
      }

      return prediction;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: message
      }));
      return null;
    }
  }, [agentId]);

  /**
   * Execute trade based on verified prediction
   * CRITICAL: Will reject unverified predictions
   */
  const executeTrade = useCallback(async (
    marketId: bigint,
    amount: string
  ): Promise<TradeExecutionResult> => {
    const { prediction, validation } = state;

    if (!prediction) {
      return { success: false, error: 'No prediction available' };
    }

    if (!validation?.valid) {
      return {
        success: false,
        error: 'Prediction validation failed: ' + (validation?.reasons.join(', ') || 'Unknown reason')
      };
    }

    // CRITICAL: Reject unverified predictions
    if (!prediction.isVerified) {
      return {
        success: false,
        error: 'Cannot execute trade: Prediction is not verified by 0G Compute'
      };
    }

    if (prediction.fallbackMode) {
      return {
        success: false,
        error: 'Cannot execute trade: Prediction is in fallback mode (not from real 0G provider)'
      };
    }

    setState(prev => ({ ...prev, isExecuting: true, error: null }));

    try {
      const amountBigInt = parseEther(amount);

      writeContract({
        address: contracts.predictionMarketAMM as Address,
        abi: PredictionMarketABI,
        functionName: 'buy',
        args: [
          marketId,
          prediction.isYes,
          amountBigInt,
          BigInt(0) // minSharesOut
        ]
      });

      return {
        success: true,
        prediction,
        amount
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isExecuting: false,
        error: message
      }));
      return { success: false, error: message };
    }
  }, [state, contracts, writeContract]);

  /**
   * Get trade recommendation
   */
  const getRecommendation = useCallback((maxAmount: bigint) => {
    if (!state.prediction) {
      return null;
    }
    return aiAgentTradingService.getTradeRecommendation(state.prediction, maxAmount);
  }, [state.prediction]);

  /**
   * Clear current prediction and state
   */
  const clearPrediction = useCallback(() => {
    setState({
      prediction: null,
      isGenerating: false,
      isValidating: false,
      isExecuting: false,
      error: null,
      validation: null
    });
  }, []);

  return {
    // State
    prediction: state.prediction,
    isVerified: state.prediction?.isVerified ?? false,
    isFallback: state.prediction?.fallbackMode ?? false,
    validation: state.validation,

    // Loading states
    isGenerating: state.isGenerating,
    isExecuting: state.isExecuting || isPending,
    isConfirming,
    isSuccess,

    // Error
    error: state.error || (writeError ? writeError.message : null),

    // Actions
    generatePrediction,
    executeTrade,
    getRecommendation,
    clearPrediction,

    // Transaction
    txHash: hash
  };
}

// ============================================================================
// Hook: useVerifiedCopyTrade
// ============================================================================

/**
 * Enhanced copy trade hook that requires 0G verification
 */
export function useVerifiedCopyTrade(agentId: bigint | null) {
  const { address } = useAccount();
  const [lastPrediction, setLastPrediction] = useState<TradingPrediction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const contracts = getContracts();

  /**
   * Execute copy trade with verification
   * CRITICAL: Requires verified 0G prediction
   */
  const executeCopyTrade = useCallback(async (
    marketId: bigint,
    amount: string,
    prediction: TradingPrediction
  ) => {
    setError(null);

    // CRITICAL: Verify the prediction
    const validation = aiAgentTradingService.validatePrediction(prediction);

    if (!validation.valid) {
      setError('Prediction validation failed: ' + validation.reasons.join(', '));
      return false;
    }

    if (!prediction.isVerified) {
      setError('Cannot copy trade: AI prediction is not verified by 0G Compute');
      return false;
    }

    if (prediction.fallbackMode) {
      setError('Cannot copy trade: AI prediction is in fallback mode');
      return false;
    }

    try {
      const amountBigInt = parseEther(amount);

      writeContract({
        address: contracts.predictionMarketAMM as Address,
        abi: PredictionMarketABI,
        functionName: 'buy',
        args: [
          marketId,
          prediction.isYes,
          amountBigInt,
          BigInt(0)
        ]
      });

      setLastPrediction(prediction);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    }
  }, [contracts, writeContract]);

  return {
    executeCopyTrade,
    lastPrediction,
    isPending,
    isConfirming,
    isSuccess,
    error: error || (writeError ? writeError.message : null),
    txHash: hash
  };
}

export default useAIAgentTrading;
