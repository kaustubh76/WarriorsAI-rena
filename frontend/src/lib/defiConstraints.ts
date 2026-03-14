/**
 * DeFi Trait Constraint Enforcement
 *
 * Converts NFT personality traits into hard DeFi limits:
 *   ALPHA   → max single-pool concentration
 *   HEDGE   → min Stable pool allocation
 *   MOMENTUM → max allocation shift per cycle
 *   COMPLEXITY → allowed multi-hop depth (unused until Phase 3+ Flow Actions)
 *   TIMING  → VRF window tightness (unused until FLASH move)
 *
 * All trait values are 0-10000.  Allocation values are basis points (sum = 10000).
 */

export interface DeFiTraits {
  alpha: number;
  complexity: number;
  momentum: number;
  hedge: number;
  timing: number;
}

export interface VaultAllocation {
  highYield: number;
  stable: number;
  lp: number;
}

// ─── Constraint Calculators ─────────────────────────────

/** Max any risky pool (highYield/lp) can hold (basis points). High ALPHA → up to 8000 bps (80%). */
export function maxConcentration(alpha: number): number {
  // 2000 bps (20%) base + up to 6000 bps scaled by alpha
  return Math.round(2000 + (alpha / 10000) * 6000);
}

/** Min Stable pool allocation (basis points). High HEDGE → up to 7000 bps (70%). */
export function minStableAllocation(hedge: number): number {
  // 500 bps (5%) floor + up to 6500 bps scaled by hedge
  return Math.round(500 + (hedge / 10000) * 6500);
}

/** Max total allocation shift between old and new (basis points). High MOMENTUM → up to 5000 bps. */
export function maxRebalanceDelta(momentum: number): number {
  // 500 bps (5%) floor + up to 4500 bps scaled by momentum
  return Math.round(500 + (momentum / 10000) * 4500);
}

// ─── Enforcement ────────────────────────────────────────

/**
 * Clamp a proposed allocation so it satisfies trait constraints.
 * Also enforces the rebalance delta limit relative to the previous allocation.
 */
export function enforceTraitConstraints(
  proposed: VaultAllocation,
  traits: DeFiTraits,
  prevAllocation?: VaultAllocation
): VaultAllocation {
  let { highYield, stable, lp } = proposed;

  const maxConc = maxConcentration(traits.alpha);
  const minStable = minStableAllocation(traits.hedge);

  // 1. Cap risky pools at maxConcentration (stable is excluded — governed by minStable instead)
  if (highYield > maxConc) highYield = maxConc;
  if (lp > maxConc) lp = maxConc;

  // 2. Floor stable at minStable
  if (stable < minStable) stable = minStable;

  // 3. Re-normalise to 10000, then re-check caps (normalization can push above maxConc)
  const rawSum = highYield + stable + lp;
  if (rawSum !== 10000) {
    // Scale non-stable pools proportionally
    const nonStable = 10000 - stable;
    const rawNonStable = highYield + lp;
    if (rawNonStable > 0) {
      highYield = Math.round((highYield / rawNonStable) * nonStable);
      lp = nonStable - highYield;
    } else {
      highYield = Math.round(nonStable / 2);
      lp = nonStable - highYield;
    }
  }

  // 3b. Re-check concentration caps after normalization
  if (highYield > maxConc) {
    const excess = highYield - maxConc;
    highYield = maxConc;
    lp += excess;
  }
  if (lp > maxConc) {
    const excess = lp - maxConc;
    lp = maxConc;
    stable += excess;
  }

  // 4. Enforce momentum-based rebalance delta (if previous allocation provided)
  if (prevAllocation) {
    const maxDelta = maxRebalanceDelta(traits.momentum);
    const totalShift =
      Math.abs(highYield - prevAllocation.highYield) +
      Math.abs(stable - prevAllocation.stable) +
      Math.abs(lp - prevAllocation.lp);

    // totalShift counts each bps of movement; divide by 2 for directional shift
    if (totalShift > 0 && totalShift / 2 > maxDelta) {
      // Scale the deltas down proportionally
      const scale = (maxDelta * 2) / totalShift;
      highYield = Math.round(prevAllocation.highYield + (highYield - prevAllocation.highYield) * scale);
      stable = Math.round(prevAllocation.stable + (stable - prevAllocation.stable) * scale);
      lp = 10000 - highYield - stable;

      // Re-apply stable floor after scaling
      if (stable < minStable) {
        const deficit = minStable - stable;
        stable = minStable;
        highYield = Math.max(0, highYield - deficit);
        lp = 10000 - highYield - stable;
      }
    }
  }

  // 5. Final safety: ensure no negatives and sum = 10000
  if (highYield < 0) highYield = 0;
  if (lp < 0) lp = 0;
  lp = 10000 - highYield - stable;
  if (lp < 0) {
    lp = 0;
    highYield = 10000 - stable;
  }

  return { highYield, stable, lp };
}
