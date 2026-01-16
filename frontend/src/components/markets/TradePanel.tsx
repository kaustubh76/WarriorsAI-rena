'use client';

import React, { useState, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';
import { useTrade, usePosition, useTokenBalance, useMarketPrice, clearMarketCache } from '@/hooks/useMarkets';
import { type Market, MarketStatus } from '@/services/predictionMarketService';
import { useAgentMarketTrading } from '@/hooks/useAgentMarketTrading';
import { formatTokenAmount } from '@/utils/format';
import { useGamificationContext } from '@/contexts/GamificationContext';
import { useNotifications } from '@/contexts/NotificationContext';

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

  // Gamification context - safely access (may not be available during SSR)
  let gamification: ReturnType<typeof useGamificationContext> | null = null;
  let notifications: ReturnType<typeof useNotifications> | null = null;
  try {
    gamification = useGamificationContext();
    notifications = useNotifications();
  } catch {
    // Context not available (SSR or not wrapped in provider)
  }

  const [mode, setMode] = useState<TradeMode>('buy');
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>('yes');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1); // 1% default

  // AI Agent Trading State
  const [useAgent, setUseAgent] = useState(false);
  const {
    agents,
    agentsLoading,
    selectedAgent,
    setSelectedAgent,
    prediction,
    predictionResult,
    isGenerating,
    generationError,
    isExecuting,
    executionError,
    lastTradeResult,
    autoExecute,
    setAutoExecute,
    generatePrediction,
    executeAgentTrade,
    clearPrediction,
    suggestedAmountFormatted,
    confidencePercent
  } = useAgentMarketTrading(market.id);

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
  const isEnded = Number(market.endTime) * 1000 < Date.now();
  const canTradeMarket = isActive && !isEnded; // Market must be active AND not expired
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

      // Gamification: Track trade completion
      if (gamification && notifications) {
        // Track quest progress for completing trades
        gamification.quests.trackProgress('complete_trades', 1);

        // Check time-based achievements (early bird, night owl)
        gamification.checkTimeBasedAchievements();

        // Show success notification
        notifications.success(
          'Trade Executed',
          `${mode === 'buy' ? 'Bought' : 'Sold'} ${selectedOutcome.toUpperCase()} position`
        );

        // Trigger celebration confetti for trades
        gamification.triggerConfetti('low');
      }

      setAmount('');
      clearPrediction(); // Clear agent prediction after trade
      onTradeComplete?.();
    }
  }, [isSuccess, refetchBalance, refetchPosition, refetchPrice, onTradeComplete, clearPrediction, gamification, notifications, mode, selectedOutcome]);

  // Auto-fill from agent prediction
  useEffect(() => {
    if (prediction && useAgent && predictionResult?.recommendation) {
      setSelectedOutcome(prediction.isYes ? 'yes' : 'no');
      if (predictionResult.recommendation.amount > BigInt(0)) {
        setAmount(suggestedAmountFormatted);
      }
    }
  }, [prediction, useAgent, predictionResult, suggestedAmountFormatted]);

  // Handle agent prediction generation with auto-execute
  const handleGeneratePrediction = async (e?: React.MouseEvent) => {
    // Prevent any default behavior
    e?.preventDefault();
    e?.stopPropagation();

    try {
      console.log('[TradePanel] Generating prediction, autoExecute:', autoExecute);
      // Use default max amount (100 CRwN) instead of full balance
      // This prevents accidentally trading the entire wallet
      const result = await generatePrediction();

      console.log('[TradePanel] Prediction result:', {
        hasResult: !!result,
        validationValid: result?.validation?.valid,
        shouldTrade: result?.recommendation?.shouldTrade,
        autoExecute
      });

      if (result && autoExecute && result.validation?.valid && result.recommendation?.shouldTrade) {
        console.log('[TradePanel] Auto-executing trade...');
        // Auto-execute trade using server-side wallet (not user wallet)
        setTimeout(async () => {
          try {
            const tradeResult = await executeAgentTrade();
            console.log('[TradePanel] Trade result:', tradeResult);
            if (tradeResult?.success) {
              // Clear caches and refresh data after successful agent trade
              clearMarketCache();
              refetchBalance();
              refetchPosition();
              refetchPrice();

              // Gamification: Track AI agent trade
              if (gamification && notifications) {
                gamification.quests.trackProgress('complete_trades', 1);
                gamification.checkTimeBasedAchievements();
                notifications.success('AI Trade Executed', 'Agent prediction trade completed');
                gamification.triggerConfetti('medium');
              }

              setAmount('');
              clearPrediction();
              onTradeComplete?.();
            } else {
              console.error('[TradePanel] Trade failed:', tradeResult?.error);
            }
          } catch (execError) {
            console.error('[TradePanel] Auto-execute error:', execError);
          }
        }, 500);
      } else if (result && autoExecute) {
        console.log('[TradePanel] Auto-execute skipped - validation failed or not recommended');
      }
    } catch (error) {
      console.error('[TradePanel] Prediction generation error:', error);
    }
  };

  // Handle manual agent trade execution (server-side wallet)
  const handleExecuteAgentTrade = async (e?: React.MouseEvent) => {
    // Prevent any default behavior
    e?.preventDefault();
    e?.stopPropagation();

    try {
      const tradeResult = await executeAgentTrade();
      if (tradeResult?.success) {
        // Clear caches and refresh data after successful agent trade
        clearMarketCache();
        refetchBalance();
        refetchPosition();
        refetchPrice();

        // Gamification: Track AI agent trade
        if (gamification && notifications) {
          gamification.quests.trackProgress('complete_trades', 1);
          gamification.checkTimeBasedAchievements();
          notifications.success('AI Trade Executed', 'Agent prediction trade completed');
          gamification.triggerConfetti('medium');
        }

        setAmount('');
        clearPrediction();
        onTradeComplete?.();
      }
    } catch (error) {
      console.error('[TradePanel] Execute agent trade error:', error);
    }
  };

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
        setAmount(formatTokenAmount(shares));
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
  const canTrade = isConnected && canTradeMarket && amount && parseFloat(amount) > 0 && !isTrading && !quoteLoading && (mode === 'sell' || quote !== null);

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
        {/* Market Expired Warning */}
        {isEnded && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-400">
              <span className="text-lg">⏰</span>
              <div>
                <p className="font-medium text-sm">Market Expired</p>
                <p className="text-xs text-yellow-400/70">
                  Trading is closed. Awaiting resolution by oracle.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI Agent Trading Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span className="text-sm font-medium text-white">Use AI Agent</span>
          </div>
          <button
            onClick={() => setUseAgent(!useAgent)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              useAgent ? 'bg-purple-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                useAgent ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>

        {/* Agent Selection & Prediction (shown when useAgent is true) */}
        {useAgent && (
          <div className="space-y-3 p-3 bg-purple-900/20 rounded-lg border border-purple-500/30">
            {/* Agent Selector */}
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Select AI Agent</label>
              <select
                value={selectedAgent?.id?.toString() || ''}
                onChange={(e) => {
                  const agent = agents.find(a => a.id.toString() === e.target.value);
                  setSelectedAgent(agent || null);
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                disabled={agentsLoading}
              >
                <option value="">
                  {agentsLoading ? 'Loading agents...' : 'Select an agent'}
                </option>
                {agents.map((agent) => (
                  <option key={agent.id.toString()} value={agent.id.toString()}>
                    {agent.name} ({agent.winRate?.toFixed(1) || 0}% win rate)
                  </option>
                ))}
              </select>
              {agents.length === 0 && !agentsLoading && (
                <p className="text-xs text-gray-500 mt-1">
                  No agents available. Create one first.
                </p>
              )}
            </div>

            {/* Auto-Execute Toggle */}
            {selectedAgent && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Auto-execute trade</span>
                <button
                  onClick={() => setAutoExecute(!autoExecute)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    autoExecute ? 'bg-green-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      autoExecute ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Generate Prediction Button */}
            {selectedAgent && (
              <button
                type="button"
                onClick={handleGeneratePrediction}
                disabled={isGenerating || !canTradeMarket}
                className={`w-full py-2 rounded-lg font-medium text-sm transition-all ${
                  isGenerating
                    ? 'bg-purple-700 text-purple-300 cursor-wait'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {isGenerating
                  ? 'Generating prediction...'
                  : autoExecute
                  ? 'Get Prediction & Trade'
                  : 'Get Prediction'
                }
              </button>
            )}

            {/* Prediction Result Display */}
            {prediction && (
              <div className="p-3 bg-gray-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Prediction</span>
                  {prediction.isVerified ? (
                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full flex items-center gap-1">
                      ✓ 0G Verified
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">
                      ✗ Unverified
                    </span>
                  )}
                </div>

                {/* Outcome & Confidence */}
                <div className="flex items-center gap-3">
                  <span
                    className={`text-2xl font-bold ${
                      prediction.isYes ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {prediction.isYes ? 'YES' : 'NO'}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">Confidence</span>
                      <span className={`font-medium ${
                        confidencePercent >= 70 ? 'text-green-400' :
                        confidencePercent >= 50 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {confidencePercent}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          confidencePercent >= 70 ? 'bg-green-500' :
                          confidencePercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${confidencePercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Reasoning */}
                <div className="text-xs text-gray-400 line-clamp-2">
                  {prediction.reasoning}
                </div>

                {/* Suggested Amount */}
                {predictionResult?.recommendation?.amount && predictionResult.recommendation.amount > BigInt(0) && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Suggested:</span>
                    <span className="text-white font-medium">
                      {suggestedAmountFormatted} CRwN
                    </span>
                  </div>
                )}

                {/* Validation Warnings */}
                {predictionResult?.validation && !predictionResult.validation.valid && (
                  <div className="text-xs p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-400">
                    ⚠️ {predictionResult.validation.reasons.join(', ')}
                  </div>
                )}

                {/* Execute Agent Trade Button (shown when not auto-execute and prediction is valid) */}
                {!autoExecute && predictionResult?.validation?.valid && predictionResult?.recommendation?.shouldTrade && (
                  <button
                    type="button"
                    onClick={handleExecuteAgentTrade}
                    disabled={isExecuting}
                    className={`w-full py-2 rounded-lg font-medium text-sm transition-all ${
                      isExecuting
                        ? 'bg-green-700 text-green-300 cursor-wait'
                        : 'bg-green-600 hover:bg-green-500 text-white'
                    }`}
                  >
                    {isExecuting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span>
                        Executing Trade...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        🤖 Execute Agent Trade ({suggestedAmountFormatted} CRwN)
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Agent Trade Success Result */}
            {lastTradeResult?.success && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-green-400">
                  <span className="text-lg">✅</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Agent Trade Successful!</p>
                    <p className="text-xs text-green-400/70 truncate">
                      TX: {lastTradeResult.txHash}
                    </p>
                    {lastTradeResult.amount && (
                      <p className="text-xs text-green-400/70">
                        Amount: {lastTradeResult.amount} CRwN
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Execution Error */}
            {executionError && (
              <div className="text-xs p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400">
                ❌ Execution failed: {executionError}
              </div>
            )}

            {/* Generation Error */}
            {generationError && (
              <div className="text-xs p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400">
                {generationError}
              </div>
            )}
          </div>
        )}

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
              Available: {formatTokenAmount(selectedOutcome === 'yes' ? position.yesTokens : position.noTokens)} shares
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
                  ? `${formatTokenAmount(quote.sharesOut)} shares`
                  : `${formatTokenAmount(quote.sharesOut)} CRwN`
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
                  {formatTokenAmount(quote.sharesOut)} CRwN
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
            <div className="grid grid-cols-2 gap-3 text-sm mb-2">
              <div>
                <span className="text-green-400">YES:</span>{' '}
                <span className="text-white">{formatTokenAmount(position.yesTokens)}</span>
              </div>
              <div>
                <span className="text-red-400">NO:</span>{' '}
                <span className="text-white">{formatTokenAmount(position.noTokens)}</span>
              </div>
            </div>
            {/* Estimated Value */}
            {(position.yesTokens > BigInt(0) || position.noTokens > BigInt(0)) && (
              <div className="pt-2 border-t border-gray-700 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Est. Value:</span>
                  <span className="text-white font-medium">
                    {(() => {
                      const yesValue = (position.yesTokens * BigInt(Math.round(yesProbability * 100))) / BigInt(10000);
                      const noValue = (position.noTokens * BigInt(Math.round(noProbability * 100))) / BigInt(10000);
                      return formatTokenAmount(yesValue + noValue);
                    })()} CRwN
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Win Prob:</span>
                  <span className={`font-medium ${
                    (position.yesTokens > position.noTokens ? yesProbability : noProbability) > 50
                      ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {position.yesTokens > position.noTokens
                      ? yesProbability.toFixed(1)
                      : position.noTokens > position.yesTokens
                      ? noProbability.toFixed(1)
                      : '50.0'}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TradePanel;
