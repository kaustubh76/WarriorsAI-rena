'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { formatTokenAmount } from '@/utils/format';
import { useMarkets, useUserPositions, useTokenBalance } from '@/hooks/useMarkets';
import { MarketStatus, MarketOutcome, type Market, type Position } from '@/services/predictionMarketService';
import PortfolioPerformanceChart from '@/components/portfolio/PortfolioPerformanceChart';

type PositionTab = 'active' | 'resolved' | 'liquidity';

// Skeleton loader for position cards
const PositionCardSkeleton = () => (
  <div className="card animate-pulse">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
        <div className="skeleton h-6 w-3/4 mb-2" />
        <div className="skeleton h-4 w-1/4" />
      </div>
      <div className="flex gap-4">
        <div className="skeleton h-12 w-16" />
        <div className="skeleton h-12 w-16" />
        <div className="skeleton h-12 w-20" />
      </div>
    </div>
  </div>
);

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { markets } = useMarkets();
  const { positions, loading: positionsLoading } = useUserPositions();
  const { balance, balanceFormatted } = useTokenBalance();

  const [activeTab, setActiveTab] = useState<PositionTab>('active');

  if (!isConnected) {
    return (
      <main className="container-arcade py-12 md:py-20">
        <div className="text-center animate-fade-in">
          <div className="text-5xl md:text-6xl mb-6">🔐</div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 arcade-glow">Connect Your Wallet</h1>
          <p className="text-slate-400 mb-8 text-sm md:text-base">
            Connect your wallet to view your portfolio and positions
          </p>
          <w3m-connect-button />
        </div>
      </main>
    );
  }

  // Get markets where user has positions
  const userMarkets = markets.filter(
    (m) => positions.has(m.id.toString())
  );

  // Get market IDs for portfolio history (memoized)
  const userMarketIds = useMemo(() =>
    userMarkets.map(m => m.id),
    [userMarkets]
  );

  // Separate by status
  const activePositions = userMarkets.filter(
    (m) => m.status === MarketStatus.Active
  );
  const resolvedPositions = userMarkets.filter(
    (m) => m.status === MarketStatus.Resolved
  );
  const liquidityPositions = userMarkets.filter((m) => {
    const pos = positions.get(m.id.toString());
    return pos && pos.lpShares > BigInt(0);
  });

  // Calculate portfolio stats
  let totalInvested = BigInt(0);
  let totalPotentialPayout = BigInt(0);
  let totalWinnings = BigInt(0);
  let totalLosses = BigInt(0);

  userMarkets.forEach((market) => {
    const pos = positions.get(market.id.toString());
    if (!pos) return;

    const yesValue = pos.yesTokens;
    const noValue = pos.noTokens;
    totalInvested += yesValue + noValue;

    if (market.status === MarketStatus.Resolved) {
      if (market.outcome === MarketOutcome.Yes) {
        totalWinnings += pos.yesTokens;
        totalLosses += pos.noTokens;
      } else if (market.outcome === MarketOutcome.No) {
        totalWinnings += pos.noTokens;
        totalLosses += pos.yesTokens;
      }
    } else {
      totalPotentialPayout += yesValue > noValue ? yesValue : noValue;
    }
  });

  const netPnL = totalWinnings - totalLosses;
  const isProfitable = netPnL >= BigInt(0);

  const getDisplayedPositions = () => {
    switch (activeTab) {
      case 'active':
        return activePositions;
      case 'resolved':
        return resolvedPositions;
      case 'liquidity':
        return liquidityPositions;
      default:
        return [];
    }
  };

  return (
    <main className="container-arcade py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 md:mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 arcade-glow">Portfolio</h1>
        <p className="text-sm md:text-base text-slate-400">
          Track your prediction market positions and performance
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8 animate-slide-up" style={{ animationDelay: '50ms' }}>
        <div className="feature-card col-span-2 lg:col-span-1">
          <span className="stat-card-label">CRwN Balance</span>
          <p className="text-2xl md:text-3xl font-bold text-white mt-1">
            {balanceFormatted}
          </p>
          <Link
            href="/warriorsMinter"
            className="text-purple-400 text-xs md:text-sm hover:text-purple-300 mt-2 inline-flex items-center gap-1"
          >
            Get more CRwN
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="stat-card">
          <span className="stat-card-label">Active Positions</span>
          <p className="stat-card-value text-white">
            {activePositions.length}
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {formatTokenAmount(totalPotentialPayout)} CRwN potential
          </p>
        </div>

        <div className="stat-card">
          <span className="stat-card-label">Total Invested</span>
          <p className="stat-card-value text-white text-lg md:text-xl">
            {formatTokenAmount(totalInvested)}
            <span className="text-xs text-slate-400 ml-1">CRwN</span>
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Across {userMarkets.length} markets
          </p>
        </div>

        <div className="stat-card">
          <span className="stat-card-label">Net P&L</span>
          <p className={`stat-card-value text-lg md:text-xl ${
            isProfitable ? 'text-green-400' : 'text-red-400'
          }`}>
            {isProfitable ? '+' : ''}{formatTokenAmount(netPnL)}
            <span className="text-xs text-slate-400 ml-1">CRwN</span>
          </p>
          <p className="text-slate-500 text-xs mt-1">
            From resolved markets
          </p>
        </div>
      </div>

      {/* Performance History Chart */}
      <div className="mb-6 md:mb-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <PortfolioPerformanceChart
          markets={markets}
          userMarketIds={userMarketIds}
        />
      </div>

      {/* Position Tabs - Scrollable on mobile */}
      <div className="flex overflow-x-auto gap-2 md:gap-4 mb-4 md:mb-6 pb-2 -mx-2 px-2 animate-slide-up" style={{ animationDelay: '150ms' }}>
        {[
          { key: 'active', label: 'Active', icon: '📊', count: activePositions.length },
          { key: 'resolved', label: 'Resolved', icon: '✅', count: resolvedPositions.length },
          { key: 'liquidity', label: 'Liquidity', icon: '💧', count: liquidityPositions.length }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as PositionTab)}
            className={`flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap touch-target ${
              activeTab === tab.key
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] md:text-xs bg-slate-700/50">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Positions List */}
      {positionsLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <PositionCardSkeleton key={i} />
          ))}
        </div>
      ) : getDisplayedPositions().length === 0 ? (
        <div className="card text-center py-12 md:py-16 animate-fade-in">
          <div className="text-4xl md:text-5xl mb-4">
            {activeTab === 'active' ? '📊' : activeTab === 'resolved' ? '✅' : '💧'}
          </div>
          <h3 className="text-lg md:text-xl font-semibold text-white mb-2">
            No {activeTab} positions
          </h3>
          <p className="text-slate-400 mb-6 text-sm max-w-md mx-auto">
            {activeTab === 'active'
              ? "Start trading to see your positions here"
              : activeTab === 'resolved'
              ? "Your resolved positions will appear here"
              : "Provide liquidity to markets to earn fees"
            }
          </p>
          <Link
            href="/markets"
            className="btn btn-primary"
          >
            Browse Markets
          </Link>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {getDisplayedPositions().map((market, index) => (
            <div
              key={market.id.toString()}
              className="animate-slide-up"
              style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
            >
              <PositionCard
                market={market}
                position={positions.get(market.id.toString())!}
                showLiquidity={activeTab === 'liquidity'}
              />
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-8 md:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
        <Link
          href="/markets"
          className="card hover:border-purple-500/50 transition-colors group"
        >
          <div className="text-2xl md:text-3xl mb-2 md:mb-3">🔮</div>
          <h3 className="text-sm md:text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
            Trade Markets
          </h3>
          <p className="text-slate-400 text-xs md:text-sm mt-1">
            Buy and sell outcome tokens
          </p>
        </Link>

        <Link
          href="/leaderboard"
          className="card hover:border-purple-500/50 transition-colors group"
        >
          <div className="text-2xl md:text-3xl mb-2 md:mb-3">🏆</div>
          <h3 className="text-sm md:text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
            Leaderboard
          </h3>
          <p className="text-slate-400 text-xs md:text-sm mt-1">
            See how you rank against others
          </p>
        </Link>

        <Link
          href="/arena"
          className="card hover:border-purple-500/50 transition-colors group"
        >
          <div className="text-2xl md:text-3xl mb-2 md:mb-3">⚔️</div>
          <h3 className="text-sm md:text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
            Arena Battles
          </h3>
          <p className="text-slate-400 text-xs md:text-sm mt-1">
            Watch live warrior battles
          </p>
        </Link>
      </div>
    </main>
  );
}

interface PositionCardProps {
  market: Market;
  position: Position;
  showLiquidity?: boolean;
}

function PositionCard({ market, position, showLiquidity }: PositionCardProps) {
  const isResolved = market.status === MarketStatus.Resolved;
  const isBattleMarket = market.battleId > BigInt(0);

  // Determine winning/losing position
  let isWinning = false;
  let winningAmount = BigInt(0);

  if (isResolved) {
    if (market.outcome === MarketOutcome.Yes && position.yesTokens > BigInt(0)) {
      isWinning = true;
      winningAmount = position.yesTokens;
    } else if (market.outcome === MarketOutcome.No && position.noTokens > BigInt(0)) {
      isWinning = true;
      winningAmount = position.noTokens;
    }
  }

  return (
    <Link href={`/markets/${market.id.toString()}`}>
      <div className={`card p-4 md:p-6 transition-all hover:border-purple-500/50 ${
        isResolved && isWinning
          ? 'border-green-500/50 bg-green-900/10'
          : isResolved && !isWinning
          ? 'border-red-500/30 bg-red-900/5'
          : ''
      }`}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {isBattleMarket && (
                <span className="badge badge-purple">
                  ⚔️ Battle
                </span>
              )}
              {isResolved && (
                <span className={`badge ${
                  isWinning
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {isWinning ? '🏆 Won' : '❌ Lost'}
                </span>
              )}
            </div>
            <h3 className="text-sm md:text-lg font-semibold text-white mb-1 line-clamp-2 md:line-clamp-1">
              {market.question}
            </h3>
            <p className="text-xs md:text-sm text-slate-400">
              Market #{market.id.toString()}
            </p>
          </div>

          {/* Position Details */}
          <div className="flex gap-3 md:gap-6 flex-shrink-0">
            {!showLiquidity ? (
              <>
                <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center min-w-[60px] md:min-w-[70px]">
                  <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">YES</span>
                  <p className="text-sm md:text-lg font-bold text-green-400">
                    {formatTokenAmount(position.yesTokens)}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center min-w-[60px] md:min-w-[70px]">
                  <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">NO</span>
                  <p className="text-sm md:text-lg font-bold text-red-400">
                    {formatTokenAmount(position.noTokens)}
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center min-w-[80px]">
                <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">LP Shares</span>
                <p className="text-sm md:text-lg font-bold text-purple-400">
                  {formatTokenAmount(position.lpShares)}
                </p>
              </div>
            )}
            <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center min-w-[80px] md:min-w-[100px]">
              <span className="text-[10px] md:text-xs text-slate-400 block mb-0.5">
                {isResolved ? 'Payout' : 'Potential'}
              </span>
              <p className={`text-sm md:text-lg font-bold ${
                isResolved && isWinning ? 'text-green-400' : 'text-white'
              }`}>
                {isResolved
                  ? formatTokenAmount(winningAmount)
                  : formatTokenAmount(
                      position.yesTokens > position.noTokens
                        ? position.yesTokens
                        : position.noTokens
                    )
                }
              </p>
            </div>
          </div>
        </div>

        {/* Claim Button for Resolved Markets */}
        {isResolved && isWinning && winningAmount > BigInt(0) && (
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <button className="btn btn-success w-full">
              🎉 Claim {formatTokenAmount(winningAmount)} CRwN
            </button>
          </div>
        )}
      </div>
    </Link>
  );
}
