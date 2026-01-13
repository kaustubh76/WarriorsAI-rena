/**
 * Market Creation Service
 * Handles on-chain market creation with CRwN token approval workflow
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther, type Address, type WalletClient } from 'viem';
import { flowTestnet } from 'viem/chains';
import { chainsToContracts, crownTokenAbi, CreatorRevenueShareAbi, MicroMarketFactoryAbi } from '../constants';

// Flow Testnet configuration
const FLOW_CHAIN_ID = 545;
const contracts = chainsToContracts[FLOW_CHAIN_ID];

// Public client for read operations
const publicClient = createPublicClient({
  chain: flowTestnet,
  transport: http('https://testnet.evm.nodes.onflow.org'),
});

// Market creation parameters
export interface CreateMarketParams {
  question: string;
  description?: string;
  category: string;
  endTime: number; // Unix timestamp in ms
  initialLiquidity: string; // Amount in CRwN (e.g., "100")
  creatorAddress: Address;
}

export interface MarketCreationResult {
  success: boolean;
  marketId?: string;
  txHash?: string;
  error?: string;
}

export interface ApprovalStatus {
  hasApproval: boolean;
  currentAllowance: bigint;
  requiredAmount: bigint;
}

class MarketCreationService {
  /**
   * Check if user has approved enough CRwN tokens for market creation
   */
  async checkApproval(
    userAddress: Address,
    amount: string
  ): Promise<ApprovalStatus> {
    const requiredAmount = parseEther(amount);

    try {
      const allowance = await publicClient.readContract({
        address: contracts.crownToken as Address,
        abi: crownTokenAbi,
        functionName: 'allowance',
        args: [userAddress, contracts.microMarketFactory as Address],
      });

      return {
        hasApproval: (allowance as bigint) >= requiredAmount,
        currentAllowance: allowance as bigint,
        requiredAmount,
      };
    } catch (error) {
      console.error('[MarketCreation] Check approval error:', error);
      return {
        hasApproval: false,
        currentAllowance: 0n,
        requiredAmount,
      };
    }
  }

  /**
   * Check user's CRwN balance
   */
  async checkBalance(userAddress: Address): Promise<bigint> {
    try {
      const balance = await publicClient.readContract({
        address: contracts.crownToken as Address,
        abi: crownTokenAbi,
        functionName: 'balanceOf',
        args: [userAddress],
      });
      return balance as bigint;
    } catch (error) {
      console.error('[MarketCreation] Check balance error:', error);
      return 0n;
    }
  }

  /**
   * Approve CRwN tokens for market creation
   * Returns the transaction hash
   */
  async approveTokens(
    walletClient: WalletClient,
    amount: string
  ): Promise<string> {
    const approveAmount = parseEther(amount);

    if (!walletClient.account) {
      throw new Error('Wallet not connected');
    }

    const hash = await walletClient.writeContract({
      address: contracts.crownToken as Address,
      abi: crownTokenAbi,
      functionName: 'approve',
      args: [contracts.microMarketFactory as Address, approveAmount],
      account: walletClient.account,
      chain: flowTestnet,
    });

    // Wait for transaction confirmation
    await publicClient.waitForTransactionReceipt({ hash });

    return hash;
  }

  /**
   * Create a market on-chain
   * This creates a custom market through the MicroMarketFactory
   */
  async createMarketOnChain(
    walletClient: WalletClient,
    params: CreateMarketParams
  ): Promise<MarketCreationResult> {
    try {
      if (!walletClient.account) {
        return { success: false, error: 'Wallet not connected' };
      }

      // Convert end time from ms to seconds
      const endTimeSeconds = BigInt(Math.floor(params.endTime / 1000));
      const liquidityAmount = parseEther(params.initialLiquidity);

      // For user-created markets, we use a custom approach since MicroMarketFactory
      // is designed for battle markets. We'll create a generic prediction market
      // by using the PredictionMarketAMM contract or storing in database with on-chain tracking.

      // Since the current MicroMarketFactory is battle-specific, we'll:
      // 1. Store the market in database via API
      // 2. Register the creator in CreatorRevenueShare
      // 3. Track the market ID for future on-chain features

      // Register creator in CreatorRevenueShare if not already registered
      try {
        const creatorData = await publicClient.readContract({
          address: contracts.creatorRevenueShare as Address,
          abi: CreatorRevenueShareAbi,
          functionName: 'getCreator',
          args: [params.creatorAddress],
        });

        // Check if creator is already registered (registeredAt > 0)
        const creator = creatorData as { registeredAt: bigint };
        if (creator.registeredAt === 0n) {
          // Register as market creator (type 0 = MARKET_CREATOR)
          const registerHash = await walletClient.writeContract({
            address: contracts.creatorRevenueShare as Address,
            abi: CreatorRevenueShareAbi,
            functionName: 'registerCreator',
            args: [0], // CreatorType.MARKET_CREATOR
            account: walletClient.account,
            chain: flowTestnet,
          });
          await publicClient.waitForTransactionReceipt({ hash: registerHash });
        }
      } catch (error) {
        // Creator might already be registered, continue
        console.log('[MarketCreation] Creator registration check:', error);
      }

      // Create market in database first (we'll store it with on-chain creator reference)
      const response = await fetch('/api/markets/user-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: params.question,
          description: params.description,
          category: params.category,
          endTime: params.endTime,
          initialLiquidity: params.initialLiquidity,
          creatorAddress: params.creatorAddress,
          onChainCreator: true, // Flag to indicate this is on-chain creator
        }),
      });

      const result = await response.json();

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Get the database market ID
      const dbMarketId = result.data.market.id;

      // Register market creator in CreatorRevenueShare contract
      // Use a unique numeric ID derived from the database ID
      const onChainMarketId = BigInt(dbMarketId);

      try {
        const setCreatorHash = await walletClient.writeContract({
          address: contracts.creatorRevenueShare as Address,
          abi: CreatorRevenueShareAbi,
          functionName: 'setMarketCreator',
          args: [onChainMarketId, params.creatorAddress],
          account: walletClient.account,
          chain: flowTestnet,
        });

        await publicClient.waitForTransactionReceipt({ hash: setCreatorHash });

        // Update database with on-chain reference
        await fetch('/api/markets/user-create', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marketId: dbMarketId,
            onChainMarketId: onChainMarketId.toString(),
            txHash: setCreatorHash,
          }),
        });

        return {
          success: true,
          marketId: result.data.marketId,
          txHash: setCreatorHash,
        };
      } catch (error) {
        // Market was created in DB but on-chain registration failed
        // Return partial success
        console.error('[MarketCreation] On-chain registration error:', error);
        return {
          success: true,
          marketId: result.data.marketId,
          error: 'Market created but on-chain creator registration failed',
        };
      }
    } catch (error) {
      console.error('[MarketCreation] Create market error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create market',
      };
    }
  }

  /**
   * Get minimum liquidity required for market creation
   */
  async getMinimumLiquidity(): Promise<string> {
    try {
      const minLiquidity = await publicClient.readContract({
        address: contracts.microMarketFactory as Address,
        abi: MicroMarketFactoryAbi,
        functionName: 'MIN_LIQUIDITY',
      });
      return formatEther(minLiquidity as bigint);
    } catch (error) {
      // Default to 100 CRwN if contract call fails
      return '100';
    }
  }

  /**
   * Format balance for display
   */
  formatBalance(balance: bigint): string {
    return formatEther(balance);
  }
}

export const marketCreationService = new MarketCreationService();
