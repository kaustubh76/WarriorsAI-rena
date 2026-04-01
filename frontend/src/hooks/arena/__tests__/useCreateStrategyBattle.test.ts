/**
 * Tests for useCreateStrategyBattle hook.
 *
 * Validates:
 * - Gas limits on all writeContractAsync calls (Flow Testnet cap: 16,777,216)
 * - Contract call parameters for approve + createBattle
 * - Full happy-path: balance check → approve → createBattle → API record
 * - Error handling: wallet disconnected, balance, tx failures, API errors, timeouts
 * - Event log decoding (BattleCreated extraction, fallback, multi-log)
 * - Edge cases: undefined hashes, non-Error thrown, large IDs, fractional stakes
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as viem from 'viem';

// ─── Constants ────────────────────────────────────────

const FLOW_BLOCK_GAS_CAP = 16_777_216n;
const EXPECTED_GAS = 5_000_000n;
const FAKE_ADDR = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;
const FAKE_APPROVE_HASH = ('0x' + 'a'.repeat(64)) as `0x${string}`;
const FAKE_CREATE_HASH = ('0x' + 'b'.repeat(64)) as `0x${string}`;
const ON_CHAIN_BATTLE_ID = 42n;

const CRWN_ADDR = '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6';
const BM_ADDR = '0x8eb708084751d567Bd5301B1CB7F99e4a8B2ee83';

// ─── Mock state (mutated per test) ────────────────────

let mockAddress: `0x${string}` | undefined = FAKE_ADDR;
let mockWriteContractAsync: Mock;
let mockReadContract: Mock;
let mockWaitForTransactionReceipt: Mock;
let mockSimulateContract: Mock;
let mockPublicClient: { readContract: Mock; waitForTransactionReceipt: Mock; simulateContract: Mock } | undefined;

// ─── Mock wagmi ───────────────────────────────────────

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: mockAddress }),
  useWriteContract: () => ({ writeContractAsync: mockWriteContractAsync }),
  usePublicClient: () => mockPublicClient,
}));

// ─── Mock react ───────────────────────────────────────

vi.mock('react', () => ({
  useState: (init: unknown) => {
    let val = init;
    return [val, (newVal: unknown) => { val = typeof newVal === 'function' ? (newVal as (prev: unknown) => unknown)(val) : newVal; }];
  },
  useCallback: (fn: (...args: unknown[]) => unknown) => fn,
}));

// ─── Mock constants ───────────────────────────────────

vi.mock('@/constants/index', () => ({
  FLOW_TESTNET_CONTRACTS: {
    CRWN_TOKEN: CRWN_ADDR,
    BATTLE_MANAGER: BM_ADDR,
  },
}));

// ─── Helpers ──────────────────────────────────────────

function createBattleCreatedLog() {
  // ABI: BattleCreated(uint256 indexed battleId, uint256 indexed warrior1Id,
  //                    uint256 indexed warrior2Id, uint256 stakes,
  //                    address warrior1Owner, address warrior2Owner)
  const eventSig = viem.keccak256(
    viem.toBytes('BattleCreated(uint256,uint256,uint256,uint256,address,address)')
  );
  const battleIdTopic = viem.pad(viem.toHex(ON_CHAIN_BATTLE_ID), { size: 32 });
  const warrior1IdTopic = viem.pad(viem.toHex(1n), { size: 32 });
  const warrior2IdTopic = viem.pad(viem.toHex(2n), { size: 32 });

  return {
    // Non-indexed params: stakes, warrior1Owner, warrior2Owner
    data: viem.encodeAbiParameters(
      [
        { name: 'stakes', type: 'uint256' },
        { name: 'warrior1Owner', type: 'address' },
        { name: 'warrior2Owner', type: 'address' },
      ],
      [viem.parseEther('100'), FAKE_ADDR, '0xabcdef1234567890abcdef1234567890abcdef12']
    ),
    // Topics: [eventSig, battleId, warrior1Id, warrior2Id]
    topics: [eventSig, battleIdTopic, warrior1IdTopic, warrior2IdTopic] as [`0x${string}`, ...`0x${string}`[]],
  };
}

/** Standard happy-path default mocks + import */
async function setupHook() {
  const { useCreateStrategyBattle } = await import('../useCreateStrategyBattle');
  return useCreateStrategyBattle();
}

const VALID_PARAMS = {
  warrior1Id: 1,
  warrior1Owner: FAKE_ADDR,
  warrior2Id: 2,
  warrior2Owner: '0xabcdef1234567890abcdef1234567890abcdef12',
  stakes: '100',
};

// Keep a ref to original fetch for cleanup
const originalFetch = global.fetch;

// ─── Main test suite ──────────────────────────────────

describe('useCreateStrategyBattle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddress = FAKE_ADDR;

    mockWriteContractAsync = vi.fn()
      .mockResolvedValueOnce(FAKE_APPROVE_HASH)
      .mockResolvedValueOnce(FAKE_CREATE_HASH);

    mockReadContract = vi.fn().mockResolvedValue(viem.parseEther('1000'));

    mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({
      logs: [createBattleCreatedLog()],
    });

    mockSimulateContract = vi.fn().mockResolvedValue({ result: ON_CHAIN_BATTLE_ID });

    mockPublicClient = {
      readContract: mockReadContract,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
      simulateContract: mockSimulateContract,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        battle: { id: 'db-battle-123' },
        bettingPoolId: 'pool-456',
      }),
    }) as Mock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── Gas limit verification ──────────────────────────

  describe('gas limits', () => {
    it('sets gas on approve call under Flow block cap', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      const approveCall = mockWriteContractAsync.mock.calls[0][0];
      expect(approveCall.gas).toBe(EXPECTED_GAS);
      expect(approveCall.gas).toBeLessThan(FLOW_BLOCK_GAS_CAP);
    });

    it('sets gas on createBattle call under Flow block cap', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      const createCall = mockWriteContractAsync.mock.calls[1][0];
      expect(createCall.gas).toBe(EXPECTED_GAS);
      expect(createCall.gas).toBeLessThan(FLOW_BLOCK_GAS_CAP);
    });
  });

  // ── Contract call parameters ────────────────────────

  describe('contract call parameters', () => {
    it('calls approve with correct token address, spender, and amount', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      const call = mockWriteContractAsync.mock.calls[0][0];
      expect(call.functionName).toBe('approve');
      expect(call.address).toBe(CRWN_ADDR);
      expect(call.args[0]).toBe(BM_ADDR);
      expect(call.args[1]).toBe(viem.parseEther('200')); // stakes × 2 (caller funds both sides)
    });

    it('calls createBattle with correct warrior IDs and stakes', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      const call = mockWriteContractAsync.mock.calls[1][0];
      expect(call.functionName).toBe('createBattle');
      expect(call.address).toBe(BM_ADDR);
      expect(call.args[0]).toBe(1n);
      expect(call.args[1]).toBe(2n);
      expect(call.args[2]).toBe(viem.parseEther('100'));
    });

    it('waits for approve receipt before calling createBattle', async () => {
      const callOrder: string[] = [];
      mockWriteContractAsync = vi.fn().mockImplementation(async (params: { functionName: string }) => {
        callOrder.push(`write:${params.functionName}`);
        return params.functionName === 'approve' ? FAKE_APPROVE_HASH : FAKE_CREATE_HASH;
      });
      mockWaitForTransactionReceipt = vi.fn().mockImplementation(async () => {
        callOrder.push('waitReceipt');
        return { logs: [createBattleCreatedLog()] };
      });
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      expect(callOrder[0]).toBe('write:approve');
      expect(callOrder[1]).toBe('waitReceipt');
      expect(callOrder[2]).toBe('write:createBattle');
    });

    it('converts large warrior IDs to BigInt correctly', async () => {
      const { createBattle } = await setupHook();
      await createBattle({ ...VALID_PARAMS, warrior1Id: 999999, warrior2Id: 1000000 });

      const call = mockWriteContractAsync.mock.calls[1][0];
      expect(call.args[0]).toBe(999999n);
      expect(call.args[1]).toBe(1000000n);
    });

    it('handles fractional stake amounts via parseEther', async () => {
      const { createBattle } = await setupHook();
      await createBattle({ ...VALID_PARAMS, stakes: '0.5' });

      const approveCall = mockWriteContractAsync.mock.calls[0][0];
      expect(approveCall.args[1]).toBe(viem.parseEther('1')); // 0.5 × 2 (caller funds both sides)

      const createCall = mockWriteContractAsync.mock.calls[1][0];
      expect(createCall.args[2]).toBe(viem.parseEther('0.5'));
    });
  });

  // ── Happy path ──────────────────────────────────────

  describe('happy path', () => {
    it('returns battleId, onChainBattleId, and txHash on success', async () => {
      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);

      expect(result).not.toBeNull();
      expect(result!.battleId).toBe('db-battle-123');
      expect(result!.onChainBattleId).toBe(String(ON_CHAIN_BATTLE_ID));
      expect(result!.txHash).toBe(FAKE_CREATE_HASH);
    });

    it('sends correct body to /api/arena/strategy/create', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/arena/strategy/create',
        expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
      );

      const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
      expect(body.warrior1Id).toBe(1);
      expect(body.warrior2Id).toBe(2);
      expect(body.stakes).toBe(viem.parseEther('100').toString());
      expect(body.txHash).toBe(FAKE_CREATE_HASH);
      expect(body.onChainBattleId).toBe(String(ON_CHAIN_BATTLE_ID));
    });

    it('includes scheduledStartAt when provided', async () => {
      const { createBattle } = await setupHook();
      const futureDate = '2026-04-15T12:00:00Z';
      await createBattle({ ...VALID_PARAMS, scheduledStartAt: futureDate });

      const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
      expect(body.scheduledStartAt).toBe(new Date(futureDate).toISOString());
    });

    it('omits scheduledStartAt from body when not provided', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
      expect(body).not.toHaveProperty('scheduledStartAt');
    });

    it('passes AbortSignal to fetch for timeout', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      const fetchOpts = (global.fetch as Mock).mock.calls[0][1];
      expect(fetchOpts.signal).toBeDefined();
      expect(fetchOpts.signal).toBeInstanceOf(AbortSignal);
    });
  });

  // ── simulateContract (primary path) ──────────────────

  describe('simulateContract (primary battleId extraction)', () => {
    it('gets battleId from simulateContract return value', async () => {
      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);

      expect(mockSimulateContract).toHaveBeenCalledWith(
        expect.objectContaining({
          account: FAKE_ADDR,
          address: BM_ADDR,
          functionName: 'createBattle',
          gas: EXPECTED_GAS,
        })
      );
      expect(result!.onChainBattleId).toBe(String(ON_CHAIN_BATTLE_ID));
    });

    it('skips event log parsing when simulateContract succeeds', async () => {
      // Even with empty logs, simulateContract provides the battleId
      mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({ logs: [] });
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);

      expect(result).not.toBeNull();
      expect(result!.onChainBattleId).toBe(String(ON_CHAIN_BATTLE_ID));
    });

    it('falls back to event logs when simulateContract fails', async () => {
      mockSimulateContract = vi.fn().mockRejectedValue(new Error('Simulation failed'));
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);

      expect(result).not.toBeNull();
      expect(result!.onChainBattleId).toBe('42'); // extracted from event log
    });

    it('falls back to indexed topic when both simulate and event decode fail', async () => {
      mockSimulateContract = vi.fn().mockRejectedValue(new Error('Simulation failed'));
      const fallbackBattleId = 99n;
      const paddedHex = viem.pad(viem.toHex(fallbackBattleId), { size: 32 });
      mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({
        logs: [{ data: '0x', topics: [('0x' + 'f'.repeat(64)) as `0x${string}`, paddedHex] }],
      });
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result!.onChainBattleId).toBe('99');
    });

    it('returns null when all three extraction methods fail', async () => {
      mockSimulateContract = vi.fn().mockRejectedValue(new Error('Simulation failed'));
      mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({ logs: [] });
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });
  });

  // ── Event log decoding (fallback) ───────────────────

  describe('event log decoding (fallback)', () => {
    beforeEach(() => {
      // Force simulate to fail so event extraction runs
      mockSimulateContract = vi.fn().mockRejectedValue(new Error('sim fail'));
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };
    });

    it('extracts battleId from BattleCreated event', async () => {
      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result!.onChainBattleId).toBe('42');
    });

    it('finds BattleCreated event when it is second log (not first)', async () => {
      const unrelatedLog = { data: '0x' + '00'.repeat(32), topics: [('0x' + '1'.repeat(64)) as `0x${string}`] };
      mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({
        logs: [unrelatedLog, createBattleCreatedLog()],
      });
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).not.toBeNull();
      expect(result!.onChainBattleId).toBe('42');
    });
  });

  // ── Error handling ──────────────────────────────────

  describe('error handling', () => {
    it('returns null when wallet not connected', async () => {
      mockAddress = undefined;
      const { createBattle } = await setupHook();

      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
      expect(mockWriteContractAsync).not.toHaveBeenCalled();
    });

    it('returns null when CRwN balance insufficient', async () => {
      mockReadContract = vi.fn().mockResolvedValue(viem.parseEther('1'));
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
      expect(mockWriteContractAsync).not.toHaveBeenCalled();
    });

    it('returns null when approve tx fails', async () => {
      mockWriteContractAsync = vi.fn().mockRejectedValueOnce(new Error('User rejected'));

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });

    it('returns null when createBattle tx fails', async () => {
      mockWriteContractAsync = vi.fn()
        .mockResolvedValueOnce(FAKE_APPROVE_HASH)
        .mockRejectedValueOnce(new Error('Execution reverted'));

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });

    it('returns null when API recording fails with JSON error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 500,
        json: () => Promise.resolve({ error: 'DB write failed' }),
      }) as Mock;

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });

    it('handles non-Error thrown object in catch', async () => {
      mockWriteContractAsync = vi.fn().mockRejectedValueOnce('string error');

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });
  });

  // ── Balance check ───────────────────────────────────

  describe('balance check', () => {
    it('reads CRwN balance for the connected wallet', async () => {
      const { createBattle } = await setupHook();
      await createBattle(VALID_PARAMS);

      expect(mockReadContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'balanceOf', args: [FAKE_ADDR] })
      );
    });

    it('proceeds when balance equals stakes × 2 exactly', async () => {
      mockReadContract = vi.fn().mockResolvedValue(viem.parseEther('200')); // stakes × 2 (caller funds both sides)
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).not.toBeNull();
      expect(mockWriteContractAsync).toHaveBeenCalledTimes(2);
    });
  });

  // ── publicClient undefined ──────────────────────────

  describe('publicClient undefined', () => {
    it('skips balance check + receipt waits, fails on missing battleId', async () => {
      mockPublicClient = undefined;

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);

      // Balance check skipped
      expect(mockReadContract).not.toHaveBeenCalled();
      // approve + createBattle still called
      expect(mockWriteContractAsync).toHaveBeenCalledTimes(2);
      // No receipt → no battleId → error → null
      expect(result).toBeNull();
    });
  });

  // ── Undefined tx hashes ─────────────────────────────

  describe('undefined tx hashes', () => {
    it('skips approve receipt wait when approveHash is undefined', async () => {
      mockWriteContractAsync = vi.fn()
        .mockResolvedValueOnce(undefined)         // approve → undefined
        .mockResolvedValueOnce(FAKE_CREATE_HASH); // createBattle → hash

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);

      // Only 1 receipt wait (for createBattle, not approve)
      expect(mockWaitForTransactionReceipt).toHaveBeenCalledTimes(1);
      expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ hash: FAKE_CREATE_HASH })
      );
      expect(result).not.toBeNull();
    });

    it('succeeds with simulate even when createBattle hash is undefined', async () => {
      mockWriteContractAsync = vi.fn()
        .mockResolvedValueOnce(FAKE_APPROVE_HASH)
        .mockResolvedValueOnce(undefined);

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      // simulateContract already got the battleId, so this succeeds
      expect(result).not.toBeNull();
      expect(result!.onChainBattleId).toBe(String(ON_CHAIN_BATTLE_ID));
    });

    it('fails when createBattle hash is undefined AND simulate fails', async () => {
      mockSimulateContract = vi.fn().mockRejectedValue(new Error('sim fail'));
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };
      mockWriteContractAsync = vi.fn()
        .mockResolvedValueOnce(FAKE_APPROVE_HASH)
        .mockResolvedValueOnce(undefined);

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });
  });

  // ── Timeout and abort errors ────────────────────────

  describe('timeout and abort errors', () => {
    it('catches DOMException AbortError from fetch timeout', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      global.fetch = vi.fn().mockRejectedValue(abortError) as Mock;

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });

    it('returns null when createBattle receipt wait times out', async () => {
      mockWaitForTransactionReceipt = vi.fn()
        .mockResolvedValueOnce({}) // approve receipt OK
        .mockRejectedValueOnce(new Error('Timed out waiting for transaction receipt'));
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });

    it('returns null when approve receipt wait times out (createBattle never called)', async () => {
      mockWaitForTransactionReceipt = vi.fn()
        .mockRejectedValueOnce(new Error('Timed out waiting for approve receipt'));
      mockPublicClient = { readContract: mockReadContract, waitForTransactionReceipt: mockWaitForTransactionReceipt, simulateContract: mockSimulateContract };

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
      // Only approve was called; createBattle never reached
      expect(mockWriteContractAsync).toHaveBeenCalledTimes(1);
    });
  });

  // ── API error edge cases ────────────────────────────

  describe('API error edge cases', () => {
    it('uses status-only fallback when res.json() throws', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 502,
        json: () => { throw new Error('Invalid JSON'); },
      }) as Mock;

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).toBeNull();
    });

    it('returns empty string battleId when API response has no battle object', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }) as Mock;

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).not.toBeNull();
      expect(result!.battleId).toBe('');
    });

    it('returns empty string battleId when battle.id is undefined', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ battle: {} }),
      }) as Mock;

      const { createBattle } = await setupHook();
      const result = await createBattle(VALID_PARAMS);
      expect(result).not.toBeNull();
      expect(result!.battleId).toBe('');
    });
  });
});

// ─── BattleManager not deployed (separate describe to isolate vi.doMock) ──

describe('useCreateStrategyBattle — BattleManager not deployed', () => {
  it('returns null and skips all tx calls when BM address is zero', async () => {
    vi.resetModules();

    vi.doMock('@/constants/index', () => ({
      FLOW_TESTNET_CONTRACTS: {
        CRWN_TOKEN: CRWN_ADDR,
        BATTLE_MANAGER: '0x0000000000000000000000000000000000000000',
      },
    }));
    vi.doMock('wagmi', () => ({
      useAccount: () => ({ address: FAKE_ADDR }),
      useWriteContract: () => ({ writeContractAsync: vi.fn() }),
      usePublicClient: () => ({ readContract: vi.fn(), waitForTransactionReceipt: vi.fn() }),
    }));
    vi.doMock('react', () => ({
      useState: (init: unknown) => {
        let val = init;
        return [val, (newVal: unknown) => { val = typeof newVal === 'function' ? (newVal as (prev: unknown) => unknown)(val) : newVal; }];
      },
      useCallback: (fn: (...args: unknown[]) => unknown) => fn,
    }));

    const { useCreateStrategyBattle } = await import('../useCreateStrategyBattle');
    const { createBattle } = useCreateStrategyBattle();

    const result = await createBattle(VALID_PARAMS);
    expect(result).toBeNull();
  });
});

// ─── Cross-hook gas audit (source-level) ──────────────

describe('gas limit audit across all arena hooks', () => {
  it('all writeContractAsync calls in useCreateStrategyBattle have gas set', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../useCreateStrategyBattle.ts'), 'utf-8');
    const matches = source.match(/writeContractAsync\(\{[\s\S]*?\}\)/g);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
    for (const match of matches!) {
      expect(match).toContain('gas:');
      const gasMatch = match.match(/gas:\s*(\d[\d_]*n?)/);
      expect(gasMatch).not.toBeNull();
      const gasValue = BigInt(gasMatch![1].replace(/_/g, '').replace(/n$/, ''));
      expect(gasValue).toBeLessThan(FLOW_BLOCK_GAS_CAP);
      expect(gasValue).toBeGreaterThan(0n);
    }
  });

  it('all writeContractAsync calls in useBattleBetting have gas set', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../useBattleBetting.ts'), 'utf-8');
    const matches = source.match(/writeContractAsync\(\{[\s\S]*?\}\)/g);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
    for (const match of matches!) {
      expect(match).toContain('gas:');
    }
  });

  it('all writeContractAsync calls in usePredictionArena have gas set', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../usePredictionArena.ts'), 'utf-8');
    const matches = source.match(/writeContractAsync\(\{[\s\S]*?\}\)/g);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
    for (const match of matches!) {
      expect(match).toContain('gas:');
    }
  });

  it('all writeContractAsync calls in useStaking have gas set', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../../useStaking.ts'), 'utf-8');
    const matches = source.match(/writeContractAsync\(\{[\s\S]*?\}\)/g);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(7);
    for (const match of matches!) {
      expect(match).toContain('gas:');
      const gasMatch = match.match(/gas:\s*(\d[\d_]*n?)/);
      expect(gasMatch).not.toBeNull();
      const gasValue = BigInt(gasMatch![1].replace(/_/g, '').replace(/n$/, ''));
      expect(gasValue).toBeLessThan(FLOW_BLOCK_GAS_CAP);
    }
  });
});
