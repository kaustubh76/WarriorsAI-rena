/**
 * Authentication Utilities
 * Signature verification, token generation, and wallet authentication
 */

import { createHash } from 'crypto';

/**
 * Verify Ethereum signature
 * This would typically use ethers or viem for full verification
 */
export interface SignaturePayload {
  address: string;
  signature: string;
  message: string;
  timestamp: number;
}

/**
 * Validate signature payload structure
 */
export function validateSignaturePayload(payload: unknown): payload is SignaturePayload {
  if (!payload || typeof payload !== 'object') return false;

  const p = payload as Partial<SignaturePayload>;

  return (
    typeof p.address === 'string' &&
    typeof p.signature === 'string' &&
    typeof p.message === 'string' &&
    typeof p.timestamp === 'number'
  );
}

/**
 * Check if signature timestamp is still valid
 */
export function isSignatureTimestampValid(
  timestamp: number,
  maxAgeMs: number = 5 * 60 * 1000 // 5 minutes
): boolean {
  const now = Date.now();
  const age = now - timestamp;

  return age >= 0 && age <= maxAgeMs;
}

/**
 * Generate a nonce for signature challenges
 */
export function generateNonce(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
  } else {
    // Fallback for Node.js
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }

  return result;
}

/**
 * Create a standard message for signing
 */
export function createSignMessage(options: {
  domain: string;
  address: string;
  nonce: string;
  timestamp?: number;
  statement?: string;
}): string {
  const { domain, address, nonce, timestamp = Date.now(), statement } = options;

  const parts = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
  ];

  if (statement) {
    parts.push(statement, '');
  }

  parts.push(
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`,
    `Chain ID: 545` // Flow Testnet
  );

  return parts.join('\n');
}

/**
 * Parse signed message to extract components
 */
export function parseSignedMessage(message: string): {
  domain?: string;
  address?: string;
  nonce?: string;
  timestamp?: number;
  chainId?: number;
} | null {
  try {
    const lines = message.split('\n');
    const result: ReturnType<typeof parseSignedMessage> = {};

    // Extract domain (first line before "wants you to sign in")
    if (lines[0]?.includes('wants you to sign in')) {
      result.domain = lines[0].split(' wants you to sign in')[0];
    }

    // Extract address (second line)
    if (lines[1]) {
      result.address = lines[1].trim();
    }

    // Extract nonce
    const nonceLine = lines.find(l => l.startsWith('Nonce:'));
    if (nonceLine) {
      result.nonce = nonceLine.replace('Nonce:', '').trim();
    }

    // Extract timestamp
    const timestampLine = lines.find(l => l.startsWith('Timestamp:'));
    if (timestampLine) {
      result.timestamp = parseInt(timestampLine.replace('Timestamp:', '').trim(), 10);
    }

    // Extract chain ID
    const chainIdLine = lines.find(l => l.startsWith('Chain ID:'));
    if (chainIdLine) {
      result.chainId = parseInt(chainIdLine.replace('Chain ID:', '').trim(), 10);
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Simple JWT-like token generation (not cryptographically secure, use for demo only)
 * For production, use proper JWT libraries
 */
export function createToken(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${secret}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode token
 */
export function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }

    // Verify signature
    const expectedSignature = createHash('sha256')
      .update(`${encodedHeader}.${encodedPayload}.${secret}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());

    // Check expiration
    if (payload.exp && typeof payload.exp === 'number') {
      if (Date.now() / 1000 > payload.exp) {
        return null; // Token expired
      }
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Create a session token with expiration
 */
export function createSessionToken(
  userId: string,
  address: string,
  secret: string,
  expiresInSeconds: number = 24 * 60 * 60 // 24 hours
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    userId,
    address,
    iat: now,
    exp: now + expiresInSeconds,
  };

  return createToken(payload, secret);
}

/**
 * Extract address from authorization header
 */
export function extractAddressFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;

  // Bearer token format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Direct address format
  if (authHeader.startsWith('0x')) {
    return authHeader;
  }

  return null;
}

/**
 * Rate limit tracking for authentication attempts
 */
const authAttempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if authentication attempts are rate limited
 */
export function isAuthRateLimited(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): boolean {
  const now = Date.now();
  const attempts = authAttempts.get(identifier);

  if (!attempts || now > attempts.resetAt) {
    // Reset or initialize
    authAttempts.set(identifier, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (attempts.count >= maxAttempts) {
    return true;
  }

  attempts.count++;
  return false;
}

/**
 * Reset rate limit for identifier
 */
export function resetAuthRateLimit(identifier: string): void {
  authAttempts.delete(identifier);
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupAuthRateLimits(): void {
  const now = Date.now();
  for (const [key, value] of authAttempts.entries()) {
    if (now > value.resetAt) {
      authAttempts.delete(key);
    }
  }
}

/**
 * Session storage (in-memory, replace with Redis in production)
 */
const sessions = new Map<string, { userId: string; address: string; expiresAt: number }>();

/**
 * Create a session
 */
export function createSession(
  sessionId: string,
  userId: string,
  address: string,
  expiresInMs: number = 24 * 60 * 60 * 1000
): void {
  sessions.set(sessionId, {
    userId,
    address,
    expiresAt: Date.now() + expiresInMs,
  });
}

/**
 * Get session
 */
export function getSession(sessionId: string): { userId: string; address: string } | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return { userId: session.userId, address: session.address };
}

/**
 * Delete session
 */
export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [key, value] of sessions.entries()) {
    if (now > value.expiresAt) {
      sessions.delete(key);
    }
  }
}

/**
 * Permissions and roles
 */
export const Roles = {
  USER: 'user',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  CREATOR: 'creator',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

/**
 * Check if user has required role
 */
export function hasRole(userRoles: Role[], requiredRole: Role): boolean {
  return userRoles.includes(requiredRole);
}

/**
 * Check if user has any of the required roles
 */
export function hasAnyRole(userRoles: Role[], requiredRoles: Role[]): boolean {
  return requiredRoles.some(role => userRoles.includes(role));
}

/**
 * Check if user has all required roles
 */
export function hasAllRoles(userRoles: Role[], requiredRoles: Role[]): boolean {
  return requiredRoles.every(role => userRoles.includes(role));
}

/**
 * Permission definitions
 */
export const Permissions = {
  // Market permissions
  CREATE_MARKET: 'market:create',
  EDIT_MARKET: 'market:edit',
  RESOLVE_MARKET: 'market:resolve',

  // Arena permissions
  CREATE_BATTLE: 'battle:create',
  EXECUTE_BATTLE: 'battle:execute',
  MODERATE_BATTLE: 'battle:moderate',

  // Agent permissions
  CREATE_AGENT: 'agent:create',
  EXECUTE_TRADE: 'agent:execute',
  VIEW_ANALYTICS: 'agent:analytics',

  // Admin permissions
  BAN_USER: 'admin:ban',
  VIEW_LOGS: 'admin:logs',
  MANAGE_SYSTEM: 'admin:system',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Role to permissions mapping
 */
export const rolePermissions: Record<Role, Permission[]> = {
  [Roles.USER]: [
    Permissions.CREATE_AGENT,
    Permissions.EXECUTE_TRADE,
    Permissions.CREATE_BATTLE,
  ],
  [Roles.CREATOR]: [
    Permissions.CREATE_AGENT,
    Permissions.EXECUTE_TRADE,
    Permissions.CREATE_BATTLE,
    Permissions.CREATE_MARKET,
    Permissions.VIEW_ANALYTICS,
  ],
  [Roles.MODERATOR]: [
    Permissions.CREATE_AGENT,
    Permissions.EXECUTE_TRADE,
    Permissions.CREATE_BATTLE,
    Permissions.CREATE_MARKET,
    Permissions.EDIT_MARKET,
    Permissions.MODERATE_BATTLE,
    Permissions.VIEW_ANALYTICS,
  ],
  [Roles.ADMIN]: Object.values(Permissions),
};

/**
 * Check if roles have permission
 */
export function hasPermission(userRoles: Role[], permission: Permission): boolean {
  return userRoles.some(role => {
    const permissions = rolePermissions[role];
    return permissions.includes(permission);
  });
}

/**
 * Get all permissions for roles
 */
export function getPermissions(userRoles: Role[]): Permission[] {
  const permissions = new Set<Permission>();
  userRoles.forEach(role => {
    rolePermissions[role].forEach(p => permissions.add(p));
  });
  return Array.from(permissions);
}

/**
 * API key generation and validation
 */
export function generateApiKey(prefix: string = 'sk'): string {
  const random = generateNonce(32);
  return `${prefix}_${random}`;
}

/**
 * Hash API key for storage
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return /^[a-z]{2,}_[A-Za-z0-9]{32,}$/.test(apiKey);
}

/**
 * Create a signed payload for API requests
 */
export function signPayload(
  payload: Record<string, unknown>,
  secret: string
): { payload: Record<string, unknown>; signature: string } {
  const timestamp = Date.now();
  const payloadWithTimestamp = { ...payload, timestamp };

  const signature = createHash('sha256')
    .update(JSON.stringify(payloadWithTimestamp) + secret)
    .digest('hex');

  return {
    payload: payloadWithTimestamp,
    signature,
  };
}

/**
 * Verify signed payload
 */
export function verifySignedPayload(
  payload: Record<string, unknown>,
  signature: string,
  secret: string,
  maxAgeMs: number = 5 * 60 * 1000
): boolean {
  // Check timestamp
  if (typeof payload.timestamp !== 'number') return false;
  if (!isSignatureTimestampValid(payload.timestamp, maxAgeMs)) return false;

  // Verify signature
  const expectedSignature = createHash('sha256')
    .update(JSON.stringify(payload) + secret)
    .digest('hex');

  return signature === expectedSignature;
}
