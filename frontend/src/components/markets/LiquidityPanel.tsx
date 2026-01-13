'use client';

import React, { useState, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';
import { useLiquidity, usePosition, useTokenBalance, clearMarketCache } from '@/hooks/useMarkets';
import { type Market, MarketStatus } from '@/services/predictionMarketService';
import { formatTokenAmount } from '@/utils/format';
import { useGamificationContext } from '@/contexts/GamificationContext';

interface LiquidityPanelProps {
  market: Market;
  onComplete?: () => void;
}

type LiquidityMode = 'add' | 'remove';

export function LiquidityPanel({ market, onComplete }: LiquidityPanelProps) {
  const { address, isConnected } = useAccount();
  const { position, refetch: refetchPosition } = usePosition(market.id);
  const { balance, balanceFormatted, refetch: refetchBalance } = useTokenBalance();

  const [mode, setMode] = useState<LiquidityMode>('add');
  const [amount, setAmount] = useState('');

  // Gamification context - safely access
  let gamification: ReturnType<typeof useGamificationContext> | null = null;
  try {
    gamification = useGamificationContext();
  } catch {
    // Context not available
  }

  const {
    addLiquidity,
    removeLiquidity,
    isPending,
    isConfirming,
    isSuccess,
    error
  } = useLiquidity(market.id);

  const isActive = market.status === MarketStatus.Active;
  const isEnded = Number(market.endTime) * 1000 < Date.now();
  const canOperateMarket = isActive && !isEnded; // Market must be active AND not expired
  const isProcessing = isPending || isConfirming;
  const hasLiquidity = position && position.lpShares > BigInt(0);

  // Refetch ALL data after successful transaction - clear cache first
  useEffect(() => {
    if (isSuccess) {
      // Clear RPC cache to ensure fresh blockchain data
      clearMarketCache();
      // Refetch local data
      refetchBalance();
      refetchPosition();

      // Gamification: Track liquidity added
      if (gamification && mode === 'add') {
        gamification.handleAddLiquidity();
      }

      setAmount('');
      // Trigger parent refresh for all market data
      onComplete?.();
    }
  }, [isSuccess, refetchBalance, refetchPosition, onComplete, gamification, mode]);

  const handleAmountChange = (value: string) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const setMaxAmount = () => {
    if (mode === 'add') {
      setAmount(balanceFormatted);
    } else if (position) {
      setAmount(formatTokenAmount(position.lpShares));
    }
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    if (mode === 'add') {
      await addLiquidity(amount);
    } else {
      await removeLiquidity(amount);
    }
  };

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet';
    if (isPending) return 'Confirm in Wallet...';
    if (isConfirming) return 'Processing...';
    if (mode === 'add') return 'Add Liquidity';
    return 'Remove Liquidity';
  };

  const canSubmit = isConnected && canOperateMarket && amount && parseFloat(amount) > 0 && !isProcessing;

  // Calculate estimated LP tokens / shares
  const estimatedLpTokens = amount && parseFloat(amount) > 0
    ? (parseFloat(amount) / parseFloat(formatTokenAmount(market.liquidity || BigInt(1)))) * 100
    : 0;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">Liquidity Provider</h3>
        <p className="text-sm text-gray-400 mt-1">
          Earn fees by providing liquidity to this market
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setMode('add')}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            mode === 'add'
              ? 'bg-purple-500/20 text-purple-400 border-b-2 border-purple-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Add
        </button>
        <button
          onClick={() => setMode('remove')}
          disabled={!hasLiquidity}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            mode === 'remove'
              ? 'bg-orange-500/20 text-orange-400 border-b-2 border-orange-500'
              : hasLiquidity
              ? 'text-gray-400 hover:text-white'
              : 'text-gray-600 cursor-not-allowed'
          }`}
        >
          Remove
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Market Expired Warning */}
        {isEnded && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-400">
              <span className="text-lg">⏰</span>
              <div>
                <p className="font-medium text-sm">Market Expired</p>
                <p className="text-xs text-yellow-400/70">
                  Liquidity operations are closed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pool Stats */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-gray-800 rounded-lg">
          <div>
            <span className="text-sm text-gray-400">Pool Liquidity</span>
            <p className="text-white font-medium">
              {formatTokenAmount(market.liquidity)} CRwN
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-400">Your LP Shares</span>
            <p className="text-purple-400 font-medium">
              {position ? formatTokenAmount(position.lpShares) : '0.00'}
            </p>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">
              {mode === 'add' ? 'Amount (CRwN)' : 'LP Shares to Remove'}
            </span>
            <button
              onClick={setMaxAmount}
              className="text-purple-400 hover:text-purple-300"
            >
              Max
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-purple-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              {mode === 'add' ? 'CRwN' : 'LP'}
            </span>
          </div>
          {mode === 'add' && (
            <div className="text-sm text-gray-500 mt-1">
              Balance: {balanceFormatted} CRwN
            </div>
          )}
          {mode === 'remove' && position && (
            <div className="text-sm text-gray-500 mt-1">
              Available: {formatTokenAmount(position.lpShares)} LP shares
            </div>
          )}
        </div>

        {/* Estimate Display */}
        {mode === 'add' && amount && parseFloat(amount) > 0 && (
          <div className="bg-gray-800 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Est. Pool Share</span>
              <span className="text-white font-medium">
                ~{estimatedLpTokens.toFixed(2)}%
              </span>
            </div>
            <div className="text-xs text-gray-500">
              You will receive LP tokens representing your share of the pool.
              Withdraw your share at any time.
            </div>
          </div>
        )}

        {mode === 'remove' && amount && parseFloat(amount) > 0 && (
          <div className="bg-gray-800 rounded-lg p-3 space-y-2">
            <div className="text-sm text-gray-400">You will receive:</div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">CRwN + YES + NO tokens</span>
              <span className="text-white font-medium">
                Proportional to pool share
              </span>
            </div>
          </div>
        )}

        {/* Risk Warning */}
        <div className="text-xs text-yellow-400/80 bg-yellow-500/10 p-3 rounded-lg">
          <strong>Note:</strong> LP providers may experience impermanent loss if the market
          price moves significantly from the initial price.
        </div>

        {/* Error Display */}
        {error && (
          <div className="text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">
            {error.message}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
            canSubmit
              ? mode === 'add'
                ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
                : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {getButtonText()}
        </button>

        {/* Benefits Info */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>LP Benefits:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Earn 2% fee on all trades</li>
            <li>Fees distributed proportional to LP share</li>
            <li>Withdraw anytime before market resolution</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default LiquidityPanel;
