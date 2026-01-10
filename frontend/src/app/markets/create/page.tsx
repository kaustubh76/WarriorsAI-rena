'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther } from 'viem';
import { PredictionMarketABI, ERC20ABI } from '@/services/predictionMarketService';
import { getContracts } from '@/constants';
import { useTokenBalance } from '@/hooks/useMarkets';

export default function CreateMarketPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { balance, balanceFormatted } = useTokenBalance();

  // Form state
  const [question, setQuestion] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('12:00');
  const [initialLiquidity, setInitialLiquidity] = useState('100');
  const [step, setStep] = useState<'form' | 'approve' | 'create'>('form');

  // Contract addresses
  const contracts = getContracts(); // Flow Testnet
  const predictionMarketAddress = contracts?.predictionMarketAMM as `0x${string}`;
  const crownTokenAddress = (contracts?.crownToken || '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6') as `0x${string}`;

  // Approve transaction
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
    error: approveError
  } = useWriteContract();

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess
  } = useWaitForTransactionReceipt({ hash: approveHash });

  // Create market transaction
  const {
    writeContract: writeCreate,
    data: createHash,
    isPending: isCreatePending,
    error: createError
  } = useWriteContract();

  const {
    isLoading: isCreateConfirming,
    isSuccess: isCreateSuccess
  } = useWaitForTransactionReceipt({ hash: createHash });

  // Get next market ID to show after creation
  const { data: nextMarketId } = useReadContract({
    address: predictionMarketAddress,
    abi: PredictionMarketABI,
    functionName: 'nextMarketId',
  });

  // The created market ID will be nextMarketId - 1 after creation
  const createdMarketId = isCreateSuccess && nextMarketId ? Number(nextMarketId) - 1 : null;

  // Calculate end time as unix timestamp
  const getEndTimestamp = useCallback(() => {
    if (!endDate || !endTime) return 0;
    const dateTime = new Date(`${endDate}T${endTime}`);
    return Math.floor(dateTime.getTime() / 1000);
  }, [endDate, endTime]);

  // Validation
  const isValidForm = question.trim().length > 10 &&
    endDate &&
    getEndTimestamp() > Math.floor(Date.now() / 1000) + 3600 && // At least 1 hour in future
    parseFloat(initialLiquidity) >= 10;

  const liquidityBigInt = parseEther(initialLiquidity || '0');
  const hasEnoughBalance = balance >= liquidityBigInt;

  // Handle approve
  const handleApprove = () => {
    setStep('approve');
    writeApprove({
      address: crownTokenAddress,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [predictionMarketAddress, liquidityBigInt]
    });
  };

  // Handle create market
  const handleCreate = () => {
    setStep('create');
    const endTimestamp = BigInt(getEndTimestamp());

    writeCreate({
      address: predictionMarketAddress,
      abi: PredictionMarketABI,
      functionName: 'createMarket',
      args: [question, endTimestamp, liquidityBigInt]
    });
  };

  // Redirect on success
  React.useEffect(() => {
    if (isCreateSuccess) {
      setTimeout(() => {
        router.push('/markets');
      }, 2000);
    }
  }, [isCreateSuccess, router]);

  // Move to create step after approval
  React.useEffect(() => {
    if (isApproveSuccess && step === 'approve') {
      handleCreate();
    }
  }, [isApproveSuccess, step]);

  // Get minimum date (today - we allow same-day markets as long as end time is 1+ hour away)
  const today = new Date();
  const minDate = today.toISOString().split('T')[0];

  // Calculate time until market ends for display
  const timeUntilEnd = useMemo(() => {
    const endTs = getEndTimestamp();
    if (!endTs) return null;
    const now = Math.floor(Date.now() / 1000);
    const diff = endTs - now;
    if (diff <= 0) return 'Already passed';
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''} ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  }, [getEndTimestamp]);

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/markets" className="text-purple-400 hover:text-purple-300">
            ← Back to Markets
          </Link>
        </div>

        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create Prediction Market</h1>
          <p className="text-gray-400">
            Create a custom prediction market and earn fees from trading activity
          </p>
        </div>

        {/* Connect Wallet Prompt */}
        {!isConnected && (
          <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6">
              You need to connect your wallet to create a prediction market
            </p>
            <w3m-connect-button />
          </div>
        )}

        {/* Create Market Form */}
        {isConnected && (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
            {/* Success State */}
            {isCreateSuccess && (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-2xl font-bold text-green-400 mb-2">Market Created!</h2>
                <p className="text-gray-400 mb-4">
                  Your prediction market has been created successfully
                </p>
                {createdMarketId && (
                  <div className="mb-4">
                    <Link
                      href={`/markets/${createdMarketId}`}
                      className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
                    >
                      View Market #{createdMarketId} →
                    </Link>
                  </div>
                )}
                {createHash && (
                  <p className="text-xs text-gray-500 font-mono truncate max-w-md mx-auto">
                    TX: {createHash}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-4">Redirecting to markets page...</p>
              </div>
            )}

            {/* Form */}
            {!isCreateSuccess && (
              <form onSubmit={(e) => { e.preventDefault(); handleApprove(); }}>
                {/* Question */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Question *
                  </label>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g., Will Bitcoin reach $100,000 by the end of 2025?"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                    rows={3}
                    maxLength={500}
                    disabled={step !== 'form'}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {question.length}/500 characters (minimum 10)
                  </p>
                </div>

                {/* End Date & Time */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      End Date *
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={minDate}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                      disabled={step !== 'form'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      End Time *
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                      disabled={step !== 'form'}
                    />
                  </div>
                </div>
                {/* Time until end display */}
                {timeUntilEnd && (
                  <p className={`text-sm mb-6 ${timeUntilEnd === 'Already passed' ? 'text-red-400' : 'text-gray-400'}`}>
                    Market will be active for: <span className="font-medium text-white">{timeUntilEnd}</span>
                  </p>
                )}

                {/* Initial Liquidity */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Initial Liquidity (CRwN) *
                  </label>
                  <input
                    type="number"
                    value={initialLiquidity}
                    onChange={(e) => setInitialLiquidity(e.target.value)}
                    placeholder="100"
                    min="10"
                    step="1"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    disabled={step !== 'form'}
                  />
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Minimum: 10 CRwN</span>
                    <span className="text-gray-400">Balance: {parseFloat(balanceFormatted).toFixed(2)} CRwN</span>
                  </div>
                  {!hasEnoughBalance && parseFloat(initialLiquidity) > 0 && (
                    <p className="text-red-400 text-sm mt-1">Insufficient balance</p>
                  )}
                </div>

                {/* Info Box */}
                <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-medium text-white mb-2">How It Works</h3>
                  <ul className="text-sm text-gray-400 space-y-1">
                    <li>• Your initial liquidity seeds the market for trading</li>
                    <li>• You earn 1% of all trading fees on your market</li>
                    <li>• Market resolves via 0G AI Oracle after end time</li>
                    <li>• Winning shares redeem for 1 CRwN each</li>
                  </ul>
                </div>

                {/* Transaction Status - Step Progress */}
                {step !== 'form' && (
                  <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                    {/* Progress Steps */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          isApproveSuccess ? 'bg-green-500 text-white' : 'bg-purple-500 text-white'
                        }`}>
                          {isApproveSuccess ? '✓' : '1'}
                        </div>
                        <span className={`text-sm ${isApproveSuccess ? 'text-green-400' : 'text-gray-300'}`}>
                          Approve
                        </span>
                      </div>
                      <div className={`flex-1 h-0.5 mx-2 ${isApproveSuccess ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          isCreateSuccess ? 'bg-green-500 text-white' :
                          isApproveSuccess ? 'bg-purple-500 text-white' : 'bg-gray-600 text-gray-400'
                        }`}>
                          {isCreateSuccess ? '✓' : '2'}
                        </div>
                        <span className={`text-sm ${
                          isCreateSuccess ? 'text-green-400' :
                          isApproveSuccess ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          Create
                        </span>
                      </div>
                    </div>

                    {/* Current Action */}
                    <div className="flex items-center gap-3">
                      {(isApprovePending || isApproveConfirming) && (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-purple-500" />
                          <span className="text-gray-300">
                            {isApprovePending ? 'Approve CRwN spending in wallet...' : 'Confirming approval on-chain...'}
                          </span>
                        </>
                      )}
                      {isApproveSuccess && (isCreatePending || isCreateConfirming) && (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-purple-500" />
                          <span className="text-gray-300">
                            {isCreatePending ? 'Confirm market creation in wallet...' : 'Creating market on-chain...'}
                          </span>
                        </>
                      )}
                    </div>

                    {/* TX Hashes */}
                    {approveHash && (
                      <p className="text-xs text-gray-500 mt-2 font-mono truncate">
                        Approval TX: {approveHash}
                      </p>
                    )}
                  </div>
                )}

                {/* Error Display */}
                {(approveError || createError) && (
                  <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
                    <p className="text-red-400 text-sm">
                      {(approveError || createError)?.message || 'Transaction failed'}
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!isValidForm || !hasEnoughBalance || step !== 'form'}
                  className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {step === 'form' ? 'Create Market' : 'Processing...'}
                </button>

                {/* Validation Hints */}
                {!isValidForm && step === 'form' && (
                  <div className="mt-4 text-sm text-gray-500">
                    <p>Please ensure:</p>
                    <ul className="list-disc list-inside ml-2">
                      {question.trim().length <= 10 && <li>Question has at least 10 characters</li>}
                      {!endDate && <li>End date is selected</li>}
                      {endDate && getEndTimestamp() <= Math.floor(Date.now() / 1000) + 3600 && (
                        <li>End time is at least 1 hour in the future</li>
                      )}
                      {parseFloat(initialLiquidity) < 10 && <li>Initial liquidity is at least 10 CRwN</li>}
                    </ul>
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {/* Tips Section */}
        <div className="mt-8 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Tips for a Great Market</h3>
          <div className="space-y-3 text-sm text-gray-400">
            <p>
              <strong className="text-white">Be specific:</strong> Clear, unambiguous questions attract more traders
            </p>
            <p>
              <strong className="text-white">Set reasonable timeframes:</strong> Markets that resolve too quickly or slowly may have less activity
            </p>
            <p>
              <strong className="text-white">Add more liquidity:</strong> Higher liquidity means lower slippage and more trading
            </p>
          </div>
        </div>
    </main>
  );
}
