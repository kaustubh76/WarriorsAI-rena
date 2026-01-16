'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useCopyTrade, useCopyTradeConfig } from '@/hooks/useCopyTrade';
import { formatEther } from 'viem';

interface CopyTradeSettingsProps {
  agentId: bigint;
  agentName: string;
  onUpdate?: () => void;
}

export function CopyTradeSettings({ agentId, agentName, onUpdate }: CopyTradeSettingsProps) {
  const { isConnected } = useAccount();
  const { config, isActive, maxAmountFormatted, loading: configLoading, refetch: refetchConfig } = useCopyTradeConfig(agentId);
  const {
    unfollow,
    updateSettings,
    isPending,
    isConfirming,
    isSuccess,
    error,
    needsChainSwitch,
    switchTo0G
  } = useCopyTrade(agentId);

  const [newMaxAmount, setNewMaxAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showConfirmUnfollow, setShowConfirmUnfollow] = useState(false);

  // Initialize edit value when config loads
  useEffect(() => {
    if (config && config.maxAmountPerTrade) {
      setNewMaxAmount(formatEther(config.maxAmountPerTrade));
    }
  }, [config]);

  // Handle success
  useEffect(() => {
    if (isSuccess) {
      setIsEditing(false);
      setShowConfirmUnfollow(false);
      setLocalError(null);
      // Refetch after a short delay
      setTimeout(() => {
        refetchConfig();
        onUpdate?.();
      }, 2000);
    }
  }, [isSuccess, refetchConfig, onUpdate]);

  // Handle errors
  useEffect(() => {
    if (error) {
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('user rejected') || errorMessage.includes('User denied')) {
        setLocalError('Transaction was cancelled.');
      } else {
        setLocalError('Transaction failed. Please try again.');
      }
    }
  }, [error]);

  const handleUpdateMaxAmount = async () => {
    setLocalError(null);
    const amount = parseFloat(newMaxAmount);
    if (isNaN(amount) || amount <= 0) {
      setLocalError('Please enter a valid amount greater than 0.');
      return;
    }

    try {
      await updateSettings(newMaxAmount);
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  const handleUnfollow = async () => {
    setLocalError(null);
    try {
      await unfollow();
    } catch (err) {
      console.error('Error unfollowing:', err);
    }
  };

  // Don't show if not connected or not following
  if (!isConnected || configLoading) {
    return null;
  }

  if (!isActive) {
    return null;
  }

  const isLoading = isPending || isConfirming;

  return (
    <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-xl p-6 border border-green-500/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <h3 className="text-lg font-semibold text-white">Copy Trading Active</h3>
        </div>
        {needsChainSwitch && (
          <button
            onClick={() => switchTo0G()}
            className="px-3 py-1 text-xs bg-yellow-600 text-white rounded-lg hover:bg-yellow-500"
          >
            Switch to 0G
          </button>
        )}
      </div>

      <p className="text-gray-400 text-sm mb-4">
        You are copying trades from <span className="text-white font-medium">{agentName}</span>.
        When this agent trades, your wallet will automatically mirror their positions.
      </p>

      {/* Current Settings */}
      <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Max Amount Per Trade</p>
            {isEditing ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={newMaxAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setNewMaxAmount(e.target.value);
                    setLocalError(null);
                  }}
                  className="w-32 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="100"
                  min="1"
                  disabled={isLoading}
                />
                <span className="text-gray-400 text-sm">CRwN</span>
              </div>
            ) : (
              <p className="text-white font-medium">{maxAmountFormatted} CRwN</p>
            )}
          </div>

          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              disabled={isLoading || needsChainSwitch}
              className="px-3 py-1 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setLocalError(null);
                  if (config) {
                    setNewMaxAmount(formatEther(config.maxAmountPerTrade));
                  }
                }}
                disabled={isLoading}
                className="px-3 py-1 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateMaxAmount}
                disabled={isLoading || needsChainSwitch}
                className="px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        {config && (
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-700">
            <div>
              <p className="text-xs text-gray-400">Total Copied</p>
              <p className="text-white font-medium">{formatEther(config.totalCopied)} CRwN</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Following Since</p>
              <p className="text-white font-medium">
                {config.startedAt > 0n
                  ? new Date(Number(config.startedAt) * 1000).toLocaleDateString()
                  : 'N/A'
                }
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {localError && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          {localError}
        </div>
      )}

      {/* Unfollow Section */}
      {!showConfirmUnfollow ? (
        <button
          onClick={() => setShowConfirmUnfollow(true)}
          disabled={isLoading || needsChainSwitch}
          className="w-full px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          Stop Copy Trading
        </button>
      ) : (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-300 mb-3">
            Are you sure you want to stop copy trading? You will no longer automatically mirror this agent&apos;s trades.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirmUnfollow(false)}
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUnfollow}
              disabled={isLoading || needsChainSwitch}
              className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : 'Yes, Stop Copy Trading'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CopyTradeSettings;
