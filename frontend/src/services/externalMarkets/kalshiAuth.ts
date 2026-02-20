/**
 * Kalshi Authentication Manager
 * RSA-PSS per-request signing for Kalshi Trade API v2
 *
 * Every request requires 3 headers:
 * - KALSHI-ACCESS-KEY: API key ID
 * - KALSHI-ACCESS-TIMESTAMP: Unix epoch milliseconds
 * - KALSHI-ACCESS-SIGNATURE: RSA-PSS SHA-256 signature (base64)
 *
 * Signature message = timestamp + method + path (no query params)
 */

import * as crypto from 'crypto';

// ============================================
// TYPES
// ============================================

export interface KalshiCredentials {
  apiKeyId: string;
  privateKey: string;
}

export interface KalshiAuthHeaders {
  'KALSHI-ACCESS-KEY': string;
  'KALSHI-ACCESS-TIMESTAMP': string;
  'KALSHI-ACCESS-SIGNATURE': string;
  'Content-Type': string;
}

// ============================================
// AUTH MANAGER CLASS
// ============================================

class KalshiAuthManager {
  private apiKeyId: string | null = null;
  private privateKey: crypto.KeyObject | null = null;
  private rawPrivateKey: string | null = null;

  constructor() {
    this.loadFromEnv();
  }

  /**
   * Load credentials from environment variables
   */
  private loadFromEnv(): void {
    const keyId = process.env.KALSHI_API_KEY_ID || process.env.KALSHI_API_KEY;
    let rawKey = process.env.KALSHI_PRIVATE_KEY;

    if (!keyId || !rawKey) {
      console.warn('[KalshiAuth] Missing KALSHI_API_KEY_ID or KALSHI_PRIVATE_KEY env vars');
      return;
    }

    // Handle escaped newlines from env vars (Vercel stores them as literal \n)
    rawKey = rawKey.replace(/\\n/g, '\n');

    this.apiKeyId = keyId;
    this.rawPrivateKey = rawKey;

    try {
      this.privateKey = crypto.createPrivateKey({
        key: rawKey,
        format: 'pem',
      });
      console.log('[KalshiAuth] RSA private key loaded successfully');
    } catch (err) {
      console.error('[KalshiAuth] Failed to parse RSA private key:', err instanceof Error ? err.message : err);
      this.privateKey = null;
    }
  }

  /**
   * Set credentials programmatically
   */
  setCredentials(credentials: KalshiCredentials): void {
    this.apiKeyId = credentials.apiKeyId;

    let rawKey = credentials.privateKey;
    rawKey = rawKey.replace(/\\n/g, '\n');
    this.rawPrivateKey = rawKey;

    try {
      this.privateKey = crypto.createPrivateKey({
        key: rawKey,
        format: 'pem',
      });
    } catch (err) {
      console.error('[KalshiAuth] Failed to parse RSA private key:', err instanceof Error ? err.message : err);
      this.privateKey = null;
    }
  }

  /**
   * Check if credentials are configured and key is loaded
   */
  hasCredentials(): boolean {
    return !!this.apiKeyId && !!this.privateKey;
  }

  /**
   * Sign a request and return auth headers
   *
   * @param method - HTTP method (GET, POST, DELETE, etc.)
   * @param path - API path WITHOUT query params (e.g., /trade-api/v2/markets)
   * @returns Headers object with KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE
   */
  signRequest(method: string, path: string): KalshiAuthHeaders {
    if (!this.apiKeyId || !this.privateKey) {
      throw new KalshiAuthError(
        'Kalshi credentials not configured — set KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY env vars'
      );
    }

    // Timestamp as unix epoch milliseconds (string)
    const timestamp = Date.now().toString();

    // Message to sign: timestamp + METHOD + path
    const message = timestamp + method.toUpperCase() + path;

    // RSA-PSS SHA-256 signature with salt length 32
    const signature = crypto.sign('sha256', Buffer.from(message), {
      key: this.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    });

    return {
      'KALSHI-ACCESS-KEY': this.apiKeyId,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature.toString('base64'),
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get authorization headers for a request (backward compat wrapper)
   * For trading endpoints that previously used getAuthHeaders()
   */
  async getAuthHeaders(method: string = 'GET', path: string = '/trade-api/v2/portfolio/orders'): Promise<Record<string, string>> {
    return this.signRequest(method, path);
  }

  /**
   * Check if currently "authenticated" (has valid credentials loaded)
   */
  isAuthenticated(): boolean {
    return this.hasCredentials();
  }

  /**
   * Get the API key ID (user identifier)
   */
  getUserId(): string | null {
    return this.apiKeyId;
  }

  /**
   * Invalidate credentials (no-op for RSA-PSS, kept for backward compat)
   */
  invalidateToken(): void {
    // No token to invalidate with RSA-PSS signing
    // Kept for backward compatibility
  }

  /**
   * Get debug info (safe to log — no secrets)
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      hasApiKeyId: !!this.apiKeyId,
      apiKeyIdPrefix: this.apiKeyId?.slice(0, 8) || null,
      hasPrivateKey: !!this.privateKey,
      hasRawKey: !!this.rawPrivateKey,
      rawKeyLength: this.rawPrivateKey?.length || 0,
      rawKeyStartsWith: this.rawPrivateKey?.slice(0, 30) || null,
    };
  }

  /**
   * Clean shutdown
   */
  destroy(): void {
    this.apiKeyId = null;
    this.privateKey = null;
    this.rawPrivateKey = null;
  }
}

// ============================================
// ERROR CLASS
// ============================================

export class KalshiAuthError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'KalshiAuthError';
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const kalshiAuth = new KalshiAuthManager();

// Export class for custom instances
export { KalshiAuthManager };
