/**
 * Tests for POST /api/arena/strategy/create validation logic.
 *
 * These tests validate the request parsing and guard conditions
 * without hitting the actual service layer or blockchain.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEther } from 'viem';
import { APIError } from '@/lib/api/errorHandler';

// ─── Mock dependencies ────────────────────────────────

vi.mock('@/services/arena/strategyArenaService', () => ({
  strategyArenaService: {
    createStrategyBattle: vi.fn().mockResolvedValue({
      battle: { id: 'test-battle-id', status: 'active' },
      bettingPoolId: 'test-pool-id',
    }),
  },
}));

vi.mock('@/lib/api/middleware', () => ({
  composeMiddleware: (_middlewares: unknown[], _opts?: unknown) => {
    // Return the last middleware (the handler) directly
    const handler = (_middlewares as unknown[])[(_middlewares as unknown[]).length - 1];
    return handler;
  },
  withRateLimit: () => null, // stub, skipped by composeMiddleware mock
}));

vi.mock('@/lib/api/rateLimit', () => ({
  RateLimitPresets: { marketCreation: {} },
}));

// ─── Helpers ──────────────────────────────────────────

const VALID_ADDR_1 = '0x1234567890abcdef1234567890abcdef12345678';
const VALID_ADDR_2 = '0xabcdef1234567890abcdef1234567890abcdef12';
const VALID_STAKES = parseEther('10').toString();

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/arena/strategy/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    warrior1Id: 1,
    warrior1Owner: VALID_ADDR_1,
    warrior2Id: 2,
    warrior2Owner: VALID_ADDR_2,
    stakes: VALID_STAKES,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────

describe('POST /api/arena/strategy/create validation', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to pick up mocks
    const mod = await import('@/app/api/arena/strategy/create/route');
    handler = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('rejects missing required fields', async () => {
    const bodies = [
      { warrior2Id: 2, warrior2Owner: VALID_ADDR_2, stakes: VALID_STAKES },
      { warrior1Id: 1, warrior1Owner: VALID_ADDR_1, stakes: VALID_STAKES },
      { warrior1Id: 1, warrior1Owner: VALID_ADDR_1, warrior2Id: 2, warrior2Owner: VALID_ADDR_2 },
    ];

    for (const body of bodies) {
      await expect(handler(makeRequest(body))).rejects.toThrow(APIError);
    }
  });

  it('rejects invalid EVM address format', async () => {
    await expect(
      handler(makeRequest(validBody({ warrior1Owner: '0xshort' })))
    ).rejects.toThrow(APIError);

    await expect(
      handler(makeRequest(validBody({ warrior2Owner: 'notanaddress' })))
    ).rejects.toThrow(APIError);
  });

  it('rejects self-battles (same owner address)', async () => {
    await expect(
      handler(makeRequest(validBody({
        warrior1Owner: VALID_ADDR_1,
        warrior2Owner: VALID_ADDR_1,
      })))
    ).rejects.toThrow(APIError);
  });

  it('rejects self-battles case-insensitive', async () => {
    await expect(
      handler(makeRequest(validBody({
        warrior1Owner: VALID_ADDR_1.toLowerCase(),
        warrior2Owner: VALID_ADDR_1.toUpperCase().replace('0X', '0x'),
      })))
    ).rejects.toThrow(APIError);
  });

  it('rejects non-numeric stakes', async () => {
    await expect(
      handler(makeRequest(validBody({ stakes: 'abc' })))
    ).rejects.toThrow(APIError);
  });

  it('rejects stakes below minimum (5 CRwN)', async () => {
    await expect(
      handler(makeRequest(validBody({ stakes: parseEther('1').toString() })))
    ).rejects.toThrow(APIError);
  });

  it('rejects zero stakes', async () => {
    await expect(
      handler(makeRequest(validBody({ stakes: '0' })))
    ).rejects.toThrow(APIError);
  });

  it('rejects negative stakes', async () => {
    await expect(
      handler(makeRequest(validBody({ stakes: '-5' })))
    ).rejects.toThrow(APIError);
  });

  it('rejects invalid txHash format', async () => {
    await expect(
      handler(makeRequest(validBody({ txHash: '0xshort' })))
    ).rejects.toThrow(APIError);
  });

  it('rejects scheduledStartAt in the past', async () => {
    const pastDate = new Date(Date.now() - 60000).toISOString();
    await expect(
      handler(makeRequest(validBody({ scheduledStartAt: pastDate })))
    ).rejects.toThrow(APIError);
  });

  it('rejects scheduledStartAt more than 30 days in the future', async () => {
    const farFuture = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      handler(makeRequest(validBody({ scheduledStartAt: farFuture })))
    ).rejects.toThrow(APIError);
  });

  it('rejects invalid scheduledStartAt format', async () => {
    await expect(
      handler(makeRequest(validBody({ scheduledStartAt: 'not-a-date' })))
    ).rejects.toThrow(APIError);
  });

  it('accepts valid body and returns success', async () => {
    const res = await handler(makeRequest(validBody()));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.battle).toBeDefined();
    expect(data.bettingPoolId).toBeDefined();
  });

  it('accepts valid body with optional txHash', async () => {
    const txHash = '0x' + 'a'.repeat(64);
    const res = await handler(makeRequest(validBody({ txHash, onChainBattleId: '1' })));
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('accepts valid scheduledStartAt within 30 days', async () => {
    const validDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await handler(makeRequest(validBody({ scheduledStartAt: validDate })));
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('passes correct parameters to service', async () => {
    const { strategyArenaService } = await import('@/services/arena/strategyArenaService');

    await handler(makeRequest(validBody()));

    expect(strategyArenaService.createStrategyBattle).toHaveBeenCalledWith(
      expect.objectContaining({
        warrior1Id: 1,
        warrior1Owner: VALID_ADDR_1,
        warrior2Id: 2,
        warrior2Owner: VALID_ADDR_2,
        stakes: VALID_STAKES,
      })
    );
  });
});
