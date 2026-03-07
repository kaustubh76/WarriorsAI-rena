/**
 * User Topic Stats Service
 *
 * Tracks per-user prediction stats by topic category.
 * Called when bets are settled (won/lost) to update predictions, streaks, and earnings.
 *
 * Uses PostgreSQL upsert (ON CONFLICT) for atomic, race-condition-free updates.
 */

import { prisma } from '@/lib/prisma';

/**
 * Record a prediction outcome for a user in a topic category.
 * Uses atomic upsert to avoid race conditions on concurrent bet settlements.
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
    const streakVal = won ? 1 : 0;

    await prisma.$executeRaw`
      INSERT INTO "UserTopicStats" ("id", "userId", "category", "predictions", "correct", "currentStreak", "longestStreak", "earnings", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${userId}, ${category}, 1, ${correctInc}, ${streakVal}, ${streakVal}, ${earningsStr}, NOW(), NOW())
      ON CONFLICT ("userId", "category") DO UPDATE SET
        "predictions" = "UserTopicStats"."predictions" + 1,
        "correct" = "UserTopicStats"."correct" + ${correctInc},
        "currentStreak" = CASE WHEN ${won} THEN "UserTopicStats"."currentStreak" + 1 ELSE 0 END,
        "longestStreak" = GREATEST("UserTopicStats"."longestStreak", CASE WHEN ${won} THEN "UserTopicStats"."currentStreak" + 1 ELSE "UserTopicStats"."longestStreak" END),
        "earnings" = CASE WHEN ${won} AND ${earningsStr} != '0' THEN (CAST("UserTopicStats"."earnings" AS BIGINT) + ${BigInt(earningsStr)})::TEXT ELSE "UserTopicStats"."earnings" END,
        "updatedAt" = NOW()
    `;
  } catch (err) {
    // Don't let stats tracking failures break bet settlement
    console.error('[UserTopicStats] Failed to record prediction outcome:', err);
  }
}
