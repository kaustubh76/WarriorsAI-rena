/**
 * Production-Grade Rate Limiting
 *
 * Implements two algorithms:
 * 1. Sliding Window Counter — for write/financial endpoints (prevents boundary doubling)
 * 2. Token Bucket — for burst-friendly read endpoints (allows controlled bursts)
 *
 * Serverless-aware: uses lazy cleanup instead of setInterval timers.
 * In production with multiple instances, swap the storage Maps for Redis.
 */

import { ErrorResponses } from './errorHandler';

// ============================================================================
// Types
// ============================================================================

/** Result from a rate limit check */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  limit: number;
}

/** Internal state for the sliding window counter */
interface SlidingWindowEntry {
  /** Request count in the previous window */
  prevCount: number;
  /** Request count in the current window */
  currCount: number;
  /** Timestamp when the current window started */
  windowStart: number;
  /** Window duration in ms */
  windowMs: number;
}

/** Internal state for the token bucket */
interface TokenBucketEntry {
  /** Current number of tokens available */
  tokens: number;
  /** Last time tokens were refilled */
  lastRefill: number;
  /** Max tokens (bucket capacity) */
  maxTokens: number;
  /** Tokens added per second */
  refillRate: number;
}

type RateLimitAlgorithm = 'sliding-window' | 'token-bucket';

/** Options for sliding window presets */
interface SlidingWindowPreset {
  maxRequests: number;
  windowMs: number;
  algorithm?: 'sliding-window';
}

/** Options for token bucket presets */
interface TokenBucketPreset {
  maxTokens: number;
  refillRate: number;
  algorithm: 'token-bucket';
}

type RateLimitPreset = SlidingWindowPreset | TokenBucketPreset;

// ============================================================================
// Storage
// ============================================================================

/**
 * In-memory stores. In production with multiple serverless instances,
 * replace with Redis using the same key format.
 */
const slidingWindowStore = new Map<string, SlidingWindowEntry>();
const tokenBucketStore = new Map<string, TokenBucketEntry>();

/** Access counter for lazy cleanup scheduling */
let accessCount = 0;
const CLEANUP_INTERVAL = 500; // Run cleanup every N accesses
const MAX_STORE_SIZE = 50_000; // Hard cap to prevent memory exhaustion

// ============================================================================
// Lazy Cleanup (serverless-friendly — no setInterval)
// ============================================================================

/**
 * Lazy cleanup: runs periodically based on access count instead of timers.
 * On serverless (Vercel), setInterval doesn't survive across invocations,
 * so we clean on every Nth access instead.
 */
function lazyCleanup(): void {
  accessCount++;
  if (accessCount % CLEANUP_INTERVAL !== 0) return;

  const now = Date.now();

  // Clean sliding window entries where both windows are expired
  for (const [key, entry] of slidingWindowStore) {
    const windowEnd = entry.windowStart + entry.windowMs * 2;
    if (now > windowEnd) {
      slidingWindowStore.delete(key);
    }
  }

  // Clean token bucket entries that have been full for > 10 minutes (idle)
  for (const [key, entry] of tokenBucketStore) {
    const idleTime = now - entry.lastRefill;
    if (idleTime > 600_000 && entry.tokens >= entry.maxTokens) {
      tokenBucketStore.delete(key);
    }
  }

  // Emergency eviction if stores are too large
  if (slidingWindowStore.size > MAX_STORE_SIZE) {
    const toDelete = Math.floor(slidingWindowStore.size * 0.1);
    const keys = slidingWindowStore.keys();
    for (let i = 0; i < toDelete; i++) {
      const next = keys.next();
      if (next.done) break;
      slidingWindowStore.delete(next.value);
    }
  }

  if (tokenBucketStore.size > MAX_STORE_SIZE) {
    const toDelete = Math.floor(tokenBucketStore.size * 0.1);
    const keys = tokenBucketStore.keys();
    for (let i = 0; i < toDelete; i++) {
      const next = keys.next();
      if (next.done) break;
      tokenBucketStore.delete(next.value);
    }
  }
}

// ============================================================================
// Sliding Window Counter Algorithm
// ============================================================================

/**
 * Sliding Window Counter rate limiter.
 *
 * Combines the count from the previous fixed window (weighted by how much
 * of it overlaps with the current sliding window) with the current window's
 * count. This prevents the 2x burst problem at fixed-window boundaries.
 *
 * Formula: effectiveCount = prevCount * (1 - elapsedRatio) + currCount
 * where elapsedRatio = (now - windowStart) / windowMs
 */
function checkSlidingWindow(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  lazyCleanup();

  const now = Date.now();
  let entry = slidingWindowStore.get(key);

  if (!entry) {
    // First request — create new entry
    entry = {
      prevCount: 0,
      currCount: 1,
      windowStart: now,
      windowMs,
    };
    slidingWindowStore.set(key, entry);

    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetIn: windowMs,
      limit: maxRequests,
    };
  }

  const elapsed = now - entry.windowStart;

  // Check if we've moved past the current window
  if (elapsed >= windowMs) {
    // How many full windows have passed?
    const windowsPassed = Math.floor(elapsed / windowMs);

    if (windowsPassed === 1) {
      // Rolled into next window — previous window's count becomes prevCount
      entry.prevCount = entry.currCount;
      entry.currCount = 1;
      entry.windowStart = entry.windowStart + windowMs;
    } else {
      // Multiple windows passed — previous data is stale
      entry.prevCount = 0;
      entry.currCount = 1;
      entry.windowStart = now;
    }

    slidingWindowStore.set(key, entry);

    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetIn: windowMs,
      limit: maxRequests,
    };
  }

  // Calculate the effective count using the sliding window formula
  const elapsedRatio = elapsed / windowMs;
  const weightedPrevCount = entry.prevCount * (1 - elapsedRatio);
  const effectiveCount = weightedPrevCount + entry.currCount;

  if (effectiveCount >= maxRequests) {
    // Rate limited
    const resetIn = windowMs - elapsed;
    return {
      allowed: false,
      remaining: 0,
      resetIn,
      limit: maxRequests,
    };
  }

  // Allow request — increment current window count
  entry.currCount++;
  slidingWindowStore.set(key, entry);

  const remaining = Math.max(0, Math.floor(maxRequests - effectiveCount - 1));
  return {
    allowed: true,
    remaining,
    resetIn: windowMs - elapsed,
    limit: maxRequests,
  };
}

// ============================================================================
// Token Bucket Algorithm
// ============================================================================

/**
 * Token Bucket rate limiter.
 *
 * A bucket starts full (maxTokens). Each request consumes 1 token.
 * Tokens refill at refillRate per second. This allows controlled bursts
 * up to the bucket capacity, then steady-state at the refill rate.
 */
function checkTokenBucket(
  key: string,
  maxTokens: number,
  refillRate: number
): RateLimitResult {
  lazyCleanup();

  const now = Date.now();
  let entry = tokenBucketStore.get(key);

  if (!entry) {
    // First request — create bucket with maxTokens - 1 (consumed one)
    entry = {
      tokens: maxTokens - 1,
      lastRefill: now,
      maxTokens,
      refillRate,
    };
    tokenBucketStore.set(key, entry);

    return {
      allowed: true,
      remaining: maxTokens - 1,
      resetIn: Math.ceil(1000 / refillRate), // Time until next token
      limit: maxTokens,
    };
  }

  // Refill tokens based on elapsed time
  const elapsedSeconds = (now - entry.lastRefill) / 1000;
  const tokensToAdd = elapsedSeconds * refillRate;

  if (tokensToAdd >= 1) {
    entry.tokens = Math.min(maxTokens, entry.tokens + Math.floor(tokensToAdd));
    entry.lastRefill = now;
  }

  if (entry.tokens < 1) {
    // No tokens available — rate limited
    const timeUntilNextToken = Math.ceil((1 - (entry.tokens % 1)) / refillRate * 1000);
    return {
      allowed: false,
      remaining: 0,
      resetIn: timeUntilNextToken,
      limit: maxTokens,
    };
  }

  // Consume one token
  entry.tokens--;
  tokenBucketStore.set(key, entry);

  const timeUntilFull = entry.tokens >= maxTokens
    ? 0
    : Math.ceil((maxTokens - entry.tokens) / refillRate * 1000);

  return {
    allowed: true,
    remaining: Math.floor(entry.tokens),
    resetIn: timeUntilFull,
    limit: maxTokens,
  };
}

// ============================================================================
// Public API — Backward-Compatible
// ============================================================================

/**
 * Check if request is within rate limit.
 *
 * Uses Sliding Window Counter by default. Pass algorithm: 'token-bucket'
 * for burst-friendly read endpoints.
 *
 * @param key - Unique identifier for the rate limit (usually IP + route)
 * @param maxRequests - Maximum requests allowed in window (sliding window) or bucket capacity (token bucket)
 * @param windowMs - Time window in milliseconds (sliding window only; ignored for token bucket)
 * @param options - Additional options
 * @returns Rate limit status
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60000,
  options?: { algorithm?: RateLimitAlgorithm; refillRate?: number }
): RateLimitResult {
  const algorithm = options?.algorithm || 'sliding-window';

  if (algorithm === 'token-bucket') {
    const refillRate = options?.refillRate || Math.ceil(maxRequests / 60);
    return checkTokenBucket(key, maxRequests, refillRate);
  }

  return checkSlidingWindow(key, maxRequests, windowMs);
}

/**
 * Generate rate limit key from request.
 *
 * @param request - The HTTP request
 * @param prefix - Prefix to identify the route/action
 * @returns Rate limit key
 */
export function getRateLimitKey(request: Request, prefix: string): string {
  // Try to get IP from various headers (in order of preference for Vercel/Cloudflare)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  const vercelIp = request.headers.get('x-vercel-forwarded-for');

  const ip =
    vercelIp?.split(',')[0].trim() ||
    forwarded?.split(',')[0].trim() ||
    realIp ||
    cfConnectingIp ||
    'unknown';

  return `${prefix}:${ip}`;
}

/**
 * Generate rate limit key with wallet address support.
 * This provides a secondary rate limit that can't be bypassed by IP rotation.
 *
 * @param request - The HTTP request
 * @param prefix - Prefix to identify the route/action
 * @param walletAddress - Optional wallet address from authenticated request
 * @returns Rate limit key
 */
export function getRateLimitKeyWithWallet(
  request: Request,
  prefix: string,
  walletAddress?: string
): string {
  const ipKey = getRateLimitKey(request, prefix);

  if (walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    return `${prefix}:wallet:${normalizedAddress}`;
  }

  return ipKey;
}

/**
 * Apply rate limiting to a request.
 *
 * @param request - The HTTP request
 * @param options - Rate limit options
 * @throws APIError if rate limit exceeded
 */
export function applyRateLimit(
  request: Request,
  options: {
    prefix: string;
    maxRequests?: number;
    windowMs?: number;
    algorithm?: RateLimitAlgorithm;
    refillRate?: number;
    /** For token bucket presets */
    maxTokens?: number;
    /** Optional wallet address for wallet-based rate limiting */
    walletAddress?: string;
    /** Use stricter limits for wallet-based tracking */
    strictWalletLimit?: boolean;
  }
): void {
  // Determine algorithm and limits
  const algorithm = options.algorithm || 'sliding-window';
  const maxRequests = options.maxTokens || options.maxRequests || 10;
  const windowMs = options.windowMs || 60000;
  const refillRate = options.refillRate;

  // IP-based rate limiting
  const ipKey = getRateLimitKey(request, options.prefix);
  const ipResult = checkRateLimit(ipKey, maxRequests, windowMs, { algorithm, refillRate });

  if (!ipResult.allowed) {
    throw ErrorResponses.rateLimitExceeded(ipResult.resetIn);
  }

  // Additional wallet-based rate limiting if wallet address is provided
  if (options.walletAddress) {
    const walletKey = getRateLimitKeyWithWallet(
      request,
      options.prefix,
      options.walletAddress
    );

    const walletMaxRequests = options.strictWalletLimit
      ? Math.max(Math.floor(maxRequests / 2), 1)
      : maxRequests;

    const walletResult = checkRateLimit(walletKey, walletMaxRequests, windowMs, {
      algorithm,
      refillRate: refillRate ? Math.ceil(refillRate / 2) : undefined,
    });

    if (!walletResult.allowed) {
      throw ErrorResponses.rateLimitExceeded(walletResult.resetIn);
    }
  }
}

/**
 * Apply rate limiting with automatic wallet extraction from request body.
 * Useful for POST requests that include wallet address in the body.
 *
 * @param request - The HTTP request (will be cloned for body reading)
 * @param body - The parsed request body
 * @param options - Rate limit options
 * @throws APIError if rate limit exceeded
 */
export function applyRateLimitWithBody(
  request: Request,
  body: { userAddress?: string; walletAddress?: string; creatorAddress?: string; userId?: string },
  options: {
    prefix: string;
    maxRequests?: number;
    windowMs?: number;
    algorithm?: RateLimitAlgorithm;
    refillRate?: number;
    maxTokens?: number;
    strictWalletLimit?: boolean;
  }
): void {
  const walletAddress =
    body.userAddress || body.walletAddress || body.creatorAddress || body.userId;

  applyRateLimit(request, {
    ...options,
    walletAddress,
  });
}

/**
 * Get rate limit headers for response.
 *
 * @param status - Rate limit status
 * @returns Headers object with standard rate limit headers
 */
export function getRateLimitHeaders(status: {
  limit: number;
  remaining: number;
  resetIn: number;
}): Record<string, string> {
  const resetAtSeconds = Math.ceil((Date.now() + status.resetIn) / 1000);
  const retryAfterSeconds = Math.ceil(status.resetIn / 1000);

  return {
    'X-RateLimit-Limit': status.limit.toString(),
    'X-RateLimit-Remaining': status.remaining.toString(),
    'X-RateLimit-Reset': resetAtSeconds.toString(),
    'Retry-After': retryAfterSeconds.toString(),
  };
}

// ============================================================================
// Predefined Rate Limit Configurations
// ============================================================================

/**
 * Predefined rate limit configurations.
 *
 * Sliding Window presets (default) — prevents boundary doubling:
 *   Use for write operations, financial endpoints, and anything abuse-sensitive.
 *
 * Token Bucket presets — allows controlled bursts:
 *   Use for read endpoints where occasional bursts are acceptable.
 */
export const RateLimitPresets = {
  // --- Sliding Window Counter presets (write/financial operations) ---

  /** Battle creation: 5 per minute (strict) */
  battleCreation: {
    maxRequests: 5,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** General betting: 20 per minute */
  betting: {
    maxRequests: 20,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Market creation: 3 per minute (strict) */
  marketCreation: {
    maxRequests: 3,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** API queries: 60 per minute */
  apiQueries: {
    maxRequests: 60,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Read operations: 120 per minute */
  readOperations: {
    maxRequests: 120,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Market betting (POST /api/markets/bet): 15 per minute */
  marketBetting: {
    maxRequests: 15,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Whale alert operations: 60 per minute */
  whaleAlerts: {
    maxRequests: 60,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Agent write operations: 10 per minute */
  agentOperations: {
    maxRequests: 10,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Cron job endpoints: 5 per minute */
  cronJobs: {
    maxRequests: 5,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Oracle resolution: 3 per minute (strict) */
  oracleOperations: {
    maxRequests: 3,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** 0G AI inference: 20 per minute */
  inference: {
    maxRequests: 20,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Copy trade execution: 5 per minute */
  copyTrade: {
    maxRequests: 5,
    windowMs: 60000,
  } as SlidingWindowPreset,

  /** Flow blockchain execution: 30 per minute */
  flowExecution: {
    maxRequests: 30,
    windowMs: 60000,
  } as SlidingWindowPreset,

  // --- Token Bucket presets (burst-friendly reads) ---

  /** Market data reads: burst of 30, refill 2/sec */
  marketReads: {
    maxTokens: 30,
    refillRate: 2,
    algorithm: 'token-bucket' as const,
  } as TokenBucketPreset,

  /** Public endpoint reads: burst of 60, refill 4/sec */
  publicReads: {
    maxTokens: 60,
    refillRate: 4,
    algorithm: 'token-bucket' as const,
  } as TokenBucketPreset,
} as const;

// ============================================================================
// Store Inspection (for monitoring/debugging)
// ============================================================================

/**
 * Get current rate limit store sizes for monitoring.
 */
export function getRateLimitStoreStats(): {
  slidingWindowEntries: number;
  tokenBucketEntries: number;
  totalEntries: number;
} {
  return {
    slidingWindowEntries: slidingWindowStore.size,
    tokenBucketEntries: tokenBucketStore.size,
    totalEntries: slidingWindowStore.size + tokenBucketStore.size,
  };
}
