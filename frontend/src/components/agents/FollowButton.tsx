'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useCopyTrade } from '@/hooks/useCopyTrade';
import { useIsFollowing, useAgent } from '@/hooks/useAgents';
import { useGamificationContext } from '@/contexts/GamificationContext';

interface FollowButtonProps {
  agentId: bigint;
  onSuccess?: () => void;
}

export function FollowButton({ agentId, onSuccess }: FollowButtonProps) {
  const { address, isConnected } = useAccount();
  const { isFollowing, loading: followingLoading } = useIsFollowing(agentId);
  const { agent, loading: agentLoading } = useAgent(agentId);
  const { follow, unfollow, isPending, isConfirming, error, needsChainSwitch, switchTo0G } = useCopyTrade(agentId);
  const [showModal, setShowModal] = useState(false);
  const [maxAmount, setMaxAmount] = useState('100');
  const [localError, setLocalError] = useState<string | null>(null);

  // Gamification context - safely access (may not be available during SSR)
  let gamification: ReturnType<typeof useGamificationContext> | null = null;
  try {
    gamification = useGamificationContext();
  } catch {
    // Context not available (SSR or not wrapped in provider)
  }

  // Check if user is the operator (cannot follow own agent)
  const isOwnAgent = agent?.operator?.toLowerCase() === address?.toLowerCase();
  // Check if copy trading is enabled on the agent (default to true while loading to not block UI)
  const copyTradingEnabled = agentLoading ? true : (agent?.copyTradingEnabled ?? true);

  // Clear local error when modal closes
  useEffect(() => {
    if (!showModal) {
      setLocalError(null);
    }
  }, [showModal]);

  // Handle transaction errors
  useEffect(() => {
    if (error) {
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('CopyTradingDisabled')) {
        setLocalError('This agent does not have copy trading enabled.');
      } else if (errorMessage.includes('CannotFollowSelf')) {
        setLocalError('You cannot follow your own agent.');
      } else if (errorMessage.includes('AlreadyFollowing')) {
        setLocalError('You are already following this agent.');
      } else if (errorMessage.includes('InsufficientStake')) {
        setLocalError('Insufficient stake to perform this action.');
      } else if (errorMessage.includes('user rejected') || errorMessage.includes('User denied')) {
        setLocalError('Transaction was cancelled.');
      } else {
        setLocalError('Transaction failed. Please try again.');
      }
    }
  }, [error]);

  const handleFollow = async () => {
    setLocalError(null);

    // Only block if we're sure it's own agent (agent data is loaded)
    if (!agentLoading && isOwnAgent) {
      setLocalError('You cannot follow your own agent.');
      return;
    }

    // Only show warning if we're sure copy trading is explicitly disabled (agent data is loaded)
    if (!agentLoading && agent !== null && agent.copyTradingEnabled === false) {
      setLocalError('This agent does not have copy trading enabled.');
      return;
    }

    if (!isFollowing) {
      setShowModal(true);
    } else {
      try {
        await unfollow();
        onSuccess?.();
      } catch (err) {
        console.error('Error unfollowing agent:', err);
      }
    }
  };

  const handleConfirmFollow = async () => {
    setLocalError(null);

    const amount = parseFloat(maxAmount);
    if (isNaN(amount) || amount <= 0) {
      setLocalError('Please enter a valid amount greater than 0.');
      return;
    }

    try {
      await follow(maxAmount);
      setShowModal(false);

      // Gamification: Track follow action
      if (gamification) {
        gamification.handleFollowAgent();
      }

      onSuccess?.();
    } catch (err) {
      console.error('Error following agent:', err);
    }
  };

  if (!isConnected) {
    return (
      <button
        disabled
        className="px-4 py-2 bg-gray-700 text-gray-400 rounded-lg cursor-not-allowed"
      >
        Connect Wallet
      </button>
    );
  }

  // Show chain switch button if user needs to switch to 0G
  if (needsChainSwitch) {
    return (
      <button
        onClick={() => switchTo0G()}
        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 transition-colors"
      >
        Switch to 0G
      </button>
    );
  }

  const isLoading = isPending || isConfirming || followingLoading || agentLoading;
  // Only disable if we're explicitly sure about the conditions:
  // - If loading, don't disable (show loading state instead)
  // - If own agent (confirmed), disable
  // - If copy trading is explicitly disabled (agent loaded and copyTradingEnabled === false), disable
  // Note: We check agent?.copyTradingEnabled === false specifically, not !agent?.copyTradingEnabled
  // This allows the button to work when agent data hasn't loaded yet or failed to load
  const isCopyTradingExplicitlyDisabled = agent !== null && agent.copyTradingEnabled === false;
  const isDisabled = isLoading || (!agentLoading && isOwnAgent) || (!agentLoading && !isFollowing && isCopyTradingExplicitlyDisabled);

  const getButtonTitle = (): string => {
    if (!agentLoading && isOwnAgent) return 'You cannot follow your own agent';
    if (!agentLoading && isCopyTradingExplicitlyDisabled && !isFollowing) return 'Copy trading is not enabled for this agent';
    return '';
  };

  return (
    <div className="relative">
      <button
        onClick={handleFollow}
        disabled={isDisabled}
        title={getButtonTitle()}
        className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
          isFollowing
            ? 'bg-gray-700 text-white hover:bg-red-500/20 hover:text-red-400 hover:border-red-500 border border-gray-600'
            : isDisabled
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-purple-600 text-white hover:bg-purple-500'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing...
          </span>
        ) : isFollowing ? (
          'Following'
        ) : (
          'Follow'
        )}
      </button>

      {localError && !showModal && (
        <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-xs text-center whitespace-nowrap">
          {localError}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">
              Enable Copy Trading
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Set your maximum trade amount per copy. When this agent trades, your wallet
              will automatically mirror their positions up to this amount.
            </p>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                Max Amount Per Trade (CRwN)
              </label>
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => {
                  setMaxAmount(e.target.value);
                  setLocalError(null);
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                placeholder="100"
                min="1"
              />
            </div>

            {localError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                {localError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFollow}
                disabled={isPending || isConfirming}
                className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50"
              >
                {isPending || isConfirming ? 'Confirming...' : 'Enable Copy Trading'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FollowButton;
