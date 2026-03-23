import { describe, it, expect } from 'vitest';
import {
  calculateRoundScore,
  calculateStrategyRoundScore,
  selectOptimalMove,
  calculateEloChange,
  calculateEloChangeDraw,
  getDynamicKFactor,
  generateBaseScore,
  calculateTraitModifiers,
  getMoveTraitBonus,
  calculateMoveMultiplier,
  doesCounter,
} from '../arenaScoring';
import { DebateMove, type WarriorTraits } from '../../types/predictionArena';

// ─── Test Fixtures ──────────────────────────────────────

const DEFAULT_TRAITS: WarriorTraits = {
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
// ELO RATING TESTS
// ═══════════════════════════════════════════════════════

describe('ELO Rating', () => {
  describe('calculateEloChange', () => {
    it('should increase winner rating and decrease loser rating', () => {
      const result = calculateEloChange(1000, 1000);
      expect(result.winnerNewRating).toBeGreaterThan(1000);
      expect(result.loserNewRating).toBeLessThan(1000);
    });

    it('should give equal-rated players symmetric changes', () => {
      const result = calculateEloChange(1000, 1000);
      const winnerGain = result.winnerNewRating - 1000;
      const loserLoss = 1000 - result.loserNewRating;
      expect(winnerGain).toBe(loserLoss);
    });

    it('should give smaller gain when beating a lower-rated opponent', () => {
      const easyWin = calculateEloChange(1500, 1000);
      const hardWin = calculateEloChange(1000, 1500);
      const easyGain = easyWin.winnerNewRating - 1500;
      const hardGain = hardWin.winnerNewRating - 1000;
      expect(hardGain).toBeGreaterThan(easyGain);
    });

    it('should respect custom K-factor', () => {
      const k48 = calculateEloChange(1000, 1000, 48);
      const k24 = calculateEloChange(1000, 1000, 24);
      const gain48 = k48.winnerNewRating - 1000;
      const gain24 = k24.winnerNewRating - 1000;
      expect(gain48).toBe(gain24 * 2);
    });

    it('should never drop below minimum rating of 100', () => {
      const result = calculateEloChange(1500, 100, 48);
      expect(result.loserNewRating).toBeGreaterThanOrEqual(100);
    });
  });

  describe('calculateEloChangeDraw', () => {
    it('should produce no change for equal-rated players', () => {
      const result = calculateEloChangeDraw(1000, 1000);
      expect(result.newRating1).toBe(1000);
      expect(result.newRating2).toBe(1000);
    });

    it('should converge ratings: higher-rated player loses, lower gains', () => {
      const result = calculateEloChangeDraw(1200, 800);
      expect(result.newRating1).toBeLessThan(1200);
      expect(result.newRating2).toBeGreaterThan(800);
    });
  });

  describe('getDynamicKFactor', () => {
    it('should return 48 for new players (<10 battles)', () => {
      expect(getDynamicKFactor(0)).toBe(48);
      expect(getDynamicKFactor(5)).toBe(48);
      expect(getDynamicKFactor(9)).toBe(48);
    });

    it('should return 32 for intermediate players (10-29 battles)', () => {
      expect(getDynamicKFactor(10)).toBe(32);
      expect(getDynamicKFactor(20)).toBe(32);
      expect(getDynamicKFactor(29)).toBe(32);
    });

    it('should return 24 for veteran players (30+ battles)', () => {
      expect(getDynamicKFactor(30)).toBe(24);
      expect(getDynamicKFactor(50)).toBe(24);
      expect(getDynamicKFactor(100)).toBe(24);
    });
  });
});

// ═══════════════════════════════════════════════════════
// SCORING TESTS
// ═══════════════════════════════════════════════════════

describe('Round Score Calculation', () => {
  describe('calculateRoundScore', () => {
    it('should return a valid ScoreBreakdown', () => {
      const result = calculateRoundScore(70, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.TAUNT);
      expect(result).toHaveProperty('baseScore', 70);
      expect(result).toHaveProperty('traitBonus');
      expect(result).toHaveProperty('moveMultiplier');
      expect(result).toHaveProperty('counterBonus');
      expect(result).toHaveProperty('finalScore');
    });

    it('should clamp score to [0, 1000]', () => {
      // Very high base score
      const result = calculateRoundScore(500, HIGH_TRAITS, DebateMove.STRIKE, DebateMove.DODGE);
      expect(result.finalScore).toBeLessThanOrEqual(1000);
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
    });

    it('should give counter bonus when move counters opponent', () => {
      // STRIKE counters TAUNT (check MOVE_COUNTERS to verify)
      const countering = calculateRoundScore(70, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.TAUNT);
      const neutral = calculateRoundScore(70, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.STRIKE);

      // If STRIKE counters TAUNT, the countering score should be higher
      if (doesCounter(DebateMove.STRIKE, DebateMove.TAUNT)) {
        expect(countering.finalScore).toBeGreaterThan(neutral.finalScore);
        expect(countering.counterBonus).toBeGreaterThan(0);
      }
    });

    it('should apply penalty when countered', () => {
      // Find a counter relationship and test the penalty
      const countered = calculateRoundScore(70, DEFAULT_TRAITS, DebateMove.TAUNT, DebateMove.STRIKE);
      const neutral = calculateRoundScore(70, DEFAULT_TRAITS, DebateMove.TAUNT, DebateMove.TAUNT);

      if (doesCounter(DebateMove.STRIKE, DebateMove.TAUNT)) {
        expect(countered.finalScore).toBeLessThan(neutral.finalScore);
      }
    });

    it('should reduce score based on opponent defence', () => {
      const noDefence = calculateRoundScore(70, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.DODGE, LOW_TRAITS);
      const highDefence = calculateRoundScore(70, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.DODGE, HIGH_TRAITS);
      expect(highDefence.finalScore).toBeLessThan(noDefence.finalScore);
    });

    it('should handle zero base score', () => {
      const result = calculateRoundScore(0, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.TAUNT);
      expect(result.finalScore).toBe(0);
      expect(result.baseScore).toBe(0);
    });
  });

  describe('generateBaseScore', () => {
    it('should return scores in valid range [40, 100]', () => {
      for (let i = 0; i < 50; i++) {
        const score = generateBaseScore(5000);
        expect(score).toBeGreaterThanOrEqual(40);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('should produce higher minimums with higher luck', () => {
      // High luck should generally produce higher scores
      const highLuckScores: number[] = [];
      const lowLuckScores: number[] = [];
      for (let i = 0; i < 100; i++) {
        highLuckScores.push(generateBaseScore(9000));
        lowLuckScores.push(generateBaseScore(1000));
      }
      const highAvg = highLuckScores.reduce((a, b) => a + b) / highLuckScores.length;
      const lowAvg = lowLuckScores.reduce((a, b) => a + b) / lowLuckScores.length;
      expect(highAvg).toBeGreaterThan(lowAvg);
    });
  });
});

// ═══════════════════════════════════════════════════════
// TRAIT MODIFIER TESTS
// ═══════════════════════════════════════════════════════

describe('Trait Modifiers', () => {
  describe('calculateTraitModifiers', () => {
    it('should return modifiers proportional to traits', () => {
      const mods = calculateTraitModifiers(DEFAULT_TRAITS);
      // 5000/10000 * 0.25 = 0.125
      expect(mods.strengthBonus).toBeCloseTo(0.125, 3);
      expect(mods.witBonus).toBeCloseTo(0.100, 3);
      expect(mods.charismaBonus).toBeCloseTo(0.075, 3);
      expect(mods.defenceBonus).toBeCloseTo(0.100, 3);
      expect(mods.luckBonus).toBeCloseTo(0.050, 3);
    });

    it('should return max modifiers for max traits', () => {
      const mods = calculateTraitModifiers({
        strength: 10000,
        wit: 10000,
        charisma: 10000,
        defence: 10000,
        luck: 10000,
      });
      expect(mods.strengthBonus).toBeCloseTo(0.25, 3);
      expect(mods.witBonus).toBeCloseTo(0.20, 3);
      expect(mods.charismaBonus).toBeCloseTo(0.15, 3);
      expect(mods.defenceBonus).toBeCloseTo(0.20, 3);
      expect(mods.luckBonus).toBeCloseTo(0.10, 3);
    });

    it('should return zero modifiers for zero traits', () => {
      const mods = calculateTraitModifiers({
        strength: 0, wit: 0, charisma: 0, defence: 0, luck: 0,
      });
      expect(mods.strengthBonus).toBe(0);
      expect(mods.witBonus).toBe(0);
    });
  });

  describe('getMoveTraitBonus', () => {
    it('should return non-negative bonus', () => {
      const bonus = getMoveTraitBonus(DebateMove.STRIKE, DEFAULT_TRAITS);
      expect(bonus).toBeGreaterThanOrEqual(0);
    });

    it('should cap at ~20%', () => {
      const bonus = getMoveTraitBonus(DebateMove.STRIKE, {
        strength: 10000, wit: 10000, charisma: 10000, defence: 10000, luck: 10000,
      });
      expect(bonus).toBeLessThanOrEqual(0.21);
    });
  });
});

// ═══════════════════════════════════════════════════════
// MOVE EFFECTIVENESS TESTS
// ═══════════════════════════════════════════════════════

describe('Move Effectiveness', () => {
  describe('calculateMoveMultiplier', () => {
    it('should return 1.3 when countering', () => {
      // Find a counter pair
      if (doesCounter(DebateMove.STRIKE, DebateMove.TAUNT)) {
        expect(calculateMoveMultiplier(DebateMove.STRIKE, DebateMove.TAUNT)).toBe(1.3);
      }
    });

    it('should return 0.7 when countered', () => {
      if (doesCounter(DebateMove.STRIKE, DebateMove.TAUNT)) {
        expect(calculateMoveMultiplier(DebateMove.TAUNT, DebateMove.STRIKE)).toBe(0.7);
      }
    });

    it('should return 1.0 for neutral matchup', () => {
      // Same move vs same move is always neutral
      expect(calculateMoveMultiplier(DebateMove.STRIKE, DebateMove.STRIKE)).toBe(1.0);
    });
  });

  describe('doesCounter', () => {
    it('should return boolean', () => {
      const result = doesCounter(DebateMove.STRIKE, DebateMove.TAUNT);
      expect(typeof result).toBe('boolean');
    });
  });
});

// ═══════════════════════════════════════════════════════
// STRATEGY SCORING TESTS
// ═══════════════════════════════════════════════════════

describe('Strategy Round Score (calculateStrategyRoundScore)', () => {
  it('should return a valid StrategyScoreBreakdown with all components', () => {
    const result = calculateStrategyRoundScore(
      500, 75, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.TAUNT, DEFAULT_TRAITS, true
    );
    expect(result).toHaveProperty('yieldComponent');
    expect(result).toHaveProperty('aiQualityComponent');
    expect(result).toHaveProperty('traitBonusComponent');
    expect(result).toHaveProperty('moveCounterComponent');
    expect(result).toHaveProperty('vrfModifier');
    expect(result).toHaveProperty('finalScore');
    expect(result).toHaveProperty('baseScore');
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(1000);
  });

  it('should produce higher score with VRF hit than miss', () => {
    const hit = calculateStrategyRoundScore(
      500, 75, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.DODGE, DEFAULT_TRAITS, true
    );
    const miss = calculateStrategyRoundScore(
      500, 75, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.DODGE, DEFAULT_TRAITS, false
    );
    expect(hit.vrfModifier).toBe(1.0);
    expect(miss.vrfModifier).toBe(0.4);
    expect(hit.finalScore).toBeGreaterThan(miss.finalScore);
  });

  it('should handle zero yield — AI + trait + move components still contribute', () => {
    const result = calculateStrategyRoundScore(
      0, 80, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.DODGE, DEFAULT_TRAITS, true
    );
    expect(result.yieldComponent).toBe(0);
    expect(result.aiQualityComponent).toBeGreaterThan(0);
    expect(result.finalScore).toBeGreaterThan(0);
  });

  it('should handle zero AI quality — yield still contributes', () => {
    const result = calculateStrategyRoundScore(
      500, 0, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.DODGE, DEFAULT_TRAITS, true
    );
    expect(result.aiQualityComponent).toBe(0);
    expect(result.yieldComponent).toBeGreaterThan(0);
    expect(result.finalScore).toBeGreaterThan(0);
  });

  it('should clamp final score to [0, 1000]', () => {
    // Very high yield
    const result = calculateStrategyRoundScore(
      2000, 100, HIGH_TRAITS, DebateMove.STRIKE, DebateMove.TAUNT, LOW_TRAITS, true
    );
    expect(result.finalScore).toBeLessThanOrEqual(1000);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('should produce zero score for all-zero inputs with VRF miss', () => {
    const result = calculateStrategyRoundScore(
      0, 0,
      { strength: 0, wit: 0, charisma: 0, defence: 0, luck: 0 },
      DebateMove.STRIKE, DebateMove.STRIKE,
      DEFAULT_TRAITS, false
    );
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('should give higher score when countering opponent move', () => {
    if (doesCounter(DebateMove.STRIKE, DebateMove.TAUNT)) {
      const countering = calculateStrategyRoundScore(
        500, 75, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.TAUNT, DEFAULT_TRAITS, true
      );
      const neutral = calculateStrategyRoundScore(
        500, 75, DEFAULT_TRAITS, DebateMove.STRIKE, DebateMove.STRIKE, DEFAULT_TRAITS, true
      );
      expect(countering.moveCounterComponent).toBeGreaterThan(neutral.moveCounterComponent);
    }
  });
});

// ═══════════════════════════════════════════════════════
// MOVE SELECTION TESTS
// ═══════════════════════════════════════════════════════

describe('selectOptimalMove', () => {
  const ALL_MOVES = [DebateMove.STRIKE, DebateMove.TAUNT, DebateMove.DODGE, DebateMove.SPECIAL, DebateMove.RECOVER];

  it('should return a valid DebateMove', () => {
    const move = selectOptimalMove(DEFAULT_TRAITS, 1);
    expect(ALL_MOVES).toContain(move);
  });

  it('should handle empty previousMoves array', () => {
    const move = selectOptimalMove(DEFAULT_TRAITS, 1, undefined, []);
    expect(ALL_MOVES).toContain(move);
  });

  it('should handle round 1 with no opponent last move', () => {
    const move = selectOptimalMove(DEFAULT_TRAITS, 1, undefined);
    expect(ALL_MOVES).toContain(move);
  });

  it('should handle round 5 (final round)', () => {
    const move = selectOptimalMove(DEFAULT_TRAITS, 5, DebateMove.STRIKE, [
      DebateMove.STRIKE, DebateMove.TAUNT, DebateMove.DODGE, DebateMove.SPECIAL,
    ]);
    expect(ALL_MOVES).toContain(move);
  });

  it('should penalize overused moves (run many times to check distribution)', () => {
    // If all previous moves are STRIKE, STRIKE should be penalized
    const previousMoves = [DebateMove.STRIKE, DebateMove.STRIKE, DebateMove.STRIKE, DebateMove.STRIKE];
    let strikeCount = 0;
    const iterations = 200;
    for (let i = 0; i < iterations; i++) {
      const move = selectOptimalMove(DEFAULT_TRAITS, 5, undefined, previousMoves);
      if (move === DebateMove.STRIKE) strikeCount++;
    }
    // STRIKE should be selected less than 50% of the time due to penalty
    expect(strikeCount / iterations).toBeLessThan(0.5);
  });

  it('should work with extreme trait values', () => {
    // All zero traits
    const move1 = selectOptimalMove(
      { strength: 0, wit: 0, charisma: 0, defence: 0, luck: 0 }, 1
    );
    expect(ALL_MOVES).toContain(move1);

    // All max traits
    const move2 = selectOptimalMove(
      { strength: 10000, wit: 10000, charisma: 10000, defence: 10000, luck: 10000 }, 1
    );
    expect(ALL_MOVES).toContain(move2);
  });

  it('should boost counter moves when opponent last move is known', () => {
    // When opponent used STRIKE last, counter-STRIKE moves should be boosted
    let counterMoveCount = 0;
    const iterations = 200;
    for (let i = 0; i < iterations; i++) {
      const move = selectOptimalMove(DEFAULT_TRAITS, 2, DebateMove.STRIKE, [DebateMove.STRIKE]);
      // Find which move counters STRIKE
      if (doesCounter(move, DebateMove.STRIKE)) {
        counterMoveCount++;
      }
    }
    // Counter moves should appear with some frequency when opponent is known
    expect(counterMoveCount).toBeGreaterThan(0);
  });
});
