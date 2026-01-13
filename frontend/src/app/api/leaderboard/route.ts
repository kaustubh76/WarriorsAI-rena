/**
 * AI Leaderboard API Route
 * GET: Fetch leaderboard data with rankings
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Time range options
type TimeRange = 'daily' | 'weekly' | 'monthly' | 'all';

// Sort categories
type SortCategory = 'profit' | 'winRate' | 'volume' | 'streak' | 'accuracy';

interface LeaderboardEntry {
  rank: number;
  address: string;
  name: string;
  avatar?: string;
  tier: string;
  trades: number;
  volume: string;
  wins: number;
  losses: number;
  winRate: number;
  profit: string;
  profitPercent: number;
  currentStreak: number;
  bestStreak: number;
  accuracy: number;
  isAgent: boolean;
  agentId?: string;
}

function getTimeRangeFilter(timeRange: TimeRange): Date | undefined {
  const now = new Date();
  switch (timeRange) {
    case 'daily':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return undefined;
  }
}

function getTierFromAccuracy(accuracy: number): string {
  if (accuracy >= 80) return 'diamond';
  if (accuracy >= 70) return 'gold';
  if (accuracy >= 60) return 'silver';
  if (accuracy >= 50) return 'bronze';
  return 'unranked';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = (searchParams.get('timeRange') || 'all') as TimeRange;
    const sortBy = (searchParams.get('sortBy') || 'profit') as SortCategory;
    const limit = parseInt(searchParams.get('limit') || '50');
    const userAddress = searchParams.get('user');

    const timeFilter = getTimeRangeFilter(timeRange);

    // Fetch AI prediction scores from database
    const scores = await prisma.aIPredictionScore.findMany({
      where: timeFilter
        ? { updatedAt: { gte: timeFilter } }
        : {},
      orderBy: getSortOrder(sortBy),
      take: limit,
    });

    // Transform to leaderboard entries
    const leaderboard: LeaderboardEntry[] = scores.map((score, index) => ({
      rank: index + 1,
      address: score.agentAddress,
      name: `Agent #${score.agentId}`,
      tier: getTierFromAccuracy(score.accuracy ?? 0),
      trades: score.totalPredictions,
      volume: score.totalStaked,
      wins: score.correctPredictions,
      losses: score.totalPredictions - score.correctPredictions,
      winRate: score.accuracy ?? 0,
      profit: score.totalReturns,
      profitPercent: score.roi ?? 0,
      currentStreak: score.currentStreak,
      bestStreak: score.longestStreak,
      accuracy: score.accuracy ?? 0,
      isAgent: true,
      agentId: score.agentId,
    }));

    // Get user's rank if requested
    let userRank: LeaderboardEntry | null = null;
    if (userAddress) {
      const userScore = await prisma.aIPredictionScore.findFirst({
        where: { agentAddress: userAddress },
      });

      if (userScore) {
        // Count how many are ranked higher
        const higherRanked = await prisma.aIPredictionScore.count({
          where: getRankingCondition(sortBy, userScore),
        });

        userRank = {
          rank: higherRanked + 1,
          address: userScore.agentAddress,
          name: `Agent #${userScore.agentId}`,
          tier: getTierFromAccuracy(userScore.accuracy ?? 0),
          trades: userScore.totalPredictions,
          volume: userScore.totalStaked,
          wins: userScore.correctPredictions,
          losses: userScore.totalPredictions - userScore.correctPredictions,
          winRate: userScore.accuracy ?? 0,
          profit: userScore.totalReturns,
          profitPercent: userScore.roi ?? 0,
          currentStreak: userScore.currentStreak,
          bestStreak: userScore.longestStreak,
          accuracy: userScore.accuracy ?? 0,
          isAgent: true,
          agentId: userScore.agentId,
        };
      }
    }

    // Get summary stats
    const stats = await prisma.aIPredictionScore.aggregate({
      _count: true,
      _sum: {
        totalPredictions: true,
        correctPredictions: true,
      },
      _avg: {
        accuracy: true,
        roi: true,
      },
    });

    // Calculate total volume from all scores (since totalStaked is a string)
    const allScores = await prisma.aIPredictionScore.findMany({
      select: { totalStaked: true },
    });
    const totalVolume = allScores.reduce(
      (sum, s) => sum + parseFloat(s.totalStaked || '0'),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        leaderboard,
        userRank,
        stats: {
          totalParticipants: stats._count,
          totalTrades: stats._sum?.totalPredictions || 0,
          totalVolume: totalVolume.toString(),
          avgAccuracy: stats._avg?.accuracy || 0,
          avgROI: stats._avg?.roi || 0,
        },
        filters: {
          timeRange,
          sortBy,
          limit,
        },
      },
    });
  } catch (error) {
    console.error('[API] Leaderboard error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch leaderboard',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

function getSortOrder(sortBy: SortCategory) {
  switch (sortBy) {
    case 'profit':
      return { totalReturns: 'desc' as const };
    case 'winRate':
    case 'accuracy':
      return { accuracy: 'desc' as const };
    case 'volume':
      return { totalStaked: 'desc' as const };
    case 'streak':
      return { longestStreak: 'desc' as const };
    default:
      return { totalReturns: 'desc' as const };
  }
}

function getRankingCondition(sortBy: SortCategory, userScore: any) {
  switch (sortBy) {
    case 'profit':
      return { totalReturns: { gt: userScore.totalReturns } };
    case 'winRate':
    case 'accuracy':
      return { accuracy: { gt: userScore.accuracy } };
    case 'volume':
      return { totalStaked: { gt: userScore.totalStaked } };
    case 'streak':
      return { longestStreak: { gt: userScore.longestStreak } };
    default:
      return { totalReturns: { gt: userScore.totalReturns } };
  }
}
