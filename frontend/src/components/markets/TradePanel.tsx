'use client';

import React, { useState, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';
import { useTrade, usePosition, useTokenBalance, useMarketPrice, clearMarketCache } from '@/hooks/useMarkets';
import { type Market, MarketStatus } from '@/services/predictionMarketService';

interface TradePanelProps {
  market: Market;
  onTradeComplete?: () => void;
}

type TradeMode = 'buy' | 'sell';
type Outcome = 'yes' | 'no';

export function TradePanel({ market, onTradeComplete }: TradePanelProps) {
  const { address, isConnected } = useAccount();
  const { position, hasPosition, refetch: refetchPosition } = usePosition(market.id);
  const { balance, balanceFormatted, allowance, refetch: refetchBalance } = useTokenBalance();
  const { yesProbability, noProbability, refetch: refetchPrice } = useMarketPrice(market.id);

  const [mode, setMode] = useState<TradeMode>('buy');
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>('yes');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1); // 1% default

  const {
    quote,
    quoteLoading,
    getQuote,
    approveTokens,
    buy,
    sell,
    isPending,
    isConfirming,
    isSuccess,
    error
  } = useTrade(market.id);

  const isActive = market.status === MarketStatus.Active;
  const isTrading = isPending || isConfirming;

  // Update quote when amount or outcome changes
  useEffect(() => {
    if (amount && parseFloat(amount) > 0) {
      getQuote(selectedOutcome === 'yes', amount);
    }
  }, [amount, selectedOutcome, getQuote]);

  // Refetch ALL data after successful trade - clear cache first for fresh reads
  useEffect(() => {
    if (isSuccess) {
      // Clear RPC cache to ensure fresh blockchain data
      clearMarketCache();

      // Immediately refetch all market data
      refetchBalance();
      refetchPosition();
      refetchPrice(); // Force immediate price update

      setAmount('');
      onTradeComplete?.();
    }
  }, [isSuccess, refetchBalance, refetchPosition, refetchPrice, onTradeComplete]);

  const handleAmountChange = (value: string) => {
    // Only allow valid number input
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const setMaxAmount = () => {
    if (mode === 'buy') {
      setAmount(balanceFormatted);
    } else {
      // For selling, set max to user's share balance
      const shares = selectedOutcome === 'yes' ? position?.yesTokens : position?.noTokens;
      if (shares) {
        setAmount(formatEther(shares));
      }
    }
  };

  // Check if approval is needed - safely parse amount to avoid errors
  const needsApproval = mode === 'buy' && amount && parseFloat(amount) > 0 && parseEther(amount) > allowance;

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      console.log('Trade aborted: invalid amount', amount);
      return;
    }

    try {
      if (needsApproval) {
        console.log('Approving tokens:', amount);
        await approveTokens(amount);
        return;
      }

      if (mode === 'buy') {
        console.log('Buying', selectedOutcome, 'with amount:', amount, 'slippage:', slippage);
        await buy(selectedOutcome === 'yes', amount, slippage * 100);
      } else {
        console.log('Selling', selectedOutcome, 'shares:', amount, 'slippage:', slippage);
        await sell(selectedOutcome === 'yes', amount, slippage * 100);
      }
    } catch (err) {
      console.error('Trade error:', err);
    }
  };

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet';
    if (isPending) return 'Confirm in Wallet...';
    if (isConfirming) return 'Processing...';
    if (quoteLoading) return 'Getting quote...';
    if (needsApproval) return 'Approve CRwN';
    if (mode === 'buy' && !quote && amount && parseFloat(amount) > 0) return 'Getting quote...';
    if (mode === 'buy') return `Buy ${selectedOutcome.toUpperCase()}`;
    return `Sell ${selectedOutcome.toUpperCase()}`;
  };

  // For buy mode, also require a valid quote
  const canTrade = isConnected && isActive && amount && parseFloat(amount) > 0 && !isTrading && !quoteLoading && (mode === 'sell' || quote !== null);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Mode Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            mode === 'buy'
              ? 'bg-green-500/20 text-green-400 border-b-2 border-green-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode('sell')}
          disabled={!hasPosition}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            mode === 'sell'
              ? 'bg-red-500/20 text-red-400 border-b-2 border-red-500'
              : hasPosition
              ? 'text-gray-400 hover:text-white'
              : 'text-gray-600 cursor-not-allowed'
          }`}
        >
          Sell
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Outcome Selection */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setSelectedOutcome('yes')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedOutcome === 'yes'
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="text-2xl mb-1">✓</div>
            <div className={`font-bold ${selectedOutcome === 'yes' ? 'text-green-400' : 'text-white'}`}>
              YES
            </div>
            <div className="text-sm text-gray-400">
              {yesProbability.toFixed(1)}%
            </div>
          </button>
          <button
            onClick={() => setSelectedOutcome('no')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedOutcome === 'no'
                ? 'border-red-500 bg-red-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="text-2xl mb-1">✗</div>
            <div className={`font-bold ${selectedOutcome === 'no' ? 'text-red-400' : 'text-white'}`}>
              NO
            </div>
            <div className="text-sm text-gray-400">
              {noProbability.toFixed(1)}%
            </div>
          </button>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">
              {mode === 'buy' ? 'Amount (CRwN)' : 'Shares to Sell'}
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
              {mode === 'buy' ? 'CRwN' : 'Shares'}
            </span>
          </div>
          {mode === 'buy' && (
            <div className="text-sm text-gray-500 mt-1">
              Balance: {balanceFormatted} CRwN
            </div>
          )}
          {mode === 'sell' && position && (
            <div className="text-sm text-gray-500 mt-1">
              Available: {formatEther(selectedOutcome === 'yes' ? position.yesTokens : position.noTokens)} shares
            </div>
          )}
        </div>

        {/* Quote Display */}
        {quote && amount && parseFloat(amount) > 0 && (
          <div className="bg-gray-800 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">
                {mode === 'buy' ? 'Est. Shares' : 'Est. Return'}
              </span>
              <span className="text-white font-medium">
                {mode === 'buy'
                  ? `${formatEther(quote.sharesOut)} shares`
                  : `${formatEther(quote.sharesOut)} CRwN`
                }
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Price Impact</span>
              <span className={`font-medium ${quote.priceImpact > 2 ? 'text-yellow-400' : 'text-gray-300'}`}>
                {quote.priceImpact.toFixed(2)}%
              </span>
            </div>
            {mode === 'buy' && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Potential Payout</span>
                <span className="text-green-400 font-medium">
                  {formatEther(quote.sharesOut)} CRwN
                </span>
              </div>
            )}
          </div>
        )}

        {/* Slippage Settings */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Slippage Tolerance</span>
          </div>
          <div className="flex gap-2">
            {[0.5, 1, 2, 5].map((val) => (
              <button
                key={val}
                onClick={() => setSlippage(val)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  slippage === val
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">
            {error.message || 'Transaction failed. Please try again.'}
          </div>
        )}

        {/* Success Message */}
        {isSuccess && (
          <div className="text-green-400 text-sm p-3 bg-green-500/10 rounded-lg">
            Trade successful! Data refreshing...
          </div>
        )}

        {/* Trade Button */}
        <button
          onClick={handleTrade}
          disabled={!canTrade}
          className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
            canTrade
              ? mode === 'buy'
                ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {getButtonText()}
        </button>

        {/* Current Position */}
        {hasPosition && position && (
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-sm text-gray-400 mb-2">Your Position</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-green-400">YES:</span>{' '}
                <span className="text-white">{formatEther(position.yesTokens)}</span>
              </div>
              <div>
                <span className="text-red-400">NO:</span>{' '}
                <span className="text-white">{formatEther(position.noTokens)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TradePanel;
