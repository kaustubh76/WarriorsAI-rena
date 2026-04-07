"use client";

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useVaultCreate, type VaultStep } from '@/hooks/useVaultCreate';
import { TRAIT_MAP } from '@/constants/defiTraitMapping';
import '../../home-glass.css';

const TRAIT_DISPLAY_ORDER = ['strength', 'wit', 'charisma', 'defence', 'luck'] as const;
const DEFI_LABELS: Record<string, string> = {
  alpha: 'ALPHA',
  complexity: 'COMPLX',
  momentum: 'MOMEN',
  hedge: 'HEDGE',
  timing: 'TIMING',
};

const STEP_LABELS: Record<VaultStep, string> = {
  idle: '',
  fetching_allocation: 'Analyzing strategy traits via 0G AI...',
  reviewing: 'Review your AI-generated allocation',
  approving: 'Approving CRwN tokens...',
  depositing: 'Depositing into vault...',
  recording: 'Recording vault on-chain...',
  connect_flow: 'Connect your Flow Wallet to schedule yield cycles',
  scheduling: 'Scheduling yield cycles on Flow...',
  success: 'Vault created successfully!',
  error: 'Something went wrong',
};

export default function VaultCreatePage() {
  const {
    state,
    fetchAllocation,
    approveAndDeposit,
    scheduleOnCadence,
    skipScheduling,
    reset,
    hasEnoughBalance,
    isConnected,
    isFlowConnected,
    connectFlowWallet,
  } = useVaultCreate();

  const [depositInput, setDepositInput] = useState('');
  const [selectedNft, setSelectedNft] = useState<number | null>(null);

  const handleGenerateAllocation = useCallback(() => {
    if (selectedNft === null || !depositInput) return;
    fetchAllocation(selectedNft, depositInput);
  }, [selectedNft, depositInput, fetchAllocation]);

  const handleDeposit = useCallback(() => {
    approveAndDeposit();
  }, [approveAndDeposit]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 flex items-center justify-center">
        <div className="glass-panel p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">STRATEGY VAULT</h1>
          <p className="text-gray-400">Connect your wallet to create a vault</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            CREATE STRATEGY VAULT
          </h1>
          <div className="text-sm text-gray-400">
            Balance: <span className="text-yellow-400">{Number(state.balance).toFixed(2)} CRwN</span>
          </div>
        </div>

        {/* Step 1: Select NFT */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-white mb-4">1. SELECT STRATEGY NFT</h2>
          {state.userNfts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-2">No Strategy NFTs found</p>
              <Link href="/warriorsMinter" className="text-yellow-400 hover:text-yellow-300 text-sm underline">
                Mint a Strategy NFT first &rarr;
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {state.userNfts.map((nftId) => (
                <button
                  key={nftId}
                  onClick={() => setSelectedNft(nftId)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedNft === nftId
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                  }`}
                >
                  <div className="text-center">
                    <span className="text-2xl">&#127919;</span>
                    <p className="text-white font-mono mt-1">#{nftId}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 2: Deposit Amount */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-white mb-4">2. DEPOSIT AMOUNT</h2>
          <div className="flex gap-3">
            <input
              type="number"
              value={depositInput}
              onChange={(e) => setDepositInput(e.target.value)}
              placeholder="Amount in CRwN"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
            />
            <button
              onClick={() => setDepositInput(state.balance)}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300"
            >
              MAX
            </button>
          </div>
          {depositInput && !hasEnoughBalance(depositInput) && (
            <p className="text-red-400 text-sm mt-2">Insufficient CRwN balance</p>
          )}

          <button
            onClick={handleGenerateAllocation}
            disabled={
              selectedNft === null ||
              !depositInput ||
              !hasEnoughBalance(depositInput) ||
              state.isLoading
            }
            className="w-full mt-4 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
          >
            {state.step === 'fetching_allocation' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">&#9881;&#65039;</span> Generating AI Allocation...
              </span>
            ) : (
              'Generate AI Allocation'
            )}
          </button>
        </div>

        {/* Step 3: Allocation Preview */}
        {state.allocation && state.step !== 'idle' && state.step !== 'connect_flow' && state.step !== 'success' && (
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold text-white mb-4">3. AI ALLOCATION PREVIEW</h2>

            {/* Traits */}
            {state.traits && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Strategy Traits</p>
                <div className="flex gap-2">
                  {Object.entries(state.traits).map(([key, value]) => (
                    <div key={key} className="flex-1 bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-xs text-gray-400">{DEFI_LABELS[key] || key}</p>
                      <p className="text-lg font-bold text-yellow-400">{Math.round((value as number) / 100)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Allocation Bars */}
            <div className="space-y-3 mb-4">
              <AllocationBar
                label="High-Yield Pool"
                pct={state.allocation.highYield / 100}
                apy={state.poolAPYs?.highYield}
                color="from-red-500 to-orange-500"
              />
              <AllocationBar
                label="LP Pool"
                pct={state.allocation.lp / 100}
                apy={state.poolAPYs?.lp}
                color="from-blue-500 to-cyan-500"
              />
              <AllocationBar
                label="Stable Pool"
                pct={state.allocation.stable / 100}
                apy={state.poolAPYs?.stable}
                color="from-green-500 to-emerald-500"
              />
            </div>

            {/* Projected APY + Risk */}
            <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg mb-4">
              <div>
                <p className="text-xs text-gray-500">Projected Blended APY</p>
                <p className="text-xl font-bold text-green-400">{state.projectedAPY?.toFixed(1)}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Risk Profile</p>
                <p className={`text-lg font-bold ${getRiskColor(state.riskProfile)}`}>
                  {state.riskProfile}
                </p>
              </div>
              {state.proof && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">0G Proof</p>
                  <p className="text-green-400 text-sm">&#10003; Verified</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDeposit}
                disabled={state.isLoading}
                className="flex-1 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black"
              >
                {state.step === 'approving'
                  ? 'Approving CRwN...'
                  : state.step === 'depositing'
                    ? 'Depositing...'
                    : state.step === 'recording'
                      ? 'Recording...'
                      : state.step === 'scheduling'
                        ? 'Scheduling on Flow...'
                        : `Deposit ${depositInput} CRwN`}
              </button>
              <button
                onClick={reset}
                className="px-6 py-3 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Connect Flow Wallet Step */}
        {state.step === 'connect_flow' && (
          <div className="glass-panel p-6 border-purple-500/30">
            <div className="text-center">
              <span className="text-4xl">&#128279;</span>
              <h2 className="text-xl font-bold text-purple-400 mt-2">Connect Flow Wallet</h2>
              <p className="text-gray-400 mt-2">
                Your vault deposit is confirmed on-chain!
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Connect your Flow Wallet to schedule automated yield cycles via Cadence.
              </p>
              {state.txHash && (
                <a
                  href={`https://testnet.snowtrace.io/tx/${state.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
                >
                  View deposit tx &rarr;
                </a>
              )}
              <div className="mt-6 space-y-3">
                <button
                  onClick={connectFlowWallet}
                  className="w-full py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white transition-all"
                >
                  Connect Flow Wallet
                </button>
                <button
                  onClick={skipScheduling}
                  className="text-gray-500 hover:text-gray-300 text-sm underline"
                >
                  Skip — use automated cron instead
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {state.step === 'success' && (
          <div className="glass-panel p-6 border-green-500/30">
            <div className="text-center">
              <span className="text-4xl">&#127974;</span>
              <h2 className="text-xl font-bold text-green-400 mt-2">Vault Created!</h2>
              <p className="text-gray-400 mt-1">
                Strategy #{state.selectedNftId} is now managing {state.depositAmount} CRwN
              </p>
              {state.txHash && (
                <a
                  href={`https://testnet.snowtrace.io/tx/${state.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
                >
                  View deposit tx &rarr;
                </a>
              )}
              {state.schedulingTxHash && (
                <a
                  href={`https://testnet.snowtrace.io/tx/${state.schedulingTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 text-sm mt-1 inline-block"
                >
                  View Cadence schedule tx &rarr;
                </a>
              )}
              <p className="text-gray-500 text-sm mt-3">
                {state.schedulingTxHash
                  ? 'First yield cycle will execute in 24 hours via Flow Scheduled Transaction'
                  : 'First yield cycle will execute in 24 hours via automated cron'}
              </p>
              <button
                onClick={reset}
                className="mt-4 px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
              >
                Create Another Vault
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {state.step === 'error' && state.error && (
          <div className="glass-panel p-4 border-red-500/30">
            <p className="text-red-400 text-sm">{state.error}</p>
            <button onClick={reset} className="mt-2 text-gray-400 hover:text-white text-sm underline">
              Try again
            </button>
          </div>
        )}

        {/* Status label */}
        {state.isLoading && (
          <p className="text-center text-gray-500 text-sm animate-pulse">
            {STEP_LABELS[state.step]}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Components ─────────────────────────────────────────

function AllocationBar({
  label,
  pct,
  apy,
  color,
}: {
  label: string;
  pct: number;
  apy?: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">
          {pct.toFixed(1)}%{apy !== undefined && ` · ${apy.toFixed(1)}% APY`}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-3">
        <div
          className={`h-3 rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function getRiskColor(profile: string | null): string {
  switch (profile) {
    case 'AGGRESSIVE': return 'text-red-400';
    case 'CONSERVATIVE': return 'text-green-400';
    case 'COMPLEX': return 'text-purple-400';
    case 'REACTIVE': return 'text-blue-400';
    default: return 'text-yellow-400';
  }
}
