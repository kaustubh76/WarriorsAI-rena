/**
 * Trading Configuration Service
 * Centralized configuration with kill switches for production safety
 */

// ============================================
// TYPES
// ============================================

export interface TradingConfig {
  // Global kill switches
  tradingEnabled: boolean;
  arbitrageEnabled: boolean;
  settlementEnabled: boolean;

  // Trade limits
  maxSingleTradeUSD: number;
  maxDailyVolumeUSD: number;
  maxSlippagePercent: number;
  minProfitMarginPercent: number;

  // Platform-specific configs
  polymarket: {
    enabled: boolean;
    apiKey: string | undefined;
    tradingPrivateKey: string | undefined;
  };

  kalshi: {
    enabled: boolean;
    apiKeyId: string | undefined;
    privateKeyPath: string | undefined;
  };

  // Environment
  isProduction: boolean;
  environment: 'development' | 'staging' | 'production';
}

export interface TradingLimitCheck {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_MAX_SINGLE_TRADE_USD = 100;
const DEFAULT_MAX_DAILY_VOLUME_USD = 1000;
const DEFAULT_MAX_SLIPPAGE_PERCENT = 5;
const DEFAULT_MIN_PROFIT_MARGIN_PERCENT = 2;

// ============================================
// TRADING CONFIG SERVICE
// ============================================

class TradingConfigService {
  private config: TradingConfig;
  private dailyVolumes: Map<string, number> = new Map(); // userId -> volume
  private lastVolumeReset: Date = new Date();

  constructor() {
    this.config = this.loadConfig();
    this.resetDailyVolumesIfNeeded();
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfig(): TradingConfig {
    const env = process.env.NODE_ENV || 'development';
    const isProduction = env === 'production';

    return {
      // Kill switches - default to safe (disabled) in production if not explicitly set
      tradingEnabled: this.parseBool(process.env.TRADING_ENABLED, !isProduction),
      arbitrageEnabled: this.parseBool(process.env.ARBITRAGE_ENABLED, !isProduction),
      settlementEnabled: this.parseBool(process.env.SETTLEMENT_ENABLED, !isProduction),

      // Trade limits
      maxSingleTradeUSD: this.parseFloat(
        process.env.MAX_SINGLE_TRADE_USD,
        DEFAULT_MAX_SINGLE_TRADE_USD
      ),
      maxDailyVolumeUSD: this.parseFloat(
        process.env.MAX_DAILY_VOLUME_USD,
        DEFAULT_MAX_DAILY_VOLUME_USD
      ),
      maxSlippagePercent: this.parseFloat(
        process.env.MAX_SLIPPAGE_PERCENT,
        DEFAULT_MAX_SLIPPAGE_PERCENT
      ),
      minProfitMarginPercent: this.parseFloat(
        process.env.MIN_PROFIT_MARGIN_PERCENT,
        DEFAULT_MIN_PROFIT_MARGIN_PERCENT
      ),

      // Polymarket
      polymarket: {
        enabled: this.parseBool(process.env.POLYMARKET_ENABLED, true),
        apiKey: process.env.POLYMARKET_API_KEY,
        tradingPrivateKey: process.env.POLYMARKET_TRADING_PRIVATE_KEY,
      },

      // Kalshi
      kalshi: {
        enabled: this.parseBool(process.env.KALSHI_ENABLED, true),
        apiKeyId: process.env.KALSHI_API_KEY_ID,
        privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH,
      },

      // Environment
      isProduction,
      environment: env as 'development' | 'staging' | 'production',
    };
  }

  /**
   * Get current config (read-only)
   */
  getConfig(): Readonly<TradingConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Check if trading is allowed
   */
  isTradingAllowed(): boolean {
    return this.config.tradingEnabled;
  }

  /**
   * Check if arbitrage is allowed
   */
  isArbitrageAllowed(): boolean {
    return this.config.tradingEnabled && this.config.arbitrageEnabled;
  }

  /**
   * Check if settlement is allowed
   */
  isSettlementAllowed(): boolean {
    return this.config.settlementEnabled;
  }

  /**
   * Check if a specific platform is enabled
   */
  isPlatformEnabled(platform: 'polymarket' | 'kalshi'): boolean {
    if (!this.config.tradingEnabled) return false;

    if (platform === 'polymarket') {
      return this.config.polymarket.enabled && !!this.config.polymarket.tradingPrivateKey;
    } else if (platform === 'kalshi') {
      return this.config.kalshi.enabled && !!this.config.kalshi.apiKeyId;
    }

    return false;
  }

  /**
   * Check if trade amount is within limits
   */
  checkTradeLimit(userId: string, amountUSD: number): TradingLimitCheck {
    // Check single trade limit
    if (amountUSD > this.config.maxSingleTradeUSD) {
      return {
        allowed: false,
        reason: 'Trade exceeds maximum single trade limit',
        limit: this.config.maxSingleTradeUSD,
        current: amountUSD,
      };
    }

    // Check daily volume limit
    this.resetDailyVolumesIfNeeded();
    const currentDailyVolume = this.dailyVolumes.get(userId) || 0;

    if (currentDailyVolume + amountUSD > this.config.maxDailyVolumeUSD) {
      return {
        allowed: false,
        reason: 'Trade would exceed daily volume limit',
        limit: this.config.maxDailyVolumeUSD,
        current: currentDailyVolume,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a trade for daily volume tracking
   */
  recordTrade(userId: string, amountUSD: number): void {
    this.resetDailyVolumesIfNeeded();
    const currentVolume = this.dailyVolumes.get(userId) || 0;
    this.dailyVolumes.set(userId, currentVolume + amountUSD);
  }

  /**
   * Check if slippage is acceptable
   */
  checkSlippage(expectedPrice: number, actualPrice: number): TradingLimitCheck {
    const slippagePercent = Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100;

    if (slippagePercent > this.config.maxSlippagePercent) {
      return {
        allowed: false,
        reason: 'Slippage exceeds maximum allowed',
        limit: this.config.maxSlippagePercent,
        current: slippagePercent,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if arbitrage profit margin is sufficient
   */
  checkProfitMargin(profitPercent: number): TradingLimitCheck {
    if (profitPercent < this.config.minProfitMarginPercent) {
      return {
        allowed: false,
        reason: 'Profit margin below minimum threshold',
        limit: this.config.minProfitMarginPercent,
        current: profitPercent,
      };
    }

    return { allowed: true };
  }

  /**
   * Get user's remaining daily volume
   */
  getRemainingDailyVolume(userId: string): number {
    this.resetDailyVolumesIfNeeded();
    const currentVolume = this.dailyVolumes.get(userId) || 0;
    return Math.max(0, this.config.maxDailyVolumeUSD - currentVolume);
  }

  /**
   * Validate all trading prerequisites
   */
  validateTradingPrerequisites(params: {
    userId: string;
    amountUSD: number;
    platform: 'polymarket' | 'kalshi';
    isArbitrage?: boolean;
  }): TradingLimitCheck {
    // Check global trading switch
    if (!this.isTradingAllowed()) {
      return {
        allowed: false,
        reason: 'Trading is currently disabled',
      };
    }

    // Check arbitrage switch if applicable
    if (params.isArbitrage && !this.isArbitrageAllowed()) {
      return {
        allowed: false,
        reason: 'Arbitrage trading is currently disabled',
      };
    }

    // Check platform
    if (!this.isPlatformEnabled(params.platform)) {
      return {
        allowed: false,
        reason: `${params.platform} trading is not enabled or configured`,
      };
    }

    // Check trade limits
    const limitCheck = this.checkTradeLimit(params.userId, params.amountUSD);
    if (!limitCheck.allowed) {
      return limitCheck;
    }

    return { allowed: true };
  }

  /**
   * Reset daily volumes at midnight UTC
   */
  private resetDailyVolumesIfNeeded(): void {
    const now = new Date();
    const lastResetDay = this.lastVolumeReset.toISOString().split('T')[0];
    const currentDay = now.toISOString().split('T')[0];

    if (lastResetDay !== currentDay) {
      this.dailyVolumes.clear();
      this.lastVolumeReset = now;
      console.log('[TradingConfig] Daily volumes reset');
    }
  }

  /**
   * Parse boolean from environment variable
   */
  private parseBool(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Parse float from environment variable
   */
  private parseFloat(value: string | undefined, defaultValue: number): number {
    if (value === undefined) return defaultValue;
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Reload configuration (useful for runtime updates)
   */
  reloadConfig(): void {
    this.config = this.loadConfig();
    console.log('[TradingConfig] Configuration reloaded');
  }

  /**
   * Get a summary of current configuration state
   */
  getConfigSummary(): Record<string, unknown> {
    return {
      tradingEnabled: this.config.tradingEnabled,
      arbitrageEnabled: this.config.arbitrageEnabled,
      settlementEnabled: this.config.settlementEnabled,
      maxSingleTradeUSD: this.config.maxSingleTradeUSD,
      maxDailyVolumeUSD: this.config.maxDailyVolumeUSD,
      maxSlippagePercent: this.config.maxSlippagePercent,
      minProfitMarginPercent: this.config.minProfitMarginPercent,
      polymarketEnabled: this.isPlatformEnabled('polymarket'),
      kalshiEnabled: this.isPlatformEnabled('kalshi'),
      environment: this.config.environment,
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const tradingConfig = new TradingConfigService();

// Helper functions for common checks
export function isTradingEnabled(): boolean {
  return tradingConfig.isTradingAllowed();
}

export function isArbitrageEnabled(): boolean {
  return tradingConfig.isArbitrageAllowed();
}

export function getTradingConfig(): Readonly<TradingConfig> {
  return tradingConfig.getConfig();
}

export default tradingConfig;
