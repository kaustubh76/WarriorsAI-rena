/**
 * Custom hooks for prediction market functionality
 * All data is fetched from blockchain - NO MOCK DATA
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { formatTokenAmount } from '@/utils/format';
import predictionMarketService, {
  type Market,
  type Position,
  type TradeQuote,
  type MarketActivity,
  MarketStatus,
  MarketOutcome,
  PredictionMarketABI,
  ERC20ABI
} from '@/services/predictionMarketService';
import { clearRPCCache } from '@/lib/rpcClient';

/**
 * Force refresh all market data by clearing cache
 */
export function clearMarketCache() {
  clearRPCCache();
}

/**
 * Hook to fetch all markets
 */
export function useMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const allMarkets = await predictionMarketService.getAllMarkets();
      setMarkets(allMarkets);
      setError(null);
    } catch (err) {
      setError('Failed to fetch markets');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMarkets, 30000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  const activeMarkets = markets.filter(m => m.status === MarketStatus.Active);
  const resolvedMarkets = markets.filter(m => m.status === MarketStatus.Resolved);

  return {
    markets,
    activeMarkets,
    resolvedMarkets,
    loading,
    error,
    refetch: fetchMarkets
  };
}

/**
 * Hook to fetch a single market
 */
export function useMarket(marketId: bigint | null) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = useCallback(async () => {
    if (marketId === null) return;

    try {
      setLoading(true);
      const marketData = await predictionMarketService.getMarket(marketId);
      setMarket(marketData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch market');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchMarket();
    // Refresh every 10 seconds for active market updates
    const interval = setInterval(fetchMarket, 10000);
    return () => clearInterval(interval);
  }, [fetchMarket]);

  return { market, loading, error, refetch: fetchMarket };
}

/**
 * Hook to get market prices - fetches REAL prices from blockchain
 * Refreshes every 3 seconds for responsive updates
 */
export function useMarketPrice(marketId: bigint | null) {
  const [prices, setPrices] = useState<{ yesPrice: bigint; noPrice: bigint } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async (skipCache = false) => {
    if (marketId === null) return;

    try {
      setLoading(true);
      setError(null);
      // Clear cache before fetching if requested
      if (skipCache) {
        clearRPCCache();
      }
      const priceData = await predictionMarketService.getPrice(marketId);
      setPrices(priceData);
    } catch (err) {
      console.error('Error fetching prices:', err);
      setError('Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchPrices();
    // Refresh prices every 3 seconds for more responsive updates
    const interval = setInterval(() => fetchPrices(), 3000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Calculate probabilities from actual prices - NO hardcoded fallbacks
  // Only show real data, loading state otherwise
  const yesProbability = prices ? Number(prices.yesPrice) / 100 : null;
  const noProbability = prices ? Number(prices.noPrice) / 100 : null;

  return {
    prices,
    yesProbability: yesProbability ?? 0,
    noProbability: noProbability ?? 0,
    loading,
    error,
    refetch: () => fetchPrices(true) // Force skip cache on manual refetch
  };
}

/**
 * Hook to get user's position in a market
 */
export function usePosition(marketId: bigint | null) {
  const { address } = useAccount();
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPosition = useCallback(async () => {
    if (marketId === null || !address) return;

    try {
      setLoading(true);
      const pos = await predictionMarketService.getPosition(marketId, address);
      setPosition(pos);
    } catch (err) {
      console.error('Error fetching position:', err);
    } finally {
      setLoading(false);
    }
  }, [marketId, address]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  const hasPosition = position && (
    position.yesTokens > BigInt(0) ||
    position.noTokens > BigInt(0) ||
    position.lpShares > BigInt(0)
  );

  return {
    position,
    hasPosition,
    loading,
    refetch: fetchPosition
  };
}

/**
 * Hook to get all user positions across markets
 */
export function useUserPositions() {
  const { address } = useAccount();
  const { markets } = useMarkets();
  const [positions, setPositions] = useState<Map<string, Position>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchAllPositions = useCallback(async () => {
    if (!address || markets.length === 0) return;

    try {
      setLoading(true);
      const posMap = new Map<string, Position>();

      for (const market of markets) {
        const pos = await predictionMarketService.getPosition(market.id, address);
        if (pos.yesTokens > BigInt(0) || pos.noTokens > BigInt(0) || pos.lpShares > BigInt(0)) {
          posMap.set(market.id.toString(), pos);
        }
      }

      setPositions(posMap);
    } catch (err) {
      console.error('Error fetching positions:', err);
    } finally {
      setLoading(false);
    }
  }, [address, markets]);

  useEffect(() => {
    fetchAllPositions();
  }, [fetchAllPositions]);

  return { positions, loading, refetch: fetchAllPositions };
}

/**
 * Hook for trading (buy/sell)
 */
export function useTrade(marketId: bigint | null) {
  const { address } = useAccount();
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = predictionMarketService.getAddresses();

  // Get quote for a trade
  const getQuote = useCallback(async (isYes: boolean, amount: string) => {
    if (marketId === null || !amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }

    try {
      setQuoteLoading(true);
      const collateralAmount = parseEther(amount);
      console.log('Getting quote for:', { marketId: marketId.toString(), isYes, collateralAmount: collateralAmount.toString() });
      const quoteData = await predictionMarketService.getTradeQuote(marketId, isYes, collateralAmount);
      console.log('Quote received:', { sharesOut: quoteData.sharesOut.toString(), priceImpact: quoteData.priceImpact });
      setQuote(quoteData);
    } catch (err) {
      console.error('Error getting quote:', err);
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [marketId]);

  // Check and approve token allowance
  const approveTokens = useCallback(async (amount: string) => {
    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.crownToken,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [addresses.predictionMarket, amountBigInt]
    });
  }, [writeContract, addresses]);

  // Buy outcome tokens
  const buy = useCallback(async (isYes: boolean, amount: string, slippageBps: number = 100) => {
    if (marketId === null) {
      console.error('Buy failed: marketId is null');
      return;
    }
    if (!quote) {
      console.error('Buy failed: no quote available. Getting fresh quote...');
      // If no quote, try to get one first
      return;
    }

    const collateralAmount = parseEther(amount);
    // Apply slippage to minimum shares out
    const minSharesOut = quote.sharesOut * BigInt(10000 - slippageBps) / BigInt(10000);

    console.log('Executing buy:', {
      marketId: marketId.toString(),
      isYes,
      collateralAmount: collateralAmount.toString(),
      minSharesOut: minSharesOut.toString(),
      contractAddress: addresses.predictionMarket
    });

    writeContract({
      address: addresses.predictionMarket,
      abi: PredictionMarketABI,
      functionName: 'buy',
      args: [marketId, isYes, collateralAmount, minSharesOut]
    });
  }, [marketId, quote, writeContract, addresses]);

  // Sell outcome tokens
  const sell = useCallback(async (isYes: boolean, shareAmount: string, slippageBps: number = 100) => {
    if (marketId === null) {
      console.error('Sell failed: marketId is null');
      return;
    }

    const shares = parseEther(shareAmount);
    const expectedCollateral = await predictionMarketService.calculateSellAmount(marketId, isYes, shares);
    const minCollateralOut = expectedCollateral * BigInt(10000 - slippageBps) / BigInt(10000);

    console.log('Executing sell:', {
      marketId: marketId.toString(),
      isYes,
      shares: shares.toString(),
      minCollateralOut: minCollateralOut.toString(),
      contractAddress: addresses.predictionMarket
    });

    writeContract({
      address: addresses.predictionMarket,
      abi: PredictionMarketABI,
      functionName: 'sell',
      args: [marketId, isYes, shares, minCollateralOut]
    });
  }, [marketId, writeContract, addresses]);

  return {
    quote,
    quoteLoading,
    getQuote,
    approveTokens,
    buy,
    sell,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook for liquidity provision
 */
export function useLiquidity(marketId: bigint | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = predictionMarketService.getAddresses();

  // Add liquidity to a market
  const addLiquidity = useCallback(async (amount: string) => {
    if (marketId === null) return;

    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.predictionMarket,
      abi: PredictionMarketABI,
      functionName: 'addLiquidity',
      args: [marketId, amountBigInt]
    });
  }, [marketId, writeContract, addresses]);

  // Remove liquidity from a market
  const removeLiquidity = useCallback(async (lpShares: string) => {
    if (marketId === null) return;

    const sharesBigInt = parseEther(lpShares);

    writeContract({
      address: addresses.predictionMarket,
      abi: PredictionMarketABI,
      functionName: 'removeLiquidity',
      args: [marketId, sharesBigInt]
    });
  }, [marketId, writeContract, addresses]);

  return {
    addLiquidity,
    removeLiquidity,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook to claim winnings from resolved market
 */
export function useClaimWinnings(marketId: bigint | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = predictionMarketService.getAddresses();

  const claim = useCallback(async () => {
    if (marketId === null) return;

    writeContract({
      address: addresses.predictionMarket,
      abi: PredictionMarketABI,
      functionName: 'claimWinnings',
      args: [marketId]
    });
  }, [marketId, writeContract, addresses]);

  return {
    claim,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook for token balance and allowance
 */
export function useTokenBalance() {
  const { address } = useAccount();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(true);

  const fetchBalanceAndAllowance = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const [bal, allow] = await Promise.all([
        predictionMarketService.getBalance(address),
        predictionMarketService.checkAllowance(address)
      ]);
      setBalance(bal);
      setAllowance(allow);
    } catch (err) {
      console.error('Error fetching balance/allowance:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalanceAndAllowance();
  }, [fetchBalanceAndAllowance]);

  return {
    balance,
    balanceFormatted: formatTokenAmount(balance),
    allowance,
    loading,
    refetch: fetchBalanceAndAllowance
  };
}

// Re-export MarketActivity type from service
export type { MarketActivity } from '@/services/predictionMarketService';

/**
 * Hook to fetch market activity from blockchain events
 */
export function useMarketActivity(marketId: bigint | null) {
  const [activities, setActivities] = useState<MarketActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    if (marketId === null) {
      setActivities([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const activityList = await predictionMarketService.getMarketActivity(marketId);
      setActivities(activityList);
      setError(null);
    } catch (err) {
      console.error('Error fetching market activity:', err);
      setError('Failed to fetch activity');
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchActivity();
    // Refresh every 15 seconds
    const interval = setInterval(fetchActivity, 15000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  return {
    activities,
    loading,
    error,
    refetch: fetchActivity
  };
}
