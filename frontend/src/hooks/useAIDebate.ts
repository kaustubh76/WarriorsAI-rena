/**
 * AI Debate Hook
 * Manage AI debate state and interactions
 */

import { useState, useCallback } from 'react';
import {
  DebateResult,
  MarketSource,
} from '@/types/externalMarket';

// ============================================
// TYPES
// ============================================

interface UseAIDebateReturn {
  debate: DebateResult | null;
  isLoading: boolean;
  error: string | null;
  startDebate: () => Promise<void>;
  getDebate: (debateId: string) => Promise<void>;
}

// ============================================
// HOOK: useAIDebate
// ============================================

export function useAIDebate(
  marketId: string,
  question: string,
  source: MarketSource = MarketSource.NATIVE
): UseAIDebateReturn {
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDebate = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/ai/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId, question, source }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to start debate');
      }

      setDebate(data.data.debate);
    } catch (err) {
      console.error('[useAIDebate] Error:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [marketId, question, source]);

  const getDebate = useCallback(async (debateId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/ai/debate/${debateId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch debate');
      }

      setDebate(data.data.debate);
    } catch (err) {
      console.error('[useAIDebate] Error:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    debate,
    isLoading,
    error,
    startDebate,
    getDebate,
  };
}

// ============================================
// HOOK: useDebateHistory
// ============================================

export function useDebateHistory(marketId: string) {
  const [debates, setDebates] = useState<DebateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/ai/debate?marketId=${marketId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch debate history');
      }

      setDebates(data.data.debates || []);
    } catch (err) {
      console.error('[useDebateHistory] Error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  return {
    debates,
    loading,
    error,
    refetch: fetchHistory,
  };
}

export default useAIDebate;
