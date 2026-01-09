'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useCopyTrade, useCopyTradeConfig } from '@/hooks/useCopyTrade';
import { useIsFollowing } from '@/hooks/useAgents';

interface FollowButtonProps {
  agentId: bigint;
  onSuccess?: () => void;
}

export function FollowButton({ agentId, onSuccess }: FollowButtonProps) {
  const { isConnected } = useAccount();
  const { isFollowing, loading: followingLoading } = useIsFollowing(agentId);
  const { follow, unfollow, isPending, isConfirming, isSuccess } = useCopyTrade(agentId);
  const [showModal, setShowModal] = useState(false);
  const [maxAmount, setMaxAmount] = useState('100');

  const handleFollow = async () => {
    if (!isFollowing) {
      setShowModal(true);
    } else {
      await unfollow();
      onSuccess?.();
    }
  };

  const handleConfirmFollow = async () => {
    await follow(maxAmount);
    setShowModal(false);
    onSuccess?.();
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

  const isLoading = isPending || isConfirming || followingLoading;

  return (
    <>
      <button
        onClick={handleFollow}
        disabled={isLoading}
        className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
          isFollowing
            ? 'bg-gray-700 text-white hover:bg-red-500/20 hover:text-red-400 hover:border-red-500 border border-gray-600'
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

      {/* Follow Modal */}
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
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                placeholder="100"
                min="1"
              />
            </div>

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
    </>
  );
}

export default FollowButton;
