/**
 * Arena Tier System
 *
 * Centralizes tier definitions, matchmaking rules, reward multipliers,
 * and scoring bonuses for strategy battles.
 */

// ─── Tier Definitions ────────────────────────────────

export type ArenaTier = 'UNRANKED' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

const TIER_ORDER: ArenaTier[] = ['UNRANKED', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

export function getTierFromRating(rating: number): ArenaTier {
  if (rating >= 2000) return 'DIAMOND';
  if (rating >= 1600) return 'PLATINUM';
  if (rating >= 1400) return 'GOLD';
  if (rating >= 1200) return 'SILVER';
  if (rating >= 1000) return 'BRONZE';
  return 'UNRANKED';
}

// ─── Matchmaking ─────────────────────────────────────

/** Max rating difference allowed for matchmaking (~2 tiers) */
export const MAX_RATING_DIFFERENCE = 400;

/** Whether two tiers are adjacent (same or +/- 1) */
export function areAdjacentTiers(tier1: ArenaTier, tier2: ArenaTier): boolean {
  const idx1 = TIER_ORDER.indexOf(tier1);
  const idx2 = TIER_ORDER.indexOf(tier2);
  return Math.abs(idx1 - idx2) <= 1;
}

// ─── Reward Multipliers ──────────────────────────────

const TIER_REWARD_MULTIPLIER: Record<ArenaTier, number> = {
  UNRANKED: 1.0,
  BRONZE: 1.0,
  SILVER: 1.1,
  GOLD: 1.2,
  PLATINUM: 1.35,
  DIAMOND: 1.5,
};

/** Get reward multiplier for a battle (uses the higher tier of the two warriors) */
export function getBattleRewardMultiplier(tier1: ArenaTier, tier2: ArenaTier): number {
  const idx1 = TIER_ORDER.indexOf(tier1);
  const idx2 = TIER_ORDER.indexOf(tier2);
  const higherTier = idx1 >= idx2 ? tier1 : tier2;
  return TIER_REWARD_MULTIPLIER[higherTier];
}

// ─── Scoring Bonuses ─────────────────────────────────

/** Streak bonus: +1% per consecutive win, capped at +5% */
export function getStreakBonus(currentStreak: number): number {
  return Math.min(currentStreak * 0.01, 0.05);
}

/** Veteran consistency bonus based on total battles fought */
export function getVeteranBonus(totalBattles: number): number {
  if (totalBattles >= 100) return 0.03;
  if (totalBattles >= 50) return 0.02;
  if (totalBattles >= 20) return 0.01;
  return 0;
}
