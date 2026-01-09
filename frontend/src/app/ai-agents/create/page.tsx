'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useRegisterAgent } from '@/hooks/useCopyTrade';
import { useAgentTokenBalance, useMinStakeRequirements } from '@/hooks/useAgents';
import { type AgentStrategy, type RiskProfile, type Specialization, type PersonaTraits } from '@/services/aiAgentService';

export default function CreateAgentPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { balance, balanceFormatted } = useAgentTokenBalance();
  const { requirementsFormatted } = useMinStakeRequirements();
  const { approveStake, registerAgent, isPending, isConfirming, isSuccess, error } = useRegisterAgent();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    strategy: 0 as AgentStrategy,
    riskProfile: 1 as RiskProfile,
    specialization: 0 as Specialization,
    personaTraits: {
      patience: 50,
      conviction: 50,
      contrarian: 50,
      momentum: 50
    } as PersonaTraits,
    stakeAmount: '100',
    enableCopyTrading: true,
    copyTradeFee: 100 // 1%
  });

  const [needsApproval, setNeedsApproval] = useState(true);

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleApprove = async () => {
    await approveStake(formData.stakeAmount);
    setNeedsApproval(false);
  };

  const handleCreate = async () => {
    if (needsApproval) {
      await handleApprove();
      return;
    }

    await registerAgent(formData);

    if (isSuccess) {
      router.push('/ai-agents');
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-6">Please connect your wallet to create an AI agent.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-12">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Back Link */}
        <Link href="/ai-agents" className="text-gray-400 hover:text-white mb-6 inline-block">
          &lt; Back to Agents
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Create AI Agent</h1>
        <p className="text-gray-400 mb-8">Build your own autonomous trading agent</p>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s <= step
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400'
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div className={`w-12 h-1 ${s < step ? 'bg-purple-600' : 'bg-gray-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-8 border border-gray-700">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Basic Information</h2>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Agent Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  placeholder="The Oracle"
                  maxLength={32}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 h-32"
                  placeholder="Describe your agent's strategy and approach..."
                  maxLength={256}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Strategy & Risk</h2>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Trading Strategy</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 0, label: 'Superforecaster', desc: 'Historical analysis & probability' },
                    { value: 1, label: 'Warrior Analyst', desc: 'Trait-based prediction' },
                    { value: 2, label: 'Trend Follower', desc: 'Momentum-based trading' },
                    { value: 3, label: 'Mean Reversion', desc: 'Counter-trend strategies' },
                    { value: 4, label: 'Micro Specialist', desc: 'Round & move markets' },
                    { value: 5, label: 'Custom', desc: 'Custom strategy' }
                  ].map((strategy) => (
                    <button
                      key={strategy.value}
                      onClick={() => setFormData({ ...formData, strategy: strategy.value as AgentStrategy })}
                      className={`p-4 rounded-lg border text-left transition-all ${
                        formData.strategy === strategy.value
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                      }`}
                    >
                      <p className="text-white font-medium">{strategy.label}</p>
                      <p className="text-xs text-gray-400">{strategy.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Risk Profile</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 0, label: 'Conservative', color: 'green' },
                    { value: 1, label: 'Moderate', color: 'yellow' },
                    { value: 2, label: 'Aggressive', color: 'red' }
                  ].map((risk) => (
                    <button
                      key={risk.value}
                      onClick={() => setFormData({ ...formData, riskProfile: risk.value as RiskProfile })}
                      className={`p-4 rounded-lg border text-center transition-all ${
                        formData.riskProfile === risk.value
                          ? `border-${risk.color}-500 bg-${risk.color}-500/10`
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                      }`}
                    >
                      <p className="text-white font-medium">{risk.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Specialization</label>
                <select
                  value={formData.specialization}
                  onChange={(e) => setFormData({ ...formData, specialization: Number(e.target.value) as Specialization })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="0">Battle Outcomes</option>
                  <option value="1">Round Markets</option>
                  <option value="2">Move Predictions</option>
                  <option value="3">Damage Thresholds</option>
                  <option value="4">All Markets</option>
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Persona Traits</h2>
              <p className="text-gray-400 text-sm mb-6">
                Customize your agent&apos;s trading personality
              </p>

              {[
                { key: 'patience', label: 'Patience', low: 'Aggressive', high: 'Patient' },
                { key: 'conviction', label: 'Conviction', low: 'Cautious', high: 'Bold' },
                { key: 'contrarian', label: 'Contrarian', low: 'Follows Crowd', high: 'Contrarian' },
                { key: 'momentum', label: 'Momentum', low: 'Reversal', high: 'Momentum' }
              ].map((trait) => (
                <div key={trait.key}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-white">{trait.label}</span>
                    <span className="text-gray-400">{formData.personaTraits[trait.key as keyof PersonaTraits]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formData.personaTraits[trait.key as keyof PersonaTraits]}
                    onChange={(e) => setFormData({
                      ...formData,
                      personaTraits: {
                        ...formData.personaTraits,
                        [trait.key]: Number(e.target.value)
                      }
                    })}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{trait.low}</span>
                    <span>{trait.high}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-white mb-4">Stake & Launch</h2>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Stake Amount (CRwN)</label>
                <input
                  type="number"
                  value={formData.stakeAmount}
                  onChange={(e) => setFormData({ ...formData, stakeAmount: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  min={requirementsFormatted[0]}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Balance: {balanceFormatted} CRwN | Min: {requirementsFormatted[0]} CRwN
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.enableCopyTrading}
                  onChange={(e) => setFormData({ ...formData, enableCopyTrading: e.target.checked })}
                  className="w-5 h-5 rounded bg-gray-800 border-gray-700"
                />
                <label className="text-white">Enable Copy Trading</label>
              </div>

              {formData.enableCopyTrading && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Copy Trade Fee (%)</label>
                  <input
                    type="number"
                    value={formData.copyTradeFee / 100}
                    onChange={(e) => setFormData({ ...formData, copyTradeFee: Number(e.target.value) * 100 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                    min="0"
                    max="10"
                    step="0.1"
                  />
                </div>
              )}

              {/* Summary */}
              <div className="bg-gray-800/50 rounded-lg p-4 mt-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name</span>
                    <span className="text-white">{formData.name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Strategy</span>
                    <span className="text-white">{['Superforecaster', 'Warrior Analyst', 'Trend Follower', 'Mean Reversion', 'Micro Specialist', 'Custom'][formData.strategy]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Risk</span>
                    <span className="text-white">{['Conservative', 'Moderate', 'Aggressive'][formData.riskProfile]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stake</span>
                    <span className="text-white">{formData.stakeAmount} CRwN</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {(error as Error).message || 'Transaction failed'}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-4 mt-8">
            {step > 1 && (
              <button
                onClick={handleBack}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={step === 1 && (!formData.name || !formData.description)}
                className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={isPending || isConfirming}
                className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50"
              >
                {isPending || isConfirming
                  ? 'Processing...'
                  : needsApproval
                  ? 'Approve CRwN'
                  : 'Create Agent'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
