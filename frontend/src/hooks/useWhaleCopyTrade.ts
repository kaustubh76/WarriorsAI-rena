/**
 * Hook for whale copy trading on mirror markets
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { MarketSource } from '@/types/externalMarket';

// ============================================
// TYPES
// ============================================

export interface ExternalCopyTradeConfig {
  maxCopyAmount: string;
  copyPercentage: number; // 1-100
  enabledSources: MarketSource[];
  autoMirror: boolean; // Auto-create mirror if doesn't exist
}

export interface FollowedWhale {
  address: string;
  label?: string;
  source: MarketSource;
  config: ExternalCopyTradeConfig;
  followedAt: number;
  totalCopied: string;
  copyCount: number;
}

export interface MirrorCopyTrade {
  id: string;
  whaleAddress: string;
  mirrorKey: string;
  marketQuestion: string;
  outcome: 'yes' | 'no';
  copyAmount: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  createdAt: number;
}

export interface UseWhaleCopyTradeReturn {
  followedWhales: FollowedWhale[];
  copyHistory: MirrorCopyTrade[];
  loading: boolean;
  error: string | null;
  followWhale: (
    traderAddress: string,
    config: ExternalCopyTradeConfig
  ) => Promise<boolean>;
  unfollowWhale: (traderAddress: string) => Promise<boolean>;
  updateConfig: (
    traderAddress: string,
    config: Partial<ExternalCopyTradeConfig>
  ) => Promise<boolean>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const DEFAULT_COPY_CONFIG: ExternalCopyTradeConfig = {
  maxCopyAmount: '100',
  copyPercentage: 10,
  enabledSources: [MarketSource.POLYMARKET, MarketSource.KALSHI],
  autoMirror: false,
};

// ============================================
// HOOK
// ============================================

export function useWhaleCopyTrade(): UseWhaleCopyTradeReturn {
  const { address } = useAccount();

  const [followedWhales, setFollowedWhales] = useState<FollowedWhale[]>([]);
  const [copyHistory, setCopyHistory] = useState<MirrorCopyTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch followed whales
  const fetchFollowedWhales = useCallback(async () => {
    if (!address) {
      setFollowedWhales([]);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/whale-alerts/following?address=${address}`);

      if (!res.ok) {
        throw new Error('Failed to fetch followed whales');
      }

      const data = await res.json();
      setFollowedWhales(data.whales || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch whales');
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Fetch copy trade history
  const fetchCopyHistory = useCallback(async () => {
    if (!address) {
      setCopyHistory([]);
      return;
    }

    try {
      const res = await fetch(`/api/copy-trade/mirror-history?address=${address}`);

      if (!res.ok) {
        console.warn('Failed to fetch copy history');
        return;
      }

      const data = await res.json();
      setCopyHistory(data.trades || []);
    } catch (err) {
      console.error('Failed to fetch copy history:', err);
    }
  }, [address]);

  // Refresh all data
  const refresh = useCallback(async () => {
    await Promise.all([fetchFollowedWhales(), fetchCopyHistory()]);
  }, [fetchFollowedWhales, fetchCopyHistory]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Follow a whale
  const followWhale = useCallback(
    async (
      traderAddress: string,
      config: ExternalCopyTradeConfig
    ): Promise<boolean> => {
      if (!address) {
        setError('Wallet not connected');
        return false;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/whale-alerts/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: address,
            whaleAddress: traderAddress,
            config,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to follow whale');
        }

        await fetchFollowedWhales();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to follow whale');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [address, fetchFollowedWhales]
  );

  // Unfollow a whale
  const unfollowWhale = useCallback(
    async (traderAddress: string): Promise<boolean> => {
      if (!address) {
        setError('Wallet not connected');
        return false;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/whale-alerts/unfollow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: address,
            whaleAddress: traderAddress,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to unfollow whale');
        }

        await fetchFollowedWhales();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unfollow whale');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [address, fetchFollowedWhales]
  );

  // Update copy config
  const updateConfig = useCallback(
    async (
      traderAddress: string,
      config: Partial<ExternalCopyTradeConfig>
    ): Promise<boolean> => {
      if (!address) {
        setError('Wallet not connected');
        return false;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/whale-alerts/update-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: address,
            whaleAddress: traderAddress,
            config,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to update config');
        }

        await fetchFollowedWhales();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update config');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [address, fetchFollowedWhales]
  );

  return {
    followedWhales,
    copyHistory,
    loading,
    error,
    followWhale,
    unfollowWhale,
    updateConfig,
    refresh,
    clearError,
  };
}

export default useWhaleCopyTrade;
