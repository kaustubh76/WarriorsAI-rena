/**
 * AI Leaderboard API Route
 * GET: Fetch leaderboard data with rankings
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit, createAPILogger, createResponse, ResponsePresets } from '@/lib/api';

// Time range options
type TimeRange = 'daily' | 'weekly' | 'monthly' | 'all';

// Sort categories
type SortCategory = 'profit' | 'winRate' | 'volume' | 'streak' | 'accuracy';

// Interface for user score data (replacing 'any' type)
interface UserScoreData {
  agentAddress: string;
  agentId: string;
  accuracy: number | null;
  roi: number | null;
  totalPredictions: number;
  correctPredictions: number;
  totalStaked: string;
  totalReturns: string;
  currentStreak: number;
  longestStreak: number;
}

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
  const logger = createAPILogger(request);
  logger.start();

  try {
    // Apply rate limiting (60 requests per minute)
    applyRateLimit(request, {
      prefix: 'leaderboard-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const timeRange = (searchParams.get('timeRange') || 'all') as TimeRange;
    const sortBy = (searchParams.get('sortBy') || 'profit') as SortCategory;
    // Parse and validate pagination with max limits
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(rawLimit, 1), 100); // Clamp between 1 and 100
    const userAddress = searchParams.get('user');

    const timeFilter = getTimeRangeFilter(timeRange);
    const whereClause = timeFilter ? { updatedAt: { gte: timeFilter } } : {};

    // Optimize query execution by batching when user address is provided
    let scores, userScore, higherRankedCount;

    if (userAddress) {
      // Execute queries in parallel to reduce latency
      [scores, userScore, higherRankedCount] = await Promise.all([
        // Main leaderboard query
        prisma.aIPredictionScore.findMany({
          where: whereClause,
          orderBy: getSortOrder(sortBy),
          take: limit,
        }),
        // User's score
        prisma.aIPredictionScore.findFirst({
          where: { agentAddress: userAddress },
        }),
        // If we need count, we'll do it conditionally below
        Promise.resolve(null),
      ]);

      // Only count if user exists
      if (userScore) {
        const rankCondition = getRankingCondition(sortBy, userScore);
        higherRankedCount = await prisma.aIPredictionScore.count({
          where: rankCondition,
        });
      }
    } else {
      // No user lookup needed - just fetch leaderboard
      scores = await prisma.aIPredictionScore.findMany({
        where: whereClause,
        orderBy: getSortOrder(sortBy),
        take: limit,
      });
    }

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

    // Build user rank if requested
    let userRank: LeaderboardEntry | null = null;
    if (userScore && higherRankedCount !== null && higherRankedCount !== undefined) {
      userRank = {
        rank: higherRankedCount + 1,
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

    // Get summary stats using a single optimized query
    // Use raw query for volume sum since totalStaked is stored as string
    const [statsResult, volumeResult] = await Promise.allSettled([
      prisma.aIPredictionScore.aggregate({
        _count: true,
        _sum: {
          totalPredictions: true,
          correctPredictions: true,
        },
        _avg: {
          accuracy: true,
          roi: true,
        },
      }),
      // Use raw SQL to efficiently sum volume without fetching all records
      // This is much more efficient than findMany + reduce for large datasets
      prisma.$queryRaw<[{ total: bigint | null }]>`
        SELECT COALESCE(SUM(CAST("totalStaked" AS DECIMAL)), 0) as total
        FROM "AIPredictionScore"
      `.catch(() => [{ total: BigInt(0) }]),
    ]);

    // Extract results with fallbacks
    const stats = statsResult.status === 'fulfilled' ? statsResult.value : {
      _count: 0,
      _sum: { totalPredictions: 0, correctPredictions: 0 },
      _avg: { accuracy: 0, roi: 0 },
    };

    // Handle raw query result
    let totalVolume = 0;
    if (volumeResult.status === 'fulfilled') {
      const volumeData = volumeResult.value;
      if (Array.isArray(volumeData) && volumeData.length > 0 && volumeData[0].total !== null) {
        totalVolume = Number(volumeData[0].total);
      }
    }

    logger.complete(200);

    return createResponse({
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
    }, {
      ...ResponsePresets.standard, // Cache for 60s, stale-while-revalidate 30s
      requestId: logger.requestId,
    });
  } catch (error) {
    logger.error('Leaderboard fetch failed', error);
    return handleAPIError(error, 'API:Leaderboard:GET');
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

function getRankingCondition(sortBy: SortCategory, userScore: UserScoreData): Record<string, unknown> {
  switch (sortBy) {
    case 'profit':
      return { totalReturns: { gt: userScore.totalReturns } };
    case 'winRate':
    case 'accuracy':
      // Handle nullable accuracy field
      return userScore.accuracy !== null
        ? { accuracy: { gt: userScore.accuracy } }
        : {};
    case 'volume':
      return { totalStaked: { gt: userScore.totalStaked } };
    case 'streak':
      return { longestStreak: { gt: userScore.longestStreak } };
    default:
      return { totalReturns: { gt: userScore.totalReturns } };
  }
}
