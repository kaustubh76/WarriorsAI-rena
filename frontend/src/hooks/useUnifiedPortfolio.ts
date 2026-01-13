/**
 * Hook for unified portfolio view across native and mirror markets
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { MarketSource } from '@/types/externalMarket';

// ============================================
// TYPES
// ============================================

export interface PortfolioPosition {
  id: string;
  marketId: string;
  marketQuestion: string;
  source: MarketSource;
  isYes: boolean;
  shares: bigint;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: bigint;
  realizedPnL: bigint;
  entryTimestamp: number;
}

export interface UnifiedPortfolioSummary {
  totalValue: bigint;
  totalUnrealizedPnL: bigint;
  totalRealizedPnL: bigint;
  positionCount: number;

  // By source
  nativePositions: PortfolioPosition[];
  polymarketPositions: PortfolioPosition[];
  kalshiPositions: PortfolioPosition[];
}

export interface UseUnifiedPortfolioReturn {
  portfolio: UnifiedPortfolioSummary | null;
  positions: PortfolioPosition[];
  filter: MarketSource | 'all';
  setFilter: (filter: MarketSource | 'all') => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  // Computed values
  totalValueFormatted: string;
  totalPnLFormatted: string;
  isPnLPositive: boolean;
}

// ============================================
// HOOK
// ============================================

export function useUnifiedPortfolio(): UseUnifiedPortfolioReturn {
  const { address } = useAccount();

  const [portfolio, setPortfolio] = useState<UnifiedPortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarketSource | 'all'>('all');

  const fetchPortfolio = useCallback(async () => {
    if (!address) {
      setPortfolio(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch from all sources in parallel
      const [nativeRes, mirrorRes] = await Promise.all([
        fetch(`/api/portfolio/native?address=${address}`),
        fetch(`/api/portfolio/mirror?address=${address}`),
      ]);

      const nativeData = nativeRes.ok ? await nativeRes.json() : { positions: [] };
      const mirrorData = mirrorRes.ok ? await mirrorRes.json() : { positions: [] };

      // Parse positions and convert shares to bigint
      const parsePositions = (positions: unknown[]): PortfolioPosition[] => {
        return (positions || []).map((p: unknown) => {
          const pos = p as Record<string, unknown>;
          return {
            id: String(pos.id || ''),
            marketId: String(pos.marketId || ''),
            marketQuestion: String(pos.marketQuestion || ''),
            source: (pos.source as MarketSource) || MarketSource.NATIVE,
            isYes: Boolean(pos.isYes),
            shares: BigInt(String(pos.shares || '0')),
            avgPrice: Number(pos.avgPrice || 0),
            currentPrice: Number(pos.currentPrice || 0),
            unrealizedPnL: BigInt(String(pos.unrealizedPnL || '0')),
            realizedPnL: BigInt(String(pos.realizedPnL || '0')),
            entryTimestamp: Number(pos.entryTimestamp || 0),
          };
        });
      };

      const nativePositions = parsePositions(nativeData.positions);
      const mirrorPositions = parsePositions(mirrorData.positions);

      // Separate mirror positions by source
      const polymarketPositions = mirrorPositions.filter(
        (p) => p.source === MarketSource.POLYMARKET
      );
      const kalshiPositions = mirrorPositions.filter(
        (p) => p.source === MarketSource.KALSHI
      );

      // Calculate totals
      const allPositions = [
        ...nativePositions,
        ...polymarketPositions,
        ...kalshiPositions,
      ];

      const totalValue = allPositions.reduce(
        (sum, p) => sum + (p.shares * BigInt(Math.floor(p.currentPrice * 100))) / 100n,
        0n
      );

      const totalUnrealizedPnL = allPositions.reduce(
        (sum, p) => sum + p.unrealizedPnL,
        0n
      );

      const totalRealizedPnL = allPositions.reduce(
        (sum, p) => sum + p.realizedPnL,
        0n
      );

      setPortfolio({
        totalValue,
        totalUnrealizedPnL,
        totalRealizedPnL,
        positionCount: allPositions.length,
        nativePositions,
        polymarketPositions,
        kalshiPositions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    if (!portfolio) return [];

    switch (filter) {
      case MarketSource.NATIVE:
        return portfolio.nativePositions;
      case MarketSource.POLYMARKET:
        return portfolio.polymarketPositions;
      case MarketSource.KALSHI:
        return portfolio.kalshiPositions;
      default:
        return [
          ...portfolio.nativePositions,
          ...portfolio.polymarketPositions,
          ...portfolio.kalshiPositions,
        ];
    }
  }, [portfolio, filter]);

  // Computed values
  const totalValueFormatted = useMemo(() => {
    if (!portfolio) return '0.00';
    return formatEther(portfolio.totalValue);
  }, [portfolio]);

  const totalPnLFormatted = useMemo(() => {
    if (!portfolio) return '0.00';
    const totalPnL = portfolio.totalUnrealizedPnL + portfolio.totalRealizedPnL;
    return formatEther(totalPnL);
  }, [portfolio]);

  const isPnLPositive = useMemo(() => {
    if (!portfolio) return true;
    return portfolio.totalUnrealizedPnL + portfolio.totalRealizedPnL >= 0n;
  }, [portfolio]);

  return {
    portfolio,
    positions: filteredPositions,
    filter,
    setFilter,
    loading,
    error,
    refresh: fetchPortfolio,
    totalValueFormatted,
    totalPnLFormatted,
    isPnLPositive,
  };
}

export default useUnifiedPortfolio;
