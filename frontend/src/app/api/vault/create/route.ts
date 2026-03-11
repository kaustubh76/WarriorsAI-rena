/**
 * API Route: POST /api/vault/create
 *
 * Reads NFT traits on-chain, fetches pool APYs, calls 0G AI to generate
 * an allocation, and returns the allocation + proof for user review.
 */

import { NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { vaultService } from '@/services/vaultService';
import { TRAIT_MAP } from '@/constants/defiTraitMapping';

interface CreateVaultRequest {
  nftId: number;
  depositAmount: string;
  ownerAddress: string;
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'vault-create', ...RateLimitPresets.marketCreation }),
  async (req) => {
    const body: CreateVaultRequest = await req.json();
    const { nftId, depositAmount, ownerAddress } = body;

    // Validate input
    if (!nftId || !depositAmount || !ownerAddress) {
      throw ErrorResponses.badRequest('nftId, depositAmount, and ownerAddress are required');
    }

    if (isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
      throw ErrorResponses.badRequest('depositAmount must be a positive number');
    }

    // Check if vault already exists for this NFT
    const existingVault = await vaultService.isVaultActive(nftId);
    if (existingVault) {
      throw ErrorResponses.badRequest('Vault already active for this NFT');
    }

    // 1. Read NFT traits on-chain
    let traits;
    try {
      traits = await vaultService.getNFTTraits(nftId);
    } catch (error) {
      console.error('[vault/create] Failed to read NFT traits:', error);
      throw ErrorResponses.badRequest('Failed to read NFT traits. Invalid NFT ID or contract unavailable.');
    }

    const defiTraits = vaultService.mapToDeFiTraits(traits);

    // 2. Fetch pool APYs
    let poolAPYs;
    try {
      poolAPYs = await vaultService.getPoolAPYs();
    } catch (error) {
      console.error('[vault/create] Failed to read pool APYs:', error);
      // Fallback to default APYs if contract not yet deployed
      poolAPYs = { highYield: 1800, stable: 400, lp: 1200 };
    }

    // 3. Call 0G inference for AI allocation
    let allocation;
    let proof = null;

    try {
      const prompt = buildAllocationPrompt(defiTraits, poolAPYs);
      const inferenceResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/0g/inference`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model: 'meta-llama/Llama-3.2-3B-Instruct',
            maxTokens: 500,
            temperature: 0.3,
          }),
        }
      );

      if (inferenceResponse.ok) {
        const inferenceData = await inferenceResponse.json();
        allocation = parseAllocationResponse(inferenceData.response, defiTraits);
        proof = inferenceData.proof || null;
      } else {
        // Fallback: deterministic allocation from traits
        allocation = computeFallbackAllocation(defiTraits);
      }
    } catch (error) {
      console.warn('[vault/create] 0G inference failed, using fallback allocation:', error);
      allocation = computeFallbackAllocation(defiTraits);
    }

    // 4. Calculate projected APY
    const blendedAPY = vaultService.calculateBlendedAPY(allocation, poolAPYs);
    const riskProfile = vaultService.getStrategyProfile(traits);

    return NextResponse.json({
      success: true,
      nftId,
      traits: defiTraits,
      poolAPYs: {
        highYield: poolAPYs.highYield / 100, // convert bps to percent
        stable: poolAPYs.stable / 100,
        lp: poolAPYs.lp / 100,
      },
      allocation: {
        highYield: allocation.highYield,
        stable: allocation.stable,
        lp: allocation.lp,
      },
      projectedAPY: blendedAPY / 100, // percent
      riskProfile,
      proof,
    });
  },
], { errorContext: 'API:Vault:Create:POST' });

// ─── Helpers ──────────────────────────────────────────────

function buildAllocationPrompt(
  traits: { alpha: number; complexity: number; momentum: number; hedge: number; timing: number },
  poolAPYs: { highYield: number; stable: number; lp: number }
): string {
  return `You are a DeFi strategy allocation engine. Given an NFT's trading personality traits and current pool APYs, output a JSON allocation across 3 pools.

TRAITS (0-10000 scale):
- ALPHA (conviction/concentration): ${traits.alpha}
- COMPLEXITY (strategy depth): ${traits.complexity}
- MOMENTUM (rebalance frequency): ${traits.momentum}
- HEDGE (downside protection): ${traits.hedge}
- TIMING (entry/exit precision): ${traits.timing}

POOLS:
- HighYield: ${(poolAPYs.highYield / 100).toFixed(1)}% APY (high risk, volatile)
- Stable: ${(poolAPYs.stable / 100).toFixed(1)}% APY (low risk, fixed)
- LP: ${(poolAPYs.lp / 100).toFixed(1)}% APY (medium risk)

RULES:
- Higher ALPHA → more concentration in best pool (HighYield)
- Higher HEDGE → more allocation to Stable pool (minimum 5% always)
- Higher MOMENTUM → more to LP pool (active rebalancing)
- Higher COMPLEXITY → can use all 3 pools aggressively
- Values must be integers summing to exactly 10000 (basis points)
- No single pool can exceed (ALPHA/100 * 80 + 20)% (max concentration based on ALPHA)

Output ONLY valid JSON: {"highYield": N, "stable": N, "lp": N}`;
}

function parseAllocationResponse(
  response: string,
  traits: { alpha: number; complexity: number; momentum: number; hedge: number; timing: number }
): { highYield: number; stable: number; lp: number } {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[^}]*"highYield"[^}]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const hy = Math.round(Number(parsed.highYield));
      const st = Math.round(Number(parsed.stable));
      const lp = Math.round(Number(parsed.lp));

      if (hy >= 0 && st >= 0 && lp >= 0 && hy + st + lp === 10000) {
        return { highYield: hy, stable: st, lp };
      }
    }
  } catch {
    // Fall through to fallback
  }

  return computeFallbackAllocation(traits);
}

/** Deterministic fallback allocation derived directly from traits */
function computeFallbackAllocation(
  traits: { alpha: number; complexity: number; momentum: number; hedge: number; timing: number }
): { highYield: number; stable: number; lp: number } {
  // Normalize traits to weights
  const total = traits.alpha + traits.hedge + traits.momentum;
  if (total === 0) return { highYield: 3400, stable: 3300, lp: 3300 };

  let highYield = Math.round((traits.alpha / total) * 10000);
  let stable = Math.round((traits.hedge / total) * 10000);
  let lp = 10000 - highYield - stable;

  // Ensure minimum 500 bps (5%) for stable (hedge protection)
  if (stable < 500) {
    const deficit = 500 - stable;
    stable = 500;
    highYield = Math.max(0, highYield - deficit);
    lp = 10000 - highYield - stable;
  }

  // Ensure no negatives
  if (lp < 0) {
    lp = 0;
    highYield = 10000 - stable;
  }

  return { highYield, stable, lp };
}
