/**
 * Custom hooks for Copy Trading functionality
 * Uses AIAgentINFT contract on 0G Galileo Testnet (Chain ID: 16602)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi';
import { parseEther, formatEther, type Address, createPublicClient, http } from 'viem';
import { chainsToContracts, getZeroGChainId } from '@/constants';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';

// 0G Galileo Testnet chain ID
const ZEROG_CHAIN_ID = 16602;

// 0G Galileo chain config for viem
const zeroGGalileo = {
  id: ZEROG_CHAIN_ID,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://chainscan-galileo.0g.ai' },
  },
} as const;

// Create 0G public client for read operations
const zeroGClient = createPublicClient({
  chain: zeroGGalileo,
  transport: http('https://evmrpc-testnet.0g.ai'),
});

// Get contract addresses for 0G chain
function get0GContracts() {
  const contracts = chainsToContracts[ZEROG_CHAIN_ID];
  return {
    aiAgentINFT: contracts.aiAgentINFT as Address,
    crownToken: contracts.crownToken as Address,
  };
}

/**
 * Copy trade config type matching the contract struct
 */
interface CopyTradeConfig {
  tokenId: bigint;
  maxAmountPerTrade: bigint;
  totalCopied: bigint;
  startedAt: bigint;
  isActive: boolean;
}

/**
 * Hook to get copy trade configuration for a user and agent (iNFT)
 */
export function useCopyTradeConfig(tokenId: bigint | null) {
  const { address } = useAccount();
  const [config, setConfig] = useState<CopyTradeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const addresses = get0GContracts();

  const fetchConfig = useCallback(async () => {
    if (!address || tokenId === null) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const configData = await zeroGClient.readContract({
        address: addresses.aiAgentINFT,
        abi: AIAgentINFTAbi,
        functionName: 'getCopyTradeConfig',
        args: [address, tokenId],
      }) as [bigint, bigint, bigint, bigint, boolean];

      setConfig({
        tokenId: configData[0],
        maxAmountPerTrade: configData[1],
        totalCopied: configData[2],
        startedAt: configData[3],
        isActive: configData[4],
      });
    } catch (err) {
      console.error('Error fetching copy trade config:', err);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [address, tokenId, addresses.aiAgentINFT]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const isActive = config?.isActive ?? false;
  const maxAmount = config?.maxAmountPerTrade ?? BigInt(0);

  return {
    config,
    isActive,
    maxAmount,
    maxAmountFormatted: formatEther(maxAmount),
    loading,
    refetch: fetchConfig
  };
}

/**
 * Hook to follow/unfollow an AI agent iNFT for copy trading
 * Operates on 0G Galileo Testnet
 */
export function useFollowAgent(tokenId: bigint | null) {
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = get0GContracts();
  const needsChainSwitch = currentChainId !== ZEROG_CHAIN_ID;

  // Switch to 0G chain if needed
  const ensureCorrectChain = useCallback(async () => {
    if (needsChainSwitch) {
      try {
        await switchChain({ chainId: ZEROG_CHAIN_ID });
        // Wait a bit for the switch to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error('Failed to switch chain:', err);
        throw new Error('Please switch to 0G Galileo Testnet to follow agents');
      }
    }
  }, [needsChainSwitch, switchChain]);

  // Follow an agent (enable copy trading)
  const follow = useCallback(async (maxAmountPerTrade: string) => {
    if (tokenId === null) return;

    await ensureCorrectChain();

    const maxAmount = parseEther(maxAmountPerTrade);

    writeContract({
      address: addresses.aiAgentINFT,
      abi: AIAgentINFTAbi,
      functionName: 'followAgent',
      args: [tokenId, maxAmount],
      chainId: ZEROG_CHAIN_ID,
    });
  }, [tokenId, writeContract, addresses, ensureCorrectChain]);

  // Unfollow an agent
  const unfollow = useCallback(async () => {
    if (tokenId === null) return;

    await ensureCorrectChain();

    writeContract({
      address: addresses.aiAgentINFT,
      abi: AIAgentINFTAbi,
      functionName: 'unfollowAgent',
      args: [tokenId],
      chainId: ZEROG_CHAIN_ID,
    });
  }, [tokenId, writeContract, addresses, ensureCorrectChain]);

  // Update copy trade settings
  const updateSettings = useCallback(async (maxAmountPerTrade: string) => {
    if (tokenId === null) return;

    await ensureCorrectChain();

    const maxAmount = parseEther(maxAmountPerTrade);

    writeContract({
      address: addresses.aiAgentINFT,
      abi: AIAgentINFTAbi,
      functionName: 'updateCopyTradeConfig',
      args: [tokenId, maxAmount],
      chainId: ZEROG_CHAIN_ID,
    });
  }, [tokenId, writeContract, addresses, ensureCorrectChain]);

  return {
    follow,
    unfollow,
    updateSettings,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash,
    needsChainSwitch,
    switchTo0G: () => switchChain({ chainId: ZEROG_CHAIN_ID }),
  };
}

/**
 * Hook to get agents a user is following
 */
export function useUserFollowing() {
  const { address } = useAccount();
  const [following, setFollowing] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);

  const addresses = get0GContracts();

  const fetchFollowing = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const followingIds = await zeroGClient.readContract({
        address: addresses.aiAgentINFT,
        abi: AIAgentINFTAbi,
        functionName: 'getUserFollowing',
        args: [address],
      }) as bigint[];

      setFollowing(followingIds);
    } catch (err) {
      console.error('Error fetching user following:', err);
      setFollowing([]);
    } finally {
      setLoading(false);
    }
  }, [address, addresses.aiAgentINFT]);

  useEffect(() => {
    fetchFollowing();
  }, [fetchFollowing]);

  return {
    following,
    loading,
    refetch: fetchFollowing,
  };
}

/**
 * Hook to get followers of an agent
 */
export function useAgentFollowers(tokenId: bigint | null) {
  const [followers, setFollowers] = useState<Address[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const addresses = get0GContracts();

  const fetchFollowers = useCallback(async () => {
    if (tokenId === null) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [followerList, count] = await Promise.all([
        zeroGClient.readContract({
          address: addresses.aiAgentINFT,
          abi: AIAgentINFTAbi,
          functionName: 'getAgentFollowers',
          args: [tokenId],
        }) as Promise<Address[]>,
        zeroGClient.readContract({
          address: addresses.aiAgentINFT,
          abi: AIAgentINFTAbi,
          functionName: 'getFollowerCount',
          args: [tokenId],
        }) as Promise<bigint>,
      ]);

      setFollowers(followerList);
      setFollowerCount(Number(count));
    } catch (err) {
      console.error('Error fetching agent followers:', err);
      setFollowers([]);
      setFollowerCount(0);
    } finally {
      setLoading(false);
    }
  }, [tokenId, addresses.aiAgentINFT]);

  useEffect(() => {
    fetchFollowers();
  }, [fetchFollowers]);

  return {
    followers,
    followerCount,
    loading,
    refetch: fetchFollowers,
  };
}

/**
 * Hook to check if user is following a specific agent
 */
export function useIsFollowingAgent(tokenId: bigint | null) {
  const { following, loading } = useUserFollowing();

  const isFollowing = tokenId !== null && following.some(id => id === tokenId);

  return {
    isFollowing,
    loading,
  };
}

/**
 * Combined hook for common copy trading operations
 */
export function useCopyTrade(tokenId: bigint | null) {
  const { config, isActive, maxAmount, loading: configLoading, refetch: refetchConfig } = useCopyTradeConfig(tokenId);
  const { follow, unfollow, updateSettings, isPending, isConfirming, isSuccess, error, txHash, needsChainSwitch, switchTo0G } = useFollowAgent(tokenId);
  const { followerCount, refetch: refetchFollowers } = useAgentFollowers(tokenId);

  // Refetch both config and followers on success
  useEffect(() => {
    if (isSuccess) {
      refetchConfig();
      refetchFollowers();
    }
  }, [isSuccess, refetchConfig, refetchFollowers]);

  return {
    // Config state
    config,
    isFollowing: isActive,
    maxAmount,
    maxAmountFormatted: formatEther(maxAmount),
    followerCount,

    // Actions
    follow,
    unfollow,
    updateSettings,

    // Chain switching
    needsChainSwitch,
    switchTo0G,

    // Transaction state
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash,

    // Loading state
    loading: configLoading,
    refetch: () => {
      refetchConfig();
      refetchFollowers();
    },
  };
}
