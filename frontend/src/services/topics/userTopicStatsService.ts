/**
 * User Topic Stats Service
 *
 * Tracks per-user prediction stats by topic category.
 * Called when bets are settled (won/lost) to update predictions, streaks, and earnings.
 *
 * Uses 0G Storage via the db compatibility layer.
 */

import { prisma } from '@/lib/prisma';

/**
 * Record a prediction outcome for a user in a topic category.
 */
export async function recordPredictionOutcome(params: {
  userId: string;
  category: string;
  won: boolean;
  earnings?: bigint;
}): Promise<void> {
  const { userId, category, won, earnings } = params;

  if (!userId || !category) return;

  try {
    const earningsStr = earnings && won ? earnings.toString() : '0';
    const correctInc = won ? 1 : 0;

    const existing = prisma.userTopicStats.findFirst({ where: { userId, category } });

    if (existing) {
      const newStreak = won ? ((existing as Record<string, unknown>).currentStreak as number ?? 0) + 1 : 0;
      const oldLongest = (existing as Record<string, unknown>).longestStreak as number ?? 0;
      const oldEarnings = String((existing as Record<string, unknown>).earnings ?? '0');

      prisma.userTopicStats.update({
        where: { id: existing.id },
        data: {
          predictions: { increment: 1 },
          correct: { increment: correctInc },
          currentStreak: newStreak,
          longestStreak: Math.max(oldLongest, newStreak),
          earnings: won && earningsStr !== '0'
            ? (BigInt(oldEarnings) + BigInt(earningsStr)).toString()
            : undefined,
          updatedAt: new Date(),
        },
      });
    } else {
      prisma.userTopicStats.create({
        data: {
          userId,
          category,
          predictions: 1,
          correct: correctInc,
          currentStreak: won ? 1 : 0,
          longestStreak: won ? 1 : 0,
          earnings: earningsStr,
          updatedAt: new Date(),
        },
      });
    }
  } catch (err) {
    // Don't let stats tracking failures break bet settlement
    console.error('[UserTopicStats] Failed to record prediction outcome:', err);
  }
}
