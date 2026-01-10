/**
 * AI Agent iNFT Types
 * Type definitions for ERC-7857 iNFT contract interactions
 */

import type { Address } from 'viem';
import {
  AgentStrategy,
  RiskProfile,
  AgentTier,
  Specialization,
  getStrategyLabel,
  getRiskLabel,
  getTierLabel,
  getSpecializationLabel,
  getTierColor
} from './agent';
import type { PersonaTraits } from './agent';

// Re-export common types
export {
  AgentStrategy,
  RiskProfile,
  AgentTier,
  Specialization,
  getStrategyLabel,
  getRiskLabel,
  getTierLabel,
  getSpecializationLabel,
  getTierColor
};
export type { PersonaTraits };

// ============================================================================
// iNFT Core Types
// ============================================================================

/**
 * Authorization details for an executor
 */
export interface Authorization {
  expiresAt: bigint;
  canExecute: boolean;
  canViewMetadata: boolean;
}

/**
 * Pending transfer details
 */
export interface PendingTransfer {
  from: Address;
  to: Address;
  requestId: `0x${string}`;
  initiatedAt: bigint;
  isPending: boolean;
}

/**
 * On-chain agent data stored in iNFT contract
 */
export interface AgentOnChainData {
  tier: AgentTier;
  stakedAmount: bigint;
  isActive: boolean;
  copyTradingEnabled: boolean;
  createdAt: bigint;
  lastUpdatedAt: bigint;
}

/**
 * Agent performance metrics
 */
export interface AgentINFTPerformance {
  totalTrades: bigint;
  winningTrades: bigint;
  totalPnL: bigint;
  accuracyBps: bigint;
}

/**
 * Full iNFT agent data (on-chain + encrypted)
 */
export interface AIAgentINFT {
  tokenId: bigint;
  owner: Address;
  encryptedMetadataRef: string;  // 0G Storage root hash
  metadataHash: `0x${string}`;
  onChainData: AgentOnChainData;
  performance: AgentINFTPerformance;
  pendingTransfer?: PendingTransfer;
}

// ============================================================================
// Encrypted Metadata Types
// ============================================================================

/**
 * Strategy configuration stored in encrypted metadata
 */
export interface StrategyConfig {
  type: AgentStrategy;
  parameters: Record<string, number>;
  weights: number[];
}

/**
 * Execution configuration (sensitive data)
 */
export interface ExecutionConfig {
  modelEndpoint?: string;
  customPrompts?: string[];
  tradingLimits: {
    maxPositionSize: string;
    maxDailyTrades: number;
  };
}

/**
 * Encrypted agent metadata (stored in 0G Storage)
 */
export interface EncryptedAgentMetadata {
  version: '1.0';

  // Basic info
  name: string;
  description: string;

  // Strategy configuration
  strategy: StrategyConfig;

  // Persona traits
  traits: PersonaTraits;

  // Risk & specialization
  riskProfile: RiskProfile;
  specialization: Specialization;

  // Execution config (sensitive)
  executionConfig: ExecutionConfig;

  // Metadata about encryption
  encryptedAt: number;
  encryptionVersion: string;
}

/**
 * Decrypted agent display data
 */
export interface AIAgentINFTDisplay extends AIAgentINFT {
  // Decrypted metadata (if available)
  metadata?: EncryptedAgentMetadata;

  // Computed values
  winRate: number;
  pnlFormatted: string;
  stakedFormatted: string;
  tierLabel: string;
  strategyLabel: string;
  riskLabel: string;
  specializationLabel: string;
  isOnline: boolean;
  followerCount: number;

  // iNFT specific
  isINFT: true;
  hasEncryptedMetadata: boolean;
  canDecrypt: boolean;
}

// ============================================================================
// Encryption Types
// ============================================================================

/**
 * Encrypted data package
 */
export interface EncryptedData {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  version: string;
}

/**
 * Sealed key for transfer
 */
export interface SealedKey {
  encryptedKey: Uint8Array;
  recipientPublicKey: string;
  timestamp: number;
}

/**
 * Re-encryption proof from oracle
 */
export interface ReEncryptionProof {
  requestId: `0x${string}`;
  oldMetadataHash: `0x${string}`;
  newMetadataHash: `0x${string}`;
  attestation: Uint8Array;
  timestamp: number;
}

// ============================================================================
// Form Types
// ============================================================================

/**
 * iNFT minting form
 */
export interface INFTMintForm {
  // Basic info
  name: string;
  description: string;

  // Strategy
  strategy: AgentStrategy;
  riskProfile: RiskProfile;
  specialization: Specialization;

  // Traits
  traits: PersonaTraits;

  // Staking
  stakeAmount: string;
  enableCopyTrading: boolean;

  // Execution config
  executionConfig: ExecutionConfig;
}

/**
 * Transfer form
 */
export interface INFTTransferForm {
  tokenId: bigint;
  recipientAddress: Address;
}

/**
 * Authorization form
 */
export interface AuthorizationForm {
  tokenId: bigint;
  executorAddress: Address;
  durationDays: number;
  canExecute: boolean;
  canViewMetadata: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export interface INFTMintedEvent {
  tokenId: bigint;
  owner: Address;
  metadataHash: `0x${string}`;
  encryptedMetadataRef: string;
  stakedAmount: bigint;
}

export interface MetadataUpdatedEvent {
  tokenId: bigint;
  oldHash: `0x${string}`;
  newHash: `0x${string}`;
}

export interface UsageAuthorizedEvent {
  tokenId: bigint;
  executor: Address;
  expiresAt: bigint;
}

export interface UsageRevokedEvent {
  tokenId: bigint;
  executor: Address;
}

export interface TransferInitiatedEvent {
  tokenId: bigint;
  from: Address;
  to: Address;
  requestId: `0x${string}`;
}

export interface TransferCompletedEvent {
  tokenId: bigint;
  from: Address;
  to: Address;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate win rate from performance data
 */
export function calculateINFTWinRate(performance: AgentINFTPerformance): number {
  if (performance.totalTrades === BigInt(0)) return 0;
  return Number((performance.winningTrades * BigInt(100)) / performance.totalTrades);
}

/**
 * Format stake amount for display
 */
export function formatStake(amount: bigint): string {
  const formatted = Number(amount) / 1e18;
  return `${formatted.toLocaleString()} CRwN`;
}

/**
 * Format PnL for display
 */
export function formatPnL(pnl: bigint): string {
  const amount = Number(pnl) / 1e18;
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CRwN`;
}

/**
 * Check if user can decrypt metadata
 */
export function canDecryptMetadata(
  tokenId: bigint,
  userAddress: Address,
  owner: Address,
  authorizations: Map<Address, Authorization>
): boolean {
  if (userAddress === owner) return true;

  const auth = authorizations.get(userAddress);
  if (!auth) return false;

  return auth.canViewMetadata && auth.expiresAt > BigInt(Date.now() / 1000);
}

/**
 * Get tier minimum stake
 */
export function getTierMinStake(tier: AgentTier): bigint {
  const stakes: Record<AgentTier, bigint> = {
    [AgentTier.NOVICE]: BigInt(100) * BigInt(1e18),
    [AgentTier.SKILLED]: BigInt(500) * BigInt(1e18),
    [AgentTier.EXPERT]: BigInt(2000) * BigInt(1e18),
    [AgentTier.ORACLE]: BigInt(10000) * BigInt(1e18)
  };
  return stakes[tier];
}

/**
 * Create empty metadata template
 */
export function createEmptyMetadata(): EncryptedAgentMetadata {
  return {
    version: '1.0',
    name: '',
    description: '',
    strategy: {
      type: AgentStrategy.SUPERFORECASTER,
      parameters: {},
      weights: []
    },
    traits: {
      patience: 50,
      conviction: 50,
      contrarian: 50,
      momentum: 50
    },
    riskProfile: RiskProfile.MODERATE,
    specialization: Specialization.ALL,
    executionConfig: {
      tradingLimits: {
        maxPositionSize: '1000',
        maxDailyTrades: 10
      }
    },
    encryptedAt: 0,
    encryptionVersion: '1.0.0'
  };
}

/**
 * Validate metadata before encryption
 */
export function validateMetadata(metadata: EncryptedAgentMetadata): string[] {
  const errors: string[] = [];

  if (!metadata.name || metadata.name.length === 0) {
    errors.push('Name is required');
  }
  if (metadata.name.length > 32) {
    errors.push('Name must be 32 characters or less');
  }
  if (!metadata.description) {
    errors.push('Description is required');
  }
  if (metadata.description.length > 500) {
    errors.push('Description must be 500 characters or less');
  }

  // Validate traits
  const { traits } = metadata;
  if (traits.patience < 0 || traits.patience > 100) {
    errors.push('Patience must be between 0 and 100');
  }
  if (traits.conviction < 0 || traits.conviction > 100) {
    errors.push('Conviction must be between 0 and 100');
  }
  if (traits.contrarian < 0 || traits.contrarian > 100) {
    errors.push('Contrarian must be between 0 and 100');
  }
  if (traits.momentum < 0 || traits.momentum > 100) {
    errors.push('Momentum must be between 0 and 100');
  }

  return errors;
}
