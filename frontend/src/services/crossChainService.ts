/**
 * Cross-Chain Coordination Service
 * Manages state synchronization between 0G and Flow chains
 *
 * Architecture:
 * - 0G Galileo (16602): AI compute, storage, iNFT agent management
 * - Flow Testnet (545): Trading transactions, VRF randomness, market execution
 */

import { formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainsToContracts, getZeroGChainId } from '@/constants';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  isTimeoutError,
} from '@/lib/flowClient';
import {
  createZeroGPublicClient,
  createZeroGWalletClient,
} from '@/lib/zeroGClient';

// ============================================
// TYPES
// ============================================

export interface UnifiedAgentPerformance {
  agentId: bigint;

  // Native market performance (from 0G)
  nativeTrades: number;
  nativePnL: bigint;
  nativeWinRate: number;

  // External market performance (from Flow + 0G)
  externalTrades: number;
  externalPnL: bigint;
  externalWinRate: number;

  // Combined
  totalTrades: number;
  totalPnL: bigint;
  overallWinRate: number;

  // Breakdown by source
  polymarketTrades: number;
  polymarketPnL: bigint;
  kalshiTrades: number;
  kalshiPnL: bigint;
}

export interface MirrorTradeResult {
  mirrorKey: string;
  flowMarketId: bigint;
  isYes: boolean;
  amount: bigint;
  sharesOut: bigint;
  txHash: string;
  timestamp: number;
}

export interface AgentSyncState {
  agentId: string;
  tier: number;
  stakedAmount: string;
  isActive: boolean;
  copyTradingEnabled: boolean;
  polymarketEnabled: boolean;
  kalshiEnabled: boolean;
  totalTrades: number;
  winningTrades: number;
  totalPnL: string;
  externalTradeCount: number;
  externalPnL: string;
  lastSyncedAt: Date;
}

// Simplified ABIs for ExternalMarketMirror
const externalMarketMirrorAbi = [
  {
    type: 'function',
    name: 'getMirrorMarket',
    inputs: [{ name: 'mirrorKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'flowMarketId', type: 'uint256' },
          {
            name: 'externalLink',
            type: 'tuple',
            components: [
              { name: 'externalId', type: 'string' },
              { name: 'source', type: 'uint8' },
              { name: 'lastSyncPrice', type: 'uint256' },
              { name: 'lastSyncTime', type: 'uint256' },
              { name: 'isActive', type: 'bool' },
            ],
          },
          { name: 'totalMirrorVolume', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'creator', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

// ============================================
// SERVICE CLASS
// ============================================

class CrossChainService {
  private zeroGClient = createZeroGPublicClient();

  private flowClient = createFlowPublicClient();

  private flowFallbackClient = createFlowFallbackClient();

  // Execute Flow operation with fallback
  private async executeFlowWithFallback<T>(
    operation: (client: typeof this.flowClient) => Promise<T>
  ): Promise<T> {
    try {
      return await operation(this.flowClient);
    } catch (error) {
      if (isTimeoutError(error)) {
        console.warn('[CrossChain] Flow primary RPC timed out, trying fallback...');
        return await operation(this.flowFallbackClient);
      }
      throw error;
    }
  }

  private get aiAgentINFTAddress(): `0x${string}` {
    const contracts = chainsToContracts[getZeroGChainId()];
    return (contracts?.aiAgentINFT || '0x0000000000000000000000000000000000000000') as `0x${string}`;
  }

  private get externalMarketMirrorAddress(): `0x${string}` {
    const contracts = chainsToContracts[545];
    return (contracts?.externalMarketMirror || '0x0000000000000000000000000000000000000000') as `0x${string}`;
  }

  /**
   * Sync agent state from 0G to ensure consistency
   */
  async syncAgentState(agentId: bigint): Promise<AgentSyncState> {
    // Get on-chain state from 0G
    const [agentData, performance, externalStats] = await Promise.all([
      this.zeroGClient.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAgentData',
        args: [agentId],
      }),
      this.zeroGClient.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAgentPerformance',
        args: [agentId],
      }),
      this.zeroGClient.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getExternalTradingStats',
        args: [agentId],
      }),
    ]);

    // Type assertions for contract return types
    const agentDataTyped = agentData as {
      tier: number;
      stakedAmount: bigint;
      isActive: boolean;
      copyTradingEnabled: boolean;
      polymarketEnabled?: boolean;
      kalshiEnabled?: boolean;
    };

    const performanceTyped = performance as {
      totalTrades: bigint;
      winningTrades: bigint;
      totalPnL: bigint;
    };

    const [polymarketEnabled, kalshiEnabled, externalTradeCount, externalPnL] = externalStats as [
      boolean,
      boolean,
      bigint,
      bigint
    ];

    return {
      agentId: agentId.toString(),
      tier: agentDataTyped.tier,
      stakedAmount: formatEther(agentDataTyped.stakedAmount),
      isActive: agentDataTyped.isActive,
      copyTradingEnabled: agentDataTyped.copyTradingEnabled,
      polymarketEnabled,
      kalshiEnabled,
      totalTrades: Number(performanceTyped.totalTrades),
      winningTrades: Number(performanceTyped.winningTrades),
      totalPnL: formatEther(performanceTyped.totalPnL),
      externalTradeCount: Number(externalTradeCount),
      externalPnL: formatEther(externalPnL),
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Record a mirror trade result back to 0G agent contract
   */
  async recordTradeOn0G(
    agentId: bigint,
    trade: MirrorTradeResult
  ): Promise<string> {
    // Get mirror market to determine source
    const mirrorMarket = await this.flowClient.readContract({
      address: this.externalMarketMirrorAddress,
      abi: externalMarketMirrorAbi,
      functionName: 'getMirrorMarket',
      args: [trade.mirrorKey as `0x${string}`],
    });

    const isPolymarket = mirrorMarket.externalLink.source === 0;
    const marketId = mirrorMarket.externalLink.externalId;

    // Calculate PnL (simplified - actual would need market resolution)
    const pnl = 0n; // Will be updated on market resolution
    const won = false; // Will be updated on market resolution

    // Get oracle account
    const privateKey = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Oracle private key not configured');
    }

    const oracleAccount = privateKeyToAccount(privateKey as `0x${string}`);
    const zeroGWalletClient = createZeroGWalletClient(oracleAccount);

    // Record on 0G chain
    const txHash = await zeroGWalletClient.writeContract({
      address: this.aiAgentINFTAddress,
      abi: AIAgentINFTAbi,
      functionName: 'recordExternalTrade',
      args: [agentId, isPolymarket, marketId, won, pnl],
    });

    return txHash;
  }

  /**
   * Get unified performance combining native and external markets
   */
  async getUnifiedPerformance(
    agentId: bigint
  ): Promise<UnifiedAgentPerformance> {
    // Get on-chain performance from 0G
    const [performance, externalStats] = await Promise.all([
      this.zeroGClient.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getAgentPerformance',
        args: [agentId],
      }),
      this.zeroGClient.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getExternalTradingStats',
        args: [agentId],
      }),
    ]);

    const performanceTyped = performance as {
      totalTrades: bigint;
      winningTrades: bigint;
      totalPnL: bigint;
    };

    const [polymarketEnabled, kalshiEnabled, externalTradeCount, externalPnL] = externalStats as [
      boolean,
      boolean,
      bigint,
      bigint
    ];

    // Get detailed external breakdown from API
    let externalBreakdown = { polymarket: { count: 0, pnl: 0n }, kalshi: { count: 0, pnl: 0n } };
    try {
      const response = await fetch(`/api/agents/${agentId}/external-breakdown`);
      if (response.ok) {
        const data = await response.json();
        externalBreakdown = data.breakdown || externalBreakdown;
      }
    } catch (error) {
      console.warn('Failed to fetch external breakdown:', error);
    }

    const nativeTrades = Number(performanceTyped.totalTrades);
    const nativeWins = Number(performanceTyped.winningTrades);
    const externalTrades = Number(externalTradeCount);

    return {
      agentId,
      nativeTrades,
      nativePnL: performanceTyped.totalPnL,
      nativeWinRate: nativeTrades > 0 ? (nativeWins / nativeTrades) * 100 : 0,
      externalTrades,
      externalPnL,
      externalWinRate: 0, // Would need win tracking from API
      totalTrades: nativeTrades + externalTrades,
      totalPnL: performanceTyped.totalPnL + externalPnL,
      overallWinRate: 0, // Would need combined calculation
      polymarketTrades: externalBreakdown.polymarket.count,
      polymarketPnL: externalBreakdown.polymarket.pnl,
      kalshiTrades: externalBreakdown.kalshi.count,
      kalshiPnL: externalBreakdown.kalshi.pnl,
    };
  }

  /**
   * Check if both chains are healthy
   */
  async checkChainHealth(): Promise<{
    zeroG: { healthy: boolean; blockNumber?: bigint };
    flow: { healthy: boolean; blockNumber?: bigint };
  }> {
    const results = {
      zeroG: { healthy: false, blockNumber: undefined as bigint | undefined },
      flow: { healthy: false, blockNumber: undefined as bigint | undefined },
    };

    try {
      const zeroGBlock = await this.zeroGClient.getBlockNumber();
      results.zeroG = { healthy: true, blockNumber: zeroGBlock };
    } catch (error) {
      console.error('0G chain health check failed:', error);
    }

    try {
      const flowBlock = await this.flowClient.getBlockNumber();
      results.flow = { healthy: true, blockNumber: flowBlock };
    } catch (error) {
      console.error('Flow chain health check failed:', error);
    }

    return results;
  }

  /**
   * Get cross-chain agent status
   */
  async getCrossChainAgentStatus(agentId: bigint): Promise<{
    zeroG: {
      exists: boolean;
      owner?: string;
      active?: boolean;
    };
    flow: {
      hasActiveMirrorPositions: boolean;
      pendingTrades: number;
    };
  }> {
    const result = {
      zeroG: { exists: false, owner: undefined as string | undefined, active: undefined as boolean | undefined },
      flow: { hasActiveMirrorPositions: false, pendingTrades: 0 },
    };

    try {
      const [owner, active] = await Promise.all([
        this.zeroGClient.readContract({
          address: this.aiAgentINFTAddress,
          abi: AIAgentINFTAbi,
          functionName: 'ownerOf',
          args: [agentId],
        }),
        this.zeroGClient.readContract({
          address: this.aiAgentINFTAddress,
          abi: AIAgentINFTAbi,
          functionName: 'isAgentActive',
          args: [agentId],
        }),
      ]);

      result.zeroG = {
        exists: true,
        owner: owner as string,
        active: active as boolean,
      };
    } catch (error) {
      // Agent doesn't exist
      console.warn('Agent not found on 0G:', error);
    }

    // Check Flow for active positions (would need custom endpoint)
    try {
      const response = await fetch(`/api/flow/agent-positions?agentId=${agentId}`);
      if (response.ok) {
        const data = await response.json();
        result.flow = {
          hasActiveMirrorPositions: data.positions?.length > 0,
          pendingTrades: data.pendingCount || 0,
        };
      }
    } catch (error) {
      console.warn('Failed to fetch Flow positions:', error);
    }

    return result;
  }

  /**
   * Estimate gas costs for cross-chain operation
   */
  async estimateCrossChainGas(operation: 'agentTrade' | 'enableExternal' | 'recordTrade'): Promise<{
    zeroG: { gasEstimate: bigint; gasPriceGwei: string };
    flow: { gasEstimate: bigint; gasPriceGwei: string };
  }> {
    const [zeroGGasPrice, flowGasPrice] = await Promise.all([
      this.zeroGClient.getGasPrice(),
      this.flowClient.getGasPrice(),
    ]);

    // Rough estimates based on operation type
    const gasEstimates = {
      agentTrade: { zeroG: 50000n, flow: 200000n },
      enableExternal: { zeroG: 80000n, flow: 0n },
      recordTrade: { zeroG: 100000n, flow: 0n },
    };

    const estimate = gasEstimates[operation];

    return {
      zeroG: {
        gasEstimate: estimate.zeroG,
        gasPriceGwei: formatEther(zeroGGasPrice * 1000000000n).slice(0, 8),
      },
      flow: {
        gasEstimate: estimate.flow,
        gasPriceGwei: formatEther(flowGasPrice * 1000000000n).slice(0, 8),
      },
    };
  }
}

// Export singleton instance
export const crossChainService = new CrossChainService();

// Export class for testing
export { CrossChainService };
