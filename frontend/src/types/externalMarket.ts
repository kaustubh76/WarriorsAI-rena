/**
 * External Market Types for Polymarket & Kalshi Integration
 * Warriors AI - AI-Native Prediction Markets
 */

// ============================================
// ENUMS
// ============================================

export enum MarketSource {
  NATIVE = 'native',
  POLYMARKET = 'polymarket',
  KALSHI = 'kalshi',
  OPINION = 'opinion',
}

export enum ExternalMarketStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  RESOLVED = 'resolved',
  UNOPENED = 'unopened',
}

// ============================================
// UNIFIED MARKET INTERFACE
// ============================================

export interface UnifiedMarket {
  id: string;
  source: MarketSource;
  externalId: string;

  question: string;
  description?: string;
  category?: string;
  tags?: string[];

  // Prices as 0-100 percentages
  yesPrice: number;
  noPrice: number;

  // Volume/liquidity in USD
  volume: string;
  liquidity: string;

  endTime: number;
  createdAt: number;

  status: ExternalMarketStatus;
  outcome?: 'yes' | 'no' | 'invalid';

  sourceUrl: string;
  sourceMetadata?: Record<string, unknown>;

  lastSyncAt: number;
}

// ============================================
// POLYMARKET TYPES
// ============================================

export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  conditionId: string;
  slug: string;

  // Token IDs for YES/NO outcomes
  outcomes: string[];
  outcomePrices: string[];

  // Tokens
  clobTokenIds?: string[];

  volume: string;
  volumeNum: number;
  liquidity: string;
  liquidityNum: number;

  startDate: string;
  endDate: string;

  active: boolean;
  closed: boolean;
  resolved: boolean;

  category?: string;
  tags?: string[];

  image?: string;
  icon?: string;
}

export interface PolymarketOrderbook {
  market: string;
  asset_id: string;
  bids: PolymarketOrder[];
  asks: PolymarketOrder[];
  timestamp: string;
}

export interface PolymarketOrder {
  price: string;
  size: string;
}

export interface PolymarketTrade {
  id: string;
  taker_order_id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  price: string;
  size: string;
  fee_rate_bps: string;
  timestamp: string;
  transaction_hash?: string;
  maker?: string;
  taker?: string;
}

// ============================================
// KALSHI TYPES
// ============================================

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle?: string;

  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;

  volume: number;
  volume_24h: number;
  open_interest: number;

  status: 'open' | 'closed' | 'settled';
  result?: 'yes' | 'no';

  close_time: string;
  expiration_time: string;

  category?: string;
  series_ticker?: string;

  floor_strike?: number;
  cap_strike?: number;
}

export interface KalshiTrade {
  trade_id: string;
  ticker: string;
  side: 'yes' | 'no';
  count: number;
  price: number;
  taker_side: string;
  created_time: string;
}

export interface KalshiOrderbook {
  ticker: string;
  yes: KalshiOrderbookSide;
  no: KalshiOrderbookSide;
}

export interface KalshiOrderbookSide {
  price: number[];
  quantity: number[];
}

// ============================================
// OPINION TYPES
// ============================================

export interface OpinionMarket {
  marketId: number;
  marketTitle: string;
  status: number;
  statusEnum: string;
  marketType: number; // 0=Binary, 1=Categorical
  yesLabel?: string;
  noLabel?: string;
  volume: string;
  volume24h?: string;
  volume7d?: string;
  quoteToken: string;
  chainId: string;
  yesTokenId: string;
  noTokenId: string;
  conditionId?: string;
  resultTokenId?: string;
  createdAt: string;
  cutoffAt: string;
  resolvedAt?: string;
  childMarkets?: OpinionMarket[];
}

export interface OpinionPrice {
  tokenId: string;
  price: string;
  side: string;
  size: string;
  timestamp: number;
}

export interface OpinionPriceHistory {
  tokenId: string;
  prices: Array<{
    price: string;
    timestamp: number;
  }>;
}

// ============================================
// WHALE TRACKING
// ============================================

export interface WhaleTrade {
  id: string;
  source: MarketSource;
  marketId: string;
  marketQuestion: string;
  traderAddress?: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  amountUsd: string;
  shares: string;
  price: number;
  timestamp: number;
  txHash?: string;
}

export interface TrackedTrader {
  id: string;
  address: string;
  source: MarketSource;
  alias?: string;
  totalVolume: string;
  winRate?: number;
  followers: number;
  isWhale: boolean;
}

// ============================================
// TRADING TYPES
// ============================================

export interface ExternalTradeOrder {
  source: MarketSource;
  marketId: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  amount: string;
  price?: number; // Limit price, optional
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  filledAmount?: string;
  avgPrice?: number;
  error?: string;
}

export interface Position {
  marketId: string;
  market: UnifiedMarket;
  outcome: 'yes' | 'no';
  shares: string;
  avgPrice: number;
  currentPrice: number;
  value: string;
  pnl: string;
  pnlPercent: number;
}

// ============================================
// AI DEBATE TYPES
// ============================================

export type DebateAgentRole = 'bull' | 'bear' | 'neutral' | 'supervisor';

export interface DebateAgent {
  id: string;
  role: DebateAgentRole;
  position?: 'yes' | 'no';
}

export interface DebateRound {
  id: string;
  roundNumber: number;
  agentRole: DebateAgentRole;
  argument: string;
  sources: string[];
  confidence: number;
  timestamp: number;
}

export interface DebateSource {
  url: string;
  title: string;
  snippet: string;
  relevance: number;
}

export interface DebateResult {
  id: string;
  marketId: string;
  question: string;
  source: MarketSource;
  rounds: DebateRound[];
  finalPrediction: {
    outcome: 'yes' | 'no';
    probability: number;
    confidence: number;
  };
  keyFactors: string[];
  sources: DebateSource[];
  proof?: {
    inputHash: string;
    outputHash: string;
    providerAddress: string;
  };
  isVerified: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: number;
}

// ============================================
// AI AUTO-TRADING
// ============================================

export interface AITradeDecision {
  marketId: string;
  action: 'buy_yes' | 'buy_no' | 'hold';
  amount: string;
  reasoning: string;
  confidence: number;
  expectedValue: number;
}

export interface AutoTradeConfig {
  enabled: boolean;
  maxPositionSize: string;
  minConfidence: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  allowedSources: MarketSource[];
}

// ============================================
// CREATOR MARKETS (Simmer-style)
// ============================================

export interface CreateMarketRequest {
  question: string;
  description?: string;
  category?: string;
  endTime: number;
  initialLiquidity: string;
}

export interface UserCreatedMarket {
  id: string;
  creatorAddress: string;
  question: string;
  description?: string;
  category?: string;

  initialYesPrice: number;
  currentYesPrice: number;
  currentNoPrice: number;

  initialLiquidity: string;
  totalVolume: string;
  creatorRevenue: string;

  endTime: number;
  createdAt: number;

  status: ExternalMarketStatus;
  outcome?: 'yes' | 'no' | 'invalid';

  aiTradeCount: number;
  aiDebateCount: number;

  onChainMarketId?: string;
  txHash?: string;
}

export interface CreatorRevenue {
  id: string;
  creatorAddress: string;
  marketId: string;
  tradeAmount: string;
  feeAmount: string;
  txHash: string;
  timestamp: number;
}

// ============================================
// ARBITRAGE
// ============================================

export interface ArbitrageOpportunity {
  id: string;
  market1: {
    source: MarketSource;
    marketId: string;
    question: string;
    yesPrice: number;
    noPrice: number;
  };
  market2: {
    source: MarketSource;
    marketId: string;
    question: string;
    yesPrice: number;
    noPrice: number;
  };
  spread: number;
  potentialProfit: number;
  confidence: number;
  detectedAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'executed';
}

// ============================================
// AI LEADERBOARD
// ============================================

export interface AIPredictionScore {
  id: string;
  agentId: string;
  agentAddress: string;

  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;

  totalStaked: string;
  totalReturns: string;
  roi: number;

  rank?: number;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';

  currentStreak: number;
  longestStreak: number;
}

// ============================================
// NOTIFICATIONS
// ============================================

export type NotificationChannel = 'push' | 'email' | 'discord' | 'telegram';

export interface NotificationConfig {
  channels: NotificationChannel[];
  whaleAlertThreshold: number;
  arbitrageAlertEnabled: boolean;
  predictionAlertEnabled: boolean;
  marketResolutionEnabled: boolean;
  discordWebhook?: string;
  telegramChatId?: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ExternalMarketsResponse {
  markets: UnifiedMarket[];
  total: number;
  page: number;
  pageSize: number;
  lastSync: number;
}

export interface MarketFilters {
  source?: MarketSource | MarketSource[];
  status?: ExternalMarketStatus;
  category?: string;
  search?: string;
  minVolume?: string;
  maxEndTime?: number;
  sortBy?: 'volume' | 'endTime' | 'yesPrice' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface SyncResult {
  source: MarketSource;
  success: boolean;
  marketsAdded: number;
  marketsUpdated: number;
  duration: number;
  error?: string;
}

// ============================================
// MARKET RESOLUTION
// ============================================

export interface ResolutionRequest {
  marketId: string;
  proposedOutcome: 'yes' | 'no' | 'invalid';
  evidence: string[];
  resolverType: 'creator' | 'oracle' | 'community';
  stake?: string;
}

export interface Resolution {
  id: string;
  marketId: string;
  proposer: string;
  outcome: 'yes' | 'no' | 'invalid';
  proposedAt: number;
  stake: string;
  disputed: boolean;
  finalized: boolean;
  finalizedAt?: number;
}

// ============================================
// SOCIAL FEATURES
// ============================================

export interface MarketComment {
  id: string;
  marketId: string;
  marketSource: MarketSource;
  userAddress: string;
  content: string;
  likes: number;
  parentId?: string;
  createdAt: number;
  replies?: MarketComment[];
}

export interface MarketShare {
  id: string;
  marketId: string;
  userAddress: string;
  platform: 'twitter' | 'discord' | 'telegram';
  shareUrl?: string;
  createdAt: number;
}

// ============================================
// WHALE STATS & AGGREGATIONS
// ============================================

export interface WhaleStats {
  totalVolume24h: number;
  tradeCount24h: number;
  avgTradeSize: number;
  volumeChange24h: number;
  tradeCountChange: number;
  avgTradeSizeChange: number;
  trackedTraderCount: number;
}

export interface HotMarket {
  marketId: string;
  question: string;
  source: MarketSource;
  whaleTradeCount: number;
  bullishPercent: number;
  totalVolume: number;
}

export interface TopWhale {
  address: string;
  alias?: string;
  source: MarketSource;
  volume24h: number;
  winRate: number;
  tradeCount: number;
}
