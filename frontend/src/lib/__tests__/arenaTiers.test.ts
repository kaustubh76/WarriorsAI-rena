import { describe, it, expect } from 'vitest';
import {
  getTierFromRating,
  areAdjacentTiers,
  getBattleRewardMultiplier,
  getStreakBonus,
  getVeteranBonus,
  MAX_RATING_DIFFERENCE,
} from '../arenaTiers';

// ═══════════════════════════════════════════════════════
// getTierFromRating
// ═══════════════════════════════════════════════════════

describe('getTierFromRating', () => {
  it('below 1000 → UNRANKED', () => {
    expect(getTierFromRating(0)).toBe('UNRANKED');
    expect(getTierFromRating(500)).toBe('UNRANKED');
    expect(getTierFromRating(999)).toBe('UNRANKED');
  });

  it('negative rating → UNRANKED', () => {
    expect(getTierFromRating(-100)).toBe('UNRANKED');
  });

  it('1000-1199 → BRONZE', () => {
    expect(getTierFromRating(1000)).toBe('BRONZE');
    expect(getTierFromRating(1100)).toBe('BRONZE');
    expect(getTierFromRating(1199)).toBe('BRONZE');
  });

  it('1200-1399 → SILVER', () => {
    expect(getTierFromRating(1200)).toBe('SILVER');
    expect(getTierFromRating(1399)).toBe('SILVER');
  });

  it('1400-1599 → GOLD', () => {
    expect(getTierFromRating(1400)).toBe('GOLD');
    expect(getTierFromRating(1599)).toBe('GOLD');
  });

  it('1600-1999 → PLATINUM', () => {
    expect(getTierFromRating(1600)).toBe('PLATINUM');
    expect(getTierFromRating(1999)).toBe('PLATINUM');
  });

  it('2000+ → DIAMOND', () => {
    expect(getTierFromRating(2000)).toBe('DIAMOND');
    expect(getTierFromRating(3000)).toBe('DIAMOND');
  });
});

// ═══════════════════════════════════════════════════════
// areAdjacentTiers
// ═══════════════════════════════════════════════════════

describe('areAdjacentTiers', () => {
  it('same tier → true', () => {
    expect(areAdjacentTiers('BRONZE', 'BRONZE')).toBe(true);
    expect(areAdjacentTiers('DIAMOND', 'DIAMOND')).toBe(true);
  });

  it('adjacent tiers → true', () => {
    expect(areAdjacentTiers('UNRANKED', 'BRONZE')).toBe(true);
    expect(areAdjacentTiers('BRONZE', 'SILVER')).toBe(true);
    expect(areAdjacentTiers('SILVER', 'GOLD')).toBe(true);
    expect(areAdjacentTiers('GOLD', 'PLATINUM')).toBe(true);
    expect(areAdjacentTiers('PLATINUM', 'DIAMOND')).toBe(true);
  });

  it('order does not matter', () => {
    expect(areAdjacentTiers('SILVER', 'BRONZE')).toBe(true);
    expect(areAdjacentTiers('DIAMOND', 'PLATINUM')).toBe(true);
  });

  it('non-adjacent tiers → false', () => {
    expect(areAdjacentTiers('UNRANKED', 'SILVER')).toBe(false);
    expect(areAdjacentTiers('BRONZE', 'GOLD')).toBe(false);
    expect(areAdjacentTiers('UNRANKED', 'DIAMOND')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// getBattleRewardMultiplier
// ═══════════════════════════════════════════════════════

describe('getBattleRewardMultiplier', () => {
  it('same tier uses that multiplier', () => {
    expect(getBattleRewardMultiplier('BRONZE', 'BRONZE')).toBe(1.0);
    expect(getBattleRewardMultiplier('SILVER', 'SILVER')).toBe(1.1);
    expect(getBattleRewardMultiplier('GOLD', 'GOLD')).toBe(1.2);
    expect(getBattleRewardMultiplier('PLATINUM', 'PLATINUM')).toBe(1.35);
    expect(getBattleRewardMultiplier('DIAMOND', 'DIAMOND')).toBe(1.5);
  });

  it('uses higher tier multiplier', () => {
    expect(getBattleRewardMultiplier('BRONZE', 'DIAMOND')).toBe(1.5);
    expect(getBattleRewardMultiplier('DIAMOND', 'BRONZE')).toBe(1.5);
    expect(getBattleRewardMultiplier('SILVER', 'GOLD')).toBe(1.2);
  });

  it('UNRANKED vs any → at least 1.0', () => {
    expect(getBattleRewardMultiplier('UNRANKED', 'UNRANKED')).toBe(1.0);
    expect(getBattleRewardMultiplier('UNRANKED', 'PLATINUM')).toBe(1.35);
  });
});

// ═══════════════════════════════════════════════════════
// getStreakBonus
// ═══════════════════════════════════════════════════════

describe('getStreakBonus', () => {
  it('0 streak → 0 bonus', () => expect(getStreakBonus(0)).toBe(0));
  it('1 streak → 0.01', () => expect(getStreakBonus(1)).toBe(0.01));
  it('3 streak → 0.03', () => expect(getStreakBonus(3)).toBe(0.03));
  it('5 streak → 0.05 (cap)', () => expect(getStreakBonus(5)).toBe(0.05));
  it('10 streak → 0.05 (capped)', () => expect(getStreakBonus(10)).toBe(0.05));
  it('negative streak → 0 (min)', () => expect(getStreakBonus(-5)).toBeLessThanOrEqual(0));
});

// ═══════════════════════════════════════════════════════
// getVeteranBonus
// ═══════════════════════════════════════════════════════

describe('getVeteranBonus', () => {
  it('0 battles → 0', () => expect(getVeteranBonus(0)).toBe(0));
  it('19 battles → 0', () => expect(getVeteranBonus(19)).toBe(0));
  it('20 battles → 0.01', () => expect(getVeteranBonus(20)).toBe(0.01));
  it('49 battles → 0.01', () => expect(getVeteranBonus(49)).toBe(0.01));
  it('50 battles → 0.02', () => expect(getVeteranBonus(50)).toBe(0.02));
  it('99 battles → 0.02', () => expect(getVeteranBonus(99)).toBe(0.02));
  it('100 battles → 0.03', () => expect(getVeteranBonus(100)).toBe(0.03));
  it('1000 battles → 0.03', () => expect(getVeteranBonus(1000)).toBe(0.03));
});

// ═══════════════════════════════════════════════════════
// MAX_RATING_DIFFERENCE constant
// ═══════════════════════════════════════════════════════

describe('MAX_RATING_DIFFERENCE', () => {
  it('is 400', () => expect(MAX_RATING_DIFFERENCE).toBe(400));
});
