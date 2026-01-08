/**
 * Custom hooks for prediction market functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import predictionMarketService, {
  type Market,
  type Position,
  type TradeQuote,
  MarketStatus,
  MarketOutcome,
  PredictionMarketABI,
  ERC20ABI
} from '@/services/predictionMarketService';

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
 * Hook to get market prices
 */
export function useMarketPrice(marketId: bigint | null) {
  const [prices, setPrices] = useState<{ yesPrice: bigint; noPrice: bigint } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(async () => {
    if (marketId === null) return;

    try {
      setLoading(true);
      const priceData = await predictionMarketService.getPrice(marketId);
      setPrices(priceData);
    } catch (err) {
      console.error('Error fetching prices:', err);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchPrices();
    // Refresh prices every 5 seconds
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const yesProbability = prices ? Number(prices.yesPrice) / 100 : 50;
  const noProbability = prices ? Number(prices.noPrice) / 100 : 50;

  return {
    prices,
    yesProbability,
    noProbability,
    loading,
    refetch: fetchPrices
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
    position.yesShares > BigInt(0) ||
    position.noShares > BigInt(0) ||
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
        if (pos.yesShares > BigInt(0) || pos.noShares > BigInt(0) || pos.lpShares > BigInt(0)) {
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
      const quoteData = await predictionMarketService.getTradeQuote(marketId, isYes, collateralAmount);
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
    if (marketId === null || !quote) return;

    const collateralAmount = parseEther(amount);
    // Apply slippage to minimum shares out
    const minSharesOut = quote.sharesOut * BigInt(10000 - slippageBps) / BigInt(10000);

    writeContract({
      address: addresses.predictionMarket,
      abi: PredictionMarketABI,
      functionName: 'buy',
      args: [marketId, isYes, collateralAmount, minSharesOut]
    });
  }, [marketId, quote, writeContract, addresses]);

  // Sell outcome tokens
  const sell = useCallback(async (isYes: boolean, shareAmount: string, slippageBps: number = 100) => {
    if (marketId === null) return;

    const shares = parseEther(shareAmount);
    const expectedCollateral = await predictionMarketService.calculateSellAmount(marketId, isYes, shares);
    const minCollateralOut = expectedCollateral * BigInt(10000 - slippageBps) / BigInt(10000);

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
    balanceFormatted: formatEther(balance),
    allowance,
    loading,
    refetch: fetchBalanceAndAllowance
  };
}
