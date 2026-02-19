import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  getRateLimitKey,
  getRateLimitKeyWithWallet,
  applyRateLimit,
  applyRateLimitWithBody,
  getRateLimitHeaders,
  getRateLimitStoreStats,
  RateLimitPresets,
} from '../rateLimit';

// ---------- helpers ----------

function createMockRequest(options: {
  headers?: Record<string, string>;
  url?: string;
} = {}): Request {
  const url = options.url || 'http://localhost:3000/api/test';
  return new Request(url, {
    headers: new Headers(options.headers || {}),
  });
}

// Use unique prefixes per test to avoid cross-test contamination
let testCounter = 0;
function uniquePrefix(base: string): string {
  return `${base}-${++testCounter}-${Date.now()}`;
}

// ---------- checkRateLimit — Sliding Window ----------
describe('checkRateLimit (sliding window)', () => {
  it('should allow the first request', () => {
    const key = uniquePrefix('sw-first');
    const result = checkRateLimit(key, 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it('should decrement remaining with each request', () => {
    const key = uniquePrefix('sw-decrement');
    checkRateLimit(key, 5, 60000);
    const result2 = checkRateLimit(key, 5, 60000);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(3);
  });

  it('should block after max requests', () => {
    const key = uniquePrefix('sw-block');
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60000);
    }
    const blocked = checkRateLimit(key, 3, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetIn).toBeGreaterThan(0);
  });

  it('should use default values when not provided', () => {
    const key = uniquePrefix('sw-defaults');
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10); // default maxRequests
  });

  it('should have a positive resetIn', () => {
    const key = uniquePrefix('sw-resetin');
    const result = checkRateLimit(key, 5, 60000);
    expect(result.resetIn).toBeGreaterThan(0);
    expect(result.resetIn).toBeLessThanOrEqual(60000);
  });
});

// ---------- checkRateLimit — Token Bucket ----------
describe('checkRateLimit (token bucket)', () => {
  it('should allow the first request', () => {
    const key = uniquePrefix('tb-first');
    const result = checkRateLimit(key, 10, 60000, { algorithm: 'token-bucket' });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
  });

  it('should allow burst up to maxTokens', () => {
    const key = uniquePrefix('tb-burst');
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, 5, 60000, { algorithm: 'token-bucket' });
      expect(result.allowed).toBe(true);
    }
  });

  it('should block when tokens are exhausted', () => {
    const key = uniquePrefix('tb-exhausted');
    // Drain all 3 tokens
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60000, { algorithm: 'token-bucket' });
    }
    const blocked = checkRateLimit(key, 3, 60000, { algorithm: 'token-bucket' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('should accept custom refillRate', () => {
    const key = uniquePrefix('tb-refill');
    const result = checkRateLimit(key, 10, 60000, {
      algorithm: 'token-bucket',
      refillRate: 5, // 5 tokens/sec
    });
    expect(result.allowed).toBe(true);
  });
});

// ---------- getRateLimitKey ----------
describe('getRateLimitKey', () => {
  it('should extract IP from x-forwarded-for', () => {
    const req = createMockRequest({
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    const key = getRateLimitKey(req, 'test');
    expect(key).toBe('test:1.2.3.4');
  });

  it('should prefer x-vercel-forwarded-for over x-forwarded-for', () => {
    const req = createMockRequest({
      headers: {
        'x-vercel-forwarded-for': '10.0.0.1',
        'x-forwarded-for': '1.2.3.4',
      },
    });
    const key = getRateLimitKey(req, 'test');
    expect(key).toBe('test:10.0.0.1');
  });

  it('should use x-real-ip as fallback', () => {
    const req = createMockRequest({
      headers: { 'x-real-ip': '192.168.1.1' },
    });
    const key = getRateLimitKey(req, 'test');
    expect(key).toBe('test:192.168.1.1');
  });

  it('should use cf-connecting-ip as fallback', () => {
    const req = createMockRequest({
      headers: { 'cf-connecting-ip': '172.16.0.1' },
    });
    const key = getRateLimitKey(req, 'test');
    expect(key).toBe('test:172.16.0.1');
  });

  it('should fallback to "unknown" when no IP headers', () => {
    const req = createMockRequest();
    const key = getRateLimitKey(req, 'test');
    expect(key).toBe('test:unknown');
  });
});

// ---------- getRateLimitKeyWithWallet ----------
describe('getRateLimitKeyWithWallet', () => {
  it('should return wallet-based key when wallet address is provided', () => {
    const req = createMockRequest();
    const key = getRateLimitKeyWithWallet(req, 'test', '0xABC123');
    expect(key).toBe('test:wallet:0xabc123');
  });

  it('should normalize wallet address to lowercase', () => {
    const req = createMockRequest();
    const key = getRateLimitKeyWithWallet(req, 'test', '0xABCDEF');
    expect(key).toContain('0xabcdef');
  });

  it('should fallback to IP-based key when no wallet address', () => {
    const req = createMockRequest({
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const key = getRateLimitKeyWithWallet(req, 'test');
    expect(key).toBe('test:1.2.3.4');
  });
});

// ---------- applyRateLimit ----------
describe('applyRateLimit', () => {
  it('should not throw for allowed request', () => {
    const req = createMockRequest({
      headers: { 'x-forwarded-for': uniquePrefix('apply-ok') },
    });
    expect(() => {
      applyRateLimit(req, { prefix: uniquePrefix('apply-ok'), maxRequests: 10, windowMs: 60000 });
    }).not.toThrow();
  });

  it('should throw APIError when rate limited', () => {
    const ip = uniquePrefix('apply-blocked');
    const prefix = uniquePrefix('apply-blocked');
    const req = createMockRequest({
      headers: { 'x-forwarded-for': ip },
    });

    // Exhaust limit
    for (let i = 0; i < 3; i++) {
      applyRateLimit(req, { prefix, maxRequests: 3, windowMs: 60000 });
    }

    expect(() => {
      applyRateLimit(req, { prefix, maxRequests: 3, windowMs: 60000 });
    }).toThrow();
  });

  it('should apply wallet-based rate limiting when walletAddress is provided', () => {
    const prefix = uniquePrefix('apply-wallet');
    const req = createMockRequest({
      headers: { 'x-forwarded-for': uniquePrefix('ip') },
    });

    expect(() => {
      applyRateLimit(req, {
        prefix,
        maxRequests: 10,
        windowMs: 60000,
        walletAddress: '0xWallet123',
      });
    }).not.toThrow();
  });

  it('should use strictWalletLimit to halve wallet limit', () => {
    const prefix = uniquePrefix('strict-wallet');
    const wallet = `0x${uniquePrefix('strict')}`;
    const req = createMockRequest({
      headers: { 'x-forwarded-for': uniquePrefix('strict-ip') },
    });

    // With strictWalletLimit: maxRequests / 2 = 1 (floor of 2/2)
    applyRateLimit(req, {
      prefix,
      maxRequests: 2,
      windowMs: 60000,
      walletAddress: wallet,
      strictWalletLimit: true,
    });

    // Second call should be blocked by wallet limit (max 1)
    expect(() => {
      applyRateLimit(req, {
        prefix,
        maxRequests: 2,
        windowMs: 60000,
        walletAddress: wallet,
        strictWalletLimit: true,
      });
    }).toThrow();
  });
});

// ---------- applyRateLimitWithBody ----------
describe('applyRateLimitWithBody', () => {
  it('should extract userAddress from body', () => {
    const prefix = uniquePrefix('body-user');
    const req = createMockRequest({
      headers: { 'x-forwarded-for': uniquePrefix('body-ip') },
    });

    expect(() => {
      applyRateLimitWithBody(req, { userAddress: '0xUser' }, {
        prefix,
        maxRequests: 10,
        windowMs: 60000,
      });
    }).not.toThrow();
  });

  it('should extract walletAddress from body', () => {
    const prefix = uniquePrefix('body-wallet');
    const req = createMockRequest({
      headers: { 'x-forwarded-for': uniquePrefix('body-ip2') },
    });

    expect(() => {
      applyRateLimitWithBody(req, { walletAddress: '0xWallet' }, {
        prefix,
        maxRequests: 10,
        windowMs: 60000,
      });
    }).not.toThrow();
  });

  it('should extract creatorAddress from body', () => {
    const prefix = uniquePrefix('body-creator');
    const req = createMockRequest({
      headers: { 'x-forwarded-for': uniquePrefix('body-ip3') },
    });

    expect(() => {
      applyRateLimitWithBody(req, { creatorAddress: '0xCreator' }, {
        prefix,
        maxRequests: 10,
        windowMs: 60000,
      });
    }).not.toThrow();
  });

  it('should work without any wallet field in body', () => {
    const prefix = uniquePrefix('body-empty');
    const req = createMockRequest({
      headers: { 'x-forwarded-for': uniquePrefix('body-ip4') },
    });

    expect(() => {
      applyRateLimitWithBody(req, {}, {
        prefix,
        maxRequests: 10,
        windowMs: 60000,
      });
    }).not.toThrow();
  });
});

// ---------- getRateLimitHeaders ----------
describe('getRateLimitHeaders', () => {
  it('should return standard rate limit headers', () => {
    const headers = getRateLimitHeaders({
      limit: 60,
      remaining: 42,
      resetIn: 30000,
    });

    expect(headers['X-RateLimit-Limit']).toBe('60');
    expect(headers['X-RateLimit-Remaining']).toBe('42');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
    expect(headers['Retry-After']).toBe('30');
  });

  it('should ceil Retry-After seconds', () => {
    const headers = getRateLimitHeaders({
      limit: 10,
      remaining: 0,
      resetIn: 1500,
    });
    expect(headers['Retry-After']).toBe('2');
  });
});

// ---------- getRateLimitStoreStats ----------
describe('getRateLimitStoreStats', () => {
  it('should return store size information', () => {
    const stats = getRateLimitStoreStats();
    expect(stats).toHaveProperty('slidingWindowEntries');
    expect(stats).toHaveProperty('tokenBucketEntries');
    expect(stats).toHaveProperty('totalEntries');
    expect(stats.totalEntries).toBe(stats.slidingWindowEntries + stats.tokenBucketEntries);
  });
});

// ---------- RateLimitPresets ----------
describe('RateLimitPresets', () => {
  it('should have all expected presets', () => {
    expect(RateLimitPresets.battleCreation).toBeDefined();
    expect(RateLimitPresets.betting).toBeDefined();
    expect(RateLimitPresets.marketCreation).toBeDefined();
    expect(RateLimitPresets.apiQueries).toBeDefined();
    expect(RateLimitPresets.readOperations).toBeDefined();
    expect(RateLimitPresets.marketBetting).toBeDefined();
    expect(RateLimitPresets.agentOperations).toBeDefined();
    expect(RateLimitPresets.cronJobs).toBeDefined();
    expect(RateLimitPresets.oracleOperations).toBeDefined();
    expect(RateLimitPresets.inference).toBeDefined();
    expect(RateLimitPresets.copyTrade).toBeDefined();
    expect(RateLimitPresets.flowExecution).toBeDefined();
    expect(RateLimitPresets.storageWrite).toBeDefined();
    expect(RateLimitPresets.moderateReads).toBeDefined();
    expect(RateLimitPresets.fileUpload).toBeDefined();
    expect(RateLimitPresets.marketInference).toBeDefined();
  });

  it('all presets should have maxRequests and windowMs', () => {
    for (const [name, preset] of Object.entries(RateLimitPresets)) {
      expect(preset.maxRequests, `${name}.maxRequests`).toBeGreaterThan(0);
      expect(preset.windowMs, `${name}.windowMs`).toBeGreaterThan(0);
    }
  });

  it('write presets should be stricter than read presets', () => {
    expect(RateLimitPresets.battleCreation.maxRequests).toBeLessThan(RateLimitPresets.readOperations.maxRequests);
    expect(RateLimitPresets.marketCreation.maxRequests).toBeLessThan(RateLimitPresets.apiQueries.maxRequests);
    expect(RateLimitPresets.oracleOperations.maxRequests).toBeLessThan(RateLimitPresets.readOperations.maxRequests);
  });
});
