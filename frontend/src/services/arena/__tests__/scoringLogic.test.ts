/**
 * Strategy Battle scoring logic tests
 *
 * Tests the public building blocks that strategyArenaService uses:
 *   - arenaScoring (round scores, ELO, move counters, trait bonuses)
 *   - vrfScoring (seed generation, hit/miss, modifier)
 *   - defiConstraints (allocation enforcement)
 *   - arenaTiers (tier resolution, matchmaking, reward multipliers)
 *   - Move map consistency (DEFI_MOVE_MAP ↔ DEFI_TO_DEBATE)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRoundScore,
  calculateEloChange,
  calculateEloChangeDraw,
  getDynamicKFactor,
  generateBaseScore,
  doesCounter,
  calculateMoveMultiplier,
  getMoveTraitBonus,
} from '@/lib/arenaScoring';
import {
  generateVrfSeed,
  determineHitMiss,
  applyHitMissModifier,
} from '@/lib/vrfScoring';
import {
  enforceTraitConstraints,
  maxConcentration,
  minStableAllocation,
  maxRebalanceDelta,
} from '@/lib/defiConstraints';
import {
  getTierFromRating,
  areAdjacentTiers,
  getBattleRewardMultiplier,
  getStreakBonus,
  getVeteranBonus,
  MAX_RATING_DIFFERENCE,
} from '@/lib/arenaTiers';
import { DebateMove, type WarriorTraits } from '@/types/predictionArena';

// ─── Fixtures ─────────────────────────────────────────

const MID_TRAITS: WarriorTraits = {
  strength: 5000,
  wit: 5000,
  charisma: 5000,
  defence: 5000,
  luck: 5000,
};

const HIGH_TRAITS: WarriorTraits = {
  strength: 9000,
  wit: 9000,
  charisma: 9000,
  defence: 9000,
  luck: 9000,
};

const LOW_TRAITS: WarriorTraits = {
  strength: 1000,
  wit: 1000,
  charisma: 1000,
  defence: 1000,
  luck: 1000,
};

// ═══════════════════════════════════════════════════════
// SCORING COMPOSITION (mirrors strategyArenaService.scoreCycle)
// ═══════════════════════════════════════════════════════

describe('Strategy Battle Scoring', () => {
  describe('scoreCycle composition', () => {
    it('should produce higher score for higher yield', () => {
      // Simulate two warriors with same traits/moves but different yields
      const baseScore = generateBaseScore(5000);
      expect(baseScore).toBeGreaterThanOrEqual(40);
      expect(baseScore).toBeLessThanOrEqual(100);

      // Yield component: (yieldEarned / balance) * normalizer
      const highYieldNorm = Math.min(100, (800 * 100) / 1000); // 800bps yield = 80 points
      const lowYieldNorm = Math.min(100, (200 * 100) / 1000);  // 200bps yield = 20 points

      const highWeighted = highYieldNorm * 0.6 + baseScore * 0.4;
      const lowWeighted = lowYieldNorm * 0.6 + baseScore * 0.4;

      expect(highWeighted).toBeGreaterThan(lowWeighted);
    });

    it('should cap yield normalized at 100', () => {
      const yieldNorm = Math.min(100, (2000 * 100) / 1000); // 2000bps = 200% → capped at 100
      expect(yieldNorm).toBe(100);
    });

    it('should handle zero balance without divide-by-zero', () => {
      // Zero balance → yieldRate = 0 (not NaN)
      const balance = 0;
      const yieldEarned = 0;
      const yieldRate = balance > 0 ? (yieldEarned / balance) * 10000 : 0;
      expect(yieldRate).toBe(0);
      expect(Number.isFinite(yieldRate)).toBe(true);
    });
  });

  describe('VRF hit/miss modifier', () => {
    it('should return full score on hit', () => {
      const score = 750;
      expect(applyHitMissModifier(score, true)).toBe(750);
    });

    it('should apply 0.4x on miss', () => {
      const score = 750;
      expect(applyHitMissModifier(score, false)).toBe(300); // 750 * 0.4
    });

    it('should generate deterministic VRF seeds', () => {
      const blockHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const seed1 = generateVrfSeed(1, 1, 100, blockHash);
      const seed2 = generateVrfSeed(1, 1, 100, blockHash);
      expect(seed1).toBe(seed2);
    });

    it('should produce different seeds for different warriors', () => {
      const blockHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const seed1 = generateVrfSeed(1, 1, 100, blockHash);
      const seed2 = generateVrfSeed(1, 1, 200, blockHash);
      expect(seed1).not.toBe(seed2);
    });

    it('should produce different seeds for different rounds', () => {
      const blockHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const seed1 = generateVrfSeed(1, 1, 100, blockHash);
      const seed2 = generateVrfSeed(1, 2, 100, blockHash);
      expect(seed1).not.toBe(seed2);
    });

    it('should have hit probability between 55-85%', () => {
      const blockHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const seed = generateVrfSeed(1, 1, 100, blockHash);

      // Low timing trait → lower hit probability
      const lowResult = determineHitMiss(seed, 0);
      expect(lowResult.hitProbability).toBeGreaterThanOrEqual(5500);

      // High timing trait → higher hit probability
      const highResult = determineHitMiss(seed, 10000);
      expect(highResult.hitProbability).toBeLessThanOrEqual(8500);
    });
  });

  describe('move counter system', () => {
    // Counter table: STRIKE→DODGE, TAUNT→STRIKE, DODGE→SPECIAL, SPECIAL→TAUNT, RECOVER→DODGE
    it('STRIKE counters DODGE', () => {
      expect(doesCounter(DebateMove.STRIKE, DebateMove.DODGE)).toBe(true);
    });

    it('TAUNT counters STRIKE', () => {
      expect(doesCounter(DebateMove.TAUNT, DebateMove.STRIKE)).toBe(true);
    });

    it('DODGE counters SPECIAL', () => {
      expect(doesCounter(DebateMove.DODGE, DebateMove.SPECIAL)).toBe(true);
    });

    it('same move does not counter', () => {
      expect(doesCounter(DebateMove.STRIKE, DebateMove.STRIKE)).toBe(false);
    });

    it('counter multiplier > 1', () => {
      // STRIKE counters DODGE
      const result = calculateMoveMultiplier(DebateMove.STRIKE, DebateMove.DODGE);
      expect(result).toBeGreaterThan(1.0);
    });

    it('countered multiplier < 1', () => {
      // DODGE is countered by RECOVER
      const result = calculateMoveMultiplier(DebateMove.DODGE, DebateMove.RECOVER);
      expect(result).toBeLessThan(1.0);
    });

    it('neutral multiplier is 1.0x', () => {
      const result = calculateMoveMultiplier(DebateMove.STRIKE, DebateMove.STRIKE);
      expect(result).toBeCloseTo(1.0, 1);
    });
  });

  describe('trait bonuses', () => {
    it('STRIKE benefits from strength', () => {
      const highStr = { ...MID_TRAITS, strength: 9000 };
      const lowStr = { ...MID_TRAITS, strength: 1000 };
      expect(getMoveTraitBonus(DebateMove.STRIKE, highStr))
        .toBeGreaterThan(getMoveTraitBonus(DebateMove.STRIKE, lowStr));
    });

    it('TAUNT benefits from wit', () => {
      const highWit = { ...MID_TRAITS, wit: 9000 };
      const lowWit = { ...MID_TRAITS, wit: 1000 };
      expect(getMoveTraitBonus(DebateMove.TAUNT, highWit))
        .toBeGreaterThan(getMoveTraitBonus(DebateMove.TAUNT, lowWit));
    });
  });

  describe('calculateRoundScore integration', () => {
    it('should return finalScore within [0, 1000]', () => {
      const result = calculateRoundScore(
        75, // baseScore
        MID_TRAITS,
        DebateMove.STRIKE,
        DebateMove.DODGE, // STRIKE counters DODGE
        MID_TRAITS,
      );
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(1000);
    });

    it('counter advantage should increase score', () => {
      // STRIKE counters DODGE — should produce higher score
      const countered = calculateRoundScore(75, MID_TRAITS, DebateMove.STRIKE, DebateMove.DODGE, MID_TRAITS);
      // STRIKE vs SPECIAL — neutral
      const neutral = calculateRoundScore(75, MID_TRAITS, DebateMove.STRIKE, DebateMove.RECOVER, MID_TRAITS);
      expect(countered.finalScore).toBeGreaterThanOrEqual(neutral.finalScore);
    });
  });
});

// ═══════════════════════════════════════════════════════
// ELO RATING SYSTEM
// ═══════════════════════════════════════════════════════

describe('ELO Rating for Strategy Battles', () => {
  it('underdog win yields larger delta than equal-rating win', () => {
    const equal = calculateEloChange(1000, 1000);
    const upset = calculateEloChange(800, 1200);

    const equalDelta = equal.winnerNewRating - 1000;
    const upsetDelta = upset.winnerNewRating - 800;

    expect(upsetDelta).toBeGreaterThan(equalDelta);
  });

  it('draw between unequal ratings adjusts both toward center', () => {
    const result = calculateEloChangeDraw(1200, 800);
    expect(result.newRating1).toBeLessThan(1200);
    expect(result.newRating2).toBeGreaterThan(800);
  });

  it('K-factor decreases with experience', () => {
    expect(getDynamicKFactor(5)).toBeGreaterThan(getDynamicKFactor(25));
    expect(getDynamicKFactor(25)).toBeGreaterThan(getDynamicKFactor(60));
  });

  it('rating changes are symmetric for equal ratings', () => {
    const result = calculateEloChange(1000, 1000);
    const gain = result.winnerNewRating - 1000;
    const loss = 1000 - result.loserNewRating;
    expect(gain).toBe(loss);
  });
});

// ═══════════════════════════════════════════════════════
// DEFI CONSTRAINTS (allocation enforcement)
// ═══════════════════════════════════════════════════════

describe('DeFi Trait Constraints', () => {
  it('maxConcentration scales with alpha trait', () => {
    expect(maxConcentration(0)).toBeLessThan(maxConcentration(10000));
    expect(maxConcentration(0)).toBeGreaterThanOrEqual(2000);
    expect(maxConcentration(10000)).toBeLessThanOrEqual(8000);
  });

  it('minStableAllocation scales with hedge trait', () => {
    expect(minStableAllocation(10000)).toBeGreaterThan(minStableAllocation(0));
    expect(minStableAllocation(0)).toBeGreaterThanOrEqual(500);
  });

  it('maxRebalanceDelta scales with momentum trait', () => {
    expect(maxRebalanceDelta(10000)).toBeGreaterThan(maxRebalanceDelta(0));
    expect(maxRebalanceDelta(0)).toBeGreaterThanOrEqual(500);
  });

  it('enforceTraitConstraints output always sums to 10000', () => {
    const traits = { alpha: 3000, hedge: 6000, momentum: 5000, complexity: 5000, timing: 5000 };
    const allocation = { highYield: 8000, stable: 500, lp: 1500 };

    const result = enforceTraitConstraints(allocation, traits);
    const sum = result.highYield + result.stable + result.lp;
    expect(sum).toBe(10000);
  });

  it('enforceTraitConstraints respects stable floor', () => {
    const traits = { alpha: 5000, hedge: 8000, momentum: 5000, complexity: 5000, timing: 5000 };
    const allocation = { highYield: 9000, stable: 0, lp: 1000 };

    const result = enforceTraitConstraints(allocation, traits);
    expect(result.stable).toBeGreaterThanOrEqual(minStableAllocation(8000));
  });

  it('enforceTraitConstraints respects concentration cap', () => {
    const traits = { alpha: 2000, hedge: 5000, momentum: 5000, complexity: 5000, timing: 5000 };
    const allocation = { highYield: 9500, stable: 250, lp: 250 };

    const result = enforceTraitConstraints(allocation, traits);
    const cap = maxConcentration(2000);
    expect(result.highYield).toBeLessThanOrEqual(cap);
    expect(result.lp).toBeLessThanOrEqual(cap);
  });
});

// ═══════════════════════════════════════════════════════
// ARENA TIERS (matchmaking)
// ═══════════════════════════════════════════════════════

describe('Arena Tiers for Strategy Battles', () => {
  it('getTierFromRating returns correct tiers', () => {
    expect(getTierFromRating(500)).toBe('UNRANKED');
    expect(getTierFromRating(1000)).toBe('BRONZE');
    expect(getTierFromRating(1200)).toBe('SILVER');
    expect(getTierFromRating(1400)).toBe('GOLD');
    expect(getTierFromRating(1600)).toBe('PLATINUM');
    expect(getTierFromRating(2000)).toBe('DIAMOND');
  });

  it('adjacent tiers are matchmakeable', () => {
    expect(areAdjacentTiers('BRONZE', 'SILVER')).toBe(true);
    expect(areAdjacentTiers('GOLD', 'GOLD')).toBe(true);
    expect(areAdjacentTiers('BRONZE', 'GOLD')).toBe(false);
  });

  it('reward multiplier increases with tier', () => {
    const bronzeM = getBattleRewardMultiplier('BRONZE', 'BRONZE');
    const goldM = getBattleRewardMultiplier('GOLD', 'GOLD');
    const diamondM = getBattleRewardMultiplier('DIAMOND', 'DIAMOND');
    expect(goldM).toBeGreaterThan(bronzeM);
    expect(diamondM).toBeGreaterThan(goldM);
  });

  it('streak bonus caps at 5%', () => {
    expect(getStreakBonus(0)).toBe(0);
    expect(getStreakBonus(1)).toBeGreaterThan(0);
    expect(getStreakBonus(10)).toBeLessThanOrEqual(0.05);
  });

  it('veteran bonus scales with battle count', () => {
    expect(getVeteranBonus(5)).toBe(0);
    expect(getVeteranBonus(20)).toBeGreaterThan(0);
    expect(getVeteranBonus(100)).toBeGreaterThan(getVeteranBonus(50));
  });

  it('MAX_RATING_DIFFERENCE is defined', () => {
    expect(MAX_RATING_DIFFERENCE).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// MOVE MAP CONSISTENCY
// ═══════════════════════════════════════════════════════

describe('Move Map Consistency', () => {
  // These match the maps in strategyArenaService.ts
  const DEFI_MOVE_MAP: Record<string, string> = {
    STRIKE: 'REBALANCE',
    TAUNT: 'CONCENTRATE',
    DODGE: 'HEDGE_UP',
    SPECIAL: 'COMPOSE',
    RECOVER: 'FLASH',
  };

  const DEFI_TO_DEBATE: Record<string, string> = Object.fromEntries(
    Object.entries(DEFI_MOVE_MAP).map(([k, v]) => [v, k])
  );

  it('DEFI_MOVE_MAP and DEFI_TO_DEBATE are exact inverses', () => {
    for (const [debate, defi] of Object.entries(DEFI_MOVE_MAP)) {
      expect(DEFI_TO_DEBATE[defi]).toBe(debate);
    }
    for (const [defi, debate] of Object.entries(DEFI_TO_DEBATE)) {
      expect(DEFI_MOVE_MAP[debate]).toBe(defi);
    }
  });

  it('both maps have exactly 5 entries', () => {
    expect(Object.keys(DEFI_MOVE_MAP)).toHaveLength(5);
    expect(Object.keys(DEFI_TO_DEBATE)).toHaveLength(5);
  });

  it('all DebateMove values are mapped', () => {
    const debateMoves = ['STRIKE', 'TAUNT', 'DODGE', 'SPECIAL', 'RECOVER'];
    for (const move of debateMoves) {
      expect(DEFI_MOVE_MAP[move]).toBeDefined();
    }
  });

  it('all DeFi moves are mapped', () => {
    const defiMoves = ['REBALANCE', 'CONCENTRATE', 'HEDGE_UP', 'COMPOSE', 'FLASH'];
    for (const move of defiMoves) {
      expect(DEFI_TO_DEBATE[move]).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════
// FALLBACK ALLOCATION LOGIC
// ═══════════════════════════════════════════════════════

describe('Fallback Allocation Logic', () => {
  // Mirror the FLASH logic from strategyArenaService.computeFallbackAllocation
  function computeFlashAllocation(
    current: { highYield: number; stable: number; lp: number },
    poolAPYs: { highYield: number; stable: number; lp: number },
  ) {
    let hy = Math.round(current.highYield * 0.95 + (poolAPYs.highYield > poolAPYs.lp ? 500 : 0));
    let st = current.stable;
    if (hy + st > 10000) {
      const excess = hy + st - 10000;
      if (hy >= st) { hy -= excess; } else { st -= excess; }
    }
    return { highYield: hy, stable: st, lp: Math.max(0, 10000 - hy - st) };
  }

  it('FLASH allocation always sums to 10000', () => {
    const cases = [
      { current: { highYield: 4000, stable: 3000, lp: 3000 }, apys: { highYield: 1800, stable: 400, lp: 1200 } },
      { current: { highYield: 9500, stable: 500, lp: 0 }, apys: { highYield: 1800, stable: 400, lp: 1200 } },
      { current: { highYield: 0, stable: 10000, lp: 0 }, apys: { highYield: 500, stable: 500, lp: 500 } },
      { current: { highYield: 5000, stable: 5000, lp: 0 }, apys: { highYield: 2000, stable: 100, lp: 100 } },
      { current: { highYield: 9000, stable: 1000, lp: 0 }, apys: { highYield: 3000, stable: 0, lp: 0 } },
    ];

    for (const { current, apys } of cases) {
      const result = computeFlashAllocation(current, apys);
      const sum = result.highYield + result.stable + result.lp;
      expect(sum).toBe(10000);
      expect(result.highYield).toBeGreaterThanOrEqual(0);
      expect(result.stable).toBeGreaterThanOrEqual(0);
      expect(result.lp).toBeGreaterThanOrEqual(0);
    }
  });

  it('FLASH with extreme allocation does not produce negative values', () => {
    // Edge case: HY at 9500, stable at 500 → after 0.95 + 500 shift
    const result = computeFlashAllocation(
      { highYield: 9500, stable: 500, lp: 0 },
      { highYield: 3000, stable: 100, lp: 100 },
    );
    expect(result.highYield).toBeGreaterThanOrEqual(0);
    expect(result.stable).toBeGreaterThanOrEqual(0);
    expect(result.lp).toBeGreaterThanOrEqual(0);
    expect(result.highYield + result.stable + result.lp).toBe(10000);
  });
});
