/**
 * Custom hooks for Copy Trading functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import aiAgentService, {
  type CopyTradeConfig,
  type AgentStrategy,
  type RiskProfile,
  type Specialization,
  type PersonaTraits
} from '@/services/aiAgentService';
import { AIAgentRegistryAbi, crownTokenAbi } from '@/constants';

/**
 * Hook to get copy trade configuration for a user and agent
 */
export function useCopyTradeConfig(agentId: bigint | null) {
  const { address } = useAccount();
  const [config, setConfig] = useState<CopyTradeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!address || agentId === null) return;

    try {
      setLoading(true);
      const configData = await aiAgentService.getCopyTradeConfig(address, agentId);
      setConfig(configData);
    } catch (err) {
      console.error('Error fetching copy trade config:', err);
    } finally {
      setLoading(false);
    }
  }, [address, agentId]);

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
 * Hook to follow/unfollow an AI agent for copy trading
 */
export function useFollowAgent(agentId: bigint | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = aiAgentService.getAddresses();

  // Follow an agent (enable copy trading)
  const follow = useCallback(async (maxAmountPerTrade: string) => {
    if (agentId === null) return;

    const maxAmount = parseEther(maxAmountPerTrade);

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'followAgent',
      args: [agentId, maxAmount]
    });
  }, [agentId, writeContract, addresses]);

  // Unfollow an agent
  const unfollow = useCallback(async () => {
    if (agentId === null) return;

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'unfollowAgent',
      args: [agentId]
    });
  }, [agentId, writeContract, addresses]);

  // Update copy trade settings
  const updateSettings = useCallback(async (maxAmountPerTrade: string) => {
    if (agentId === null) return;

    const maxAmount = parseEther(maxAmountPerTrade);

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'updateCopyTradeConfig',
      args: [agentId, maxAmount]
    });
  }, [agentId, writeContract, addresses]);

  return {
    follow,
    unfollow,
    updateSettings,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook to register a new AI agent
 */
export function useRegisterAgent() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = aiAgentService.getAddresses();

  // Approve tokens for staking
  const approveStake = useCallback(async (amount: string) => {
    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.crownToken,
      abi: crownTokenAbi,
      functionName: 'approve',
      args: [addresses.aiAgentRegistry, amountBigInt]
    });
  }, [writeContract, addresses]);

  // Register new agent
  // Note: Contract registerAgent takes 7 params: name, description, strategy, riskProfile, specialization, traits (struct), stakeAmount
  // enableCopyTrading and copyTradeFee are set via separate updateAgent call after registration
  const registerAgent = useCallback(async (params: {
    name: string;
    description: string;
    strategy: AgentStrategy;
    riskProfile: RiskProfile;
    specialization: Specialization;
    personaTraits: PersonaTraits;
    stakeAmount: string;
    enableCopyTrading?: boolean;
    copyTradeFee?: number; // Not used in registerAgent, kept for backwards compatibility
  }) => {
    const stakeAmountBigInt = parseEther(params.stakeAmount);

    // PersonaTraits must be passed as a struct object, not array
    // Ensure values are within uint8 range (0-255)
    const traits = {
      patience: Math.min(255, Math.max(0, params.personaTraits.patience)),
      conviction: Math.min(255, Math.max(0, params.personaTraits.conviction)),
      contrarian: Math.min(255, Math.max(0, params.personaTraits.contrarian)),
      momentum: Math.min(255, Math.max(0, params.personaTraits.momentum))
    };

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'registerAgent',
      args: [
        params.name,
        params.description,
        params.strategy,
        params.riskProfile,
        params.specialization,
        traits,
        stakeAmountBigInt
      ]
    });
  }, [writeContract, addresses]);

  return {
    approveStake,
    registerAgent,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook to update agent profile
 * Contract function: updateAgent(agentId, description, copyTradingEnabled, traits)
 */
export function useUpdateAgent(agentId: bigint | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = aiAgentService.getAddresses();

  // Update agent - full update function
  // Contract signature: updateAgent(uint256 agentId, string description, bool copyTradingEnabled, PersonaTraits traits)
  const updateAgent = useCallback(async (params: {
    description: string;
    copyTradingEnabled: boolean;
    traits: PersonaTraits;
  }) => {
    if (agentId === null) return;

    // PersonaTraits must be passed as a struct object
    const traits = {
      patience: Math.min(255, Math.max(0, params.traits.patience)),
      conviction: Math.min(255, Math.max(0, params.traits.conviction)),
      contrarian: Math.min(255, Math.max(0, params.traits.contrarian)),
      momentum: Math.min(255, Math.max(0, params.traits.momentum))
    };

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'updateAgent',
      args: [agentId, params.description, params.copyTradingEnabled, traits]
    });
  }, [agentId, writeContract, addresses]);

  // Convenience wrapper for updating just description (calls updateAgent with current values)
  const updateDescription = useCallback(async (description: string, currentTraits: PersonaTraits, currentCopyTrading: boolean) => {
    await updateAgent({ description, copyTradingEnabled: currentCopyTrading, traits: currentTraits });
  }, [updateAgent]);

  // Convenience wrapper for updating just persona traits
  const updatePersona = useCallback(async (traits: PersonaTraits, currentDescription: string, currentCopyTrading: boolean) => {
    await updateAgent({ description: currentDescription, copyTradingEnabled: currentCopyTrading, traits });
  }, [updateAgent]);

  // Convenience wrapper for toggling copy trading
  const toggleCopyTrading = useCallback(async (enabled: boolean, currentDescription: string, currentTraits: PersonaTraits) => {
    await updateAgent({ description: currentDescription, copyTradingEnabled: enabled, traits: currentTraits });
  }, [updateAgent]);

  return {
    updateAgent,
    updateDescription,
    updatePersona,
    toggleCopyTrading,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook to manage agent staking
 */
export function useAgentStaking(agentId: bigint | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = aiAgentService.getAddresses();

  // Add stake to agent
  const addStake = useCallback(async (amount: string) => {
    if (agentId === null) return;

    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'addStake',
      args: [agentId, amountBigInt]
    });
  }, [agentId, writeContract, addresses]);

  // Remove stake from agent (requires minimum stake maintained)
  const removeStake = useCallback(async (amount: string) => {
    if (agentId === null) return;

    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'removeStake',
      args: [agentId, amountBigInt]
    });
  }, [agentId, writeContract, addresses]);

  // Deactivate agent (withdraws all stake)
  const deactivateAgent = useCallback(async () => {
    if (agentId === null) return;

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'deactivateAgent',
      args: [agentId]
    });
  }, [agentId, writeContract, addresses]);

  return {
    addStake,
    removeStake,
    deactivateAgent,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook to execute a copy trade (for automated systems)
 */
export function useExecuteCopyTrade() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = aiAgentService.getAddresses();

  // Execute copy trade on prediction market
  const executeCopyTrade = useCallback(async (params: {
    agentId: bigint;
    marketId: bigint;
    isYes: boolean;
    amount: string;
  }) => {
    const amountBigInt = parseEther(params.amount);

    writeContract({
      address: addresses.aiAgentRegistry,
      abi: AIAgentRegistryAbi,
      functionName: 'executeCopyTrade',
      args: [
        params.agentId,
        params.marketId,
        params.isYes,
        amountBigInt
      ]
    });
  }, [writeContract, addresses]);

  return {
    executeCopyTrade,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Combined hook for common copy trading operations
 */
export function useCopyTrade(agentId: bigint | null) {
  const { config, isActive, maxAmount, loading: configLoading, refetch: refetchConfig } = useCopyTradeConfig(agentId);
  const { follow, unfollow, updateSettings, isPending, isConfirming, isSuccess, error, txHash } = useFollowAgent(agentId);

  return {
    // Config state
    config,
    isFollowing: isActive,
    maxAmount,
    maxAmountFormatted: formatEther(maxAmount),

    // Actions
    follow,
    unfollow,
    updateSettings,

    // Transaction state
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash,

    // Loading state
    loading: configLoading,
    refetch: refetchConfig
  };
}
