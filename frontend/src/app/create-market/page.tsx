'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useCreateMarket } from '@/hooks/useCreateMarket';

// Categories for markets
const CATEGORIES = [
  { value: 'crypto', label: 'Crypto', icon: '₿' },
  { value: 'politics', label: 'Politics', icon: '🏛️' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
  { value: 'tech', label: 'Technology', icon: '💻' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { value: 'science', label: 'Science', icon: '🔬' },
  { value: 'finance', label: 'Finance', icon: '📈' },
  { value: 'other', label: 'Other', icon: '📝' },
];

// Suggested questions for inspiration
const SUGGESTIONS = [
  'Will Bitcoin hit $100,000 by end of 2025?',
  'Will SpaceX land humans on Mars by 2030?',
  'Will Apple release AR glasses in 2025?',
  'Will the next FIFA World Cup be won by a European team?',
  'Will GPT-5 pass the bar exam?',
];

export default function CreateMarketPage() {
  const { address, isConnected } = useAccount();
  const {
    state: createState,
    checkBalanceAndApproval,
    approveTokens,
    createMarket,
    reset,
    hasEnoughBalance
  } = useCreateMarket();

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    category: 'crypto',
    endDate: '',
    endTime: '23:59',
    initialLiquidity: '100',
  });

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [creationStep, setCreationStep] = useState<'idle' | 'checking' | 'approving' | 'creating' | 'success'>('idle');

  // Check balance when liquidity changes
  useEffect(() => {
    if (isConnected && formData.initialLiquidity) {
      checkBalanceAndApproval(formData.initialLiquidity).then((valid) => {
        if (valid) {
          setNeedsApproval(!createState.hasApproval);
        }
      });
    }
  }, [formData.initialLiquidity, isConnected]);

  // Handle success state
  useEffect(() => {
    if (createState.step === 'success' && createState.marketId) {
      setCreationStep('success');
      // Redirect after short delay to show success
      setTimeout(() => {
        window.location.href = `/markets/${createState.marketId}`;
      }, 2000);
    }
  }, [createState.step, createState.marketId]);

  // Calculate estimated earnings
  const estimatedEarnings = (parseFloat(formData.initialLiquidity) || 0) * 0.5; // Example: assume 50% of liquidity gets traded

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    if (!formData.question.trim()) {
      setError('Please enter a question');
      return;
    }

    if (!formData.endDate) {
      setError('Please select an end date');
      return;
    }

    // Check balance
    if (!hasEnoughBalance(formData.initialLiquidity)) {
      setError(`Insufficient balance. You have ${createState.balance} CRwN but need ${formData.initialLiquidity} CRwN`);
      return;
    }

    try {
      setIsCreating(true);
      setError(null);

      // Step 1: Check approval status
      setCreationStep('checking');
      const isValid = await checkBalanceAndApproval(formData.initialLiquidity);
      if (!isValid) {
        setError(createState.error || 'Failed to check balance');
        setIsCreating(false);
        setCreationStep('idle');
        return;
      }

      // Step 2: Approve tokens if needed
      if (!createState.hasApproval) {
        setCreationStep('approving');
        const approved = await approveTokens(formData.initialLiquidity);
        if (!approved) {
          setError(createState.error || 'Failed to approve tokens');
          setIsCreating(false);
          setCreationStep('idle');
          return;
        }
      }

      // Step 3: Create market on-chain
      setCreationStep('creating');
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

      const success = await createMarket({
        question: formData.question,
        description: formData.description || undefined,
        category: formData.category,
        endTime: endDateTime.getTime(),
        initialLiquidity: formData.initialLiquidity,
      });

      if (!success) {
        setError(createState.error || 'Failed to create market');
        setCreationStep('idle');
      }
      // Success handling is done in the useEffect above
    } catch (err) {
      console.error('Create market error:', err);
      setError((err as Error).message);
      setCreationStep('idle');
    } finally {
      setIsCreating(false);
    }
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/markets" className="text-gray-400 hover:text-white mb-4 inline-block">
            ← Back to Markets
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">
            Create a Prediction Market
          </h1>
          <p className="text-gray-400">
            Create a market on any topic. Earn 2% of all trades as the creator.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Question Input */}
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                <label className="block text-white font-medium mb-3">
                  What do you want to predict?
                </label>
                <textarea
                  value={formData.question}
                  onChange={(e) =>
                    setFormData({ ...formData, question: e.target.value })
                  }
                  placeholder="e.g., Will Bitcoin hit $100,000 by end of 2025?"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                  rows={3}
                  maxLength={500}
                />
                <div className="flex justify-between mt-2">
                  <span className="text-gray-500 text-sm">
                    Ask a yes/no question with a clear resolution criteria
                  </span>
                  <span className="text-gray-500 text-sm">
                    {formData.question.length}/500
                  </span>
                </div>

                {/* Suggestions */}
                <div className="mt-4">
                  <span className="text-gray-400 text-sm">Need inspiration?</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {SUGGESTIONS.slice(0, 3).map((suggestion, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, question: suggestion })
                        }
                        className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full transition-colors"
                      >
                        {suggestion.slice(0, 40)}...
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                <label className="block text-white font-medium mb-3">
                  Description (optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Add context, resolution criteria, or sources..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                  rows={3}
                />
              </div>

              {/* Category */}
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                <label className="block text-white font-medium mb-3">
                  Category
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, category: cat.value })
                      }
                      className={`p-3 rounded-lg border transition-all ${
                        formData.category === cat.value
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <span className="text-xl block mb-1">{cat.icon}</span>
                      <span className="text-xs">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* End Date & Liquidity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                  <label className="block text-white font-medium mb-3">
                    Resolution Date
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                    min={getMinDate()}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) =>
                      setFormData({ ...formData, endTime: e.target.value })
                    }
                    className="w-full px-4 py-2 mt-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
                  <label className="block text-white font-medium mb-3">
                    Initial Liquidity
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.initialLiquidity}
                      onChange={(e) =>
                        setFormData({ ...formData, initialLiquidity: e.target.value })
                      }
                      min="100"
                      step="100"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      CRwN
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-2">
                    Minimum: 100 CRwN
                  </p>
                </div>
              </div>

              {/* Creator Fee Info */}
              <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 border border-purple-500/30">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">💰</span>
                  <div>
                    <h3 className="text-white font-bold mb-1">
                      Creator Revenue: 2% of ALL Trades
                    </h3>
                    <p className="text-gray-300 text-sm">
                      You earn 2% of every trade made on your market. The more
                      trading activity, the more you earn!
                    </p>
                    <div className="mt-3 p-3 bg-gray-900/50 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Est. earnings (conservative)</span>
                        <span className="text-green-400 font-medium">
                          +{estimatedEarnings.toFixed(0)} CRwN
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Balance Info */}
              {isConnected && (
                <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Your Balance:</span>
                    <span className={`font-medium ${hasEnoughBalance(formData.initialLiquidity) ? 'text-green-400' : 'text-red-400'}`}>
                      {parseFloat(createState.balance).toFixed(2)} CRwN
                    </span>
                  </div>
                  {!hasEnoughBalance(formData.initialLiquidity) && (
                    <p className="text-red-400 text-sm mt-2">
                      Insufficient balance for {formData.initialLiquidity} CRwN
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {(error || createState.error) && (
                <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-400">{error || createState.error}</p>
                </div>
              )}

              {/* Success Message */}
              {creationStep === 'success' && createState.marketId && (
                <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 font-medium">Market created successfully!</p>
                  {createState.txHash && (
                    <p className="text-green-300 text-sm mt-1">
                      Transaction:{' '}
                      <a
                        href={`https://evm-testnet.flowscan.io/tx/${createState.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-green-200"
                      >
                        {createState.txHash.slice(0, 10)}...{createState.txHash.slice(-8)}
                      </a>
                    </p>
                  )}
                  <p className="text-green-300 text-sm mt-1">Redirecting to market...</p>
                </div>
              )}

              {/* Progress Steps */}
              {isCreating && creationStep !== 'idle' && (
                <div className="p-4 bg-purple-500/20 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent" />
                    <span className="text-purple-300">
                      {creationStep === 'checking' && 'Checking balance and approval...'}
                      {creationStep === 'approving' && 'Approving CRwN tokens... (confirm in wallet)'}
                      {creationStep === 'creating' && 'Creating market on-chain... (confirm in wallet)'}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isCreating || !isConnected || !hasEnoughBalance(formData.initialLiquidity)}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  isCreating || !isConnected || !hasEnoughBalance(formData.initialLiquidity)
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/25'
                }`}
              >
                {!isConnected
                  ? 'Connect Wallet to Create'
                  : !hasEnoughBalance(formData.initialLiquidity)
                  ? 'Insufficient Balance'
                  : isCreating
                  ? creationStep === 'approving'
                    ? 'Approving...'
                    : creationStep === 'creating'
                    ? 'Creating Market...'
                    : 'Processing...'
                  : `Create Market (${formData.initialLiquidity} CRwN)`}
              </button>
            </form>
          </div>

          {/* Preview Sidebar */}
          <div className="space-y-6">
            {/* Live Preview */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-white font-bold mb-4">Preview</h3>
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <span>
                    {CATEGORIES.find((c) => c.value === formData.category)?.icon}
                  </span>
                  <span className="text-gray-400 text-sm">
                    {CATEGORIES.find((c) => c.value === formData.category)?.label}
                  </span>
                </div>
                <h4 className="text-white font-medium mb-3">
                  {formData.question || 'Your question will appear here...'}
                </h4>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-green-400">Yes 50%</span>
                  <span className="text-red-400">No 50%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
                  <div className="w-1/2 bg-green-500" />
                  <div className="w-1/2 bg-red-500" />
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  Resolves:{' '}
                  {formData.endDate
                    ? new Date(
                        `${formData.endDate}T${formData.endTime}`
                      ).toLocaleDateString()
                    : 'Select a date'}
                </div>
              </div>
            </div>

            {/* How It Works */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-white font-bold mb-4">How It Works</h3>
              <div className="space-y-4">
                <Step
                  number={1}
                  title="Create"
                  description="Set your question, category, and initial liquidity"
                />
                <Step
                  number={2}
                  title="Trade"
                  description="Users trade YES/NO positions on your market"
                />
                <Step
                  number={3}
                  title="AI Debates"
                  description="AI agents research and forecast outcomes"
                />
                <Step
                  number={4}
                  title="Earn"
                  description="Collect 2% of every trade as revenue"
                />
                <Step
                  number={5}
                  title="Resolve"
                  description="Resolve the market when the outcome is known"
                />
              </div>
            </div>

            {/* Tips */}
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-white font-bold mb-4">💡 Tips</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  Ask clear yes/no questions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  Include specific dates/numbers
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  Define resolution criteria clearly
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">•</span>
                  More liquidity = more trades
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {number}
      </div>
      <div>
        <div className="text-white font-medium">{title}</div>
        <div className="text-gray-400 text-sm">{description}</div>
      </div>
    </div>
  );
}
