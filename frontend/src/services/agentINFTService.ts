/**
 * AI Agent iNFT Service
 * Handles all interactions with the AIAgentINFT smart contract
 * Implements ERC-7857 iNFT functionality with encrypted metadata
 */

import {
  formatEther,
  parseEther,
  type Address,
  type WalletClient,
  type PublicClient,
  toHex,
  createPublicClient,
  http,
} from 'viem';
import { readContractWithRateLimit, batchReadContractsWithRateLimit } from '../lib/rpcClient';
import { chainsToContracts, crownTokenAbi, getChainId, getZeroGChainId, getZeroGComputeRpc } from '../constants';
import { AIAgentINFTAbi } from '../constants/aiAgentINFTAbi';
import type {
  AIAgentINFT,
  AIAgentINFTDisplay,
  AgentOnChainData,
  AgentINFTPerformance,
  PendingTransfer,
  Authorization,
  EncryptedAgentMetadata,
  EncryptedData,
} from '../types/agentINFT';
import {
  AgentTier,
  getTierLabel,
  getStrategyLabel,
  getRiskLabel,
  getSpecializationLabel,
  calculateINFTWinRate,
  formatStake,
  formatPnL,
} from '../types/agentINFT';
import {
  agentEncryptionService,
  deserializeEncryptedData,
  requestReEncryptionProof,
  computeMetadataHash,
} from './agentEncryptionService';

// Re-export types
export * from '../types/agentINFT';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

// Cache TTL configurations (in ms)
const CACHE_TTL = {
  TOKEN: 30000,           // 30 seconds
  PERFORMANCE: 15000,     // 15 seconds
  STATIC: 300000,         // 5 minutes
  SHORT: 5000,            // 5 seconds
};

// 0G Chain configuration for iNFT operations
const ZEROG_CHAIN_ID = getZeroGChainId(); // 16602
const ZEROG_RPC_URL = getZeroGComputeRpc();

// Create a dedicated 0G public client for iNFT reads
const zeroGPublicClient = createPublicClient({
  transport: http(ZEROG_RPC_URL),
});

// Helper function to read from 0G chain
async function readContractOnZeroG<T>(params: {
  address: Address;
  abi: any;
  functionName: string;
  args?: readonly unknown[];
}): Promise<T> {
  return zeroGPublicClient.readContract(params) as Promise<T>;
}

class AIAgentINFTService {
  private contractAddress: Address;
  private crownTokenAddress: Address;
  private chainId: number = ZEROG_CHAIN_ID; // Use 0G chain for iNFT

  constructor() {
    // iNFT contracts are on 0G Galileo Testnet (16602)
    const contracts = chainsToContracts[ZEROG_CHAIN_ID];
    // Will be set after deployment
    this.contractAddress = (contracts as any).aiAgentINFT || ZERO_ADDRESS;
    // CrownToken on 0G for staking with iNFT
    this.crownTokenAddress = contracts.crownToken as Address;
  }

  /**
   * Check if the contract is deployed
   */
  isContractDeployed(): boolean {
    return this.contractAddress !== ZERO_ADDRESS;
  }

  /**
   * Set contract address (for testing or after deployment)
   */
  setContractAddress(address: Address): void {
    this.contractAddress = address;
  }

  /**
   * Get contract address
   */
  getContractAddress(): Address {
    return this.contractAddress;
  }

  /**
   * Get the chain ID used for iNFT operations (0G Galileo)
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get the 0G RPC URL for wallet configuration
   */
  getZeroGRpcUrl(): string {
    return ZEROG_RPC_URL;
  }

  // ============================================================================
  // Read Functions
  // ============================================================================

  /**
   * Get iNFT by token ID
   */
  async getINFT(tokenId: bigint): Promise<AIAgentINFT | null> {
    if (!this.isContractDeployed()) return null;

    try {
      const [owner, encryptedMetadataRef, metadataHash, onChainData, performance, pendingTransfer] =
        await Promise.all([
          this.getOwner(tokenId),
          this.getEncryptedMetadataRef(tokenId),
          this.getMetadataHash(tokenId),
          this.getAgentData(tokenId),
          this.getAgentPerformance(tokenId),
          this.getPendingTransfer(tokenId),
        ]);

      if (!owner || owner === ZERO_ADDRESS) return null;

      return {
        tokenId,
        owner,
        encryptedMetadataRef: encryptedMetadataRef || '',
        metadataHash: metadataHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
        onChainData: onChainData || this.defaultOnChainData(),
        performance: performance || this.defaultPerformance(),
        pendingTransfer: pendingTransfer?.isPending ? pendingTransfer : undefined,
      };
    } catch (error) {
      console.error('Error fetching iNFT:', error);
      return null;
    }
  }

  /**
   * Get owner of token (reads from 0G chain)
   */
  async getOwner(tokenId: bigint): Promise<Address | null> {
    try {
      const owner = await readContractOnZeroG<Address>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      });
      return owner;
    } catch {
      return null;
    }
  }

  /**
   * Get encrypted metadata reference (reads from 0G chain)
   */
  async getEncryptedMetadataRef(tokenId: bigint): Promise<string | null> {
    try {
      const ref = await readContractOnZeroG<string>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getEncryptedMetadataRef',
        args: [tokenId],
      });
      return ref;
    } catch {
      return null;
    }
  }

  /**
   * Get metadata hash (reads from 0G chain)
   */
  async getMetadataHash(tokenId: bigint): Promise<`0x${string}` | null> {
    try {
      const hash = await readContractOnZeroG<`0x${string}`>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getMetadataHash',
        args: [tokenId],
      });
      return hash;
    } catch {
      return null;
    }
  }

  /**
   * Get agent on-chain data (reads from 0G chain)
   */
  async getAgentData(tokenId: bigint): Promise<AgentOnChainData | null> {
    try {
      const data = await readContractOnZeroG<AgentOnChainData>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAgentData',
        args: [tokenId],
      });
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Get agent performance (reads from 0G chain)
   */
  async getAgentPerformance(tokenId: bigint): Promise<AgentINFTPerformance | null> {
    try {
      const perf = await readContractOnZeroG<AgentINFTPerformance>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAgentPerformance',
        args: [tokenId],
      });
      return perf;
    } catch {
      return null;
    }
  }

  /**
   * Get pending transfer (reads from 0G chain)
   */
  async getPendingTransfer(tokenId: bigint): Promise<PendingTransfer | null> {
    try {
      const transfer = await readContractOnZeroG<PendingTransfer>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getPendingTransfer',
        args: [tokenId],
      });
      return transfer;
    } catch {
      return null;
    }
  }

  /**
   * Get authorization for an executor (reads from 0G chain)
   */
  async getAuthorization(tokenId: bigint, executor: Address): Promise<Authorization | null> {
    try {
      const auth = await readContractOnZeroG<Authorization>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAuthorization',
        args: [tokenId, executor],
      });
      return auth;
    } catch {
      return null;
    }
  }

  /**
   * Check if executor is authorized (reads from 0G chain)
   */
  async isAuthorizedExecutor(tokenId: bigint, executor: Address): Promise<boolean> {
    try {
      const result = await readContractOnZeroG<boolean>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'isAuthorizedExecutor',
        args: [tokenId, executor],
      });
      return result;
    } catch {
      return false;
    }
  }

  /**
   * Get total supply (reads from 0G chain)
   */
  async getTotalSupply(): Promise<bigint> {
    try {
      const supply = await readContractOnZeroG<bigint>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'totalSupply',
        args: [],
      });
      return supply;
    } catch {
      return BigInt(0);
    }
  }

  /**
   * Get tokens owned by address (reads from 0G chain)
   */
  async getTokensOfOwner(owner: Address): Promise<bigint[]> {
    try {
      const balance = await readContractOnZeroG<bigint>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'balanceOf',
        args: [owner],
      });

      const tokens: bigint[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await readContractOnZeroG<bigint>({
          address: this.contractAddress,
          abi: AIAgentINFTAbi,
          functionName: 'tokenOfOwnerByIndex',
          args: [owner, BigInt(i)],
        });
        tokens.push(tokenId);
      }
      return tokens;
    } catch {
      return [];
    }
  }

  /**
   * Get all active iNFTs
   */
  async getAllActiveINFTs(): Promise<AIAgentINFT[]> {
    return this.getAllINFTs(true);
  }

  /**
   * Get all iNFTs (optionally filter by active status)
   */
  async getAllINFTs(onlyActive: boolean = false): Promise<AIAgentINFT[]> {
    if (!this.isContractDeployed()) {
      console.log('[iNFT] Contract not deployed, skipping fetch');
      return [];
    }

    try {
      const totalSupply = await this.getTotalSupply();
      console.log(`[iNFT] Total supply on 0G: ${totalSupply}`);

      if (totalSupply === BigInt(0)) {
        return [];
      }

      const infts: AIAgentINFT[] = [];

      for (let i = BigInt(1); i <= totalSupply; i++) {
        const inft = await this.getINFT(i);
        if (inft) {
          console.log(`[iNFT] Token #${i}: owner=${inft.owner}, isActive=${inft.onChainData.isActive}`);
          if (!onlyActive || inft.onChainData.isActive) {
            infts.push(inft);
          }
        }
      }

      console.log(`[iNFT] Found ${infts.length} iNFTs (onlyActive=${onlyActive})`);
      return infts;
    } catch (error) {
      console.error('[iNFT] Error fetching iNFTs:', error);
      return [];
    }
  }

  // ============================================================================
  // Write Functions (returns transaction data for wallet to sign)
  // ============================================================================

  /**
   * Prepare mint transaction
   */
  prepareMint(
    encryptedMetadataRef: string,
    metadataHash: `0x${string}`,
    stakeAmount: bigint,
    copyTradingEnabled: boolean
  ) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'mint' as const,
      args: [encryptedMetadataRef, metadataHash, stakeAmount, copyTradingEnabled] as const,
    };
  }

  /**
   * Prepare transfer with re-encryption transaction
   */
  prepareTransferWithReEncryption(
    from: Address,
    to: Address,
    tokenId: bigint,
    sealedKey: Uint8Array,
    proof: Uint8Array
  ) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'transferWithReEncryption' as const,
      args: [from, to, tokenId, toHex(sealedKey), toHex(proof)] as const,
    };
  }

  /**
   * Prepare initiate transfer transaction
   */
  prepareInitiateTransfer(to: Address, tokenId: bigint) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'initiateTransfer' as const,
      args: [to, tokenId] as const,
    };
  }

  /**
   * Prepare authorize usage transaction
   */
  prepareAuthorizeUsage(tokenId: bigint, executor: Address, durationSeconds: bigint) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'authorizeUsage' as const,
      args: [tokenId, executor, durationSeconds] as const,
    };
  }

  /**
   * Prepare revoke usage transaction
   */
  prepareRevokeUsage(tokenId: bigint, executor: Address) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'revokeUsage' as const,
      args: [tokenId, executor] as const,
    };
  }

  /**
   * Prepare record trade transaction
   * Records trade results to update iNFT performance stats and tier
   * @param tokenId The iNFT token ID
   * @param won Whether the trade won
   * @param pnl Profit/loss amount (int256, can be negative)
   */
  prepareRecordTrade(tokenId: bigint, won: boolean, pnl: bigint) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'recordTrade' as const,
      args: [tokenId, won, pnl] as const,
    };
  }

  /**
   * Prepare add stake transaction
   */
  prepareAddStake(tokenId: bigint, amount: bigint) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'addStake' as const,
      args: [tokenId, amount] as const,
    };
  }

  /**
   * Prepare request unstake transaction
   */
  prepareRequestUnstake(tokenId: bigint) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'requestUnstake' as const,
      args: [tokenId] as const,
    };
  }

  /**
   * Prepare withdraw stake transaction
   */
  prepareWithdrawStake(tokenId: bigint, amount: bigint) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'withdrawStake' as const,
      args: [tokenId, amount] as const,
    };
  }

  /**
   * Prepare set copy trading enabled transaction
   */
  prepareSetCopyTradingEnabled(tokenId: bigint, enabled: boolean) {
    return {
      address: this.contractAddress,
      abi: AIAgentINFTAbi,
      functionName: 'setCopyTradingEnabled' as const,
      args: [tokenId, enabled] as const,
    };
  }

  /**
   * Prepare token approval for staking
   */
  prepareApproveToken(amount: bigint) {
    return {
      address: this.crownTokenAddress,
      abi: crownTokenAbi,
      functionName: 'approve' as const,
      args: [this.contractAddress, amount] as const,
    };
  }

  // ============================================================================
  // High-level Operations
  // ============================================================================

  /**
   * Mint a new iNFT with encrypted metadata
   */
  async mintINFT(
    metadata: EncryptedAgentMetadata,
    stakeAmount: bigint,
    copyTradingEnabled: boolean,
    walletClient: WalletClient,
    account: `0x${string}`,
    storageService: { uploadEncryptedMetadata: (data: Uint8Array) => Promise<string> }
  ): Promise<{ txHash: string; tokenId?: bigint }> {
    // 1. Encrypt metadata
    const encryptedData = await agentEncryptionService.encrypt(metadata, walletClient, account);

    // 2. Serialize for storage
    const { serializeEncryptedData } = await import('./agentEncryptionService');
    const serialized = serializeEncryptedData(encryptedData);

    // 3. Upload to 0G Storage
    const encryptedMetadataRef = await storageService.uploadEncryptedMetadata(serialized);

    // 4. Compute metadata hash
    const metadataHash = computeMetadataHash(metadata);

    // 5. Approve tokens for staking
    const approveTx = this.prepareApproveToken(stakeAmount);
    const approveHash = await walletClient.writeContract({
      ...approveTx,
      account,
      chain: null,
    });

    // 6. Mint iNFT
    const mintTx = this.prepareMint(encryptedMetadataRef, metadataHash, stakeAmount, copyTradingEnabled);
    const mintHash = await walletClient.writeContract({
      ...mintTx,
      account,
      chain: null,
    });

    return { txHash: mintHash };
  }

  /**
   * Transfer iNFT with re-encryption via 0G TEE Oracle
   * Requests a real re-encryption proof from the oracle before transfer
   */
  async transferINFTWithReEncryption(
    tokenId: bigint,
    to: Address,
    walletClient: WalletClient,
    account: `0x${string}`
  ): Promise<string> {
    // Get encrypted metadata reference
    const encryptedMetadataRef = await this.getEncryptedMetadataRef(tokenId);
    if (!encryptedMetadataRef) {
      throw new Error('No encrypted metadata found for this iNFT');
    }

    // Request re-encryption proof from 0G TEE Oracle
    const reEncryptionProof = await requestReEncryptionProof(
      tokenId,
      account,
      to,
      encryptedMetadataRef
    );

    // Execute transfer with the oracle-provided proof
    const tx = this.prepareTransferWithReEncryption(
      account,
      to,
      tokenId,
      reEncryptionProof.sealedKey,
      reEncryptionProof.proof
    );

    const hash = await walletClient.writeContract({
      ...tx,
      account,
      chain: null,
    });

    return hash;
  }

  // ============================================================================
  // Display Helpers
  // ============================================================================

  /**
   * Convert iNFT to display format with decrypted metadata
   */
  async toDisplayFormat(
    inft: AIAgentINFT,
    metadata?: EncryptedAgentMetadata
  ): Promise<AIAgentINFTDisplay> {
    const winRate = calculateINFTWinRate(inft.performance);
    const pnlFormatted = formatPnL(inft.performance.totalPnL);
    const stakedFormatted = formatStake(inft.onChainData.stakedAmount);
    const tierLabel = getTierLabel(inft.onChainData.tier);

    // Use metadata if available, otherwise use defaults
    const strategyLabel = metadata ? getStrategyLabel(metadata.strategy.type) : 'Unknown';
    const riskLabel = metadata ? getRiskLabel(metadata.riskProfile) : 'Unknown';
    const specializationLabel = metadata ? getSpecializationLabel(metadata.specialization) : 'Unknown';

    // Check if online (traded in last 24h)
    const oneDayAgo = BigInt(Math.floor(Date.now() / 1000) - 86400);
    const isOnline = inft.onChainData.lastUpdatedAt > oneDayAgo;

    return {
      ...inft,
      metadata,
      winRate,
      pnlFormatted,
      stakedFormatted,
      tierLabel,
      strategyLabel,
      riskLabel,
      specializationLabel,
      isOnline,
      followerCount: 0, // Would need to track separately
      isINFT: true,
      hasEncryptedMetadata: inft.encryptedMetadataRef.length > 0,
      canDecrypt: false, // Set by caller based on ownership/authorization
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private defaultOnChainData(): AgentOnChainData {
    return {
      tier: AgentTier.NOVICE,
      stakedAmount: BigInt(0),
      isActive: false,
      copyTradingEnabled: false,
      createdAt: BigInt(0),
      lastUpdatedAt: BigInt(0),
    };
  }

  private defaultPerformance(): AgentINFTPerformance {
    return {
      totalTrades: BigInt(0),
      winningTrades: BigInt(0),
      totalPnL: BigInt(0),
      accuracyBps: BigInt(0),
    };
  }
}

// Export singleton instance
export const agentINFTService = new AIAgentINFTService();

// Export class for testing
export { AIAgentINFTService };
