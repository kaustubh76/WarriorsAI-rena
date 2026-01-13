'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { useAgentTokenBalance, useMinStakeRequirements, useZeroGTokenBalance } from '@/hooks/useAgents';
import { useMintINFT } from '@/hooks/useAgentINFT';
import { type AgentStrategy, type RiskProfile, type Specialization, type PersonaTraits } from '@/services/aiAgentService';
import { INFTBadge } from '@/components/agents/INFTBadge';
import { chainsToContracts, AIAgentRegistryAbi, crownTokenAbi, getChainId } from '@/constants';

export default function CreateAgentPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { balance, balanceFormatted } = useAgentTokenBalance(); // Flow CRwN (for trading)
  const { balance: zeroGBalance, balanceFormatted: zeroGBalanceFormatted } = useZeroGTokenBalance(); // 0G CRwN (for iNFT staking)
  const { requirementsFormatted } = useMinStakeRequirements();
  const { mint: mintINFT, isMinting, error: mintError } = useMintINFT();

  // Legacy registry contract addresses (Flow Testnet)
  const chainId = getChainId();
  const contracts = chainsToContracts[chainId];
  const crownTokenAddress = contracts.crownToken as `0x${string}`;
  const aiAgentRegistryAddress = contracts.aiAgentRegistry as `0x${string}`;

  // Legacy registry: Approve stake
  const {
    writeContractAsync: approveAsync,
    data: approveTxHash,
    isPending: isApproving,
    error: approveError
  } = useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Legacy registry: Register agent
  const {
    writeContractAsync: registerAsync,
    data: registerTxHash,
    isPending: isRegistering,
    error: registerError
  } = useWriteContract();

  const { isSuccess: registerSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: registerTxHash,
  });

  // Combined state for UI
  const isPending = isMinting || isApproving || isRegistering;
  const isSuccess = registerSuccess;
  const error = mintError || approveError || registerError;

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
    // Strategy-specific parameters
    strategyParams: {
      minConfidence: 60, // Minimum confidence to execute trade (0-100)
      lookbackPeriod: 5, // Number of past battles to analyze
      marketFocus: 'all' as 'all' | 'main' | 'micro', // Which markets to target
    },
    strategyWeights: {
      traitAnalysis: 40, // Weight for trait-based prediction
      historicalData: 30, // Weight for historical performance
      marketSentiment: 20, // Weight for current market odds
      randomVariance: 10, // Allow some variance for unpredictability
    },
    // Trading limits (separate from stake)
    tradingLimits: {
      maxPositionSize: '10', // Max per-trade size in CRwN
      maxDailyTrades: 10, // Maximum trades per day
      maxDailyExposure: '50', // Max total exposure per day in CRwN
    },
    stakeAmount: '1', // Default to minimum (1 CRwN for NOVICE tier on 0G)
    enableCopyTrading: true,
    copyTradeFee: 100, // 1%
    mintAsINFT: true // New: Create as iNFT by default
  });

  const [needsApproval, setNeedsApproval] = useState(true);
  const [mintStep, setMintStep] = useState<'idle' | 'encrypting' | 'uploading' | 'minting' | 'success'>('idle');

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Approve CRwN for staking
  const approveStake = async (amount: string) => {
    const amountWei = parseEther(amount);
    await approveAsync({
      address: crownTokenAddress,
      abi: crownTokenAbi,
      functionName: 'approve',
      args: [aiAgentRegistryAddress, amountWei]
    });
  };

  // Register agent on legacy registry
  const registerAgent = async (data: typeof formData) => {
    const amountWei = parseEther(data.stakeAmount);
    await registerAsync({
      address: aiAgentRegistryAddress,
      abi: AIAgentRegistryAbi,
      functionName: 'registerAgent',
      args: [
        data.name,
        data.description,
        data.strategy,
        data.riskProfile,
        data.specialization,
        {
          patience: data.personaTraits.patience,
          conviction: data.personaTraits.conviction,
          contrarian: data.personaTraits.contrarian,
          momentum: data.personaTraits.momentum
        },
        amountWei
      ]
    });
  };

  const handleApprove = async () => {
    await approveStake(formData.stakeAmount);
    setNeedsApproval(false);
  };

  // Check if user has enough 0G CRwN for staking
  const stakeAmountWei = BigInt(Math.floor(parseFloat(formData.stakeAmount || '0') * 1e18));
  const hasEnough0GBalance = zeroGBalance >= stakeAmountWei;
  const insufficientBalanceError = formData.mintAsINFT && !hasEnough0GBalance && parseFloat(formData.stakeAmount) > 0;

  const handleCreate = async () => {
    if (formData.mintAsINFT) {
      // Validate 0G CRwN balance before attempting mint
      if (!hasEnough0GBalance) {
        alert(`Insufficient CRwN on 0G chain!\n\nYou have: ${zeroGBalanceFormatted} CRwN\nRequired: ${formData.stakeAmount} CRwN\n\nPlease get more CRwN tokens on 0G Galileo testnet.`);
        return;
      }

      // Mint as iNFT with encrypted metadata
      try {
        setMintStep('encrypting');

        const metadata = {
          version: '1.0' as const,
          name: formData.name,
          description: formData.description,
          strategy: {
            type: formData.strategy,
            parameters: {
              minConfidence: formData.strategyParams.minConfidence,
              lookbackPeriod: formData.strategyParams.lookbackPeriod,
              marketFocus: formData.strategyParams.marketFocus,
            },
            weights: [
              formData.strategyWeights.traitAnalysis,
              formData.strategyWeights.historicalData,
              formData.strategyWeights.marketSentiment,
              formData.strategyWeights.randomVariance,
            ]
          },
          traits: formData.personaTraits,
          riskProfile: formData.riskProfile,
          specialization: formData.specialization,
          executionConfig: {
            tradingLimits: {
              maxPositionSize: formData.tradingLimits.maxPositionSize,
              maxDailyTrades: formData.tradingLimits.maxDailyTrades,
            }
          },
          encryptedAt: Date.now(),
          encryptionVersion: '1.0',
        };

        setMintStep('minting');
        // Convert stakeAmount string to bigint (in wei)
        const stakeAmountWei = BigInt(Math.floor(parseFloat(formData.stakeAmount) * 1e18));
        const result = await mintINFT(
          metadata,
          stakeAmountWei,
          formData.enableCopyTrading
        );

        if (result) {
          setMintStep('success');
          // Force refresh agents list to ensure newly minted iNFT appears
          console.log('[CreateAgent] Mint successful, triggering agents refresh...');
          await fetch('/api/agents?refresh=true');
          setTimeout(() => router.push('/ai-agents'), 2000);
        }
      } catch (err) {
        console.error('iNFT minting failed:', err);
        setMintStep('idle');
      }
    } else {
      // Legacy registry-based creation
      if (needsApproval) {
        await handleApprove();
        // After approval, user needs to click again to register
        return;
      }

      try {
        await registerAgent(formData);
        // Navigation happens via useEffect when registerSuccess becomes true
      } catch (err) {
        console.error('Legacy agent registration failed:', err);
      }
    }
  };

  // Navigate on successful legacy registration
  React.useEffect(() => {
    if (registerSuccess) {
      router.push('/ai-agents');
    }
  }, [registerSuccess, router]);

  // Reset needsApproval after successful approval
  React.useEffect(() => {
    if (approveSuccess) {
      setNeedsApproval(false);
    }
  }, [approveSuccess]);

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

              {/* Advanced Strategy Configuration */}
              <div className="pt-4 border-t border-gray-700">
                <h3 className="text-sm font-medium text-white mb-4">Strategy Parameters</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Min Confidence (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.strategyParams.minConfidence}
                      onChange={(e) => setFormData({
                        ...formData,
                        strategyParams: { ...formData.strategyParams, minConfidence: Number(e.target.value) }
                      })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Only trade when AI confidence exceeds this</p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Lookback Period</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={formData.strategyParams.lookbackPeriod}
                      onChange={(e) => setFormData({
                        ...formData,
                        strategyParams: { ...formData.strategyParams, lookbackPeriod: Number(e.target.value) }
                      })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Past battles to analyze</p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs text-gray-400 mb-1">Market Focus</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'all', label: 'All Markets' },
                      { value: 'main', label: 'Main Only' },
                      { value: 'micro', label: 'Micro Only' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setFormData({
                          ...formData,
                          strategyParams: { ...formData.strategyParams, marketFocus: option.value as 'all' | 'main' | 'micro' }
                        })}
                        className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                          formData.strategyParams.marketFocus === option.value
                            ? 'border-purple-500 bg-purple-500/10 text-white'
                            : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <h3 className="text-sm font-medium text-white mt-6 mb-4">Analysis Weights</h3>
                <p className="text-xs text-gray-500 mb-3">How your agent weighs different factors (must sum to 100)</p>

                {[
                  { key: 'traitAnalysis', label: 'Trait Analysis', desc: 'Warrior stats comparison' },
                  { key: 'historicalData', label: 'Historical Data', desc: 'Past battle performance' },
                  { key: 'marketSentiment', label: 'Market Sentiment', desc: 'Current betting odds' },
                  { key: 'randomVariance', label: 'Random Variance', desc: 'Unpredictability factor' }
                ].map((weight) => (
                  <div key={weight.key} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300">{weight.label}</span>
                      <span className="text-gray-400">{formData.strategyWeights[weight.key as keyof typeof formData.strategyWeights]}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formData.strategyWeights[weight.key as keyof typeof formData.strategyWeights]}
                      onChange={(e) => setFormData({
                        ...formData,
                        strategyWeights: {
                          ...formData.strategyWeights,
                          [weight.key]: Number(e.target.value)
                        }
                      })}
                      className="w-full accent-purple-500 h-1"
                    />
                    <p className="text-xs text-gray-600">{weight.desc}</p>
                  </div>
                ))}

                {/* Weight sum warning */}
                {Object.values(formData.strategyWeights).reduce((a, b) => a + b, 0) !== 100 && (
                  <p className="text-xs text-yellow-500 mt-2">
                    ⚠ Weights sum to {Object.values(formData.strategyWeights).reduce((a, b) => a + b, 0)}% (should be 100%)
                  </p>
                )}
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

              {/* iNFT Toggle */}
              <div className="p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <INFTBadge size="md" />
                    <div>
                      <p className="text-white font-medium">Mint as iNFT</p>
                      <p className="text-xs text-gray-400">ERC-7857 compliant with encrypted metadata</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.mintAsINFT}
                      onChange={(e) => setFormData({ ...formData, mintAsINFT: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-blue-500"></div>
                  </label>
                </div>
                {formData.mintAsINFT && (
                  <div className="mt-3 pt-3 border-t border-purple-500/20">
                    <ul className="text-xs text-gray-400 space-y-1">
                      <li className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        True ownership via NFT
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Encrypted strategy & persona
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Secure transfer with re-encryption
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        AIverse marketplace compatible
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Stake Amount (CRwN)</label>
                <input
                  type="number"
                  value={formData.stakeAmount}
                  onChange={(e) => setFormData({ ...formData, stakeAmount: e.target.value })}
                  className={`w-full bg-gray-800 border rounded-lg px-4 py-3 text-white focus:outline-none ${
                    insufficientBalanceError
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-700 focus:border-purple-500'
                  }`}
                  min={requirementsFormatted[0]}
                />
                {formData.mintAsINFT ? (
                  <div className="mt-2 space-y-1">
                    <p className={`text-xs ${insufficientBalanceError ? 'text-red-400' : 'text-gray-500'}`}>
                      0G Balance: {zeroGBalanceFormatted} CRwN {insufficientBalanceError && '(Insufficient!)'}
                    </p>
                    {insufficientBalanceError && (
                      <p className="text-xs text-red-400">
                        You need {formData.stakeAmount} CRwN on 0G Galileo testnet to mint this iNFT.
                      </p>
                    )}
                    <p className="text-xs text-gray-600">
                      Min: {requirementsFormatted[0]} CRwN | iNFT staking uses 0G chain CRwN
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    Flow Balance: {balanceFormatted} CRwN | Min: {requirementsFormatted[0]} CRwN
                  </p>
                )}
              </div>

              {/* Trading Limits Configuration */}
              <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                <h3 className="text-sm font-medium text-white mb-3">Trading Limits</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Max Position (CRwN)</label>
                    <input
                      type="number"
                      value={formData.tradingLimits.maxPositionSize}
                      onChange={(e) => setFormData({
                        ...formData,
                        tradingLimits: { ...formData.tradingLimits, maxPositionSize: e.target.value }
                      })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-purple-500"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Max Daily Trades</label>
                    <input
                      type="number"
                      value={formData.tradingLimits.maxDailyTrades}
                      onChange={(e) => setFormData({
                        ...formData,
                        tradingLimits: { ...formData.tradingLimits, maxDailyTrades: Number(e.target.value) }
                      })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-purple-500"
                      min="1"
                      max="100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Daily Exposure (CRwN)</label>
                    <input
                      type="number"
                      value={formData.tradingLimits.maxDailyExposure}
                      onChange={(e) => setFormData({
                        ...formData,
                        tradingLimits: { ...formData.tradingLimits, maxDailyExposure: e.target.value }
                      })}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-purple-500"
                      min="1"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  These limits control your agent&apos;s trading behavior
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
                    <span className="text-gray-400">Type</span>
                    <span className="text-white flex items-center gap-2">
                      {formData.mintAsINFT ? (
                        <>
                          <INFTBadge size="sm" />
                          <span>iNFT (ERC-7857)</span>
                        </>
                      ) : (
                        'Registry Agent'
                      )}
                    </span>
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

              {/* iNFT Minting Progress */}
              {mintStep !== 'idle' && formData.mintAsINFT && (
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    {mintStep === 'success' ? (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    <div>
                      <p className="text-white font-medium">
                        {mintStep === 'encrypting' && 'Encrypting metadata...'}
                        {mintStep === 'uploading' && 'Uploading to 0G Storage...'}
                        {mintStep === 'minting' && 'Minting iNFT...'}
                        {mintStep === 'success' && 'iNFT Created Successfully!'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {mintStep === 'encrypting' && 'Your strategy and persona are being encrypted'}
                        {mintStep === 'uploading' && 'Storing encrypted data on 0G decentralized storage'}
                        {mintStep === 'minting' && 'Confirm the transaction in your wallet'}
                        {mintStep === 'success' && 'Redirecting to your agents...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {(error || mintError) && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {mintError?.message || (error as Error)?.message || 'Transaction failed'}
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
                disabled={isPending || isConfirming || isMinting || mintStep !== 'idle' || insufficientBalanceError}
                className={`flex-1 px-6 py-3 text-white rounded-lg transition-colors disabled:opacity-50 ${
                  insufficientBalanceError
                    ? 'bg-red-600/50 cursor-not-allowed'
                    : formData.mintAsINFT
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500'
                    : 'bg-purple-600 hover:bg-purple-500'
                }`}
              >
                {insufficientBalanceError ? (
                  'Insufficient 0G CRwN'
                ) : formData.mintAsINFT ? (
                  isMinting || mintStep !== 'idle'
                    ? mintStep === 'success'
                      ? 'Created!'
                      : 'Minting iNFT...'
                    : 'Mint iNFT Agent'
                ) : (
                  isPending || isConfirming
                    ? 'Processing...'
                    : needsApproval
                    ? 'Approve CRwN'
                    : 'Create Agent'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
