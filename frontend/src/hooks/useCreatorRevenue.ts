/**
 * Custom hooks for Creator Revenue functionality
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { formatTokenAmount } from '@/utils/format';
import creatorService, {
  type Creator,
  type CreatorDisplay,
  type RevenueEntry,
  type RevenueEntryDisplay,
  type MarketFees,
  type MarketFeesDisplay,
  type RevenueBreakdown,
  type CreatorStats,
  type CreatorTier,
  type CreatorType
} from '@/services/creatorService';
import { CreatorRevenueShareAbi, crownTokenAbi } from '@/constants';

/**
 * Hook to get creator profile for current user
 */
export function useCreator() {
  const { address } = useAccount();
  const [creator, setCreator] = useState<CreatorDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCreator = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const creatorData = await creatorService.getCreatorWithDisplay(address);
      setCreator(creatorData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch creator profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchCreator();
    // Refresh every 30 seconds
    const interval = setInterval(fetchCreator, 30000);
    return () => clearInterval(interval);
  }, [fetchCreator]);

  const isRegistered = creator !== null && creator.isActive;

  return {
    creator,
    isRegistered,
    loading,
    error,
    refetch: fetchCreator
  };
}

/**
 * Hook to get creator profile by wallet address
 */
export function useCreatorByAddress(walletAddress: Address | null) {
  const [creator, setCreator] = useState<CreatorDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCreator = useCallback(async () => {
    if (!walletAddress) return;

    try {
      setLoading(true);
      const creatorData = await creatorService.getCreatorWithDisplay(walletAddress);
      setCreator(creatorData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch creator profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchCreator();
  }, [fetchCreator]);

  return { creator, loading, error, refetch: fetchCreator };
}

/**
 * Hook to get creator tier
 */
export function useCreatorTier() {
  const { address } = useAccount();
  const [tier, setTier] = useState<CreatorTier>(0);
  const [loading, setLoading] = useState(true);

  const fetchTier = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const tierData = await creatorService.getCreatorTier(address);
      setTier(tierData);
    } catch (err) {
      console.error('Error fetching creator tier:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchTier();
  }, [fetchTier]);

  const tierInfo = creatorService.getTierInfo(tier);

  return {
    tier,
    tierInfo,
    loading,
    refetch: fetchTier
  };
}

/**
 * Hook to get pending rewards
 */
export function usePendingRewards() {
  const { address } = useAccount();
  const [pendingRewards, setPendingRewards] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(true);

  const fetchRewards = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const rewards = await creatorService.getPendingRewards(address);
      setPendingRewards(rewards);
    } catch (err) {
      console.error('Error fetching pending rewards:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchRewards();
    // Refresh every 15 seconds
    const interval = setInterval(fetchRewards, 15000);
    return () => clearInterval(interval);
  }, [fetchRewards]);

  const hasRewards = pendingRewards > BigInt(0);

  return {
    pendingRewards,
    pendingRewardsFormatted: formatEther(pendingRewards),
    hasRewards,
    loading,
    refetch: fetchRewards
  };
}

/**
 * Hook to get revenue history
 */
export function useRevenueHistory() {
  const { address } = useAccount();
  const [history, setHistory] = useState<RevenueEntryDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const historyData = await creatorService.getRevenueHistoryWithDisplay(address);
      setHistory(historyData);
    } catch (err) {
      console.error('Error fetching revenue history:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const totalRevenue = useMemo(() => {
    return history.reduce((acc, entry) => acc + entry.amount, BigInt(0));
  }, [history]);

  return {
    history,
    totalRevenue,
    totalRevenueFormatted: formatEther(totalRevenue),
    loading,
    refetch: fetchHistory
  };
}

/**
 * Hook to get revenue breakdown by source
 */
export function useRevenueBreakdown() {
  const { address } = useAccount();
  const [breakdown, setBreakdown] = useState<RevenueBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBreakdown = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const breakdownData = await creatorService.getRevenueBreakdown(address);
      setBreakdown(breakdownData);
    } catch (err) {
      console.error('Error fetching revenue breakdown:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  return { breakdown, loading, refetch: fetchBreakdown };
}

/**
 * Hook to get creator statistics
 */
export function useCreatorStats() {
  const { address } = useAccount();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const statsData = await creatorService.getCreatorStats(address);
      setStats(statsData);
    } catch (err) {
      console.error('Error fetching creator stats:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

/**
 * Hook to get market fees for a specific market
 */
export function useMarketFees(marketId: bigint | null) {
  const [fees, setFees] = useState<MarketFeesDisplay | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFees = useCallback(async () => {
    if (marketId === null) return;

    try {
      setLoading(true);
      const feesData = await creatorService.getMarketFeesWithDisplay(marketId);
      setFees(feesData);
    } catch (err) {
      console.error('Error fetching market fees:', err);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchFees();
  }, [fetchFees]);

  return { fees, loading, refetch: fetchFees };
}

/**
 * Hook to get global creator stats
 */
export function useGlobalCreatorStats() {
  const [stats, setStats] = useState({
    totalCreators: BigInt(0),
    totalFeesDistributed: BigInt(0)
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const [totalCreators, totalFeesDistributed] = await Promise.all([
        creatorService.getTotalCreators(),
        creatorService.getTotalFeesDistributed()
      ]);
      setStats({ totalCreators, totalFeesDistributed });
    } catch (err) {
      console.error('Error fetching global creator stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Refresh every minute
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    totalCreators: Number(stats.totalCreators),
    totalFeesDistributed: stats.totalFeesDistributed,
    totalFeesDistributedFormatted: formatEther(stats.totalFeesDistributed),
    loading,
    refetch: fetchStats
  };
}

/**
 * Hook to get effective fee rate for a creator type
 */
export function useEffectiveFeeRate(creatorType: CreatorType) {
  const { address } = useAccount();
  const [feeRate, setFeeRate] = useState<bigint>(BigInt(200)); // Default 2%
  const [loading, setLoading] = useState(true);

  const fetchFeeRate = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const rate = await creatorService.getEffectiveFeeRate(address, creatorType);
      setFeeRate(rate);
    } catch (err) {
      console.error('Error fetching effective fee rate:', err);
    } finally {
      setLoading(false);
    }
  }, [address, creatorType]);

  useEffect(() => {
    fetchFeeRate();
  }, [fetchFeeRate]);

  const feeRatePercent = Number(feeRate) / 100;

  return {
    feeRate,
    feeRatePercent,
    feeRateFormatted: `${feeRatePercent}%`,
    loading
  };
}

/**
 * Hook to claim creator rewards
 */
export function useClaimCreatorRewards() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = creatorService.getAddresses();

  // Claim pending rewards
  const claimRewards = useCallback(async () => {
    writeContract({
      address: addresses.creatorRevenue,
      abi: CreatorRevenueShareAbi,
      functionName: 'claimRewards'
    });
  }, [writeContract, addresses]);

  return {
    claimRewards,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook to register as a creator
 */
export function useRegisterCreator() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = creatorService.getAddresses();

  // Register as creator with a type
  const register = useCallback(async (creatorType: CreatorType) => {
    writeContract({
      address: addresses.creatorRevenue,
      abi: CreatorRevenueShareAbi,
      functionName: 'registerCreator',
      args: [creatorType]
    });
  }, [writeContract, addresses]);

  return {
    register,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook for token balance and allowance for creator revenue
 */
export function useCreatorTokenBalance() {
  const { address } = useAccount();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(true);

  const fetchBalanceAndAllowance = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const [bal, allow] = await Promise.all([
        creatorService.getBalance(address),
        creatorService.checkAllowance(address)
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
 * Hook to get all tier information
 */
export function useAllTierInfo() {
  const tiers = useMemo(() => {
    return [0, 1, 2, 3, 4].map(tier => creatorService.getTierInfo(tier as CreatorTier));
  }, []);

  return { tiers };
}

/**
 * Combined hook for creator dashboard
 */
export function useCreatorDashboard() {
  const { creator, isRegistered, loading: creatorLoading, error, refetch: refetchCreator } = useCreator();
  const { pendingRewards, pendingRewardsFormatted, hasRewards } = usePendingRewards();
  const { stats, loading: statsLoading } = useCreatorStats();
  const { breakdown, loading: breakdownLoading } = useRevenueBreakdown();
  const { claimRewards, isPending, isConfirming, isSuccess } = useClaimCreatorRewards();

  const refetch = useCallback(async () => {
    await refetchCreator();
  }, [refetchCreator]);

  return {
    // Creator data
    creator,
    isRegistered,

    // Rewards
    pendingRewards,
    pendingRewardsFormatted,
    hasRewards,

    // Statistics
    stats,
    breakdown,

    // Claim action
    claimRewards,
    isClaiming: isPending || isConfirming,
    claimSuccess: isSuccess,

    // Loading state
    loading: creatorLoading || statsLoading || breakdownLoading,
    error,
    refetch
  };
}

/**
 * Hook to check if current user is a registered creator
 */
export function useIsCreator() {
  const { address } = useAccount();
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkCreator = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const registered = await creatorService.isRegisteredCreator(address);
      setIsCreator(registered);
    } catch (err) {
      console.error('Error checking creator status:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    checkCreator();
  }, [checkCreator]);

  return { isCreator, loading, refetch: checkCreator };
}
