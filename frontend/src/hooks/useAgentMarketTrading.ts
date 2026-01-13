/**
 * useAgentMarketTrading Hook
 * Enables AI agents to trade on prediction markets
 *
 * Features:
 * - Agent selection (iNFT agents from 0G chain)
 * - Prediction generation via 0G Compute
 * - Verification status tracking
 * - Auto-execute mode toggle
 */

import { useState, useCallback } from 'react';
import { useAgents } from './useAgents';
import aiAgentTradingService, {
  type TradingPrediction,
  type TradeExecutionResult,
} from '@/services/aiAgentTradingService';
import type { AIAgentDisplay } from '@/services/aiAgentService';
import { formatEther, parseEther } from 'viem';
import { TRADING_LIMITS } from '@/lib/apiConfig';

// ============================================================================
// Types
// ============================================================================

export interface AgentPredictionResult {
  prediction: TradingPrediction | null;
  validation: {
    valid: boolean;
    reasons: string[];
  } | null;
  recommendation: {
    shouldTrade: boolean;
    position: 'yes' | 'no';
    amount: bigint;
    reasons: string[];
  } | null;
}

export interface UseAgentMarketTradingResult {
  // Agent selection
  agents: AIAgentDisplay[];
  agentsLoading: boolean;
  selectedAgent: AIAgentDisplay | null;
  setSelectedAgent: (agent: AIAgentDisplay | null) => void;

  // Prediction state
  prediction: TradingPrediction | null;
  predictionResult: AgentPredictionResult | null;
  isGenerating: boolean;
  generationError: string | null;

  // Trade execution state
  isExecuting: boolean;
  executionError: string | null;
  lastTradeResult: TradeExecutionResult | null;

  // Auto-execute mode
  autoExecute: boolean;
  setAutoExecute: (value: boolean) => void;

  // Actions
  generatePrediction: (maxAmount?: bigint) => Promise<AgentPredictionResult | null>;
  executeAgentTrade: (amount?: bigint) => Promise<TradeExecutionResult | null>;
  clearPrediction: () => void;

  // Formatted values for display
  suggestedAmountFormatted: string;
  confidencePercent: number;
}

// ============================================================================
// Default Values
// ============================================================================

// Use the centralized default trade amount from apiConfig (10 CRwN)
const DEFAULT_MAX_AMOUNT = parseEther(TRADING_LIMITS.defaultTradeAmount);

// ============================================================================
// Main Hook
// ============================================================================

export function useAgentMarketTrading(marketId: bigint): UseAgentMarketTradingResult {
  // Agent state
  const { agents, loading: agentsLoading } = useAgents();
  const [selectedAgent, setSelectedAgent] = useState<AIAgentDisplay | null>(null);

  // Prediction state
  const [prediction, setPrediction] = useState<TradingPrediction | null>(null);
  const [predictionResult, setPredictionResult] = useState<AgentPredictionResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Trade execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [lastTradeResult, setLastTradeResult] = useState<TradeExecutionResult | null>(null);

  // Auto-execute mode
  const [autoExecute, setAutoExecute] = useState(false);

  /**
   * Generate prediction for the selected agent
   */
  const generatePrediction = useCallback(async (
    maxAmount: bigint = DEFAULT_MAX_AMOUNT
  ): Promise<AgentPredictionResult | null> => {
    if (!selectedAgent) {
      setGenerationError('No agent selected');
      return null;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      console.log(`[AgentTrading] Generating prediction for agent #${selectedAgent.id} on market #${marketId}`);

      // Generate prediction via 0G Compute
      const pred = await aiAgentTradingService.generatePrediction(
        marketId,
        selectedAgent.id
      );

      if (!pred) {
        setGenerationError('Failed to generate prediction');
        setPrediction(null);
        setPredictionResult(null);
        return null;
      }

      // Validate the prediction
      const validation = aiAgentTradingService.validatePrediction(pred);

      // Get trade recommendation
      const recommendation = aiAgentTradingService.getTradeRecommendation(pred, maxAmount);

      const result: AgentPredictionResult = {
        prediction: pred,
        validation,
        recommendation
      };

      setPrediction(pred);
      setPredictionResult(result);

      // Store prediction on 0G for audit trail
      if (pred.isVerified) {
        aiAgentTradingService.storePrediction(pred).catch(err => {
          console.warn('Failed to store prediction on 0G:', err);
        });
      }

      console.log(`[AgentTrading] Prediction generated:`, {
        outcome: pred.isYes ? 'YES' : 'NO',
        confidence: pred.confidence,
        verified: pred.isVerified,
        validationValid: validation.valid,
        validationReasons: validation.reasons,
        shouldTrade: recommendation.shouldTrade,
        recommendationReasons: recommendation.reasons
      });

      return result;
    } catch (error) {
      console.error('[AgentTrading] Error generating prediction:', error);
      setGenerationError(error instanceof Error ? error.message : 'Unknown error');
      setPrediction(null);
      setPredictionResult(null);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [selectedAgent, marketId]);

  /**
   * Execute trade using agent's prediction via server wallet
   */
  const executeAgentTrade = useCallback(async (
    amount?: bigint
  ): Promise<TradeExecutionResult | null> => {
    if (!prediction) {
      setExecutionError('No prediction available');
      return null;
    }

    if (!predictionResult?.recommendation?.shouldTrade) {
      setExecutionError('Prediction not recommended for trading');
      return null;
    }

    const tradeAmount = amount || predictionResult.recommendation.amount;
    if (tradeAmount <= BigInt(0)) {
      setExecutionError('Invalid trade amount');
      return null;
    }

    setIsExecuting(true);
    setExecutionError(null);

    try {
      console.log(`[AgentTrading] Executing trade for agent #${prediction.agentId}`);
      console.log(`   Amount: ${formatEther(tradeAmount)} CRwN`);

      const result = await aiAgentTradingService.executeAgentTrade(prediction, tradeAmount);

      setLastTradeResult(result);

      if (!result.success) {
        setExecutionError(result.error || 'Trade execution failed');
      } else {
        console.log(`[AgentTrading] ✅ Trade executed: ${result.txHash}`);
      }

      return result;
    } catch (error) {
      console.error('[AgentTrading] Error executing trade:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setExecutionError(errorMessage);
      return {
        success: false,
        error: errorMessage,
        prediction
      };
    } finally {
      setIsExecuting(false);
    }
  }, [prediction, predictionResult]);

  /**
   * Clear current prediction
   */
  const clearPrediction = useCallback(() => {
    setPrediction(null);
    setPredictionResult(null);
    setGenerationError(null);
    setExecutionError(null);
    setLastTradeResult(null);
  }, []);

  /**
   * Handle agent selection change - clear prediction when agent changes
   */
  const handleSetSelectedAgent = useCallback((agent: AIAgentDisplay | null) => {
    setSelectedAgent(agent);
    clearPrediction();
  }, [clearPrediction]);

  // Computed display values
  const suggestedAmountFormatted = predictionResult?.recommendation?.amount
    ? formatEther(predictionResult.recommendation.amount)
    : '0';

  const confidencePercent = prediction?.confidence ?? 0;

  return {
    // Agent selection
    agents,
    agentsLoading,
    selectedAgent,
    setSelectedAgent: handleSetSelectedAgent,

    // Prediction state
    prediction,
    predictionResult,
    isGenerating,
    generationError,

    // Trade execution state
    isExecuting,
    executionError,
    lastTradeResult,

    // Auto-execute mode
    autoExecute,
    setAutoExecute,

    // Actions
    generatePrediction,
    executeAgentTrade,
    clearPrediction,

    // Formatted values
    suggestedAmountFormatted,
    confidencePercent
  };
}

export default useAgentMarketTrading;
