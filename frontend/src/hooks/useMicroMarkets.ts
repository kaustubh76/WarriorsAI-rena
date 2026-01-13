/**
 * Custom hooks for Micro-Market functionality
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { formatTokenAmount } from '@/utils/format';
import microMarketService, {
  type MicroMarket,
  type MicroMarketDisplay,
  type MicroMarketPosition,
  type MicroMarketPositionDisplay,
  type RoundData,
  type BattleMicroMarkets,
  type RoundMarkets,
  type MicroMarketFilters,
  type MicroMarketSortOptions
} from '@/services/microMarketService';
import { MicroMarketFactoryAbi, crownTokenAbi } from '@/constants';

/**
 * Hook to fetch all micro markets for a battle
 */
export function useBattleMicroMarkets(battleId: bigint | null) {
  const [markets, setMarkets] = useState<MicroMarketDisplay[]>([]);
  const [groupedMarkets, setGroupedMarkets] = useState<BattleMicroMarkets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    if (battleId === null) return;

    try {
      setLoading(true);
      const marketIds = await microMarketService.getBattleMicroMarkets(battleId);

      const displayPromises = marketIds.map(id => microMarketService.getMarketWithDisplay(id));
      const displayResults = await Promise.all(displayPromises);
      setMarkets(displayResults.filter((m): m is MicroMarketDisplay => m !== null));

      const grouped = await microMarketService.getBattleMarketsGrouped(battleId);
      setGroupedMarkets(grouped);

      setError(null);
    } catch (err) {
      setError('Failed to fetch micro markets');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [battleId]);

  useEffect(() => {
    fetchMarkets();
    // Refresh every 10 seconds
    const interval = setInterval(fetchMarkets, 10000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return {
    markets,
    groupedMarkets,
    loading,
    error,
    refetch: fetchMarkets
  };
}

/**
 * Hook to fetch markets grouped by round
 */
export function useRoundMarkets(battleId: bigint | null) {
  const [rounds, setRounds] = useState<RoundMarkets[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRounds = useCallback(async () => {
    if (battleId === null) return;

    try {
      setLoading(true);
      const roundData = await microMarketService.getMarketsByRound(battleId);
      setRounds(roundData);
    } catch (err) {
      console.error('Error fetching round markets:', err);
    } finally {
      setLoading(false);
    }
  }, [battleId]);

  useEffect(() => {
    fetchRounds();
    // Refresh every 10 seconds
    const interval = setInterval(fetchRounds, 10000);
    return () => clearInterval(interval);
  }, [fetchRounds]);

  const activeRound = rounds.find(r => r.isActive);
  const currentRoundNumber = activeRound?.roundNumber ?? 0;

  return {
    rounds,
    activeRound,
    currentRoundNumber,
    loading,
    refetch: fetchRounds
  };
}

/**
 * Hook to fetch a single micro market
 */
export function useMicroMarket(marketId: bigint | null) {
  const [market, setMarket] = useState<MicroMarketDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = useCallback(async () => {
    if (marketId === null) return;

    try {
      setLoading(true);
      const marketData = await microMarketService.getMarketWithDisplay(marketId);
      setMarket(marketData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch micro market');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchMarket();
    // Refresh every 5 seconds for active markets
    const interval = setInterval(fetchMarket, 5000);
    return () => clearInterval(interval);
  }, [fetchMarket]);

  return { market, loading, error, refetch: fetchMarket };
}

/**
 * Hook to get micro market prices
 */
export function useMicroMarketPrice(marketId: bigint | null) {
  const [prices, setPrices] = useState<{ yesPrice: bigint; noPrice: bigint } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(async () => {
    if (marketId === null) return;

    try {
      setLoading(true);
      const priceData = await microMarketService.getPrice(marketId);
      setPrices(priceData);
    } catch (err) {
      console.error('Error fetching micro market prices:', err);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchPrices();
    // Refresh prices every 3 seconds
    const interval = setInterval(fetchPrices, 3000);
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
 * Hook to get user's position in a micro market
 */
export function useMicroMarketPosition(marketId: bigint | null) {
  const { address } = useAccount();
  const [position, setPosition] = useState<MicroMarketPositionDisplay | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPosition = useCallback(async () => {
    if (marketId === null || !address) return;

    try {
      setLoading(true);
      const pos = await microMarketService.getPositionWithDisplay(marketId, address);
      setPosition(pos);
    } catch (err) {
      console.error('Error fetching micro market position:', err);
    } finally {
      setLoading(false);
    }
  }, [marketId, address]);

  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  const hasPosition = position && (
    position.yesTokens > BigInt(0) ||
    position.noTokens > BigInt(0)
  );

  return {
    position,
    hasPosition,
    loading,
    refetch: fetchPosition
  };
}

/**
 * Hook to get round data for a battle
 */
export function useRoundData(battleId: bigint | null, roundNumber: number) {
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoundData = useCallback(async () => {
    if (battleId === null) return;

    try {
      setLoading(true);
      const data = await microMarketService.getRoundData(battleId, roundNumber);
      setRoundData(data);
    } catch (err) {
      console.error('Error fetching round data:', err);
    } finally {
      setLoading(false);
    }
  }, [battleId, roundNumber]);

  useEffect(() => {
    fetchRoundData();
  }, [fetchRoundData]);

  return { roundData, loading, refetch: fetchRoundData };
}

/**
 * Hook to get all active micro markets
 */
export function useActiveMicroMarkets() {
  const [markets, setMarkets] = useState<MicroMarketDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const marketIds = await microMarketService.getActiveMarkets();

      const displayPromises = marketIds.map(id => microMarketService.getMarketWithDisplay(id));
      const displayResults = await Promise.all(displayPromises);
      setMarkets(displayResults.filter((m): m is MicroMarketDisplay => m !== null));
    } catch (err) {
      console.error('Error fetching active micro markets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveMarkets();
    // Refresh every 15 seconds
    const interval = setInterval(fetchActiveMarkets, 15000);
    return () => clearInterval(interval);
  }, [fetchActiveMarkets]);

  return { markets, loading, refetch: fetchActiveMarkets };
}

/**
 * Hook to filter and sort micro markets
 * Uses stable serialization to prevent infinite re-renders
 */
export function useFilteredMicroMarkets(
  filters: MicroMarketFilters,
  sort: MicroMarketSortOptions
) {
  const [markets, setMarkets] = useState<MicroMarketDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  // Serialize to create stable dependencies
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const sortKey = useMemo(() => JSON.stringify(sort), [sort]);

  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const parsedFilters = JSON.parse(filtersKey) as MicroMarketFilters;
      const parsedSort = JSON.parse(sortKey) as MicroMarketSortOptions;
      const filteredMarkets = await microMarketService.getFilteredMarkets(parsedFilters, parsedSort);
      setMarkets(filteredMarkets);
    } catch (err) {
      console.error('Error fetching filtered micro markets:', err);
    } finally {
      setLoading(false);
    }
  }, [filtersKey, sortKey]);

  useEffect(() => {
    fetchMarkets();
    // Refresh every 15 seconds
    const interval = setInterval(fetchMarkets, 15000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return { markets, loading, refetch: fetchMarkets };
}

/**
 * Hook for trading on micro markets
 */
export function useMicroMarketTrade(marketId: bigint | null) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = microMarketService.getAddresses();

  // Approve tokens for trading
  const approveTokens = useCallback(async (amount: string) => {
    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.crownToken,
      abi: crownTokenAbi,
      functionName: 'approve',
      args: [addresses.microMarketFactory, amountBigInt]
    });
  }, [writeContract, addresses]);

  // Buy YES or NO tokens
  const buy = useCallback(async (isYes: boolean, amount: string, minSharesOut: bigint = BigInt(0)) => {
    if (marketId === null) return;

    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.microMarketFactory,
      abi: MicroMarketFactoryAbi,
      functionName: 'buy',
      args: [marketId, isYes, amountBigInt, minSharesOut]
    });
  }, [marketId, writeContract, addresses]);

  // Sell YES or NO tokens
  const sell = useCallback(async (isYes: boolean, shares: string, minAmountOut: bigint = BigInt(0)) => {
    if (marketId === null) return;

    const sharesBigInt = parseEther(shares);

    writeContract({
      address: addresses.microMarketFactory,
      abi: MicroMarketFactoryAbi,
      functionName: 'sell',
      args: [marketId, isYes, sharesBigInt, minAmountOut]
    });
  }, [marketId, writeContract, addresses]);

  // Claim winnings after market resolution
  const claimWinnings = useCallback(async () => {
    if (marketId === null) return;

    writeContract({
      address: addresses.microMarketFactory,
      abi: MicroMarketFactoryAbi,
      functionName: 'claimWinnings',
      args: [marketId]
    });
  }, [marketId, writeContract, addresses]);

  return {
    approveTokens,
    buy,
    sell,
    claimWinnings,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook for token balance and allowance for micro markets
 */
export function useMicroMarketTokenBalance() {
  const { address } = useAccount();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(true);

  const fetchBalanceAndAllowance = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const [bal, allow] = await Promise.all([
        microMarketService.getBalance(address),
        microMarketService.checkAllowance(address)
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

/**
 * Combined hook for micro market with all data
 */
export function useMicroMarketFull(marketId: bigint | null) {
  const { market, loading: marketLoading, error, refetch: refetchMarket } = useMicroMarket(marketId);
  const { prices, yesProbability, noProbability, loading: pricesLoading, refetch: refetchPrices } = useMicroMarketPrice(marketId);
  const { position, hasPosition, loading: positionLoading, refetch: refetchPosition } = useMicroMarketPosition(marketId);

  const refetch = useCallback(async () => {
    await Promise.all([refetchMarket(), refetchPrices(), refetchPosition()]);
  }, [refetchMarket, refetchPrices, refetchPosition]);

  return {
    market,
    prices,
    yesProbability,
    noProbability,
    position,
    hasPosition,
    loading: marketLoading || pricesLoading || positionLoading,
    error,
    refetch
  };
}
