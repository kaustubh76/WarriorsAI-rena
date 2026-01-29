'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, TrendingUp, Check } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useUserNFTs } from '@/hooks/useUserNFTs';
import { useNotifications } from '@/contexts/NotificationContext';
import MarketSearchWithArbitrage from './MarketSearchWithArbitrage';
import DualWarriorSelector from './DualWarriorSelector';
import ArbitrageProfitPreview from './ArbitrageProfitPreview';
import { useChainId } from 'wagmi';

// ============================================
// TYPES
// ============================================

interface CreateArbitrageBattleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (battleId: string) => void;
}

interface ArbitrageOpportunity {
  id: string;
  question: string;
  polymarket: {
    id: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
  };
  kalshi: {
    id: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
  };
  spread: number;
  potentialProfit: number;
  cost: number;
  strategy: {
    market1: string;
    side1: string;
    market2: string;
    side2: string;
  };
}

interface Warrior {
  id: number;
  name?: string;
  tokenId: string;
  attributes?: {
    attack?: number;
    defense?: number;
    [key: string]: any;
  };
}

// ============================================
// COMPONENT
// ============================================

export default function CreateArbitrageBattleModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateArbitrageBattleModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { success: showSuccess, error: showError } = useNotifications();

  // Fetch user's warriors
  const { userNFTs: warriors, isLoadingNFTs: loadingWarriors } = useUserNFTs(isOpen, chainId);

  // Multi-step wizard state
  const [step, setStep] = useState(1); // 1-4
  const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageOpportunity | null>(null);
  const [selectedWarrior1, setSelectedWarrior1] = useState<Warrior | null>(null);
  const [selectedWarrior2, setSelectedWarrior2] = useState<Warrior | null>(null);
  const [stakeAmount, setStakeAmount] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedOpportunity(null);
      setSelectedWarrior1(null);
      setSelectedWarrior2(null);
      setStakeAmount('10');
      setError(null);
    }
  }, [isOpen]);

  // Handlers
  const handleOpportunitySelect = (opportunity: ArbitrageOpportunity) => {
    setSelectedOpportunity(opportunity);
    setError(null);
    setStep(2); // Auto-advance to warrior selection
  };

  const handleWarriorSelect = (warrior1: Warrior | null, warrior2: Warrior | null) => {
    setSelectedWarrior1(warrior1);
    setSelectedWarrior2(warrior2);
    setError(null);
  };

  const handleNext = () => {
    // Validate current step
    if (step === 1 && !selectedOpportunity) {
      setError('Please select an arbitrage opportunity');
      return;
    }
    if (step === 2 && (!selectedWarrior1 || !selectedWarrior2)) {
      setError('Please select 2 warriors');
      return;
    }
    if (step === 3) {
      const stake = parseFloat(stakeAmount);
      if (isNaN(stake) || stake <= 0) {
        setError('Please enter a valid stake amount (min 0.1 CRwN)');
        return;
      }
      if (stake < 0.1) {
        setError('Minimum stake is 0.1 CRwN');
        return;
      }
    }

    setError(null);
    setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    setStep(step - 1);
  };

  const handleCreateBattle = async () => {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }
    if (!selectedOpportunity || !selectedWarrior1 || !selectedWarrior2) {
      setError('Missing required information');
      return;
    }

    const stake = parseFloat(stakeAmount);
    if (isNaN(stake) || stake <= 0) {
      setError('Invalid stake amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const stakeInWei = (BigInt(Math.floor(stake * 1e18))).toString();

      const response = await fetch('/api/arena/battles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warrior1Id: selectedWarrior1.id,
          warrior2Id: selectedWarrior2.id,
          warrior1Owner: address,
          externalMarketId: selectedOpportunity.polymarket.id,
          source: 'polymarket',
          question: selectedOpportunity.question,
          kalshiMarketId: selectedOpportunity.kalshi.id,
          totalStake: stakeInWei,
          isArbitrageBattle: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create arbitrage battle');
      }

      showSuccess('Arbitrage battle created successfully!');
      onSuccess(data.battle.id);
      onClose();
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const warriors_array = warriors || [];
  const hasEnoughWarriors = warriors_array.length >= 2;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Create Arbitrage Battle</h2>
                <p className="text-green-100 text-sm">Guaranteed profit through price arbitrage</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 flex items-center gap-2">
            {[1, 2, 3, 4].map((stepNum) => (
              <div key={stepNum} className="flex-1 flex items-center gap-2">
                <div
                  className={`flex-1 h-2 rounded-full transition-all ${
                    stepNum <= step
                      ? 'bg-white'
                      : 'bg-white bg-opacity-30'
                  }`}
                />
                {stepNum < 4 && (
                  <div className={`w-2 h-2 rounded-full ${stepNum < step ? 'bg-white' : 'bg-white bg-opacity-30'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step Labels */}
          <div className="mt-3 flex justify-between text-xs text-green-100">
            <span className={step === 1 ? 'font-semibold text-white' : ''}>1. Search</span>
            <span className={step === 2 ? 'font-semibold text-white' : ''}>2. Warriors</span>
            <span className={step === 3 ? 'font-semibold text-white' : ''}>3. Stake</span>
            <span className={step === 4 ? 'font-semibold text-white' : ''}>4. Review</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Step 1: Opportunity Search */}
          {step === 1 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Select an Arbitrage Opportunity
              </h3>
              <MarketSearchWithArbitrage
                onSelect={handleOpportunitySelect}
                minSpread={5}
              />
            </div>
          )}

          {/* Step 2: Warrior Selection */}
          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Select Your Warriors
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Choose 2 warriors to participate in this arbitrage battle. Both will work together
                to capture arbitrage profit while debating on opposite sides.
              </p>

              {!hasEnoughWarriors ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-yellow-800 font-medium">
                    You need at least 2 warriors to create an arbitrage battle.
                  </p>
                  <p className="text-yellow-600 text-sm mt-1">
                    You currently own {warriors_array.length} warrior{warriors_array.length !== 1 ? 's' : ''}.
                  </p>
                </div>
              ) : (
                <DualWarriorSelector
                  warriors={warriors_array}
                  warrior1={selectedWarrior1}
                  warrior2={selectedWarrior2}
                  onSelectWarriors={handleWarriorSelect}
                  disabled={loading}
                />
              )}
            </div>
          )}

          {/* Step 3: Stake Amount */}
          {step === 3 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Set Your Stake
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Enter the total amount you want to invest in this arbitrage opportunity.
              </p>

              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200 p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stake Amount (CRwN)
                </label>
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  min="0.1"
                  step="0.1"
                  className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg text-lg font-semibold focus:outline-none focus:border-blue-500"
                  placeholder="10.0"
                />
                <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                  <span>Minimum: 0.1 CRwN</span>
                  <span>Recommended: 10-100 CRwN</span>
                </div>

                {selectedOpportunity && parseFloat(stakeAmount) > 0 && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Expected Profit:</span>
                      <span className="font-bold text-green-600 text-lg">
                        +{(parseFloat(stakeAmount) * selectedOpportunity.potentialProfit / 100).toFixed(3)} CRwN
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                      <span>Profit Margin:</span>
                      <span className="font-semibold">
                        {selectedOpportunity.potentialProfit.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review & Confirm */}
          {step === 4 && selectedOpportunity && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Review Your Arbitrage Battle
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Review all details before creating the battle.
              </p>

              {/* Selected Opportunity Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Market Question</h4>
                <p className="text-gray-700">{selectedOpportunity.question}</p>
              </div>

              {/* Warriors Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Warriors</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded p-2 border border-purple-200">
                    <p className="text-xs text-gray-600">Warrior 1 (YES position)</p>
                    <p className="font-medium text-gray-900">
                      #{selectedWarrior1?.id} {selectedWarrior1?.name || ''}
                    </p>
                  </div>
                  <div className="bg-white rounded p-2 border border-blue-200">
                    <p className="text-xs text-gray-600">Warrior 2 (NO position)</p>
                    <p className="font-medium text-gray-900">
                      #{selectedWarrior2?.id} {selectedWarrior2?.name || ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Profit Preview */}
              <ArbitrageProfitPreview
                opportunity={selectedOpportunity}
                stakeAmount={stakeAmount}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-xl border-t border-gray-200 flex items-center justify-between">
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={handleBack}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:opacity-50 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
            >
              Cancel
            </button>

            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={
                  loading ||
                  (step === 1 && !selectedOpportunity) ||
                  (step === 2 && (!selectedWarrior1 || !selectedWarrior2))
                }
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCreateBattle}
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create Arbitrage Battle
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
