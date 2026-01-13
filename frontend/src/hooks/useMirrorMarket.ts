/**
 * Mirror Market Hooks
 * Hooks for creating and trading on mirror markets (Polymarket/Kalshi on Flow chain)
 */

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { MarketSource, UnifiedMarket, Position } from '@/types/externalMarket';

// ============================================
// TYPES
// ============================================

export interface MirrorMarketState {
  mirrorKey: string;
  flowMarketId: string;
  source: MarketSource;
  externalId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  totalVolume: string;
  tradeCount: number;
  isActive: boolean;
  creator: string;
  createdAt: number;
}

export interface CreateMirrorParams {
  externalId: string;
  source: MarketSource;
  question: string;
  yesPrice: number;
  endTime: number;
  initialLiquidity: string;
}

export interface TradeParams {
  mirrorKey: string;
  isYes: boolean;
  amount: string;
  minSharesOut?: string;
}

export interface VRFTradeParams {
  mirrorKey: string;
  isYes: boolean;
  amount: string;
  useVRF?: boolean;
  agentId?: string;
  prediction?: {
    outcome: 'yes' | 'no';
    confidence: number;
    isVerified: boolean;
    inputHash: string;
    outputHash: string;
    providerAddress: string;
  };
  slippageBps?: number;
}

export interface MirrorPosition extends Position {
  mirrorKey: string;
  usedVRF: boolean;
  agentId?: string;
}

// ============================================
// HOOK: useMirrorMarketCreation
// ============================================

export function useMirrorMarketCreation() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMirrorMarket = useCallback(
    async (params: CreateMirrorParams) => {
      if (!address) {
        setError('Please connect your wallet');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/flow/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'createMirror',
            walletAddress: address,
            externalId: params.externalId,
            source: params.source,
            question: params.question,
            yesPrice: Math.round(params.yesPrice * 100), // Convert to basis points
            endTime: params.endTime,
            initialLiquidity: params.initialLiquidity,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create mirror market');
        }

        return {
          txHash: data.txHash,
          mirrorKey: data.mirrorKey,
          blockNumber: data.blockNumber,
          requestId: data.requestId,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  const createFromMarket = useCallback(
    async (market: UnifiedMarket, initialLiquidity: string) => {
      return createMirrorMarket({
        externalId: market.externalId,
        source: market.source,
        question: market.question,
        yesPrice: market.yesPrice,
        endTime: market.endTime,
        initialLiquidity,
      });
    },
    [createMirrorMarket]
  );

  return {
    createMirrorMarket,
    createFromMarket,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ============================================
// HOOK: useMirrorMarketTrade
// ============================================

export function useMirrorMarketTrade() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeTrade = useCallback(
    async (params: TradeParams) => {
      if (!address) {
        setError('Please connect your wallet');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/flow/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'trade',
            walletAddress: address,
            mirrorKey: params.mirrorKey,
            isYes: params.isYes,
            amount: params.amount,
            minSharesOut: params.minSharesOut || '0',
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to execute trade');
        }

        return {
          txHash: data.txHash,
          blockNumber: data.blockNumber,
          sharesOut: data.sharesOut,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return {
    executeTrade,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ============================================
// HOOK: useVRFTrade
// ============================================

export function useVRFTrade() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeVRFTrade = useCallback(
    async (params: VRFTradeParams) => {
      if (!address) {
        setError('Please connect your wallet');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/flow/vrf-trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            mirrorKey: params.mirrorKey,
            isYes: params.isYes,
            amount: params.amount,
            useVRF: params.useVRF ?? false,
            agentId: params.agentId,
            prediction: params.prediction,
            slippageBps: params.slippageBps ?? 100, // Default 1% slippage
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to execute VRF trade');
        }

        return {
          txHash: data.txHash,
          blockNumber: data.blockNumber,
          sharesReceived: data.sharesReceived,
          usedVRF: data.usedVRF,
          storageRootHash: data.storageRootHash,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  return {
    executeVRFTrade,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ============================================
// HOOK: useMirrorMarketQuery
// ============================================

export function useMirrorMarketQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mirrorMarket, setMirrorMarket] = useState<MirrorMarketState | null>(null);

  const queryMirrorMarket = useCallback(async (mirrorKey: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/flow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'query',
          mirrorKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to query mirror market');
      }

      const market: MirrorMarketState = {
        mirrorKey: data.mirrorKey,
        flowMarketId: data.flowMarketId,
        source: data.source as MarketSource,
        externalId: data.externalId,
        question: data.question || '',
        yesPrice: data.yesPrice / 100, // Convert from basis points
        noPrice: data.noPrice / 100,
        totalVolume: data.totalVolume,
        tradeCount: data.tradeCount,
        isActive: data.isActive,
        creator: data.creator,
        createdAt: data.createdAt,
      };

      setMirrorMarket(market);
      return market;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setMirrorMarket(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getMirrorKeyFromMarket = useCallback((market: UnifiedMarket): string => {
    // Generate mirror key the same way the contract does
    // keccak256(abi.encodePacked(source, externalId))
    // For now, return a formatted key - actual computation happens on backend
    return `${market.source}_${market.externalId}`;
  }, []);

  return {
    queryMirrorMarket,
    getMirrorKeyFromMarket,
    mirrorMarket,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ============================================
// HOOK: useMirrorMarketPositions
// ============================================

export function useMirrorMarketPositions() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<MirrorPosition[]>([]);

  const fetchPositions = useCallback(async () => {
    if (!address) {
      setError('Please connect your wallet');
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      // Query the GET endpoint for trade status which includes position info
      const response = await fetch(`/api/flow/vrf-trade?walletAddress=${address}`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch positions');
      }

      // Map the response to positions
      const mirrorPositions: MirrorPosition[] = (data.positions || []).map(
        (pos: Record<string, unknown>) => ({
          marketId: pos.marketId as string,
          market: pos.market as UnifiedMarket,
          outcome: pos.outcome as 'yes' | 'no',
          shares: pos.shares as string,
          avgPrice: pos.avgPrice as number,
          currentPrice: pos.currentPrice as number,
          value: pos.value as string,
          pnl: pos.pnl as string,
          pnlPercent: pos.pnlPercent as number,
          mirrorKey: pos.mirrorKey as string,
          usedVRF: pos.usedVRF as boolean,
          agentId: pos.agentId as string | undefined,
        })
      );

      setPositions(mirrorPositions);
      return mirrorPositions;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [address]);

  return {
    positions,
    fetchPositions,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ============================================
// HOOK: useMirrorMarketSync
// ============================================

export function useMirrorMarketSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncPrice = useCallback(
    async (mirrorKey: string, newYesPrice: number, signature: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/flow/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'syncPrice',
            mirrorKey,
            newYesPrice: Math.round(newYesPrice * 100), // Convert to basis points
            signature,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to sync price');
        }

        return { txHash: data.txHash, success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        return { success: false };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const resolveMarket = useCallback(
    async (mirrorKey: string, outcome: 'yes' | 'no', signature: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/flow/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'resolve',
            mirrorKey,
            outcome,
            signature,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to resolve market');
        }

        return { txHash: data.txHash, success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        return { success: false };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    syncPrice,
    resolveMarket,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ============================================
// COMBINED HOOK: useMirrorMarket
// ============================================

export function useMirrorMarket() {
  const creation = useMirrorMarketCreation();
  const trade = useMirrorMarketTrade();
  const vrfTrade = useVRFTrade();
  const query = useMirrorMarketQuery();
  const positions = useMirrorMarketPositions();
  const sync = useMirrorMarketSync();

  return {
    // Creation
    createMirrorMarket: creation.createMirrorMarket,
    createFromMarket: creation.createFromMarket,
    creationLoading: creation.loading,
    creationError: creation.error,

    // Direct trading
    executeTrade: trade.executeTrade,
    tradeLoading: trade.loading,
    tradeError: trade.error,

    // VRF trading
    executeVRFTrade: vrfTrade.executeVRFTrade,
    vrfTradeLoading: vrfTrade.loading,
    vrfTradeError: vrfTrade.error,

    // Query
    queryMirrorMarket: query.queryMirrorMarket,
    getMirrorKeyFromMarket: query.getMirrorKeyFromMarket,
    mirrorMarket: query.mirrorMarket,
    queryLoading: query.loading,
    queryError: query.error,

    // Positions
    positions: positions.positions,
    fetchPositions: positions.fetchPositions,
    positionsLoading: positions.loading,
    positionsError: positions.error,

    // Sync
    syncPrice: sync.syncPrice,
    resolveMarket: sync.resolveMarket,
    syncLoading: sync.loading,
    syncError: sync.error,

    // Combined loading state
    isLoading:
      creation.loading ||
      trade.loading ||
      vrfTrade.loading ||
      query.loading ||
      positions.loading ||
      sync.loading,
  };
}

export default useMirrorMarket;
