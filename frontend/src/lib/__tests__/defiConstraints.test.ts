import { describe, it, expect } from 'vitest';
import {
  maxConcentration,
  minStableAllocation,
  maxRebalanceDelta,
  enforceTraitConstraints,
  type DeFiTraits,
  type VaultAllocation,
} from '../defiConstraints';

// ─── Fixtures ──────────────────────────────────────────

const DEFAULT_TRAITS: DeFiTraits = { alpha: 5000, complexity: 5000, momentum: 5000, hedge: 5000, timing: 5000 };
const LOW_TRAITS: DeFiTraits = { alpha: 1000, complexity: 1000, momentum: 1000, hedge: 1000, timing: 1000 };
const HIGH_TRAITS: DeFiTraits = { alpha: 9000, complexity: 9000, momentum: 9000, hedge: 9000, timing: 9000 };

const sumOf = (a: VaultAllocation) => a.highYield + a.stable + a.lp;

// ═══════════════════════════════════════════════════════
// maxConcentration
// ═══════════════════════════════════════════════════════

describe('maxConcentration', () => {
  it('alpha=0 → 2000 (20% base)', () => expect(maxConcentration(0)).toBe(2000));
  it('alpha=5000 → 5000 (50%)', () => expect(maxConcentration(5000)).toBe(5000));
  it('alpha=10000 → 8000 (80% cap)', () => expect(maxConcentration(10000)).toBe(8000));
  it('alpha=1 → rounds correctly', () => expect(maxConcentration(1)).toBe(2001));
  it('alpha=2500 → 3500', () => expect(maxConcentration(2500)).toBe(3500));
});

// ═══════════════════════════════════════════════════════
// minStableAllocation
// ═══════════════════════════════════════════════════════

describe('minStableAllocation', () => {
  it('hedge=0 → 500 (5% floor)', () => expect(minStableAllocation(0)).toBe(500));
  it('hedge=5000 → 3750', () => expect(minStableAllocation(5000)).toBe(3750));
  it('hedge=10000 → 7000 (70% max)', () => expect(minStableAllocation(10000)).toBe(7000));
});

// ═══════════════════════════════════════════════════════
// maxRebalanceDelta
// ═══════════════════════════════════════════════════════

describe('maxRebalanceDelta', () => {
  it('momentum=0 → 500 (5% floor)', () => expect(maxRebalanceDelta(0)).toBe(500));
  it('momentum=5000 → 2750', () => expect(maxRebalanceDelta(5000)).toBe(2750));
  it('momentum=10000 → 5000 (50% max)', () => expect(maxRebalanceDelta(10000)).toBe(5000));
});

// ═══════════════════════════════════════════════════════
// enforceTraitConstraints
// ═══════════════════════════════════════════════════════

describe('enforceTraitConstraints', () => {
  describe('sum invariant', () => {
    it('output always sums to 10000', () => {
      const cases: [VaultAllocation, DeFiTraits][] = [
        [{ highYield: 3000, stable: 4000, lp: 3000 }, DEFAULT_TRAITS],
        [{ highYield: 9000, stable: 500, lp: 500 }, LOW_TRAITS],
        [{ highYield: 0, stable: 10000, lp: 0 }, HIGH_TRAITS],
        [{ highYield: 5000, stable: 5000, lp: 0 }, DEFAULT_TRAITS],
        [{ highYield: 10000, stable: 0, lp: 0 }, LOW_TRAITS],
      ];
      for (const [proposed, traits] of cases) {
        const result = enforceTraitConstraints(proposed, traits);
        expect(sumOf(result)).toBe(10000);
      }
    });

    it('no negative values in output', () => {
      const result = enforceTraitConstraints(
        { highYield: 0, stable: 0, lp: 10000 },
        { ...LOW_TRAITS, hedge: 9000 } // very high hedge → huge minStable
      );
      expect(result.highYield).toBeGreaterThanOrEqual(0);
      expect(result.stable).toBeGreaterThanOrEqual(0);
      expect(result.lp).toBeGreaterThanOrEqual(0);
      expect(sumOf(result)).toBe(10000);
    });
  });

  describe('pass-through', () => {
    it('valid allocation unchanged', () => {
      // alpha=5000 → maxConc=5000, hedge=5000 → minStable=3750
      const proposed = { highYield: 3000, stable: 4000, lp: 3000 };
      const result = enforceTraitConstraints(proposed, DEFAULT_TRAITS);
      expect(result).toEqual(proposed);
    });

    it('same as prev with no change passes through', () => {
      const alloc = { highYield: 3000, stable: 4000, lp: 3000 };
      const result = enforceTraitConstraints(alloc, DEFAULT_TRAITS, alloc);
      expect(result).toEqual(alloc);
    });
  });

  describe('ALPHA cap', () => {
    it('caps highYield at maxConcentration', () => {
      // alpha=1000 → maxConc=2600
      const traits: DeFiTraits = { ...DEFAULT_TRAITS, alpha: 1000, hedge: 0 };
      const result = enforceTraitConstraints(
        { highYield: 5000, stable: 3000, lp: 2000 },
        traits
      );
      expect(result.highYield).toBeLessThanOrEqual(maxConcentration(1000));
      expect(sumOf(result)).toBe(10000);
    });

    it('caps lp at maxConcentration', () => {
      const traits: DeFiTraits = { ...DEFAULT_TRAITS, alpha: 1000, hedge: 0 };
      const result = enforceTraitConstraints(
        { highYield: 2000, stable: 1000, lp: 7000 },
        traits
      );
      expect(result.lp).toBeLessThanOrEqual(maxConcentration(1000));
      expect(sumOf(result)).toBe(10000);
    });
  });

  describe('HEDGE floor', () => {
    it('raises stable to minStable', () => {
      // hedge=8000 → minStable = 500 + (8000/10000)*6500 = 5700
      const traits: DeFiTraits = { ...DEFAULT_TRAITS, hedge: 8000 };
      const result = enforceTraitConstraints(
        { highYield: 4000, stable: 2000, lp: 4000 },
        traits
      );
      expect(result.stable).toBeGreaterThanOrEqual(minStableAllocation(8000));
      expect(sumOf(result)).toBe(10000);
    });
  });

  describe('MOMENTUM delta', () => {
    it('scales down large shift', () => {
      // momentum=1000 → maxDelta=950
      const traits: DeFiTraits = { ...DEFAULT_TRAITS, momentum: 1000, alpha: 10000, hedge: 0 };
      const prev = { highYield: 3000, stable: 4000, lp: 3000 };
      const proposed = { highYield: 7000, stable: 1000, lp: 2000 };
      const result = enforceTraitConstraints(proposed, traits, prev);

      const totalShift =
        Math.abs(result.highYield - prev.highYield) +
        Math.abs(result.stable - prev.stable) +
        Math.abs(result.lp - prev.lp);
      expect(totalShift / 2).toBeLessThanOrEqual(maxRebalanceDelta(1000) + 1); // +1 for rounding
      expect(sumOf(result)).toBe(10000);
    });

    it('skipped when no prevAllocation', () => {
      const traits: DeFiTraits = { ...DEFAULT_TRAITS, momentum: 0, alpha: 10000, hedge: 0 };
      const proposed = { highYield: 8000, stable: 1000, lp: 1000 };
      // With momentum=0 and no prev, should not constrain delta
      const result = enforceTraitConstraints(proposed, traits);
      expect(result.highYield).toBe(8000);
    });
  });

  describe('edge cases', () => {
    it('all zeros proposed → valid output', () => {
      const result = enforceTraitConstraints(
        { highYield: 0, stable: 0, lp: 0 },
        DEFAULT_TRAITS
      );
      expect(sumOf(result)).toBe(10000);
      expect(result.stable).toBeGreaterThanOrEqual(minStableAllocation(DEFAULT_TRAITS.hedge));
    });

    it('extreme traits: alpha=0, hedge=10000', () => {
      const traits: DeFiTraits = { alpha: 0, hedge: 10000, momentum: 5000, complexity: 5000, timing: 5000 };
      const result = enforceTraitConstraints(
        { highYield: 5000, stable: 2000, lp: 3000 },
        traits
      );
      // maxConc=2000, minStable=7000
      expect(result.highYield).toBeLessThanOrEqual(2000);
      expect(result.stable).toBeGreaterThanOrEqual(7000);
      expect(sumOf(result)).toBe(10000);
    });
  });
});
