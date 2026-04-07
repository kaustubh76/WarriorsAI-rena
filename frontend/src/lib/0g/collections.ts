/**
 * 0G Storage Collections — typed document definitions for all data models.
 * These replace the Prisma schema models with document-store equivalents.
 *
 * Phase 1: Strategy Arena (battles, rounds, bets, stats, vaults)
 * Phase 2: External markets, arbitrage, whale tracking
 * Phase 3: Social, AI debates, audit logs
 */

import { zeroGStore, Collection, Document, generateId } from './store';

// ─── Document Types ─────────────────────────────────────

export interface PredictionBattleDoc extends Document {
  id: string;
  externalMarketId: string;
  source: string;
  question: string;
  warrior1Id: number;
  warrior1Owner: string;
  warrior2Id: number;
  warrior2Owner: string;
  stakes: string;
  warrior1Score: number;
  warrior2Score: number;
  status: string; // pending | active | completed | cancelled
  currentRound: number;
  onChainBattleId: string | null;
  txHash: string | null;
  battleDataHash: string | null;
  kalshiMarketId: string | null;
  arbitrageTradeId: string | null;
  isArbitrageBattle: boolean;
  whaleTriggered: boolean;
  triggerWhaleTradeId: string | null;
  isStrategyBattle: boolean;
  vault1Id: string | null;
  vault2Id: string | null;
  w1TotalYield: string | null;
  w2TotalYield: string | null;
  w1RatingAtStart: number | null;
  w2RatingAtStart: number | null;
  w1TierAtStart: string | null;
  w2TierAtStart: string | null;
  tierMultiplier: number | null;
  scheduledStartAt: string | null; // ISO string
  lastCycleAt: string | null;      // ISO string
  warrior1ImageUrl: string | null;
  warrior2ImageUrl: string | null;
  createdAt: string; // ISO string
  completedAt: string | null;
}

export interface PredictionRoundDoc extends Document {
  id: string;
  battleId: string;
  roundNumber: number;
  w1Argument: string | null;
  w1Evidence: string | null;
  w1Move: string | null;
  w1Confidence: number | null;
  w1Score: number;
  w2Argument: string | null;
  w2Evidence: string | null;
  w2Move: string | null;
  w2Confidence: number | null;
  w2Score: number;
  roundWinner: string | null;
  judgeReasoning: string | null;
  argumentsHash: string | null;
  // DeFi strategy fields
  w1DeFiMove: string | null;
  w2DeFiMove: string | null;
  w1AllocationBefore: string | null;
  w2AllocationBefore: string | null;
  w1AllocationAfter: string | null;
  w2AllocationAfter: string | null;
  w1YieldEarned: string | null;
  w2YieldEarned: string | null;
  w1BalanceBefore: string | null;
  w2BalanceBefore: string | null;
  w1BalanceAfter: string | null;
  w2BalanceAfter: string | null;
  w1TxHash: string | null;
  w2TxHash: string | null;
  poolAPYsSnapshot: string | null;
  // VRF
  w1VrfSeed: string | null;
  w2VrfSeed: string | null;
  w1IsHit: boolean | null;
  w2IsHit: boolean | null;
  // Score breakdown
  w1ScoreBreakdown: string | null;
  w2ScoreBreakdown: string | null;
  startedAt: string; // ISO
  endedAt: string | null;
}

export interface WarriorArenaStatsDoc extends Document {
  id: string;
  warriorId: number;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  totalEarnings: string;
  avgScore: number | null;
  currentStreak: number;
  longestStreak: number;
  arenaRating: number;
  peakRating: number;
  categoryStats: string | null;
  updatedAt: string;
}

export interface BattleBetDoc extends Document {
  id: string;
  battleId: string;
  bettorAddress: string;
  betOnWarrior1: boolean;
  amount: string;
  claimed: boolean;
  payout: string | null;
  placeTxHash: string | null;
  claimTxHash: string | null;
  placedAt: string;
  claimedAt: string | null;
}

export interface BattleBettingPoolDoc extends Document {
  id: string;
  battleId: string;
  totalWarrior1Bets: string;
  totalWarrior2Bets: string;
  totalBettors: number;
  bettingOpen: boolean;
  onChainSettled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VaultDoc extends Document {
  id: string;
  nftId: number;
  ownerAddress: string;
  depositAmount: string;
  allocationHighYield: number;
  allocationStable: number;
  allocationLP: number;
  aiProof: string | null;
  status: string;
  scheduledTxId: string | null;
  cyclesExecuted: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultCycleDoc extends Document {
  id: string;
  vaultId: string;
  cycleNumber: number;
  move: string;
  rationale: string | null;
  allocationBeforeHY: number;
  allocationBeforeST: number;
  allocationBeforeLP: number;
  allocationAfterHY: number;
  allocationAfterST: number;
  allocationAfterLP: number;
  yieldEarned: string;
  balanceBefore: string;
  balanceAfter: string;
  poolAPYHighYield: number;
  poolAPYStable: number;
  poolAPYLP: number;
  aiProof: string | null;
  txHash: string | null;
  executedAt: string;
}

export interface SettlementTransactionDoc extends Document {
  id: string;
  recipient: string;
  amount: string;
  type: string;
  status: string;
  sourceType: string | null;
  sourceId: string | null;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface TradeAuditLogDoc extends Document {
  id: string;
  userId: string;
  tradeType: string;
  action: string;
  marketId: string | null;
  orderId: string | null;
  tradeId: string | null;
  amount: string;
  source: string | null;
  side: string | null;
  success: boolean;
  error: string | null;
  metadata: string | null;
  createdAt: string;
}

// Phase 2 placeholder types
export interface ExternalMarketDoc extends Document {
  id: string;
  source: string;
  externalId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  liquidity: string;
  endTime: string;
  status: string;
  outcome: string | null;
  sourceUrl: string;
  lastSyncAt: string;
  curatedForArena: boolean;
  topicCategory: string | null;
  isTrending: boolean;
  trendingReason: string | null;
  [key: string]: unknown;
}

export interface MatchedMarketPairDoc extends Document {
  id: string;
  polymarketId: string;
  kalshiId: string;
  similarity: number;
  priceDifference: number;
  hasArbitrage: boolean;
  isActive: boolean;
  [key: string]: unknown;
}

export interface ArbitrageTradeDoc extends Document {
  id: string;
  userId: string;
  status: string;
  settled: boolean;
  predictionBattleId: string | null;
  [key: string]: unknown;
}

// ─── Collection Instances (singletons) ──────────────────

export const battles = zeroGStore.collection<PredictionBattleDoc>(
  'battles',
  ['status', 'warrior1Id', 'warrior2Id', 'isStrategyBattle', 'isArbitrageBattle']
);

export const rounds = zeroGStore.collection<PredictionRoundDoc>(
  'rounds',
  ['battleId', 'roundNumber']
);

export const warriorStats = zeroGStore.collection<WarriorArenaStatsDoc>(
  'warriorStats',
  ['warriorId', 'arenaRating']
);

export const battleBets = zeroGStore.collection<BattleBetDoc>(
  'battleBets',
  ['battleId', 'bettorAddress', 'claimed']
);

export const bettingPools = zeroGStore.collection<BattleBettingPoolDoc>(
  'bettingPools',
  ['battleId', 'bettingOpen']
);

export const vaults = zeroGStore.collection<VaultDoc>(
  'vaults',
  ['nftId', 'ownerAddress', 'status']
);

export const vaultCycles = zeroGStore.collection<VaultCycleDoc>(
  'vaultCycles',
  ['vaultId']
);

export const settlements = zeroGStore.collection<SettlementTransactionDoc>(
  'settlements',
  ['recipient', 'status', 'sourceId']
);

export const auditLogs = zeroGStore.collection<TradeAuditLogDoc>(
  'auditLogs',
  ['userId', 'tradeType']
);

export const externalMarkets = zeroGStore.collection<ExternalMarketDoc>(
  'externalMarkets',
  ['source', 'externalId', 'status', 'curatedForArena', 'isTrending']
);

export const matchedPairs = zeroGStore.collection<MatchedMarketPairDoc>(
  'matchedPairs',
  ['polymarketId', 'kalshiId', 'hasArbitrage', 'isActive']
);

export const arbitrageTrades = zeroGStore.collection<ArbitrageTradeDoc>(
  'arbitrageTrades',
  ['userId', 'status', 'settled']
);

// ─── Phase 2: Additional Model Collections ──────────────

// AI & Debates
export interface AIDebateDoc extends Document { id: string; [key: string]: unknown; }
export interface AIDebateRoundDoc extends Document { id: string; debateId: string; [key: string]: unknown; }
export interface AIPredictionScoreDoc extends Document { id: string; agentId: string; [key: string]: unknown; }

// Trading & Markets
export interface AgentTradeDoc extends Document { id: string; agentId: string; [key: string]: unknown; }
export interface MarketBetDoc extends Document { id: string; userId: string; externalMarketId: string; [key: string]: unknown; }
export interface UserCreatedMarketDoc extends Document { id: string; creatorAddress: string; [key: string]: unknown; }

// Mirror Markets
export interface MirrorMarketDoc extends Document { id: string; mirrorKey: string; source: string; [key: string]: unknown; }
export interface MirrorTradeDoc extends Document { id: string; mirrorKey: string; agentId: string | null; [key: string]: unknown; }
export interface MirrorCopyTradeDoc extends Document { id: string; userId: string; whaleAddress: string; [key: string]: unknown; }

// Whale Tracking
export interface WhaleTradeDoc extends Document { id: string; source: string; traderAddress: string | null; [key: string]: unknown; }
export interface TrackedTraderDoc extends Document { id: string; address: string; source: string; [key: string]: unknown; }
export interface WhaleFollowDoc extends Document { id: string; userAddress: string; whaleAddress: string; [key: string]: unknown; }

// Escrow & Balance
export interface EscrowLockDoc extends Document { id: string; userId: string; status: string; [key: string]: unknown; }
export interface UserBalanceDoc extends Document { id: string; userId: string; [key: string]: unknown; }

// Creator Economy
export interface CreatorDoc extends Document { id: string; address: string; [key: string]: unknown; }
export interface CreatorFeeEntryDoc extends Document { id: string; creatorAddress: string; [key: string]: unknown; }
export interface CreatorRevenueDoc extends Document { id: string; creatorAddress: string; [key: string]: unknown; }

// Topics & Stats
export interface TopicAggregateDoc extends Document { id: string; category: string; [key: string]: unknown; }
export interface UserTopicStatsDoc extends Document { id: string; userId: string; category: string; [key: string]: unknown; }

// Verified Predictions & Snapshots
export interface VerifiedPredictionDoc extends Document { id: string; marketId: string; [key: string]: unknown; }
export interface MarketSnapshotDoc extends Document { id: string; rootHash: string; [key: string]: unknown; }

// Scheduling & Sync
export interface ScheduledTransactionDoc extends Document { id: string; status: string; [key: string]: unknown; }
export interface ScheduledResolutionDoc extends Document { id: string; externalMarketId: string; [key: string]: unknown; }
export interface SyncLogDoc extends Document { id: string; source: string; [key: string]: unknown; }
export interface PriceSyncHistoryDoc extends Document { id: string; mirrorKey: string; [key: string]: unknown; }
export interface SystemAuditDoc extends Document { id: string; eventType: string; [key: string]: unknown; }

// Vault Deposits
export interface VaultDepositDoc extends Document { id: string; vaultId: string; [key: string]: unknown; }

// User Auth
export interface UserExternalAuthDoc extends Document { id: string; userId: string; [key: string]: unknown; }
export interface UserNotificationPrefsDoc extends Document { id: string; userAddress: string; [key: string]: unknown; }

// Social
export interface MarketCommentDoc extends Document { id: string; marketId: string; [key: string]: unknown; }
export interface MarketShareDoc extends Document { id: string; marketId: string; [key: string]: unknown; }
export interface PredictionOutcomeDoc extends Document { id: string; agentId: string; [key: string]: unknown; }
export interface ArbitrageOpportunityDoc extends Document { id: string; status: string; [key: string]: unknown; }
export interface MirroredMarketDoc extends Document { id: string; externalId: string; [key: string]: unknown; }

// ── Collection instances for all new models ──

export const aiDebates = zeroGStore.collection<AIDebateDoc>('aiDebates', ['marketId', 'status']);
export const aiDebateRounds = zeroGStore.collection<AIDebateRoundDoc>('aiDebateRounds', ['debateId']);
export const aiPredictionScores = zeroGStore.collection<AIPredictionScoreDoc>('aiPredictionScores', ['agentId']);
export const agentTrades = zeroGStore.collection<AgentTradeDoc>('agentTrades', ['agentId', 'marketId']);
export const marketBets = zeroGStore.collection<MarketBetDoc>('marketBets', ['userId', 'externalMarketId', 'status']);
export const userCreatedMarkets = zeroGStore.collection<UserCreatedMarketDoc>('userCreatedMarkets', ['creatorAddress', 'status']);
export const mirrorMarkets = zeroGStore.collection<MirrorMarketDoc>('mirrorMarkets', ['mirrorKey', 'source', 'isActive']);
export const mirrorTrades = zeroGStore.collection<MirrorTradeDoc>('mirrorTrades', ['mirrorKey', 'agentId']);
export const mirrorCopyTrades = zeroGStore.collection<MirrorCopyTradeDoc>('mirrorCopyTrades', ['userId', 'whaleAddress', 'status']);
export const whaleTrades = zeroGStore.collection<WhaleTradeDoc>('whaleTrades', ['source', 'traderAddress']);
export const trackedTraders = zeroGStore.collection<TrackedTraderDoc>('trackedTraders', ['address', 'source']);
export const whaleFollows = zeroGStore.collection<WhaleFollowDoc>('whaleFollows', ['userAddress', 'whaleAddress', 'isActive']);
export const escrowLocks = zeroGStore.collection<EscrowLockDoc>('escrowLocks', ['userId', 'status', 'referenceId']);
export const userBalances = zeroGStore.collection<UserBalanceDoc>('userBalances', ['userId']);
export const creators = zeroGStore.collection<CreatorDoc>('creators', ['address']);
export const creatorFeeEntries = zeroGStore.collection<CreatorFeeEntryDoc>('creatorFeeEntries', ['creatorAddress']);
export const creatorRevenues = zeroGStore.collection<CreatorRevenueDoc>('creatorRevenues', ['creatorAddress']);
export const topicAggregates = zeroGStore.collection<TopicAggregateDoc>('topicAggregates', ['category']);
export const userTopicStats = zeroGStore.collection<UserTopicStatsDoc>('userTopicStats', ['userId', 'category']);
export const verifiedPredictions = zeroGStore.collection<VerifiedPredictionDoc>('verifiedPredictions', ['marketId', 'agentId']);
export const marketSnapshots = zeroGStore.collection<MarketSnapshotDoc>('marketSnapshots', ['rootHash', 'marketId']);
export const scheduledTransactions = zeroGStore.collection<ScheduledTransactionDoc>('scheduledTransactions', ['status']);
export const scheduledResolutions = zeroGStore.collection<ScheduledResolutionDoc>('scheduledResolutions', ['externalMarketId', 'status']);
export const syncLogs = zeroGStore.collection<SyncLogDoc>('syncLogs', ['source']);
export const priceSyncHistory = zeroGStore.collection<PriceSyncHistoryDoc>('priceSyncHistory', ['mirrorKey']);
export const systemAudits = zeroGStore.collection<SystemAuditDoc>('systemAudits', ['eventType']);
export const vaultDeposits = zeroGStore.collection<VaultDepositDoc>('vaultDeposits', ['vaultId']);
export const userExternalAuths = zeroGStore.collection<UserExternalAuthDoc>('userExternalAuths', ['userId']);
export const userNotificationPrefs = zeroGStore.collection<UserNotificationPrefsDoc>('userNotificationPrefs', ['userAddress']);
export const marketComments = zeroGStore.collection<MarketCommentDoc>('marketComments', ['marketId']);
export const marketShares = zeroGStore.collection<MarketShareDoc>('marketShares', ['marketId']);
export const predictionOutcomes = zeroGStore.collection<PredictionOutcomeDoc>('predictionOutcomes', ['agentId']);
export const arbitrageOpportunities = zeroGStore.collection<ArbitrageOpportunityDoc>('arbitrageOpportunities', ['status']);
export const mirroredMarkets = zeroGStore.collection<MirroredMarketDoc>('mirroredMarkets', ['externalId']);

// ─── Helper: get rounds for a battle ────────────────────

export function getBattleRounds(battleId: string): PredictionRoundDoc[] {
  return rounds.findMany({ battleId }, { orderBy: { field: 'roundNumber', direction: 'asc' } });
}

// ─── Helper: get battle with rounds ─────────────────────

export function getBattleWithRounds(battleId: string): (PredictionBattleDoc & { rounds: PredictionRoundDoc[] }) | null {
  const battle = battles.findUnique(battleId);
  if (!battle) return null;
  return { ...battle, rounds: getBattleRounds(battleId) };
}

// ─── Helper: get or create betting pool ─────────────────

export function getOrCreateBettingPool(battleId: string): BattleBettingPoolDoc {
  let pool = bettingPools.findFirst({ battleId });
  if (!pool) {
    pool = bettingPools.create({
      id: generateId(),
      battleId,
      totalWarrior1Bets: '0',
      totalWarrior2Bets: '0',
      totalBettors: 0,
      bettingOpen: true,
      onChainSettled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return pool;
}

// ─── Helper: get warrior stats (upsert pattern) ─────────

export function getOrCreateWarriorStats(warriorId: number): WarriorArenaStatsDoc {
  let stats = warriorStats.findFirst({ warriorId });
  if (!stats) {
    stats = warriorStats.create({
      id: generateId(),
      warriorId,
      totalBattles: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalEarnings: '0',
      avgScore: null,
      currentStreak: 0,
      longestStreak: 0,
      arenaRating: 1000,
      peakRating: 1000,
      categoryStats: null,
      updatedAt: new Date().toISOString(),
    });
  }
  return stats;
}

// ─── Helper: get vault by nftId ─────────────────────────

export function getVaultByNftId(nftId: number): VaultDoc | null {
  return vaults.findFirst({ nftId });
}

// ─── Re-export store for flush/load ─────────────────────

export { zeroGStore, generateId };
