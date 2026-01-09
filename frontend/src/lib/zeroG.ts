/**
 * 0G Network Integration - Main Export
 *
 * This module provides the complete 0G integration for:
 * - Verifiable AI Compute (inference with cryptographic proofs)
 * - Decentralized Storage (battle data with RAG queries)
 * - AI Agent Trading (verified predictions for prediction markets)
 *
 * CRITICAL SECURITY NOTES:
 * 1. All AI predictions MUST be verified before on-chain execution
 * 2. Fallback predictions should NEVER be used for trades
 * 3. Cryptographic proofs use keccak256 for on-chain verification
 * 4. TEE attestation provides additional security for sensitive operations
 */

// ============================================================================
// Services
// ============================================================================

export { zeroGComputeService } from '@/services/zeroGComputeService';
export { zeroGStorageService } from '@/services/zeroGStorageService';
export { debateComputeService } from '@/services/debateComputeService';
export { aiAgentTradingService } from '@/services/aiAgentTradingService';

// ============================================================================
// Hooks
// ============================================================================

export {
  useZeroGInference,
  useZeroGProviders,
  useZeroGStorage,
  useZeroGQuery,
  useZeroGStatus
} from '@/hooks/useZeroG';

export {
  useAIAgentTrading,
  useVerifiedCopyTrade
} from '@/hooks/useAIAgentTrading';

// ============================================================================
// Components
// ============================================================================

export { ZeroGStatus } from '@/components/0g/ZeroGStatus';

// ============================================================================
// Types
// ============================================================================

export type {
  ZeroGConfig,
  InferenceRequest,
  InferenceResult,
  InferenceProof,
  PredictionResult,
  ReasoningResult,
  BattleDataIndex,
  WarriorData,
  WarriorTraits,
  AIProvider,
  LedgerInfo,
  StorageUploadResult,
  StorageDownloadResult,
  StorageStatus
} from '@/types/zeroG';

export type {
  TradingPrediction,
  TradeExecutionResult,
  AgentTradingConfig
} from '@/services/aiAgentTradingService';

// ============================================================================
// Constants
// ============================================================================

export { ZERO_G_TESTNET_CONFIG } from '@/types/zeroG';

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a prediction is safe to trade with
 */
export function isPredictionTradeSafe(prediction: {
  isVerified?: boolean;
  fallbackMode?: boolean;
  confidence?: number;
}): boolean {
  return (
    prediction.isVerified === true &&
    prediction.fallbackMode !== true &&
    (prediction.confidence ?? 0) >= 60
  );
}

/**
 * Check if 0G is available in the current environment
 */
export function is0GAvailable(): boolean {
  return typeof fetch !== 'undefined';
}

/**
 * Get 0G network status summary
 */
export async function get0GNetworkStatus(): Promise<{
  compute: { available: boolean; providerCount: number };
  storage: { available: boolean };
}> {
  try {
    const [computeRes, storageRes] = await Promise.all([
      fetch('/api/0g/inference').catch(() => null),
      fetch('/api/0g/store', { method: 'PUT' }).catch(() => null)
    ]);

    const computeData = computeRes?.ok ? await computeRes.json() : { success: false };
    const storageData = storageRes?.ok ? await storageRes.json() : { status: 'unhealthy' };

    return {
      compute: {
        available: computeData.success && computeData.providers?.length > 0,
        providerCount: computeData.providers?.length || 0
      },
      storage: {
        available: storageData.status === 'healthy'
      }
    };
  } catch {
    return {
      compute: { available: false, providerCount: 0 },
      storage: { available: false }
    };
  }
}
