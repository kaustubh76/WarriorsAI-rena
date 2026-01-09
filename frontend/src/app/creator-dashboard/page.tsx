'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { useCreatorDashboard, useRevenueHistory, useGlobalCreatorStats, useAllTierInfo } from '@/hooks/useCreatorRevenue';
import { CreatorRevenueCard, TierProgressCard, ClaimRewardsButton } from '@/components/creator';

export default function CreatorDashboardPage() {
  const { isConnected } = useAccount();
  const {
    creator,
    isRegistered,
    stats,
    breakdown,
    loading,
    error
  } = useCreatorDashboard();
  const { history } = useRevenueHistory();
  const { totalCreators, totalFeesDistributedFormatted } = useGlobalCreatorStats();
  const { tiers } = useAllTierInfo();

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-6">Please connect your wallet to view your creator dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-800 rounded w-1/3 mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-96 bg-gray-800 rounded-xl" />
              <div className="h-96 bg-gray-800 rounded-xl" />
              <div className="h-96 bg-gray-800 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="text-center py-16">
            <h1 className="text-3xl font-bold text-white mb-4">Become a Creator</h1>
            <p className="text-gray-400 max-w-lg mx-auto mb-8">
              Join {totalCreators} creators earning from prediction markets.
              Create markets, warriors, or operate AI agents to earn fees.
            </p>

            {/* Creator Benefits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-12">
              <div className="bg-gray-900 rounded-xl p-6">
                <div className="text-3xl mb-4">*</div>
                <h3 className="text-white font-medium mb-2">Market Creator</h3>
                <p className="text-gray-400 text-sm">Earn 2% of trading volume on markets you create</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-6">
                <div className="text-3xl mb-4">*</div>
                <h3 className="text-white font-medium mb-2">Warrior Creator</h3>
                <p className="text-gray-400 text-sm">Earn 1% when users bet on warriors you mint</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-6">
                <div className="text-3xl mb-4">*</div>
                <h3 className="text-white font-medium mb-2">Agent Operator</h3>
                <p className="text-gray-400 text-sm">Earn 0.5% from copy-trade volume</p>
              </div>
            </div>

            {/* Tier Roadmap */}
            <div className="bg-gray-900 rounded-xl p-8 max-w-2xl mx-auto mb-8">
              <h3 className="text-xl font-semibold text-white mb-6">Creator Tiers</h3>
              <div className="space-y-4">
                {tiers.map((tier) => (
                  <div key={tier.tier} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                      tier.color === 'bronze' ? 'bg-orange-500/20' :
                      tier.color === 'silver' ? 'bg-gray-400/20' :
                      tier.color === 'gold' ? 'bg-yellow-500/20' :
                      tier.color === 'platinum' ? 'bg-cyan-500/20' :
                      'bg-purple-500/20'
                    }`}>
                      {tier.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">{tier.label}</p>
                      <p className="text-xs text-gray-500">{tier.benefits[0]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-gray-500 text-sm">
              Start creating markets or minting warriors to become a creator automatically
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pt-24 pb-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Creator Dashboard</h1>
          <p className="text-gray-400">Track your earnings and manage your creator profile</p>
        </div>

        {/* Global Stats */}
        <div className="grid grid-cols-2 gap-4 max-w-md mb-8">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-2xl font-bold text-white">{totalCreators}</p>
            <p className="text-sm text-gray-400">Total Creators</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-2xl font-bold text-white">{totalFeesDistributedFormatted}</p>
            <p className="text-sm text-gray-400">Total Distributed</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Revenue */}
          <div className="lg:col-span-2 space-y-8">
            {creator && <CreatorRevenueCard creator={creator} breakdown={breakdown} />}

            {/* Revenue History */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Revenue History</h3>
              {history.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No revenue history yet</p>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 10).map((entry, index) => (
                    <div key={index} className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">
                      <div>
                        <p className="text-white">{entry.sourceLabel}</p>
                        <p className="text-xs text-gray-500">{entry.dateFormatted}</p>
                      </div>
                      <p className="text-green-400 font-medium">+{entry.amountFormatted} CRwN</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Tier & Claim */}
          <div className="space-y-8">
            {creator && <TierProgressCard creator={creator} />}
            <ClaimRewardsButton />
          </div>
        </div>

        {/* Creator Stats */}
        {stats && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Earnings" value={`${Number(stats.totalEarnings) / 1e18} CRwN`} />
            <StatCard label="Weekly Earnings" value={`${Number(stats.weeklyEarnings) / 1e18} CRwN`} />
            <StatCard label="Monthly Earnings" value={`${Number(stats.monthlyEarnings) / 1e18} CRwN`} />
            <StatCard label="Assets Created" value={stats.assetsCreated.toString()} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
