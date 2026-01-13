/**
 * Centralized API Configuration
 *
 * All API routes should import from this file instead of hardcoding values.
 * This enables easy network switching between testnet and mainnet.
 */

// ============================================================================
// Chain RPCs
// ============================================================================

export const FLOW_RPC = process.env.NEXT_PUBLIC_FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org';
export const ZEROG_RPC = process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai';

// Chain IDs
export const FLOW_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '545', 10);
export const ZEROG_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602', 10);

// ============================================================================
// Contract Addresses - Flow Testnet (545)
// ============================================================================

export const FLOW_CONTRACTS = {
  crownToken: '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6',
  predictionMarketAMM: '0x1b26203A2752557ecD4763a9A8A26119AC5e18e4',
  aiAgentRegistry: '0xdc2b123Ec17c36E10c2Ca4628473E879194153D0',
  aiDebateOracle: '0x31037D0EfB3E43E2914CCD21bE7A3AC4E52a1988',
  outcomeToken: '0xb9BbdB84EaA159166B2c4eFE713F7Ea87700a81e',
  creatorRevenueShare: '0x8B096E9b9D800BDbD353386865F55c1E2B3928aA',
  zeroGOracle: '0xe796D8D16475C92c30caa59E9De2147726a80DF0',
  warriorsNFT: '0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1',
  arenaFactory: '0xf77840febD42325F83cB93F9deaE0F8b14Eececf',
} as const;

// ============================================================================
// Contract Addresses - 0G Galileo Testnet (16602)
// ============================================================================

export const ZEROG_CONTRACTS = {
  crownToken: '0xC13f60749ECfCDE5f79689dd2E5A361E9210f153',
  aiAgentINFT: '0x88f3133C6e506Eaa68bB0de1a4765E9B73b15BBC',
  agentINFTOracle: '0x9A712e70b20e7dcfCa45f36051A6810db04A751B',
} as const;

// ============================================================================
// 0G Network Configuration
// ============================================================================

export const ZEROG_STORAGE = {
  indexerUrl: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai',
  evmRpc: ZEROG_RPC,
  flowContract: process.env.NEXT_PUBLIC_0G_FLOW_CONTRACT || '0xbD2C3F0E65eDF5582141C35969d66e34629cC768',
} as const;

export const ZEROG_COMPUTE = {
  brokerUrl: process.env.NEXT_PUBLIC_0G_COMPUTE_BROKER_URL || 'https://broker-testnet.0g.ai',
  providerAddress: process.env.NEXT_PUBLIC_0G_COMPUTE_PROVIDER || '0xa48f01287233509FD694a22Bf840225062E67836',
  // Known fallback providers on 0G Galileo testnet
  fallbackProviders: [
    '0xa48f01287233509FD694a22Bf840225062E67836',
    '0x7D62c65E2A54C7f6B9e3F7E8E5F53c0cA6d0c5b2', // Backup provider
  ],
  // Retry configuration for resilient connections
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
  },
  // Minimum ledger balance for inference
  minLedgerBalance: 1.0,
  // Deposit amount when creating new ledger
  ledgerDepositAmount: 3.0,
} as const;

// ============================================================================
// API Rate Limits
// ============================================================================

export const RATE_LIMITS = {
  agentTrades: {
    maxPerMinute: 10,
    windowMs: 60000,
  },
  inference: {
    maxPerMinute: 20,
    blockDurationMs: 300000, // 5 minutes
  },
} as const;

// ============================================================================
// Trading Limits
// ============================================================================

export const TRADING_LIMITS = {
  maxTradeAmount: '100', // in CRwN
  minConfidence: 60, // percentage
  defaultTradeAmount: '10', // in CRwN
} as const;

// ============================================================================
// ABIs - Minimal for API routes
// ============================================================================

export const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
] as const;

export const AI_AGENT_INFT_ABI = [
  'function getAgentData(uint256 tokenId) view returns (tuple(uint8 tier, uint256 stakedAmount, bool isActive, bool copyTradingEnabled, uint256 createdAt, uint256 lastUpdatedAt))',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getEncryptedMetadataRef(uint256 tokenId) view returns (string)',
  'function getMetadataHash(uint256 tokenId) view returns (bytes32)',
  'function totalSupply() view returns (uint256)',
  'function crownToken() view returns (address)',
  'function MIN_STAKE_NOVICE() view returns (uint256)',
  'function getAgentFollowers(uint256 tokenId) view returns (address[])',
  'function getCopyTradeConfig(address user, uint256 tokenId) view returns (tuple(uint256 tokenId, uint256 maxAmountPerTrade, uint256 totalCopied, uint256 startedAt, bool isActive))',
  'function followAgent(uint256 tokenId, uint256 maxAmountPerTrade)',
  'function unfollowAgent(uint256 tokenId)',
  'function getUserFollowedAgents(address user) view returns (uint256[])',
] as const;

export const PREDICTION_MARKET_ABI = [
  'function getMarket(uint256 marketId) view returns (tuple(uint256 id, string question, uint256 endTime, uint256 resolutionTime, uint8 status, uint8 outcome, uint256 yesTokens, uint256 noTokens, uint256 liquidity, uint256 totalVolume, address creator, uint256 battleId, uint256 warrior1Id, uint256 warrior2Id, uint256 createdAt))',
  'function getPrice(uint256 marketId) view returns (uint256 yesPrice, uint256 noPrice)',
  'function buy(uint256 marketId, bool isYes, uint256 collateralAmount, uint256 minSharesOut) returns (uint256 sharesOut)',
  'function nextMarketId() view returns (uint256)',
  'function executeCopyTrade(uint256 agentId, uint256 marketId, bool isYes, uint256 collateralAmount) returns (uint256)',
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the base URL for internal API calls
 */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

/**
 * Get server private key (only available server-side)
 */
export function getServerPrivateKey(): string | undefined {
  return process.env.PRIVATE_KEY;
}

/**
 * Get AI signer private key (only available server-side)
 */
export function getAISignerPrivateKey(): string | undefined {
  return process.env.AI_SIGNER_PRIVATE_KEY;
}

// ============================================================================
// Type exports
// ============================================================================

export type FlowContract = keyof typeof FLOW_CONTRACTS;
export type ZeroGContract = keyof typeof ZEROG_CONTRACTS;
