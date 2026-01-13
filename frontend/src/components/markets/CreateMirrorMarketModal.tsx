'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { useMirrorMarketCreation } from '@/hooks/useMirrorMarket';
import { UnifiedMarket, MarketSource } from '@/types/externalMarket';
import { formatTokenAmount } from '@/utils/format';

interface CreateMirrorMarketModalProps {
  market: UnifiedMarket;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { txHash: string; mirrorKey: string }) => void;
}

export function CreateMirrorMarketModal({
  market,
  isOpen,
  onClose,
  onSuccess,
}: CreateMirrorMarketModalProps) {
  const { address, isConnected } = useAccount();
  const { createFromMarket, loading, error, clearError } = useMirrorMarketCreation();

  const [liquidityAmount, setLiquidityAmount] = useState('100');
  const [step, setStep] = useState<'input' | 'confirming' | 'success' | 'error'>('input');
  const [txResult, setTxResult] = useState<{ txHash: string; mirrorKey: string } | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setTxResult(null);
      clearError();
    }
  }, [isOpen, clearError]);

  const handleCreate = async () => {
    if (!isConnected || !address) {
      return;
    }

    setStep('confirming');

    try {
      const result = await createFromMarket(market, parseEther(liquidityAmount).toString());

      if (result) {
        setTxResult({ txHash: result.txHash, mirrorKey: result.mirrorKey });
        setStep('success');
        onSuccess?.(result);
      } else {
        setStep('error');
      }
    } catch {
      setStep('error');
    }
  };

  if (!isOpen) return null;

  const getSourceColor = (source: MarketSource) => {
    switch (source) {
      case MarketSource.POLYMARKET:
        return 'text-purple-400';
      case MarketSource.KALSHI:
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getSourceName = (source: MarketSource) => {
    switch (source) {
      case MarketSource.POLYMARKET:
        return 'Polymarket';
      case MarketSource.KALSHI:
        return 'Kalshi';
      default:
        return source;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Create Mirror Market</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'input' && (
            <>
              {/* Market Info */}
              <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm font-medium ${getSourceColor(market.source)}`}>
                    {getSourceName(market.source)}
                  </span>
                  <span className="text-xs text-gray-500">#{market.externalId.slice(0, 8)}</span>
                </div>
                <p className="text-white font-medium mb-3">{market.question}</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">YES Price:</span>
                    <span className="ml-2 text-green-400">{market.yesPrice.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-400">NO Price:</span>
                    <span className="ml-2 text-red-400">{market.noPrice.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Volume:</span>
                    <span className="ml-2 text-white">${formatTokenAmount(market.volume)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Ends:</span>
                    <span className="ml-2 text-white">
                      {new Date(market.endTime * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Liquidity Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Initial Liquidity (CRwN)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={liquidityAmount}
                    onChange={(e) => setLiquidityAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
                    placeholder="Enter amount"
                    min="10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                    {[50, 100, 500].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setLiquidityAmount(amount.toString())}
                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Minimum: 10 CRwN. You earn 2% fees on all trades.
                </p>
              </div>

              {/* Info Box */}
              <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                <h4 className="text-sm font-medium text-yellow-400 mb-2">How it works</h4>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• Creates a mirror of this market on Flow chain</li>
                  <li>• Initial price is VRF-enhanced for fair pricing</li>
                  <li>• AI agents can trade with verified predictions</li>
                  <li>• Resolves automatically when external market resolves</li>
                </ul>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!isConnected || loading || parseFloat(liquidityAmount) < 10}
                  className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-medium rounded-lg transition-colors"
                >
                  {!isConnected
                    ? 'Connect Wallet'
                    : parseFloat(liquidityAmount) < 10
                    ? 'Min 10 CRwN'
                    : 'Create Mirror'}
                </button>
              </div>
            </>
          )}

          {step === 'confirming' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              <h3 className="text-lg font-medium text-white mb-2">Creating Mirror Market</h3>
              <p className="text-gray-400 text-sm">
                Please confirm the transaction in your wallet...
              </p>
              <p className="text-gray-500 text-xs mt-4">
                This may take a few moments
              </p>
            </div>
          )}

          {step === 'success' && txResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Mirror Market Created!</h3>
              <p className="text-gray-400 text-sm mb-4">
                Your mirror market is now live on Flow chain
              </p>
              <div className="bg-gray-800 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-400 mb-1">Transaction Hash</p>
                <a
                  href={`https://evm-testnet.flowscan.io/tx/${txResult.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-400 hover:text-yellow-300 text-sm font-mono break-all"
                >
                  {txResult.txHash}
                </a>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Creation Failed</h3>
              <p className="text-gray-400 text-sm mb-4">
                {error || 'Something went wrong. Please try again.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreateMirrorMarketModal;
