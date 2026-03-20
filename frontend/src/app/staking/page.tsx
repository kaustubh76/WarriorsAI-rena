'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { useStaking } from '@/hooks/useStaking';
import Link from 'next/link';

// ── Helpers ──────────────────────────────
function formatCRwN(weiStr: string | null): string {
  if (!weiStr || weiStr === '0') return '0.00';
  return Number(formatEther(BigInt(weiStr))).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function formatRate(rateStr: string | null): string {
  if (!rateStr) return '1.0000';
  // Rate is scaled by 1e18
  const rate = Number(BigInt(rateStr)) / 1e18;
  return rate.toFixed(4);
}

function formatBoostLabel(bps: number): string {
  if (bps <= 10000) return 'None';
  return `${(bps / 10000).toFixed(2)}x`;
}

function rankFromBoost(bps: number): string {
  if (bps >= 30000) return 'PLATINUM';
  if (bps >= 20000) return 'GOLD';
  if (bps >= 15000) return 'SILVER';
  if (bps >= 12500) return 'BRONZE';
  return 'UNRANKED';
}

function formatCountdown(unlockTime: number): string {
  const now = Date.now() / 1000;
  const remaining = unlockTime - now;
  if (remaining <= 0) return 'Ready to claim';
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

// ── Boost Tier Display ──────────────────────────
const BOOST_TIERS = [
  { rank: 'BRONZE', bps: 12500, label: '1.25x' },
  { rank: 'SILVER', bps: 15000, label: '1.50x' },
  { rank: 'GOLD', bps: 20000, label: '2.00x' },
  { rank: 'PLATINUM', bps: 30000, label: '3.00x' },
];

// ── Page ──────────────────────────────
export default function StakingPage() {
  const { address, isConnected } = useAccount();
  const staking = useStaking();

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [warriorNftId, setWarriorNftId] = useState('');

  // ── Actions ──────────────────────────
  const handleStake = async () => {
    if (!stakeAmount || Number(stakeAmount) <= 0) return;
    const ok = await staking.stake(stakeAmount);
    if (ok) setStakeAmount('');
  };

  const handleRequestUnstake = async () => {
    if (!unstakeAmount || Number(unstakeAmount) <= 0) return;
    const ok = await staking.requestUnstake(unstakeAmount);
    if (ok) setUnstakeAmount('');
  };

  const handleStakeWarrior = async () => {
    const id = parseInt(warriorNftId);
    if (isNaN(id) || id <= 0) return;
    const ok = await staking.stakeWarrior(id);
    if (ok) setWarriorNftId('');
  };

  if (!staking.isStakingDeployed) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-2xl mx-auto text-center py-20">
          <h1 className="text-3xl font-bold mb-4">CRwN Staking</h1>
          <p className="text-gray-400">Staking contracts are not yet deployed. Check back soon.</p>
          <Link href="/arena" className="text-amber-400 hover:underline mt-4 inline-block">
            Back to Arena
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">CRwN Staking</h1>
            <p className="text-gray-400 text-sm mt-1">
              Stake CRwN to earn protocol fees. Boost with Warrior NFTs.
            </p>
          </div>
          <Link href="/arena" className="text-gray-400 hover:text-white text-sm">
            Back to Arena
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Value Locked" value={`${formatCRwN(staking.totalStaked)} CRwN`} />
          <StatCard label="Exchange Rate" value={`1 stCRwN = ${formatRate(staking.exchangeRate)} CRwN`} />
          <StatCard
            label="Your Position"
            value={isConnected ? `${formatCRwN(staking.userStakedBalance)} CRwN` : '--'}
          />
          <StatCard
            label="stCRwN Balance"
            value={isConnected ? `${formatCRwN(staking.userStCrwnBalance)} stCRwN` : '--'}
          />
        </div>

        {/* Error */}
        {staking.error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {staking.error}
          </div>
        )}

        {!isConnected ? (
          <div className="bg-gray-900 rounded-xl p-8 text-center border border-gray-800">
            <p className="text-gray-400">Connect your wallet to stake CRwN</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Stake Panel */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-4">
              <h2 className="text-lg font-semibold text-amber-400">Stake CRwN</h2>
              <p className="text-gray-400 text-xs">
                Deposit CRwN and receive stCRwN at the current exchange rate.
                Protocol fees automatically increase the stCRwN value.
              </p>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Amount (CRwN)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              {stakeAmount && Number(stakeAmount) > 0 && staking.exchangeRate && (
                <p className="text-xs text-gray-400">
                  You&apos;ll receive ~{(Number(stakeAmount) / Number(formatRate(staking.exchangeRate))).toFixed(4)} stCRwN
                </p>
              )}
              <button
                onClick={handleStake}
                disabled={staking.isStaking || !stakeAmount || Number(stakeAmount) <= 0}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {staking.isStaking ? 'Staking...' : 'Approve & Stake'}
              </button>
            </div>

            {/* Unstake Panel */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-4">
              <h2 className="text-lg font-semibold text-blue-400">Unstake</h2>

              {staking.unstakeRequest ? (
                <div className="space-y-3">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-sm text-gray-400">Pending Unstake</p>
                    <p className="text-lg font-mono text-white">
                      {formatCRwN(staking.unstakeRequest.crwnAmount)} CRwN
                    </p>
                    <p className={`text-xs mt-1 ${staking.canCompleteUnstake ? 'text-green-400' : 'text-yellow-400'}`}>
                      {formatCountdown(staking.unstakeRequest.unlockTime)}
                    </p>
                  </div>
                  <button
                    onClick={() => staking.completeUnstake()}
                    disabled={!staking.canCompleteUnstake || staking.isUnstaking}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    {staking.isUnstaking ? 'Completing...' : staking.canCompleteUnstake ? 'Complete Unstake' : 'Cooldown Active'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-gray-400 text-xs">
                    Request unstake to start a 7-day cooldown. After cooldown, claim your CRwN.
                  </p>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Amount (stCRwN)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={unstakeAmount}
                      onChange={(e) => setUnstakeAmount(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleRequestUnstake}
                    disabled={staking.isUnstaking || !unstakeAmount || Number(unstakeAmount) <= 0}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    {staking.isUnstaking ? 'Processing...' : 'Request Unstake'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warrior Boost Panel */}
        {isConnected && (
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-4">
            <h2 className="text-lg font-semibold text-purple-400">Warrior NFT Boost</h2>
            <p className="text-gray-400 text-xs">
              Stake a Warrior NFT to multiply your staking yield based on rank.
            </p>

            {/* Boost tiers */}
            <div className="grid grid-cols-4 gap-2">
              {BOOST_TIERS.map((tier) => (
                <div
                  key={tier.rank}
                  className={`text-center p-2 rounded-lg border ${
                    staking.warriorBoost && rankFromBoost(staking.warriorBoost.boostBps) === tier.rank
                      ? 'border-purple-500 bg-purple-900/30'
                      : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  <p className="text-xs text-gray-400">{tier.rank}</p>
                  <p className="text-sm font-bold text-white">{tier.label}</p>
                </div>
              ))}
            </div>

            {staking.warriorBoost ? (
              <div className="flex items-center justify-between bg-gray-800 rounded-lg p-4">
                <div>
                  <p className="text-sm text-gray-400">Active Boost</p>
                  <p className="text-white font-semibold">
                    Warrior #{staking.warriorBoost.nftId} — {rankFromBoost(staking.warriorBoost.boostBps)} ({formatBoostLabel(staking.warriorBoost.boostBps)})
                  </p>
                </div>
                <button
                  onClick={() => staking.unstakeWarrior()}
                  disabled={staking.isStaking}
                  className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  {staking.isStaking ? 'Processing...' : 'Unstake NFT'}
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Warrior NFT ID</label>
                  <input
                    type="number"
                    placeholder="e.g. 42"
                    value={warriorNftId}
                    onChange={(e) => setWarriorNftId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <button
                  onClick={handleStakeWarrior}
                  disabled={staking.isStaking || !warriorNftId}
                  className="self-end bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
                >
                  {staking.isStaking ? '...' : 'Stake NFT'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card Component ──────────────────────────
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white truncate">{value}</p>
    </div>
  );
}
