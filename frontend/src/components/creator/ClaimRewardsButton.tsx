'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import { useClaimCreatorRewards, usePendingRewards } from '@/hooks/useCreatorRevenue';

interface ClaimRewardsButtonProps {
  onSuccess?: () => void;
}

export function ClaimRewardsButton({ onSuccess }: ClaimRewardsButtonProps) {
  const { isConnected } = useAccount();
  const { pendingRewards, pendingRewardsFormatted, hasRewards, loading: rewardsLoading } = usePendingRewards();
  const { claimRewards, isPending, isConfirming, isSuccess, error, txHash } = useClaimCreatorRewards();

  const handleClaim = async () => {
    await claimRewards();
    onSuccess?.();
  };

  const isLoading = isPending || isConfirming || rewardsLoading;

  if (!isConnected) {
    return (
      <button
        disabled
        className="w-full py-4 bg-slate-700 text-slate-400 rounded-xl cursor-not-allowed"
      >
        Connect Wallet to Claim
      </button>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700">
      {/* Pending Rewards Display */}
      <div className="text-center mb-6">
        <p className="text-slate-400 text-sm mb-2">Available to Claim</p>
        {rewardsLoading ? (
          <div className="flex justify-center">
            <div className="skeleton h-10 w-32 rounded animate-pulse" />
          </div>
        ) : (
          <p className="text-4xl font-bold text-white">{pendingRewardsFormatted}</p>
        )}
        <p className="text-slate-400 text-sm mt-1">CRwN</p>
      </div>

      {/* Claim Button */}
      <button
        onClick={handleClaim}
        disabled={isLoading || !hasRewards}
        className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 ${
          hasRewards
            ? 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white'
            : 'bg-slate-700 text-slate-400 cursor-not-allowed'
        } disabled:opacity-50`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
            {isPending ? 'Confirm in Wallet...' : 'Processing...'}
          </span>
        ) : hasRewards ? (
          'Claim Rewards'
        ) : (
          'No Rewards to Claim'
        )}
      </button>

      {/* Success Message */}
      {isSuccess && txHash && (
        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-green-400">
            <span>*</span>
            <span className="font-medium">Rewards claimed successfully!</span>
          </div>
          <a
            href={`https://testnet.flowscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-green-400/70 hover:text-green-400 mt-2 block"
          >
            View transaction
          </a>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400">
            <span>!</span>
            <span className="font-medium">Transaction failed</span>
          </div>
          <p className="text-sm text-red-400/70 mt-1">
            {(error as Error).message || 'Unknown error occurred'}
          </p>
        </div>
      )}

      {/* Info Note */}
      {hasRewards && (
        <p className="text-xs text-slate-500 text-center mt-4">
          Claiming rewards will transfer all pending CRwN tokens to your wallet
        </p>
      )}
    </div>
  );
}

export default ClaimRewardsButton;
