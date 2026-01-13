'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { useMirrorMarketTrade, useVRFTrade, useMirrorMarketQuery, MirrorMarketState } from '@/hooks/useMirrorMarket';
import { UnifiedMarket, MarketSource } from '@/types/externalMarket';
import { formatTokenAmount } from '@/utils/format';

interface MirrorMarketTradePanelProps {
  market: UnifiedMarket;
  mirrorKey: string;
  onTradeComplete?: () => void;
}

type Outcome = 'yes' | 'no';

export function MirrorMarketTradePanel({
  market,
  mirrorKey,
  onTradeComplete,
}: MirrorMarketTradePanelProps) {
  const { address, isConnected } = useAccount();
  const { executeTrade, loading: tradeLoading, error: tradeError, clearError: clearTradeError } = useMirrorMarketTrade();
  const { executeVRFTrade, loading: vrfLoading, error: vrfError, clearError: clearVRFError } = useVRFTrade();
  const { queryMirrorMarket, mirrorMarket, loading: queryLoading } = useMirrorMarketQuery();

  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>('yes');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1); // 1% default
  const [useVRF, setUseVRF] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [txResult, setTxResult] = useState<{ txHash: string; shares: string } | null>(null);

  const loading = tradeLoading || vrfLoading;
  const error = tradeError || vrfError;

  // Fetch mirror market state on mount
  useEffect(() => {
    if (mirrorKey) {
      queryMirrorMarket(mirrorKey);
    }
  }, [mirrorKey, queryMirrorMarket]);

  const handleTrade = async () => {
    if (!isConnected || !address || !amount) return;

    const amountWei = parseEther(amount).toString();

    try {
      let result;

      if (useVRF) {
        result = await executeVRFTrade({
          mirrorKey,
          isYes: selectedOutcome === 'yes',
          amount: amountWei,
          useVRF: true,
          slippageBps: slippage * 100,
        });
      } else {
        const minSharesOut = calculateMinShares(amountWei, slippage);
        result = await executeTrade({
          mirrorKey,
          isYes: selectedOutcome === 'yes',
          amount: amountWei,
          minSharesOut,
        });
      }

      if (result) {
        setTxResult({
          txHash: result.txHash,
          shares: result.sharesReceived || result.sharesOut || '0',
        });
        setAmount('');
        onTradeComplete?.();
      }
    } catch {
      // Error is handled by hooks
    }
  };

  const calculateMinShares = (amountWei: string, slippagePercent: number): string => {
    const amount = BigInt(amountWei);
    const slippageBps = BigInt(Math.round(slippagePercent * 100));
    const minShares = (amount * (10000n - slippageBps)) / 10000n;
    return minShares.toString();
  };

  const estimatedShares = amount
    ? (parseFloat(amount) / (selectedOutcome === 'yes' ? market.yesPrice : market.noPrice) * 100).toFixed(2)
    : '0';

  const potentialPayout = amount
    ? (parseFloat(estimatedShares) * 1).toFixed(2) // Each share pays 1 CRwN on correct outcome
    : '0';

  const clearError = () => {
    clearTradeError();
    clearVRFError();
  };

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">Trade Mirror Market</h3>

      {/* Mirror Market Status */}
      {mirrorMarket && (
        <div className="mb-4 p-3 bg-gray-900 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-400">Mirror Status</span>
            <span className={`text-sm font-medium ${mirrorMarket.isActive ? 'text-green-400' : 'text-red-400'}`}>
              {mirrorMarket.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">YES:</span>
              <span className="ml-2 text-green-400">{mirrorMarket.yesPrice.toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-gray-500">NO:</span>
              <span className="ml-2 text-red-400">{mirrorMarket.noPrice.toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-gray-500">Volume:</span>
              <span className="ml-2 text-white">{formatTokenAmount(mirrorMarket.totalVolume)}</span>
            </div>
            <div>
              <span className="text-gray-500">Trades:</span>
              <span className="ml-2 text-white">{mirrorMarket.tradeCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Outcome Selection */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => setSelectedOutcome('yes')}
          className={`py-3 px-4 rounded-lg font-medium transition-all ${
            selectedOutcome === 'yes'
              ? 'bg-green-500/20 border-2 border-green-500 text-green-400'
              : 'bg-gray-700 border-2 border-transparent text-gray-300 hover:border-gray-600'
          }`}
        >
          <div className="text-lg">YES</div>
          <div className="text-sm opacity-70">{market.yesPrice.toFixed(1)}%</div>
        </button>
        <button
          onClick={() => setSelectedOutcome('no')}
          className={`py-3 px-4 rounded-lg font-medium transition-all ${
            selectedOutcome === 'no'
              ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
              : 'bg-gray-700 border-2 border-transparent text-gray-300 hover:border-gray-600'
          }`}
        >
          <div className="text-lg">NO</div>
          <div className="text-sm opacity-70">{market.noPrice.toFixed(1)}%</div>
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Amount (CRwN)</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white text-lg focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
            {[10, 50, 100].map((val) => (
              <button
                key={val}
                onClick={() => setAmount(val.toString())}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trade Estimate */}
      {amount && parseFloat(amount) > 0 && (
        <div className="mb-4 p-3 bg-gray-900 rounded-lg">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Est. Shares</span>
            <span className="text-white">{estimatedShares}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Potential Payout</span>
            <span className="text-green-400">{potentialPayout} CRwN</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Max Slippage</span>
            <span className="text-yellow-400">{slippage}%</span>
          </div>
        </div>
      )}

      {/* VRF Toggle */}
      <div className="mb-4 flex items-center justify-between p-3 bg-gray-900 rounded-lg">
        <div>
          <div className="text-sm font-medium text-white">VRF-Enhanced Trade</div>
          <div className="text-xs text-gray-500">Adds timing randomness for copy trading</div>
        </div>
        <button
          onClick={() => setUseVRF(!useVRF)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            useVRF ? 'bg-yellow-500' : 'bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              useVRF ? 'right-1' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Advanced Settings */}
      <div className="mb-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Advanced Settings
        </button>
        {showAdvanced && (
          <div className="mt-3 p-3 bg-gray-900 rounded-lg">
            <label className="block text-sm text-gray-400 mb-2">Slippage Tolerance</label>
            <div className="flex gap-2">
              {[0.5, 1, 2, 5].map((val) => (
                <button
                  key={val}
                  onClick={() => setSlippage(val)}
                  className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                    slippage === val
                      ? 'bg-yellow-500 text-black'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <div className="flex justify-between items-start">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={clearError} className="text-red-400 hover:text-red-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Success Display */}
      {txResult && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-green-400 text-sm mb-1">Trade successful!</p>
          <a
            href={`https://evm-testnet.flowscan.io/tx/${txResult.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-300 hover:underline font-mono"
          >
            View on FlowScan
          </a>
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={handleTrade}
        disabled={!isConnected || !amount || loading || (mirrorMarket && !mirrorMarket.isActive)}
        className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
          !isConnected || !amount || loading || (mirrorMarket && !mirrorMarket.isActive)
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
            : selectedOutcome === 'yes'
            ? 'bg-green-500 hover:bg-green-400 text-black'
            : 'bg-red-500 hover:bg-red-400 text-white'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {useVRF ? 'Executing VRF Trade...' : 'Executing Trade...'}
          </span>
        ) : !isConnected ? (
          'Connect Wallet'
        ) : !amount ? (
          'Enter Amount'
        ) : mirrorMarket && !mirrorMarket.isActive ? (
          'Market Inactive'
        ) : (
          `Buy ${selectedOutcome.toUpperCase()}`
        )}
      </button>
    </div>
  );
}

export default MirrorMarketTradePanel;
