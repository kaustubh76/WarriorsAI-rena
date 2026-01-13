'use client';

import React, { use, useCallback } from 'react';
import Link from 'next/link';
import { formatEther } from 'viem';
import { formatTokenAmount } from '@/utils/format';
import { useAccount } from 'wagmi';
import { useMarket, usePosition, useClaimWinnings, useMarketActivity, useMarketPrice, clearMarketCache, type MarketActivity } from '@/hooks/useMarkets';
import { MarketStatus, MarketOutcome } from '@/services/predictionMarketService';
import { TradePanel } from '@/components/markets/TradePanel';
import { LiquidityPanel } from '@/components/markets/LiquidityPanel';
import { MarketChart } from '@/components/markets/MarketChart';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MarketDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);

  // Validate that id is a valid number before converting to BigInt
  const isValidId = /^\d+$/.test(resolvedParams.id);
  const marketId = isValidId ? BigInt(resolvedParams.id) : BigInt(0);

  const { market, loading, error, refetch } = useMarket(isValidId ? marketId : BigInt(0));
  const { position, hasPosition, refetch: refetchPosition } = usePosition(marketId);
  const { activities, loading: activitiesLoading, error: activitiesError, refetch: refetchActivity } = useMarketActivity(isValidId ? marketId : null);
  const { refetch: refetchPrice } = useMarketPrice(isValidId ? marketId : null);
  const { isConnected } = useAccount();

  // Callback to refresh ALL market data after a trade completes
  const handleTradeComplete = useCallback(() => {
    // Clear cache to ensure fresh blockchain data
    clearMarketCache();
    // Refetch all data
    refetch();
    refetchPosition();
    refetchPrice();
    refetchActivity();
  }, [refetch, refetchPosition, refetchPrice, refetchActivity]);

  const {
    claim,
    isPending: isClaimPending,
    isConfirming: isClaimConfirming,
    isSuccess: isClaimSuccess,
    error: claimError
  } = useClaimWinnings(marketId);

  // Handle invalid market ID (e.g., /markets/create routes here by mistake)
  if (!isValidId) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Invalid Market ID</h1>
        <p className="text-gray-400 mb-6">"{resolvedParams.id}" is not a valid market ID.</p>
        <Link
          href="/markets"
          className="inline-block bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600"
        >
          Back to Markets
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Market Not Found</h1>
        <p className="text-gray-400 mb-6">The market you're looking for doesn't exist.</p>
        <Link
          href="/markets"
          className="inline-block bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600"
        >
          Back to Markets
        </Link>
      </div>
    );
  }

  const isActive = market.status === MarketStatus.Active;
  const isResolved = market.status === MarketStatus.Resolved;
  const isBattleMarket = market.battleId > BigInt(0);
  const endDate = new Date(Number(market.endTime) * 1000);
  const isEnded = endDate < new Date();

  // Check if user can claim winnings
  // Note: Contract doesn't have 'claimed' field, so we check if position has winning tokens
  const winningTokens = market.outcome === MarketOutcome.Yes
    ? position?.yesTokens || BigInt(0)
    : market.outcome === MarketOutcome.No
    ? position?.noTokens || BigInt(0)
    : BigInt(0);
  const canClaim = isResolved && hasPosition && winningTokens > BigInt(0);

  const handleClaim = async () => {
    await claim();
    refetchPosition();
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/markets" className="text-purple-400 hover:text-purple-300">
            ← Back to Markets
          </Link>
        </div>

        {/* Market Header */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              {isBattleMarket && (
                <span className="inline-block px-3 py-1 text-sm font-medium bg-purple-500/20 text-purple-300 rounded-full mb-3">
                  Battle Market
                </span>
              )}
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {market.question}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span>Created by {truncateAddress(market.creator)}</span>
                <span>•</span>
                <span>
                  {isEnded ? 'Ended' : 'Ends'} {endDate.toLocaleDateString()} at{' '}
                  {endDate.toLocaleTimeString()}
                </span>
              </div>
            </div>
            <MarketStatusBadge status={market.status} outcome={market.outcome} isEnded={isEnded} />
          </div>

          {/* Battle Warriors Display */}
          {isBattleMarket && (
            <div className="flex items-center justify-center gap-8 p-6 bg-gray-800/50 rounded-xl mb-6">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-3xl mb-2">
                  ⚔️
                </div>
                <p className="text-lg font-bold text-purple-300">
                  Warrior #{market.warrior1Id.toString()}
                </p>
                <p className="text-sm text-gray-400">YES outcome</p>
              </div>
              <div className="text-4xl text-gray-600">VS</div>
              <div className="text-center">
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-3xl mb-2">
                  🛡️
                </div>
                <p className="text-lg font-bold text-orange-300">
                  Warrior #{market.warrior2Id.toString()}
                </p>
                <p className="text-sm text-gray-400">NO outcome</p>
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Volume"
              value={`${formatTokenAmount(market.yesTokens + market.noTokens)} CRwN`}
            />
            <StatCard
              label="Liquidity"
              value={`${formatTokenAmount(market.liquidity)} CRwN`}
            />
            <StatCard
              label="YES Tokens"
              value={formatTokenAmount(market.yesTokens)}
            />
            <StatCard
              label="NO Tokens"
              value={formatTokenAmount(market.noTokens)}
            />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Chart */}
          <div className="lg:col-span-2 space-y-8">
            <MarketChart market={market} />

            {/* Resolution Info */}
            {isResolved && (
              <div className="bg-gradient-to-br from-green-900/30 to-gray-900 rounded-xl p-6 border border-green-700/50">
                <h3 className="text-lg font-semibold text-white mb-4">Market Resolved</h3>
                <div className="flex items-center gap-4">
                  <div className={`text-4xl font-bold ${
                    market.outcome === MarketOutcome.Yes ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {getOutcomeLabel(market.outcome)}
                  </div>
                  <div className="text-gray-400">
                    Resolved at {new Date(Number(market.resolutionTime) * 1000).toLocaleString()}
                  </div>
                </div>

                {/* Claim Winnings */}
                {canClaim && winningTokens > BigInt(0) && (
                  <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                    <p className="text-white mb-3">
                      You won! Claim your {formatTokenAmount(winningTokens)} CRwN
                    </p>
                    <button
                      onClick={handleClaim}
                      disabled={isClaimPending || isClaimConfirming}
                      className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50"
                    >
                      {isClaimPending
                        ? 'Confirm in Wallet...'
                        : isClaimConfirming
                        ? 'Processing...'
                        : 'Claim Winnings'}
                    </button>
                    {claimError && (
                      <p className="text-red-400 text-sm mt-2">{claimError.message}</p>
                    )}
                  </div>
                )}

                {isClaimSuccess && (
                  <div className="mt-4 text-green-400">
                    ✓ You have claimed your winnings
                  </div>
                )}
              </div>
            )}

            {/* User Position */}
            {hasPosition && position && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Your Position</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-gray-400 text-sm">YES Tokens</span>
                    <p className="text-green-400 font-bold text-xl">
                      {formatTokenAmount(position.yesTokens)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">NO Tokens</span>
                    <p className="text-red-400 font-bold text-xl">
                      {formatTokenAmount(position.noTokens)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">LP Shares</span>
                    <p className="text-purple-400 font-bold text-xl">
                      {formatTokenAmount(position.lpShares)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Potential Payout</span>
                    <p className="text-white font-bold text-xl">
                      {formatTokenAmount(
                        position.yesTokens > position.noTokens
                          ? position.yesTokens
                          : position.noTokens
                      )}{' '}
                      CRwN
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Market Activity */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
              {activitiesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
                </div>
              ) : activitiesError ? (
                <div className="text-center py-8 text-red-400">
                  <p>Failed to load activity</p>
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>No activity yet for this market.</p>
                  <p className="text-sm mt-2">Be the first to trade!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {activities.map((activity, index) => (
                    <ActivityItem key={`${activity.txHash}-${index}`} activity={activity} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Trade Panel */}
          <div className="space-y-6">
            {isActive && <TradePanel market={market} onTradeComplete={handleTradeComplete} />}

            {isActive && <LiquidityPanel market={market} onComplete={handleTradeComplete} />}

            {!isConnected && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 text-center">
                <p className="text-gray-400 mb-4">Connect your wallet to start trading</p>
                <w3m-connect-button />
              </div>
            )}

            {!isActive && !isResolved && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 text-center">
                <p className="text-yellow-400">This market is currently paused or cancelled.</p>
              </div>
            )}

            {/* Market Info */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Market Info</h3>
              <div className="space-y-3 text-sm">
                <InfoRow label="Market ID" value={`#${market.id.toString()}`} />
                <InfoRow label="Creator" value={truncateAddress(market.creator)} />
                <InfoRow label="End Time" value={endDate.toLocaleString()} />
                {isBattleMarket && (
                  <>
                    <InfoRow label="Battle ID" value={`#${market.battleId.toString()}`} />
                    <InfoRow label="Warrior 1" value={`#${market.warrior1Id.toString()}`} />
                    <InfoRow label="Warrior 2" value={`#${market.warrior2Id.toString()}`} />
                  </>
                )}
                <InfoRow label="Platform Fee" value="2%" />
                <InfoRow label="Resolution" value="0G AI Oracle" />
              </div>
            </div>
          </div>
        </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <span className="text-sm text-gray-400">{label}</span>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function MarketStatusBadge({ status, outcome, isEnded }: { status: MarketStatus; outcome: MarketOutcome; isEnded?: boolean }) {
  // If market end time has passed but not yet resolved, show as Expired
  if (status === MarketStatus.Active && isEnded) {
    return (
      <span className="px-3 py-1.5 text-sm font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
        ⏰ Expired
      </span>
    );
  }
  if (status === MarketStatus.Active) {
    return (
      <span className="px-3 py-1.5 text-sm font-medium bg-green-500/20 text-green-400 rounded-full">
        ● Active
      </span>
    );
  }
  if (status === MarketStatus.Resolved) {
    return (
      <span className="px-3 py-1.5 text-sm font-medium bg-blue-500/20 text-blue-400 rounded-full">
        ✓ Resolved: {getOutcomeLabel(outcome)}
      </span>
    );
  }
  if (status === MarketStatus.Cancelled) {
    return (
      <span className="px-3 py-1.5 text-sm font-medium bg-gray-500/20 text-gray-400 rounded-full">
        ✕ Cancelled
      </span>
    );
  }
  // Default/unknown status
  return (
    <span className="px-3 py-1.5 text-sm font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
      Unknown
    </span>
  );
}

function getOutcomeLabel(outcome: MarketOutcome): string {
  switch (outcome) {
    case MarketOutcome.Yes:
      return 'YES';
    case MarketOutcome.No:
      return 'NO';
    case MarketOutcome.Invalid:
      return 'INVALID';
    default:
      return 'Pending';
  }
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ActivityItem({ activity }: { activity: MarketActivity }) {
  const getActivityIcon = () => {
    switch (activity.type) {
      case 'buy':
        return activity.isYes ? '🟢' : '🔴';
      case 'sell':
        return '💰';
      case 'add_liquidity':
        return '💧';
      case 'remove_liquidity':
        return '🔥';
      case 'claim':
        return '🏆';
      default:
        return '📝';
    }
  };

  const getActivityLabel = () => {
    switch (activity.type) {
      case 'buy':
        return `Bought ${activity.isYes ? 'YES' : 'NO'}`;
      case 'sell':
        return `Sold ${activity.isYes ? 'YES' : 'NO'}`;
      case 'add_liquidity':
        return 'Added Liquidity';
      case 'remove_liquidity':
        return 'Removed Liquidity';
      case 'claim':
        return 'Claimed Winnings';
      default:
        return 'Activity';
    }
  };

  const getActivityColor = () => {
    switch (activity.type) {
      case 'buy':
        return activity.isYes ? 'text-green-400' : 'text-red-400';
      case 'sell':
        return 'text-yellow-400';
      case 'add_liquidity':
        return 'text-blue-400';
      case 'remove_liquidity':
        return 'text-orange-400';
      case 'claim':
        return 'text-purple-400';
      default:
        return 'text-gray-400';
    }
  };

  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() / 1000) - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-xl">{getActivityIcon()}</span>
        <div>
          <p className={`font-medium ${getActivityColor()}`}>
            {getActivityLabel()}
          </p>
          <p className="text-sm text-gray-500">
            {truncateAddress(activity.user)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-white font-medium">
          {formatTokenAmount(activity.tokens)} tokens
        </p>
        <p className="text-sm text-gray-500">
          {timeAgo(activity.timestamp)}
        </p>
      </div>
      <a
        href={`https://evm-testnet.flowscan.io/tx/${activity.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-3 text-purple-400 hover:text-purple-300 text-sm"
      >
        View
      </a>
    </div>
  );
}
