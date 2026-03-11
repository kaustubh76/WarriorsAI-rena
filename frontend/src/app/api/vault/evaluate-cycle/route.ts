/**
 * API Route: POST /api/vault/evaluate-cycle
 *
 * Called by the execute-yield-cycles cron to evaluate what move a vault's
 * strategy NFT should make this cycle. Reads on-chain state, calls 0G AI,
 * enforces trait constraints, and returns a constrained new allocation.
 */

import { NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { vaultService } from '@/services/vaultService';
import { enforceTraitConstraints } from '@/lib/defiConstraints';

interface EvaluateCycleRequest {
  nftId: number;
  cycleNumber: number;
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'vault-evaluate-cycle', ...RateLimitPresets.marketCreation }),
  async (req) => {
    const body: EvaluateCycleRequest = await req.json();
    const { nftId, cycleNumber } = body;

    if (!nftId || cycleNumber == null) {
      throw ErrorResponses.badRequest('nftId and cycleNumber are required');
    }

    // 1. Verify vault is active
    const vaultState = await vaultService.getVaultState(nftId);
    if (!vaultState || !vaultState.active) {
      throw ErrorResponses.badRequest('Vault not active for this NFT');
    }

    // 2. Read NFT traits
    const rawTraits = await vaultService.getNFTTraits(nftId);
    const traits = vaultService.mapToDeFiTraits(rawTraits);

    // 3. Current allocation from on-chain state
    const currentAllocation = {
      highYield: Number(vaultState.allocation[0]),
      stable: Number(vaultState.allocation[1]),
      lp: Number(vaultState.allocation[2]),
    };

    // 4. Fetch pool APYs
    let poolAPYs;
    try {
      poolAPYs = await vaultService.getPoolAPYs();
    } catch {
      poolAPYs = { highYield: 1800, stable: 400, lp: 1200 };
    }

    // 5. Call 0G AI for cycle evaluation
    let aiAllocation;
    let move = 'REBALANCE';
    let rationale = '';
    let proof = null;

    try {
      const prompt = buildCyclePrompt(traits, poolAPYs, currentAllocation, cycleNumber);
      const abortController = new AbortController();
      const inferenceTimeout = setTimeout(() => abortController.abort(), 15000);
      const inferenceResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/0g/inference`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model: 'meta-llama/Llama-3.2-3B-Instruct',
            maxTokens: 600,
            temperature: 0.4,
          }),
          signal: abortController.signal,
        }
      );
      clearTimeout(inferenceTimeout);

      if (inferenceResponse.ok) {
        const data = await inferenceResponse.json();
        const parsed = parseCycleResponse(data.response, traits);
        aiAllocation = parsed.allocation;
        move = parsed.move;
        rationale = parsed.rationale;
        proof = data.proof || null;
      } else {
        aiAllocation = computeFallbackCycleAllocation(traits, currentAllocation, poolAPYs);
      }
    } catch (error) {
      console.warn('[evaluate-cycle] 0G inference failed, using fallback:', error);
      aiAllocation = computeFallbackCycleAllocation(traits, currentAllocation, poolAPYs);
    }

    // 6. Enforce trait constraints (ALPHA max concentration, HEDGE min stable, MOMENTUM max delta)
    const constrainedAllocation = enforceTraitConstraints(aiAllocation, traits, currentAllocation);

    // Determine if allocation actually changed
    const isHold =
      constrainedAllocation.highYield === currentAllocation.highYield &&
      constrainedAllocation.stable === currentAllocation.stable &&
      constrainedAllocation.lp === currentAllocation.lp;

    if (isHold) move = 'HOLD';

    // 7. Calculate projected APY
    const blendedAPY = vaultService.calculateBlendedAPY(constrainedAllocation, poolAPYs);

    return NextResponse.json({
      success: true,
      nftId,
      cycleNumber,
      move,
      rationale,
      currentAllocation,
      newAllocation: constrainedAllocation,
      poolAPYs: {
        highYield: poolAPYs.highYield / 100,
        stable: poolAPYs.stable / 100,
        lp: poolAPYs.lp / 100,
      },
      projectedAPY: blendedAPY / 100,
      proof,
    });
  },
], { errorContext: 'API:Vault:EvaluateCycle:POST' });

// ─── Helpers ──────────────────────────────────────────────

function buildCyclePrompt(
  traits: { alpha: number; complexity: number; momentum: number; hedge: number; timing: number },
  poolAPYs: { highYield: number; stable: number; lp: number },
  currentAllocation: { highYield: number; stable: number; lp: number },
  cycleNumber: number
): string {
  return `You are a DeFi strategy engine evaluating cycle #${cycleNumber} for an autonomous vault.

STRATEGY NFT TRAITS (0-10000):
- ALPHA (conviction/concentration): ${traits.alpha}
- COMPLEXITY (strategy depth): ${traits.complexity}
- MOMENTUM (rebalance aggressiveness): ${traits.momentum}
- HEDGE (downside protection): ${traits.hedge}
- TIMING (entry/exit precision): ${traits.timing}

CURRENT ALLOCATION (basis points):
- HighYield: ${currentAllocation.highYield} (${(currentAllocation.highYield / 100).toFixed(1)}%)
- Stable: ${currentAllocation.stable} (${(currentAllocation.stable / 100).toFixed(1)}%)
- LP: ${currentAllocation.lp} (${(currentAllocation.lp / 100).toFixed(1)}%)

CURRENT POOL APYs:
- HighYield: ${(poolAPYs.highYield / 100).toFixed(1)}% (high risk)
- Stable: ${(poolAPYs.stable / 100).toFixed(1)}% (low risk)
- LP: ${(poolAPYs.lp / 100).toFixed(1)}% (medium risk)

MOVES AVAILABLE:
- REBALANCE: Shift allocation between pools based on APY changes
- CONCENTRATE: Double down on highest-performing pool (requires high ALPHA)
- HEDGE_UP: Move more to Stable pool (triggered by high HEDGE or downturn)
- COMPOSE: Multi-hop reallocation (requires high COMPLEXITY)
- FLASH: Precision timing move (requires high TIMING)
- HOLD: Keep current allocation (if no beneficial change detected)

Output ONLY valid JSON:
{"move": "MOVE_NAME", "rationale": "Brief reason", "allocation": {"highYield": N, "stable": N, "lp": N}}
Values must be integers summing to exactly 10000.`;
}

function parseCycleResponse(
  response: string,
  traits: { alpha: number; complexity: number; momentum: number; hedge: number; timing: number }
): { allocation: { highYield: number; stable: number; lp: number }; move: string; rationale: string } {
  try {
    const jsonMatch = response.match(/\{[^{}]*"move"[^{}]*"allocation"[^{}]*\{[^{}]*\}[^{}]*\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const alloc = parsed.allocation;
      const hy = Math.round(Number(alloc.highYield));
      const st = Math.round(Number(alloc.stable));
      const lp = Math.round(Number(alloc.lp));

      if (hy >= 0 && st >= 0 && lp >= 0 && hy + st + lp === 10000) {
        return {
          allocation: { highYield: hy, stable: st, lp },
          move: parsed.move || 'REBALANCE',
          rationale: parsed.rationale || '',
        };
      }
    }
  } catch {
    // Fall through to fallback
  }

  return {
    allocation: computeFallbackCycleAllocation(traits, { highYield: 3400, stable: 3300, lp: 3300 }, { highYield: 1800, stable: 400, lp: 1200 }),
    move: 'REBALANCE',
    rationale: 'AI response parsing failed — fallback allocation applied',
  };
}

/**
 * Deterministic cycle rebalance. Shifts allocation toward the highest-APY pool,
 * weighted by traits, with a small nudge each cycle.
 */
function computeFallbackCycleAllocation(
  traits: { alpha: number; momentum: number; hedge: number },
  current: { highYield: number; stable: number; lp: number },
  poolAPYs: { highYield: number; stable: number; lp: number }
): { highYield: number; stable: number; lp: number } {
  // Find best pool by APY-weighted trait affinity
  const hyScore = poolAPYs.highYield * (traits.alpha / 10000);
  const stScore = poolAPYs.stable * (traits.hedge / 10000);
  const lpScore = poolAPYs.lp * (traits.momentum / 10000);
  const totalScore = hyScore + stScore + lpScore;

  if (totalScore === 0) return current;

  // Target allocation based on trait-weighted APY
  const targetHY = Math.round((hyScore / totalScore) * 10000);
  const targetST = Math.round((stScore / totalScore) * 10000);
  const targetLP = 10000 - targetHY - targetST;

  // Nudge 20% toward target each cycle
  const nudge = 0.2;
  let highYield = Math.round(current.highYield + (targetHY - current.highYield) * nudge);
  let stable = Math.round(current.stable + (targetST - current.stable) * nudge);
  let lp = 10000 - highYield - stable;

  // Ensure min 500 bps stable
  if (stable < 500) {
    const deficit = 500 - stable;
    stable = 500;
    highYield = Math.max(0, highYield - deficit);
    lp = 10000 - highYield - stable;
  }

  if (lp < 0) { lp = 0; highYield = 10000 - stable; }

  return { highYield, stable, lp };
}
