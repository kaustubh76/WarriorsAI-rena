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
} from 'viem';
import { readContractWithRateLimit, batchReadContractsWithRateLimit } from '../lib/rpcClient';
import { chainsToContracts, crownTokenAbi, getChainId, getZeroGChainId, getZeroGComputeRpc } from '../constants';
import { AIAgentINFTAbi } from '../constants/aiAgentINFTAbi';
import { createZeroGPublicClient, zeroGGalileo } from '../lib/zeroGClient';
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
const zeroGPublicClient = createZeroGPublicClient();

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

    console.log('[iNFT Service] Initialized with:', {
      chainId: ZEROG_CHAIN_ID,
      contractAddress: this.contractAddress,
      crownTokenAddress: this.crownTokenAddress,
      rpcUrl: ZEROG_RPC_URL,
      isDeployed: this.contractAddress !== ZERO_ADDRESS,
    });
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
    console.log(`[iNFT] getINFT(${tokenId}) called, contractDeployed=${this.isContractDeployed()}`);
    if (!this.isContractDeployed()) return null;

    try {
      console.log(`[iNFT] Fetching data for token ${tokenId}...`);
      const [owner, encryptedMetadataRef, metadataHash, onChainData, performance, pendingTransfer] =
        await Promise.all([
          this.getOwner(tokenId),
          this.getEncryptedMetadataRef(tokenId),
          this.getMetadataHash(tokenId),
          this.getAgentData(tokenId),
          this.getAgentPerformance(tokenId),
          this.getPendingTransfer(tokenId),
        ]);

      console.log(`[iNFT] Token ${tokenId} data:`, {
        owner,
        encryptedMetadataRef,
        metadataHash,
        onChainData,
        performance,
        pendingTransfer,
      });

      if (!owner || owner === ZERO_ADDRESS) {
        console.log(`[iNFT] Token ${tokenId} has no owner, returning null`);
        return null;
      }

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
      console.error(`[iNFT] Error fetching iNFT ${tokenId}:`, error);
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
      console.log(`[iNFT] getAgentData(${tokenId}) returned:`, data);
      return data;
    } catch (error) {
      console.error('[iNFT] getAgentData error for token', tokenId.toString(), ':', error);
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
    } catch (error) {
      console.error('[iNFT] getAgentPerformance error for token', tokenId.toString(), ':', error);
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
    } catch (error) {
      console.error('[iNFT] getPendingTransfer error for token', tokenId.toString(), ':', error);
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
    } catch (error) {
      console.error('[iNFT] getAuthorization error:', error);
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
   * IMPORTANT: This function operates on 0G Galileo Testnet (Chain ID: 16602)
   */
  async mintINFT(
    metadata: EncryptedAgentMetadata,
    stakeAmount: bigint,
    copyTradingEnabled: boolean,
    walletClient: WalletClient,
    account: `0x${string}`,
    storageService: { uploadEncryptedMetadata: (data: Uint8Array) => Promise<string> }
  ): Promise<{ txHash: string; tokenId?: bigint }> {
    console.log('[iNFT Service] Starting mint process...');
    console.log('[iNFT Service] Account:', account);
    console.log('[iNFT Service] Stake amount:', stakeAmount.toString());
    console.log('[iNFT Service] Copy trading enabled:', copyTradingEnabled);

    // 1. Encrypt metadata
    console.log('[iNFT Service] Step 1: Encrypting metadata...');
    const encryptedData = await agentEncryptionService.encrypt(metadata, walletClient, account);

    // 2. Serialize for storage
    console.log('[iNFT Service] Step 2: Serializing encrypted data...');
    const { serializeEncryptedData } = await import('./agentEncryptionService');
    const serialized = serializeEncryptedData(encryptedData);

    // 3. Upload to 0G Storage
    console.log('[iNFT Service] Step 3: Uploading to 0G Storage...');
    const encryptedMetadataRef = await storageService.uploadEncryptedMetadata(serialized);
    console.log('[iNFT Service] Metadata ref:', encryptedMetadataRef);

    // 4. Compute metadata hash
    console.log('[iNFT Service] Step 4: Computing metadata hash...');
    const metadataHash = computeMetadataHash(metadata);
    console.log('[iNFT Service] Metadata hash:', metadataHash);

    // 5. Approve tokens for staking on 0G chain
    console.log('[iNFT Service] Step 5: Approving CRwN tokens for staking...');
    console.log('[iNFT Service] CRwN token address:', this.crownTokenAddress);
    console.log('[iNFT Service] iNFT contract address:', this.contractAddress);
    const approveTx = this.prepareApproveToken(stakeAmount);
    const approveHash = await walletClient.writeContract({
      ...approveTx,
      account,
      chain: zeroGGalileo,
    });
    console.log('[iNFT Service] Approve tx hash:', approveHash);

    // Wait a bit for the approval to be mined
    console.log('[iNFT Service] Waiting for approval confirmation...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 6. Mint iNFT on 0G chain
    console.log('[iNFT Service] Step 6: Minting iNFT...');
    const mintTx = this.prepareMint(encryptedMetadataRef, metadataHash, stakeAmount, copyTradingEnabled);
    console.log('[iNFT Service] Mint tx args:', {
      encryptedMetadataRef,
      metadataHash,
      stakeAmount: stakeAmount.toString(),
      copyTradingEnabled,
    });
    const mintHash = await walletClient.writeContract({
      ...mintTx,
      account,
      chain: zeroGGalileo,
    });
    console.log('[iNFT Service] Mint tx hash:', mintHash);

    return { txHash: mintHash };
  }

  /**
   * Transfer iNFT with re-encryption via 0G TEE Oracle
   * Requests a real re-encryption proof from the oracle before transfer
   * IMPORTANT: This function operates on 0G Galileo Testnet (Chain ID: 16602)
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
      chain: zeroGGalileo,
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
  // Copy Trading Read Functions
  // ============================================================================

  /**
   * Get copy trade config for a user and token
   */
  async getCopyTradeConfig(user: Address, tokenId: bigint): Promise<{
    tokenId: bigint;
    maxAmountPerTrade: bigint;
    totalCopied: bigint;
    startedAt: bigint;
    isActive: boolean;
  } | null> {
    if (!this.isContractDeployed()) return null;

    try {
      const config = await readContractOnZeroG<[bigint, bigint, bigint, bigint, boolean]>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getCopyTradeConfig',
        args: [user, tokenId],
      });

      return {
        tokenId: config[0],
        maxAmountPerTrade: config[1],
        totalCopied: config[2],
        startedAt: config[3],
        isActive: config[4],
      };
    } catch (error) {
      console.error('[iNFT] Error fetching copy trade config:', error);
      return null;
    }
  }

  /**
   * Get all agents a user is following
   */
  async getUserFollowing(user: Address): Promise<bigint[]> {
    if (!this.isContractDeployed()) return [];

    try {
      const following = await readContractOnZeroG<readonly bigint[]>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getUserFollowing',
        args: [user],
      });

      return [...following];
    } catch (error) {
      console.error('[iNFT] Error fetching user following:', error);
      return [];
    }
  }

  /**
   * Get all followers of an agent
   */
  async getAgentFollowers(tokenId: bigint): Promise<Address[]> {
    if (!this.isContractDeployed()) return [];

    try {
      const followers = await readContractOnZeroG<readonly Address[]>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAgentFollowers',
        args: [tokenId],
      });

      return [...followers];
    } catch (error) {
      console.error('[iNFT] Error fetching agent followers:', error);
      return [];
    }
  }

  /**
   * Get follower count for an agent
   */
  async getFollowerCount(tokenId: bigint): Promise<number> {
    if (!this.isContractDeployed()) return 0;

    try {
      const count = await readContractOnZeroG<bigint>({
        address: this.contractAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getFollowerCount',
        args: [tokenId],
      });

      return Number(count);
    } catch (error) {
      console.error('[iNFT] Error fetching follower count:', error);
      return 0;
    }
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
