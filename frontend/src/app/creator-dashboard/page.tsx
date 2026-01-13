'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { useCreatorDashboard, useRevenueHistory, useGlobalCreatorStats, useAllTierInfo } from '@/hooks/useCreatorRevenue';
import { CreatorRevenueCard, TierProgressCard, ClaimRewardsButton } from '@/components/creator';

// Skeleton loader
const DashboardSkeleton = () => (
  <div className="animate-pulse">
    <div className="skeleton h-8 w-1/3 mb-6" />
    <div className="grid grid-cols-2 gap-3 max-w-md mb-6">
      <div className="skeleton h-20 rounded-xl" />
      <div className="skeleton h-20 rounded-xl" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="skeleton h-64 rounded-xl" />
        <div className="skeleton h-48 rounded-xl" />
      </div>
      <div className="space-y-4">
        <div className="skeleton h-48 rounded-xl" />
        <div className="skeleton h-32 rounded-xl" />
      </div>
    </div>
  </div>
);

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
      <main className="container-arcade py-12 md:py-20">
        <div className="text-center animate-fade-in">
          <div className="text-5xl md:text-6xl mb-6">🔐</div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 arcade-glow">Connect Wallet</h1>
          <p className="text-slate-400 mb-6 text-sm md:text-base">Please connect your wallet to view your creator dashboard.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="container-arcade py-6 md:py-8">
        <DashboardSkeleton />
      </main>
    );
  }

  if (!isRegistered) {
    return (
      <main className="container-arcade py-8 md:py-12">
        <div className="text-center animate-fade-in">
          <div className="text-5xl md:text-6xl mb-4">🎨</div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 arcade-glow">Become a Creator</h1>
          <p className="text-slate-400 max-w-lg mx-auto mb-8 text-sm md:text-base">
            Join {totalCreators} creators earning from prediction markets.
            Create markets, warriors, or operate AI agents to earn fees.
          </p>

          {/* Creator Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-3xl mx-auto mb-8 md:mb-12">
            <div className="card hover:border-purple-500/50 transition-colors animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="text-2xl md:text-3xl mb-3">📊</div>
              <h3 className="text-white font-medium mb-2 text-sm md:text-base">Market Creator</h3>
              <p className="text-slate-400 text-xs md:text-sm">Earn 2% of trading volume on markets you create</p>
            </div>
            <div className="card hover:border-purple-500/50 transition-colors animate-slide-up" style={{ animationDelay: '150ms' }}>
              <div className="text-2xl md:text-3xl mb-3">⚔️</div>
              <h3 className="text-white font-medium mb-2 text-sm md:text-base">Warrior Creator</h3>
              <p className="text-slate-400 text-xs md:text-sm">Earn 1% when users bet on warriors you mint</p>
            </div>
            <div className="card hover:border-purple-500/50 transition-colors animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div className="text-2xl md:text-3xl mb-3">🤖</div>
              <h3 className="text-white font-medium mb-2 text-sm md:text-base">Agent Operator</h3>
              <p className="text-slate-400 text-xs md:text-sm">Earn 0.5% from copy-trade volume</p>
            </div>
          </div>

          {/* Tier Roadmap */}
          <div className="feature-card max-w-2xl mx-auto mb-6 md:mb-8 animate-slide-up" style={{ animationDelay: '250ms' }}>
            <h3 className="text-lg md:text-xl font-semibold text-white mb-4 md:mb-6">Creator Tiers</h3>
            <div className="space-y-3">
              {tiers.map((tier, index) => (
                <div
                  key={tier.tier}
                  className="flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-lg md:text-xl flex-shrink-0 ${
                    tier.color === 'bronze' ? 'bg-orange-500/20 border border-orange-500/30' :
                    tier.color === 'silver' ? 'bg-slate-400/20 border border-slate-400/30' :
                    tier.color === 'gold' ? 'bg-arcade-gold/20 border border-arcade-gold/30' :
                    tier.color === 'platinum' ? 'bg-cyan-500/20 border border-cyan-500/30' :
                    'bg-purple-500/20 border border-purple-500/30'
                  }`}>
                    {tier.icon}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-white font-medium text-sm md:text-base">{tier.label}</p>
                    <p className="text-[10px] md:text-xs text-slate-500 truncate">{tier.benefits[0]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-slate-500 text-xs md:text-sm mb-6">
            Start creating markets or minting warriors to become a creator automatically
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/markets/create" className="btn btn-primary">
              Create Market
            </Link>
            <Link href="/warriorsMinter" className="btn btn-secondary">
              Mint Warrior
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container-arcade py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 md:mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 arcade-glow">Creator Dashboard</h1>
        <p className="text-sm md:text-base text-slate-400">Track your earnings and manage your creator profile</p>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 max-w-md mb-6 md:mb-8 animate-slide-up" style={{ animationDelay: '50ms' }}>
        <div className="stat-card">
          <p className="stat-card-value text-white">{totalCreators}</p>
          <p className="stat-card-label">Total Creators</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-value text-green-400 text-lg md:text-xl">
            {totalFeesDistributedFormatted}
            <span className="text-xs text-slate-400 ml-1">CRwN</span>
          </p>
          <p className="stat-card-label">Total Distributed</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
        {/* Left Column - Revenue */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            {creator && <CreatorRevenueCard creator={creator} breakdown={breakdown} />}
          </div>

          {/* Revenue History */}
          <div className="card animate-slide-up" style={{ animationDelay: '150ms' }}>
            <h3 className="text-base md:text-lg font-semibold text-white mb-4">Revenue History</h3>
            {history.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-3">📈</div>
                <p className="text-slate-400 text-sm">No revenue history yet</p>
              </div>
            ) : (
              <div className="space-y-2 md:space-y-3">
                {history.slice(0, 10).map((entry, index) => (
                  <div key={index} className="flex items-center justify-between py-2 md:py-3 border-b border-slate-700/50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm md:text-base truncate">{entry.sourceLabel}</p>
                      <p className="text-[10px] md:text-xs text-slate-500">{entry.dateFormatted}</p>
                    </div>
                    <p className="text-green-400 font-medium text-sm md:text-base flex-shrink-0 ml-3">+{entry.amountFormatted} CRwN</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Tier & Claim */}
        <div className="space-y-4 md:space-y-6">
          <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
            {creator && <TierProgressCard creator={creator} />}
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '250ms' }}>
            <ClaimRewardsButton />
          </div>
        </div>
      </div>

      {/* Creator Stats */}
      {stats && (
        <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <StatCard label="Total Earnings" value={`${(Number(stats.totalEarnings) / 1e18).toFixed(2)} CRwN`} icon="💰" />
          <StatCard label="Weekly Earnings" value={`${(Number(stats.weeklyEarnings) / 1e18).toFixed(2)} CRwN`} icon="📅" />
          <StatCard label="Monthly Earnings" value={`${(Number(stats.monthlyEarnings) / 1e18).toFixed(2)} CRwN`} icon="📊" />
          <StatCard label="Assets Created" value={stats.assetsCreated.toString()} icon="🎨" />
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2">
        {icon && <span className="text-base">{icon}</span>}
        <p className="stat-card-label">{label}</p>
      </div>
      <p className="stat-card-value text-white text-base md:text-lg mt-1">{value}</p>
    </div>
  );
}
