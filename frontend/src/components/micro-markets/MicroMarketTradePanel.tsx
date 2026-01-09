'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { type MicroMarketDisplay } from '@/services/microMarketService';
import { useMicroMarketTrade, useMicroMarketPosition, useMicroMarketTokenBalance } from '@/hooks/useMicroMarkets';

interface MicroMarketTradePanelProps {
  market: MicroMarketDisplay;
  onSuccess?: () => void;
}

export function MicroMarketTradePanel({ market, onSuccess }: MicroMarketTradePanelProps) {
  const { isConnected } = useAccount();
  const { position, hasPosition, loading: positionLoading, refetch: refetchPosition } = useMicroMarketPosition(market.id);
  const { balance, balanceFormatted, allowance, refetch: refetchBalance } = useMicroMarketTokenBalance();
  const {
    approveTokens,
    buy,
    sell,
    claimWinnings,
    isPending,
    isConfirming,
    isSuccess,
    error
  } = useMicroMarketTrade(market.id);

  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [isYes, setIsYes] = useState(true);
  const [amount, setAmount] = useState('');

  const isLoading = isPending || isConfirming;
  const canTrade = market.canTrade && !market.isExpired;
  const isResolved = market.status === 2;
  const needsApproval = BigInt(amount || '0') * BigInt(10 ** 18) > allowance;

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    if (needsApproval) {
      await approveTokens(amount);
    } else if (tradeType === 'buy') {
      await buy(isYes, amount);
    } else {
      await sell(isYes, amount);
    }

    setAmount('');
    refetchPosition();
    refetchBalance();
    onSuccess?.();
  };

  const handleClaim = async () => {
    await claimWinnings();
    refetchPosition();
    refetchBalance();
    onSuccess?.();
  };

  if (!isConnected) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
        <p className="text-center text-gray-400">Connect wallet to trade</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      {/* Market Info */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Trade</h3>
        <p className="text-sm text-gray-400 line-clamp-2">{market.question}</p>
      </div>

      {/* Current Prices */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <PriceBox
          label="Yes"
          price={market.yesPrice}
          isSelected={isYes}
          onClick={() => setIsYes(true)}
          color="green"
        />
        <PriceBox
          label="No"
          price={market.noPrice}
          isSelected={!isYes}
          onClick={() => setIsYes(false)}
          color="red"
        />
      </div>

      {/* User Position */}
      {hasPosition && position && (
        <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Your Position</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Yes Tokens</span>
              <p className="text-green-400 font-medium">{position.yesTokensFormatted}</p>
            </div>
            <div>
              <span className="text-gray-400">No Tokens</span>
              <p className="text-red-400 font-medium">{position.noTokensFormatted}</p>
            </div>
            <div className="col-span-2">
              <span className="text-gray-400">Total Invested</span>
              <p className="text-white font-medium">{position.totalInvestedFormatted} CRwN</p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Form */}
      {canTrade && (
        <>
          {/* Trade Type Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTradeType('buy')}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                tradeType === 'buy'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setTradeType('sell')}
              disabled={!hasPosition}
              className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                tradeType === 'sell'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-400'
              } ${!hasPosition ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Sell
            </button>
          </div>

          {/* Amount Input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">
              {tradeType === 'buy' ? 'Amount (CRwN)' : 'Shares to Sell'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
              {tradeType === 'buy' && (
                <button
                  onClick={() => setAmount(formatEther(balance))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-purple-400 hover:text-purple-300"
                >
                  Max
                </button>
              )}
            </div>
            {tradeType === 'buy' && (
              <p className="text-xs text-gray-500 mt-1">
                Balance: {balanceFormatted} CRwN
              </p>
            )}
          </div>

          {/* Trade Button */}
          <button
            onClick={handleTrade}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              isYes
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? (
              'Processing...'
            ) : needsApproval ? (
              'Approve CRwN'
            ) : tradeType === 'buy' ? (
              `Buy ${isYes ? 'YES' : 'NO'}`
            ) : (
              `Sell ${isYes ? 'YES' : 'NO'}`
            )}
          </button>
        </>
      )}

      {/* Claim Winnings (if resolved) */}
      {isResolved && hasPosition && (
        <button
          onClick={handleClaim}
          disabled={isLoading}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : 'Claim Winnings'}
        </button>
      )}

      {/* Market Closed Message */}
      {!canTrade && !isResolved && (
        <p className="text-center text-yellow-400 text-sm">
          Market is currently not tradeable
        </p>
      )}

      {/* Error Display */}
      {error && (
        <p className="mt-4 text-red-400 text-sm text-center">
          {(error as Error).message || 'Transaction failed'}
        </p>
      )}
    </div>
  );
}

function PriceBox({
  label,
  price,
  isSelected,
  onClick,
  color
}: {
  label: string;
  price: number;
  isSelected: boolean;
  onClick: () => void;
  color: 'green' | 'red';
}) {
  const colorClasses = color === 'green'
    ? 'border-green-500 bg-green-500/10 text-green-400'
    : 'border-red-500 bg-red-500/10 text-red-400';

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all ${
        isSelected
          ? colorClasses
          : 'border-gray-700 bg-gray-800/50 text-gray-400'
      }`}
    >
      <span className="block text-sm mb-1">{label}</span>
      <span className="block text-2xl font-bold">{price}%</span>
    </button>
  );
}

export default MicroMarketTradePanel;
