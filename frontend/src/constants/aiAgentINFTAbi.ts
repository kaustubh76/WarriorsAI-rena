/**
 * AIAgentINFT Contract ABI
 * ERC-7857 compliant iNFT for AI trading agents
 */

import AIAgentINFTAbiJson from './aiAgentINFTAbi.json';

// Type assertion without const (JSON imports don't support const assertions)
export const AIAgentINFTAbi = AIAgentINFTAbiJson;

// Export commonly used function signatures for type safety
export const AIAgentINFTFunctions = {
  // Minting
  mint: 'mint(string,bytes32,uint256,bool)',
  mintSimple: 'mint(string,bytes32)',

  // Transfers
  transferWithReEncryption: 'transferWithReEncryption(address,address,uint256,bytes,bytes)',
  initiateTransfer: 'initiateTransfer(address,uint256)',
  completeTransfer: 'completeTransfer(uint256,string,bytes32,bytes,bytes)',
  cancelTransfer: 'cancelTransfer(uint256)',

  // Authorization
  authorizeUsage: 'authorizeUsage(uint256,address,uint256)',
  revokeUsage: 'revokeUsage(uint256,address)',
  isAuthorizedExecutor: 'isAuthorizedExecutor(uint256,address)',
  getAuthorization: 'getAuthorization(uint256,address)',

  // Staking
  addStake: 'addStake(uint256,uint256)',
  requestUnstake: 'requestUnstake(uint256)',
  withdrawStake: 'withdrawStake(uint256,uint256)',

  // Configuration
  setCopyTradingEnabled: 'setCopyTradingEnabled(uint256,bool)',
  setAgentActive: 'setAgentActive(uint256,bool)',

  // Copy Trading
  followAgent: 'followAgent(uint256,uint256)',
  unfollowAgent: 'unfollowAgent(uint256)',
  updateCopyTradeConfig: 'updateCopyTradeConfig(uint256,uint256)',
  getCopyTradeConfig: 'getCopyTradeConfig(address,uint256)',
  getUserFollowing: 'getUserFollowing(address)',
  getAgentFollowers: 'getAgentFollowers(uint256)',
  getFollowerCount: 'getFollowerCount(uint256)',

  // External Market Trading
  enableExternalTrading: 'enableExternalTrading(uint256,bool,bool)',
  recordExternalTrade: 'recordExternalTrade(uint256,bool,string,bool,int256)',
  isExternalTradingEnabled: 'isExternalTradingEnabled(uint256,bool)',
  getExternalTradingStats: 'getExternalTradingStats(uint256)',

  // View functions
  ownerOf: 'ownerOf(uint256)',
  getEncryptedMetadataRef: 'getEncryptedMetadataRef(uint256)',
  getMetadataHash: 'getMetadataHash(uint256)',
  getAgentData: 'getAgentData(uint256)',
  getAgentPerformance: 'getAgentPerformance(uint256)',
  getPendingTransfer: 'getPendingTransfer(uint256)',
  getAgentTier: 'getAgentTier(uint256)',
  getAgentStake: 'getAgentStake(uint256)',
  isAgentActive: 'isAgentActive(uint256)',
  isCopyTradingEnabled: 'isCopyTradingEnabled(uint256)',
  totalSupply: 'totalSupply()',
  balanceOf: 'balanceOf(address)',
  tokenOfOwnerByIndex: 'tokenOfOwnerByIndex(address,uint256)',
} as const;

// Export event topics for filtering
export const AIAgentINFTEvents = {
  INFTMinted: 'INFTMinted(uint256,address,bytes32,string,uint256)',
  MetadataUpdated: 'MetadataUpdated(uint256,bytes32,bytes32)',
  UsageAuthorized: 'UsageAuthorized(uint256,address,uint256)',
  UsageRevoked: 'UsageRevoked(uint256,address)',
  TransferInitiated: 'TransferInitiated(uint256,address,address,bytes32)',
  TransferCompleted: 'TransferCompleted(uint256,address,address)',
  TransferCancelled: 'TransferCancelled(uint256,address)',
  StakeAdded: 'StakeAdded(uint256,uint256,uint256)',
  StakeWithdrawn: 'StakeWithdrawn(uint256,uint256,uint256)',
  TierUpdated: 'TierUpdated(uint256,uint8,uint8)',
  TradeRecorded: 'TradeRecorded(uint256,bool,int256)',
  CopyTradeStarted: 'CopyTradeStarted(address,uint256,uint256)',
  CopyTradeStopped: 'CopyTradeStopped(address,uint256)',
  CopyTradeConfigUpdated: 'CopyTradeConfigUpdated(address,uint256,uint256)',
  ExternalTradingEnabled: 'ExternalTradingEnabled(uint256,bool,bool)',
  ExternalTradeRecorded: 'ExternalTradeRecorded(uint256,bool,string,bool,int256)',
} as const;
