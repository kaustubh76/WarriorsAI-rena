/**
 * GET /api/user/topic-stats
 *
 * Returns per-category prediction stats and badges for a user.
 *
 * Query params:
 *   userId — wallet address (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';

/** Compute badge tier from correct prediction count */
function computeBadge(correct: number): string | null {
  if (correct >= 100) return 'oracle';
  if (correct >= 25) return 'expert';
  if (correct >= 5) return 'novice';
  return null;
}

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'user-topic-stats', ...RateLimitPresets.apiQueries }),
  async (request: NextRequest) => {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId query parameter is required' },
        { status: 400 }
      );
    }

    const stats = await prisma.userTopicStats.findMany({
      where: { userId },
      orderBy: { correct: 'desc' },
    });

    const badgeUpdates: Promise<unknown>[] = [];

    const categoryStats = stats.map((entry) => {
      const computedBadge = computeBadge(entry.correct);

      // Persist badge if it changed
      if (computedBadge !== entry.badge) {
        badgeUpdates.push(
          prisma.userTopicStats.update({
            where: { id: entry.id },
            data: { badge: computedBadge },
          })
        );
      }

      return {
        category: entry.category,
        predictions: entry.predictions,
        correct: entry.correct,
        accuracy: entry.predictions > 0
          ? Math.round((entry.correct / entry.predictions) * 10000) / 100
          : 0,
        currentStreak: entry.currentStreak,
        longestStreak: entry.longestStreak,
        earnings: entry.earnings,
        badge: computedBadge,
      };
    });

    // Fire badge updates in background (non-blocking)
    if (badgeUpdates.length > 0) {
      Promise.all(badgeUpdates).catch(() => {});
    }

    // Compute overall stats
    const totalPredictions = categoryStats.reduce((s, c) => s + c.predictions, 0);
    const totalCorrect = categoryStats.reduce((s, c) => s + c.correct, 0);
    const bestStreak = categoryStats.reduce((s, c) => Math.max(s, c.longestStreak), 0);

    return NextResponse.json({
      success: true,
      userId,
      overall: {
        totalPredictions,
        totalCorrect,
        accuracy: totalPredictions > 0
          ? Math.round((totalCorrect / totalPredictions) * 10000) / 100
          : 0,
        bestStreak,
        categoriesActive: categoryStats.length,
      },
      categories: categoryStats,
      timestamp: new Date().toISOString(),
    });
  },
]);
