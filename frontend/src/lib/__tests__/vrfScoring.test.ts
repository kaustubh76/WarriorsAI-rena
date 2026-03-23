import { describe, it, expect } from 'vitest';
import { generateVrfSeed, determineHitMiss, applyHitMissModifier } from '../vrfScoring';

// ─── Constants ──────────────────────────────────────────

const SAMPLE_BLOCK_HASH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const ZERO_BLOCK_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

// ═══════════════════════════════════════════════════════
// VRF SEED GENERATION
// ═══════════════════════════════════════════════════════

describe('generateVrfSeed', () => {
  it('should return a 66-character hex string', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    expect(seed).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('should be deterministic for same inputs', () => {
    const seed1 = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const seed2 = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    expect(seed1).toBe(seed2);
  });

  it('should produce different seeds for different battle IDs', () => {
    const seed1 = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const seed2 = generateVrfSeed('battle-2', 1, 42, SAMPLE_BLOCK_HASH);
    expect(seed1).not.toBe(seed2);
  });

  it('should produce different seeds for different rounds', () => {
    const seed1 = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const seed2 = generateVrfSeed('battle-1', 2, 42, SAMPLE_BLOCK_HASH);
    expect(seed1).not.toBe(seed2);
  });

  it('should produce different seeds for different NFTs', () => {
    const seed1 = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const seed2 = generateVrfSeed('battle-1', 1, 43, SAMPLE_BLOCK_HASH);
    expect(seed1).not.toBe(seed2);
  });

  it('should produce different seeds for different block hashes', () => {
    const seed1 = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const seed2 = generateVrfSeed('battle-1', 1, 42, ZERO_BLOCK_HASH);
    expect(seed1).not.toBe(seed2);
  });
});

// ═══════════════════════════════════════════════════════
// HIT/MISS DETERMINATION
// ═══════════════════════════════════════════════════════

describe('determineHitMiss', () => {
  it('should return isHit boolean and hitProbability number', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const result = determineHitMiss(seed, 5000);
    expect(typeof result.isHit).toBe('boolean');
    expect(typeof result.hitProbability).toBe('number');
  });

  it('should calculate correct hit probability for timing=0 (55%)', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const result = determineHitMiss(seed, 0);
    expect(result.hitProbability).toBe(5500);
  });

  it('should calculate correct hit probability for timing=5000 (70%)', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const result = determineHitMiss(seed, 5000);
    expect(result.hitProbability).toBe(7000);
  });

  it('should calculate correct hit probability for timing=10000 (85%)', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const result = determineHitMiss(seed, 10000);
    expect(result.hitProbability).toBe(8500);
  });

  it('should clamp negative timing trait to 0', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const result = determineHitMiss(seed, -1000);
    expect(result.hitProbability).toBe(5500); // same as timing=0
  });

  it('should clamp timing trait above 10000', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const result = determineHitMiss(seed, 20000);
    expect(result.hitProbability).toBe(8500); // same as timing=10000
  });

  it('should throw on invalid seed', () => {
    expect(() => determineHitMiss('', 5000)).toThrow('Invalid VRF seed');
    expect(() => determineHitMiss('not-hex', 5000)).toThrow('Invalid VRF seed');
    expect(() => determineHitMiss('0x123', 5000)).toThrow('Invalid VRF seed');
  });

  it('should be deterministic for same seed and timing', () => {
    const seed = generateVrfSeed('battle-1', 1, 42, SAMPLE_BLOCK_HASH);
    const r1 = determineHitMiss(seed, 5000);
    const r2 = determineHitMiss(seed, 5000);
    expect(r1.isHit).toBe(r2.isHit);
    expect(r1.hitProbability).toBe(r2.hitProbability);
  });

  it('should produce both hits and misses across different seeds', () => {
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      const seed = generateVrfSeed(`battle-${i}`, 1, 42, SAMPLE_BLOCK_HASH);
      const { isHit } = determineHitMiss(seed, 5000); // 70% hit rate
      results.add(isHit);
      if (results.size === 2) break; // Found both true and false
    }
    expect(results.size).toBe(2); // Both hits and misses observed
  });
});

// ═══════════════════════════════════════════════════════
// HIT/MISS MODIFIER
// ═══════════════════════════════════════════════════════

describe('applyHitMissModifier', () => {
  it('should return full score on hit', () => {
    expect(applyHitMissModifier(100, true)).toBe(100);
    expect(applyHitMissModifier(75, true)).toBe(75);
  });

  it('should return 0.4x score on miss', () => {
    expect(applyHitMissModifier(100, false)).toBe(40);
    expect(applyHitMissModifier(75, false)).toBe(30);
  });

  it('should handle zero score', () => {
    expect(applyHitMissModifier(0, true)).toBe(0);
    expect(applyHitMissModifier(0, false)).toBe(0);
  });

  it('should round miss score correctly', () => {
    // 73 * 0.4 = 29.2 → rounds to 29
    expect(applyHitMissModifier(73, false)).toBe(29);
    // 77 * 0.4 = 30.8 → rounds to 31
    expect(applyHitMissModifier(77, false)).toBe(31);
  });
});
