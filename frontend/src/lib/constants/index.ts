/**
 * Application Constants
 * Centralized configuration values used throughout the app
 */

// ==================== Time Constants ====================

export const TIME = {
  /** Milliseconds in common time periods */
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  MS_PER_WEEK: 7 * 24 * 60 * 60 * 1000,

  /** Common timeout values */
  DEBOUNCE_DEFAULT: 300,
  DEBOUNCE_SEARCH: 500,
  THROTTLE_SCROLL: 100,
  TOAST_DURATION: 5000,
  MODAL_ANIMATION: 200,

  /** Polling intervals */
  POLL_FAST: 5000,      // 5 seconds
  POLL_NORMAL: 15000,   // 15 seconds
  POLL_SLOW: 60000,     // 1 minute

  /** Cache TTLs */
  CACHE_SHORT: 30000,   // 30 seconds
  CACHE_MEDIUM: 60000,  // 1 minute
  CACHE_LONG: 300000,   // 5 minutes
} as const;

// ==================== Pagination Constants ====================

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  LEADERBOARD_SIZE: 50,
  MARKETS_SIZE: 20,
  TRADES_SIZE: 50,
  WHALE_ALERTS_SIZE: 50,
} as const;

// ==================== Validation Constants ====================

export const VALIDATION = {
  /** Address validation */
  ADDRESS_LENGTH: 42,
  TX_HASH_LENGTH: 66,

  /** Input limits */
  MIN_MARKET_QUESTION_LENGTH: 10,
  MAX_MARKET_QUESTION_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 2000,
  MIN_LIQUIDITY: 0.01,
  MAX_LIQUIDITY: 1000000,

  /** Bet amounts */
  MIN_BET_AMOUNT: 0.001,
  MAX_BET_AMOUNT: 10000,

  /** Username/display name */
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 30,
} as const;

// ==================== Chain Constants ====================

export const CHAINS = {
  FLOW_TESTNET: {
    id: 545,
    name: 'Flow Testnet',
    symbol: 'FLOW',
    decimals: 18,
    rpcUrl: 'https://testnet.evm.nodes.onflow.org',
    explorerUrl: 'https://evm-testnet.flowscan.io',
  },
  FLOW_MAINNET: {
    id: 747,
    name: 'Flow Mainnet',
    symbol: 'FLOW',
    decimals: 18,
    rpcUrl: 'https://mainnet.evm.nodes.onflow.org',
    explorerUrl: 'https://evm.flowscan.io',
  },
  ZEROG_TESTNET: {
    id: 16602,
    name: '0G Galileo Testnet',
    symbol: '0G',
    decimals: 18,
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    explorerUrl: 'https://chainscan-galileo.0g.ai',
  },
} as const;

// ==================== UI Constants ====================

export const UI = {
  /** Breakpoints (matches Tailwind) */
  BREAKPOINTS: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },

  /** Z-index layers */
  Z_INDEX: {
    dropdown: 50,
    sticky: 100,
    modal: 200,
    popover: 300,
    tooltip: 400,
    toast: 500,
  },

  /** Animation durations */
  ANIMATION: {
    fast: 150,
    normal: 300,
    slow: 500,
  },

  /** Common spacing values */
  SPACING: {
    page: 'px-4 md:px-6 lg:px-8',
    section: 'py-8 md:py-12 lg:py-16',
    card: 'p-4 md:p-6',
  },
} as const;

// ==================== Price & Token Constants ====================

export const PRICING = {
  /** Token decimal configuration */
  TOKEN_DECIMALS: 18,
  TOKEN_MULTIPLIER: BigInt(10 ** 18), // 1e18 for CRwN token

  /** Price representation */
  BASIS_POINTS_MAX: 10000, // 100% = 10000 basis points
  CENTS_PER_DOLLAR: 100,
  PERCENT_MULTIPLIER: 100, // For percentage calculations

  /** Kalshi-specific pricing */
  KALSHI: {
    PRICE_MIN: 1, // Minimum price in cents
    PRICE_MAX: 99, // Maximum price in cents
    CONTRACT_VALUE_CENTS: 100, // $1.00 payout per contract
    PRICE_STEP: 1, // Price increment in cents
  },

  /** Polymarket-specific pricing */
  POLYMARKET: {
    USDC_DECIMALS: 6,
    USDC_MULTIPLIER: BigInt(10 ** 6),
    CHAIN_ID: 137, // Polygon mainnet
    MIN_SIZE: 1, // Minimum trade size in USDC
  },
} as const;

// Price conversion helper functions
export const PriceUtils = {
  /** Convert token BigInt amount to display number */
  tokenToDisplay(amount: bigint): number {
    return Number(amount) / Number(PRICING.TOKEN_MULTIPLIER);
  },

  /** Convert display number to token BigInt amount */
  displayToToken(amount: number): bigint {
    return BigInt(Math.floor(amount * Number(PRICING.TOKEN_MULTIPLIER)));
  },

  /** Convert basis points (0-10000) to percentage (0-100) */
  basisPointsToPercent(bp: number): number {
    return bp / 100;
  },

  /** Convert percentage (0-100) to basis points (0-10000) */
  percentToBasisPoints(percent: number): number {
    return Math.round(percent * 100);
  },

  /** Convert cents (1-99) to decimal (0.01-0.99) */
  centsToDecimal(cents: number): number {
    return cents / PRICING.CENTS_PER_DOLLAR;
  },

  /** Convert decimal (0.01-0.99) to cents (1-99) */
  decimalToCents(decimal: number): number {
    return Math.round(decimal * PRICING.CENTS_PER_DOLLAR);
  },

  /** Convert basis points to decimal (0-1) */
  basisPointsToDecimal(bp: number): number {
    return bp / PRICING.BASIS_POINTS_MAX;
  },

  /** Convert decimal (0-1) to basis points */
  decimalToBasisPoints(decimal: number): number {
    return Math.round(decimal * PRICING.BASIS_POINTS_MAX);
  },

  /** Format token amount for display with specified decimals */
  formatTokenAmount(amount: bigint, displayDecimals: number = 2): string {
    return this.tokenToDisplay(amount).toFixed(displayDecimals);
  },
};

// ==================== Market Constants ====================

export const MARKETS = {
  /** Market categories */
  CATEGORIES: [
    'politics',
    'crypto',
    'sports',
    'entertainment',
    'science',
    'technology',
    'finance',
    'other',
  ] as const,

  /** Market statuses */
  STATUSES: ['active', 'resolved', 'cancelled', 'pending'] as const,

  /** Market sources */
  SOURCES: ['internal', 'polymarket', 'kalshi'] as const,

  /** Resolution options */
  RESOLUTION: {
    YES: true,
    NO: false,
    INVALID: null,
  },
} as const;

// ==================== Arena/Battle Constants ====================

export const ARENA = {
  /** Battle statuses */
  STATUSES: ['pending', 'active', 'completed', 'cancelled'] as const,

  /** Warrior tiers */
  TIERS: ['bronze', 'silver', 'gold', 'diamond', 'legendary'] as const,

  /** Stat ranges */
  STATS: {
    MIN: 0,
    MAX: 10000,
    DEFAULT: 5000,
  },

  /** Battle timing */
  ROUND_DURATION_MS: 30000,    // 30 seconds per round
  MAX_ROUNDS: 10,
  BET_DEADLINE_MS: 300000,     // 5 minutes before battle
} as const;

// ==================== API Constants ====================

export const API = {
  /** Rate limits (requests per minute) */
  RATE_LIMITS: {
    read: 120,
    write: 20,
    battle: 5,
    market_create: 3,
  },

  /** Retry configuration */
  RETRY: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
  },

  /** Timeout values */
  TIMEOUTS: {
    fast: 5000,
    standard: 15000,
    slow: 30000,
    blockchain: 60000,
  },
} as const;

// ==================== Storage Keys ====================

export const STORAGE_KEYS = {
  /** LocalStorage keys */
  THEME: 'warriors-theme',
  WALLET_CACHE: 'warriors-wallet-cache',
  RECENT_MARKETS: 'warriors-recent-markets',
  SOUND_ENABLED: 'warriors-sound-enabled',
  TUTORIAL_COMPLETED: 'warriors-tutorial-completed',

  /** SessionStorage keys */
  PENDING_TX: 'warriors-pending-tx',
  FORM_DRAFT: 'warriors-form-draft',
} as const;

// ==================== Error Messages ====================

export const ERRORS = {
  /** Generic errors */
  UNKNOWN: 'An unexpected error occurred. Please try again.',
  NETWORK: 'Network error. Please check your connection.',
  TIMEOUT: 'Request timed out. Please try again.',

  /** Auth errors */
  WALLET_NOT_CONNECTED: 'Please connect your wallet to continue.',
  WRONG_NETWORK: 'Please switch to the correct network.',
  SIGNATURE_REJECTED: 'Signature request was rejected.',

  /** Validation errors */
  INVALID_ADDRESS: 'Invalid wallet address.',
  INVALID_AMOUNT: 'Invalid amount. Please enter a valid number.',
  INSUFFICIENT_BALANCE: 'Insufficient balance.',

  /** Market errors */
  MARKET_NOT_FOUND: 'Market not found.',
  MARKET_CLOSED: 'This market is no longer accepting bets.',
  MARKET_RESOLVED: 'This market has already been resolved.',
} as const;

// ==================== Success Messages ====================

export const SUCCESS = {
  WALLET_CONNECTED: 'Wallet connected successfully!',
  TRANSACTION_SUBMITTED: 'Transaction submitted. Waiting for confirmation...',
  TRANSACTION_CONFIRMED: 'Transaction confirmed!',
  BET_PLACED: 'Bet placed successfully!',
  MARKET_CREATED: 'Market created successfully!',
  COPIED: 'Copied to clipboard!',
} as const;

// ==================== External Links ====================

export const LINKS = {
  DOCS: 'https://docs.warriors-arena.io',
  DISCORD: 'https://discord.gg/warriors-arena',
  TWITTER: 'https://twitter.com/warriors_arena',
  GITHUB: 'https://github.com/warriors-arena',
  TERMS: '/terms',
  PRIVACY: '/privacy',
} as const;

// Type exports for use in components
export type MarketCategory = typeof MARKETS.CATEGORIES[number];
export type MarketStatus = typeof MARKETS.STATUSES[number];
export type MarketSource = typeof MARKETS.SOURCES[number];
export type BattleStatus = typeof ARENA.STATUSES[number];
export type WarriorTier = typeof ARENA.TIERS[number];
