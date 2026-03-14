/**
 * VRF Scoring Module
 *
 * Provides deterministic-from-inputs but unpredictable-in-advance randomness
 * for strategy battle hit/miss resolution. Uses the latest Flow block hash
 * as entropy source — result is unknowable until the block is mined.
 *
 * The VRF seed is stored in the DB for post-hoc verification.
 */

import { keccak256, encodePacked } from 'viem';

/**
 * Generate a VRF seed from verifiable inputs.
 * Anyone can reproduce this given the inputs, but the seed is
 * unpredictable before the block hash is known.
 */
export function generateVrfSeed(
  battleId: string,
  roundNumber: number,
  nftId: number,
  blockHash: string,
): string {
  return keccak256(
    encodePacked(
      ['string', 'uint256', 'uint256', 'bytes32'],
      [battleId, BigInt(roundNumber), BigInt(nftId), blockHash as `0x${string}`],
    ),
  );
}

/**
 * Determine if a move is a "hit" based on VRF seed and warrior's timing trait.
 *
 * Hit probability ranges from 55% (timing=0) to 85% (timing=10000).
 * The timing/luck trait directly influences reliability of move execution.
 *
 * @param vrfSeed - keccak256 hash from generateVrfSeed()
 * @param timingTrait - warrior's luck/timing trait (0-10000)
 */
export function determineHitMiss(
  vrfSeed: string,
  timingTrait: number,
): { isHit: boolean; hitProbability: number } {
  if (!vrfSeed || !vrfSeed.startsWith('0x') || vrfSeed.length < 18) {
    throw new Error(`Invalid VRF seed: ${vrfSeed}`);
  }

  // Convert first 16 bytes of seed to a number 0-9999
  const roll = Number(BigInt(vrfSeed.slice(0, 34)) % 10000n);

  // Clamp timing trait to valid range [0, 10000]
  const clampedTiming = Math.max(0, Math.min(10000, timingTrait));

  // Hit probability: 55% base + 30% scaling from timing trait
  // timing=0 → 55%, timing=5000 → 70%, timing=10000 → 85%
  const hitProbability = 5500 + Math.round((clampedTiming / 10000) * 3000);

  const isHit = roll < hitProbability;
  return { isHit, hitProbability };
}

/**
 * Apply hit/miss modifier to a score.
 * Hit: full score (1.0x) — move executes perfectly
 * Miss: reduced score (0.4x) — move partially fails but still contributes
 */
export function applyHitMissModifier(score: number, isHit: boolean): number {
  return isHit ? score : Math.round(score * 0.4);
}
