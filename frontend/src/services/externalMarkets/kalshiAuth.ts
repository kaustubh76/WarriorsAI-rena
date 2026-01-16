/**
 * Kalshi Authentication Manager
 * Handles JWT token lifecycle for Kalshi Trade API
 *
 * Features:
 * - Token storage and validation
 * - Proactive token refresh (before expiry)
 * - Concurrent authentication prevention
 * - Auth header generation
 */

import { kalshiAdaptiveRateLimiter } from '@/lib/adaptiveRateLimiter';
import { monitoredCall } from './monitoring';
import {
  KalshiAuthResponseSchema,
  validateKalshiResponse,
} from './schemas/kalshiSchemas';

// ============================================
// CONSTANTS
// ============================================

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const TOKEN_LIFETIME_MS = 25 * 60 * 1000; // 25 minutes
const TOKEN_REFRESH_BUFFER_MS = 3 * 60 * 1000; // Refresh 3 minutes before expiry

// ============================================
// TYPES
// ============================================

export interface KalshiCredentials {
  apiKeyId: string;
  privateKey: string;
}

interface AuthToken {
  token: string;
  expiresAt: number;
  userId: string;
}

// ============================================
// AUTH MANAGER CLASS
// ============================================

class KalshiAuthManager {
  private token: AuthToken | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<void> | null = null;
  private credentials: KalshiCredentials | null = null;

  /**
   * Set credentials for authentication
   * Call this before attempting to get a token
   */
  setCredentials(credentials: KalshiCredentials): void {
    this.credentials = credentials;
    // Clear existing token when credentials change
    this.invalidateToken();
  }

  /**
   * Check if credentials are configured
   */
  hasCredentials(): boolean {
    return !!this.credentials?.apiKeyId && !!this.credentials?.privateKey;
  }

  /**
   * Get a valid token, authenticating if necessary
   */
  async getValidToken(): Promise<string> {
    // If currently refreshing, wait for it
    if (this.refreshPromise) {
      await this.refreshPromise;
    }

    // Check if token exists and is valid
    if (this.token && this.isTokenValid()) {
      return this.token.token;
    }

    // Need to authenticate
    await this.authenticate();

    if (!this.token) {
      throw new KalshiAuthError('Authentication failed - no token received');
    }

    return this.token.token;
  }

  /**
   * Check if current token is valid (not expired)
   */
  private isTokenValid(): boolean {
    if (!this.token) return false;
    return Date.now() < this.token.expiresAt - TOKEN_REFRESH_BUFFER_MS;
  }

  /**
   * Perform authentication with Kalshi API
   */
  async authenticate(): Promise<void> {
    if (!this.credentials) {
      throw new KalshiAuthError('Kalshi credentials not configured');
    }

    // Prevent concurrent auth attempts
    if (this.isRefreshing) {
      return this.refreshPromise!;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performAuthentication();

    try {
      await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Internal authentication implementation
   */
  private async performAuthentication(): Promise<void> {
    return monitoredCall(
      'kalshi',
      'authenticate',
      async () => {
        await kalshiAdaptiveRateLimiter.acquire();

        const response = await fetch(`${KALSHI_API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: this.credentials!.apiKeyId,
            password: this.credentials!.privateKey,
          }),
        });

        kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

        if (!response.ok) {
          const errorText = await response.text();
          throw new KalshiAuthError(
            `Authentication failed: ${response.status} - ${errorText}`,
            response.status
          );
        }

        const data = await validateKalshiResponse(
          response,
          KalshiAuthResponseSchema,
          'KalshiAuth.authenticate'
        );

        this.token = {
          token: data.token,
          expiresAt: Date.now() + TOKEN_LIFETIME_MS,
          userId: data.member_id,
        };

        // Schedule proactive refresh
        this.scheduleTokenRefresh();

        console.log('[KalshiAuth] Authentication successful');
      }
    );
  }

  /**
   * Schedule proactive token refresh before expiry
   */
  private scheduleTokenRefresh(): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (!this.token) return;

    const refreshIn =
      this.token.expiresAt - Date.now() - TOKEN_REFRESH_BUFFER_MS;

    if (refreshIn > 0) {
      this.refreshTimer = setTimeout(async () => {
        console.log('[KalshiAuth] Proactive token refresh');
        try {
          await this.authenticate();
        } catch (err) {
          console.error('[KalshiAuth] Proactive refresh failed:', err);
          // Will retry on next API call
        }
      }, refreshIn);
    }
  }

  /**
   * Get authorization headers for authenticated requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getValidToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get current user ID (if authenticated)
   */
  getUserId(): string | null {
    return this.token?.userId || null;
  }

  /**
   * Invalidate current token
   * Call this on 401 responses or when credentials change
   */
  invalidateToken(): void {
    this.token = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token && this.isTokenValid();
  }

  /**
   * Get time until token expires (in ms)
   */
  getTokenExpiresIn(): number {
    if (!this.token) return 0;
    return Math.max(0, this.token.expiresAt - Date.now());
  }

  /**
   * Clean shutdown - clear all state
   */
  destroy(): void {
    this.invalidateToken();
    this.credentials = null;
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
