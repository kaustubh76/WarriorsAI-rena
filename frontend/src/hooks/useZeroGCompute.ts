/**
 * React hooks for 0G Compute integration
 * Provides AI inference capabilities via 0G Network
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  InferenceResult,
  PredictionResult,
  AIProvider,
  BattleDataIndex
} from '../types/zeroG';

// Types for hook returns
interface UseInferenceReturn {
  submitInference: (prompt: string, options?: InferenceOptions) => Promise<InferenceResult | null>;
  result: InferenceResult | null;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

interface InferenceOptions {
  maxTokens?: number;
  temperature?: number;
  battleData?: {
    battleId: string;
    warriors: {
      id: string;
      traits: {
        strength: number;
        wit: number;
        charisma: number;
        defence: number;
        luck: number;
      };
    }[];
  };
}

interface UseBattlePredictionReturn {
  predictBattle: (battleData: BattleDataIndex) => Promise<PredictionResult | null>;
  prediction: PredictionResult | null;
  isLoading: boolean;
  error: string | null;
}

interface UseProvidersReturn {
  providers: AIProvider[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for 0G AI inference
 */
export function useZeroGInference(): UseInferenceReturn {
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitInference = useCallback(async (
    prompt: string,
    options?: InferenceOptions
  ): Promise<InferenceResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/0g/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: options?.maxTokens || 1000,
          temperature: options?.temperature || 0.7,
          battleData: options?.battleData
        })
      });

      if (!response.ok) {
        throw new Error(`Inference failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Inference failed');
      }

      const inferenceResult: InferenceResult = {
        chatId: data.chatId,
        response: data.response,
        provider: data.provider,
        timestamp: data.timestamp,
        proof: data.proof,
        usage: data.usage
      };

      setResult(inferenceResult);
      return inferenceResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    submitInference,
    result,
    isLoading,
    error,
    reset
  };
}

/**
 * Hook for battle predictions via 0G
 */
export function useZeroGBattlePrediction(): UseBattlePredictionReturn {
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const predictBattle = useCallback(async (
    battleData: BattleDataIndex
  ): Promise<PredictionResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Build prediction prompt
      const w1 = battleData.warriors[0];
      const w2 = battleData.warriors[1];

      const prompt = `
You are an expert battle analyst for the Warriors AI Arena prediction market.
Analyze the following battle and predict the winner.

WARRIOR 1 STATS:
- Strength: ${w1?.traits.strength || 0}
- Wit: ${w1?.traits.wit || 0}
- Charisma: ${w1?.traits.charisma || 0}
- Defence: ${w1?.traits.defence || 0}
- Luck: ${w1?.traits.luck || 0}

WARRIOR 2 STATS:
- Strength: ${w2?.traits.strength || 0}
- Wit: ${w2?.traits.wit || 0}
- Charisma: ${w2?.traits.charisma || 0}
- Defence: ${w2?.traits.defence || 0}
- Luck: ${w2?.traits.luck || 0}

RULES:
- Higher Strength = more damage dealt
- Higher Defence = less damage taken
- Higher Wit = better move selection
- Higher Luck = critical hit chance
- Higher Charisma = recovery effectiveness

Provide your prediction in this exact JSON format:
{
  "outcome": "yes" | "no" | "draw",
  "confidence": <number 0-100>,
  "reasoning": "<one paragraph explaining your prediction>"
}

NOTE: "yes" = Warrior 1 wins, "no" = Warrior 2 wins
`;

      const response = await fetch('/api/0g/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 1000,
          temperature: 0.7,
          battleData: {
            battleId: battleData.battleId.toString(),
            warriors: battleData.warriors.map(w => ({
              id: w.id.toString(),
              traits: w.traits
            }))
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Prediction failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Prediction failed');
      }

      // Parse the response
      const parsed = parseJSONFromResponse(data.response);

      const predictionResult: PredictionResult = {
        outcome: parsed.outcome || 'draw',
        confidence: parsed.confidence || 50,
        reasoning: parsed.reasoning || data.response,
        chatId: data.chatId,
        proof: data.proof
      };

      setPrediction(predictionResult);
      return predictionResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    predictBattle,
    prediction,
    isLoading,
    error
  };
}

/**
 * Hook for listing 0G AI providers
 */
export function useZeroGProviders(): UseProvidersReturn {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/0g/inference');

      if (!response.ok) {
        throw new Error(`Failed to fetch providers: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch providers');
      }

      setProviders(data.providers || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    providers,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for checking 0G compute service status
 */
export function useZeroGStatus() {
  const [status, setStatus] = useState<{
    isHealthy: boolean;
    providerCount: number;
    lastCheck: number | null;
  }>({
    isHealthy: false,
    providerCount: 0,
    lastCheck: null
  });
  const [isLoading, setIsLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/0g/inference');
      const data = await response.json();

      setStatus({
        isHealthy: response.ok && data.success,
        providerCount: data.providers?.length || 0,
        lastCheck: Date.now()
      });
    } catch {
      setStatus(prev => ({
        ...prev,
        isHealthy: false,
        lastCheck: Date.now()
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const statusText = useMemo(() => {
    if (isLoading) return 'Checking...';
    if (!status.lastCheck) return 'Not checked';
    return status.isHealthy ? 'Online' : 'Offline';
  }, [status, isLoading]);

  return {
    ...status,
    isLoading,
    statusText,
    checkStatus
  };
}

// Helper function to parse JSON from AI response
function parseJSONFromResponse(response: string): any {
  try {
    return JSON.parse(response.trim());
  } catch {
    // Try to extract from markdown
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }

    // Try to find JSON object
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    return {};
  }
}

export default {
  useZeroGInference,
  useZeroGBattlePrediction,
  useZeroGProviders,
  useZeroGStatus
};
