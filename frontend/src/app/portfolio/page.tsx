'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useMarkets, useUserPositions, useTokenBalance } from '@/hooks/useMarkets';
import { MarketStatus, MarketOutcome, type Market } from '@/services/predictionMarketService';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

type PositionTab = 'active' | 'resolved' | 'liquidity';

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { markets } = useMarkets();
  const { positions, loading: positionsLoading } = useUserPositions();
  const { balance, balanceFormatted } = useTokenBalance();

  const [activeTab, setActiveTab] = useState<PositionTab>('active');

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="text-6xl mb-6">🔐</div>
          <h1 className="text-3xl font-bold text-white mb-4">Connect Your Wallet</h1>
          <p className="text-gray-400 mb-8">
            Connect your wallet to view your portfolio and positions
          </p>
          <w3m-connect-button />
        </div>
        <Footer />
      </div>
    );
  }

  // Get markets where user has positions
  const userMarkets = markets.filter(
    (m) => positions.has(m.id.toString())
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

    const yesValue = pos.yesShares;
    const noValue = pos.noShares;
    totalInvested += yesValue + noValue;

    if (market.status === MarketStatus.Resolved) {
      if (market.outcome === MarketOutcome.Yes) {
        totalWinnings += pos.yesShares;
        totalLosses += pos.noShares;
      } else if (market.outcome === MarketOutcome.No) {
        totalWinnings += pos.noShares;
        totalLosses += pos.yesShares;
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Portfolio</h1>
          <p className="text-gray-400">
            Track your prediction market positions and performance
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-purple-900/50 to-gray-900 rounded-xl p-6 border border-purple-500/30">
            <span className="text-gray-400 text-sm">CRwN Balance</span>
            <p className="text-3xl font-bold text-white mt-1">
              {balanceFormatted}
            </p>
            <Link
              href="/mint"
              className="text-purple-400 text-sm hover:text-purple-300 mt-2 inline-block"
            >
              Get more CRwN →
            </Link>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
            <span className="text-gray-400 text-sm">Active Positions</span>
            <p className="text-3xl font-bold text-white mt-1">
              {activePositions.length}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {formatEther(totalPotentialPayout)} CRwN potential
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
            <span className="text-gray-400 text-sm">Total Invested</span>
            <p className="text-3xl font-bold text-white mt-1">
              {formatEther(totalInvested)} CRwN
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Across {userMarkets.length} markets
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
            <span className="text-gray-400 text-sm">Net P&L</span>
            <p className={`text-3xl font-bold mt-1 ${
              isProfitable ? 'text-green-400' : 'text-red-400'
            }`}>
              {isProfitable ? '+' : ''}{formatEther(netPnL)} CRwN
            </p>
            <p className="text-gray-500 text-sm mt-1">
              From resolved markets
            </p>
          </div>
        </div>

        {/* Performance Chart Placeholder */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Performance History</h2>
          <div className="h-48 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-2">📈</div>
              <p>Performance chart coming soon</p>
              <p className="text-sm">Track your P&L over time</p>
            </div>
          </div>
        </div>

        {/* Position Tabs */}
        <div className="flex gap-4 mb-6">
          {[
            { key: 'active', label: 'Active Positions', count: activePositions.length },
            { key: 'resolved', label: 'Resolved', count: resolvedPositions.length },
            { key: 'liquidity', label: 'Liquidity', count: liquidityPositions.length }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as PositionTab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-700">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Positions List */}
        {positionsLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
          </div>
        ) : getDisplayedPositions().length === 0 ? (
          <div className="bg-gray-900 rounded-xl p-12 border border-gray-700 text-center">
            <div className="text-4xl mb-4">
              {activeTab === 'active' ? '📊' : activeTab === 'resolved' ? '✅' : '💧'}
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              No {activeTab} positions
            </h3>
            <p className="text-gray-400 mb-6">
              {activeTab === 'active'
                ? "Start trading to see your positions here"
                : activeTab === 'resolved'
                ? "Your resolved positions will appear here"
                : "Provide liquidity to markets to earn fees"
              }
            </p>
            <Link
              href="/markets"
              className="inline-block bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600 transition-colors"
            >
              Browse Markets
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {getDisplayedPositions().map((market) => (
              <PositionCard
                key={market.id.toString()}
                market={market}
                position={positions.get(market.id.toString())!}
                showLiquidity={activeTab === 'liquidity'}
              />
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/markets"
            className="bg-gray-900 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-colors group"
          >
            <div className="text-3xl mb-3">🔮</div>
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
              Trade Markets
            </h3>
            <p className="text-gray-400 text-sm mt-1">
              Buy and sell outcome tokens
            </p>
          </Link>

          <Link
            href="/leaderboard"
            className="bg-gray-900 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-colors group"
          >
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
              Leaderboard
            </h3>
            <p className="text-gray-400 text-sm mt-1">
              See how you rank against others
            </p>
          </Link>

          <Link
            href="/arena"
            className="bg-gray-900 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-colors group"
          >
            <div className="text-3xl mb-3">⚔️</div>
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
              Arena Battles
            </h3>
            <p className="text-gray-400 text-sm mt-1">
              Watch live warrior battles
            </p>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

interface PositionCardProps {
  market: Market;
  position: {
    yesShares: bigint;
    noShares: bigint;
    lpShares: bigint;
    claimed: boolean;
  };
  showLiquidity?: boolean;
}

function PositionCard({ market, position, showLiquidity }: PositionCardProps) {
  const isResolved = market.status === MarketStatus.Resolved;
  const isBattleMarket = market.battleId > BigInt(0);

  // Determine winning/losing position
  let isWinning = false;
  let winningAmount = BigInt(0);

  if (isResolved) {
    if (market.outcome === MarketOutcome.Yes && position.yesShares > BigInt(0)) {
      isWinning = true;
      winningAmount = position.yesShares;
    } else if (market.outcome === MarketOutcome.No && position.noShares > BigInt(0)) {
      isWinning = true;
      winningAmount = position.noShares;
    }
  }

  return (
    <Link href={`/markets/${market.id.toString()}`}>
      <div className={`bg-gray-900 rounded-xl p-6 border transition-all hover:border-purple-500 ${
        isResolved && isWinning
          ? 'border-green-500/50 bg-green-900/10'
          : isResolved && !isWinning
          ? 'border-red-500/30 bg-red-900/5'
          : 'border-gray-700'
      }`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {isBattleMarket && (
                <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full">
                  Battle
                </span>
              )}
              {isResolved && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  isWinning
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {isWinning ? 'Won' : 'Lost'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-white mb-1 line-clamp-1">
              {market.question}
            </h3>
            <p className="text-sm text-gray-400">
              Market #{market.id.toString()}
            </p>
          </div>

          {/* Position Details */}
          <div className="flex gap-6">
            {!showLiquidity ? (
              <>
                <div className="text-center">
                  <span className="text-sm text-gray-400">YES</span>
                  <p className="text-lg font-bold text-green-400">
                    {formatEther(position.yesShares)}
                  </p>
                </div>
                <div className="text-center">
                  <span className="text-sm text-gray-400">NO</span>
                  <p className="text-lg font-bold text-red-400">
                    {formatEther(position.noShares)}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center">
                <span className="text-sm text-gray-400">LP Shares</span>
                <p className="text-lg font-bold text-purple-400">
                  {formatEther(position.lpShares)}
                </p>
              </div>
            )}
            <div className="text-center">
              <span className="text-sm text-gray-400">
                {isResolved ? 'Payout' : 'Potential'}
              </span>
              <p className={`text-lg font-bold ${
                isResolved && isWinning ? 'text-green-400' : 'text-white'
              }`}>
                {isResolved
                  ? `${formatEther(winningAmount)} CRwN`
                  : `${formatEther(
                      position.yesShares > position.noShares
                        ? position.yesShares
                        : position.noShares
                    )} CRwN`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Claim Button for Resolved Markets */}
        {isResolved && isWinning && !position.claimed && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <button className="w-full py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors">
              Claim {formatEther(winningAmount)} CRwN
            </button>
          </div>
        )}

        {isResolved && position.claimed && (
          <div className="mt-4 pt-4 border-t border-gray-800 text-center text-green-400 text-sm">
            ✓ Claimed
          </div>
        )}
      </div>
    </Link>
  );
}
