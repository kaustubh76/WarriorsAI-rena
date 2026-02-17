/**
 * External Market Agent Service
 * Manages AI agent interactions with external mirrored markets (Polymarket/Kalshi)
 *
 * This service bridges the 0G chain (AI agent iNFTs) with Flow chain (mirror markets)
 * for verified AI-powered trading on external prediction market data.
 */

import { createWalletClient, parseEther, keccak256, toHex } from 'viem';
import { MarketSource, UnifiedMarket } from '@/types/externalMarket';
import { chainsToContracts, getZeroGChainId } from '@/constants';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  isTimeoutError,
} from '@/lib/flowClient';
import {
  createZeroGPublicClient,
  zeroGGalileo,
} from '@/lib/zeroGClient';

// ============================================
// TYPES
// ============================================

export interface VerifiedMarketPrediction {
  outcome: 'yes' | 'no';
  confidence: number;
  inputHash: `0x${string}`;
  outputHash: `0x${string}`;
  providerAddress: `0x${string}`;
  modelHash: `0x${string}`;
  isVerified: boolean;
  timestamp: number;
  signature?: `0x${string}`;
}

export interface AgentExternalPerformance {
  polymarketEnabled: boolean;
  kalshiEnabled: boolean;
  externalTradeCount: number;
  externalPnL: bigint;
  winRate: number;
  topMarkets: {
    marketId: string;
    source: MarketSource;
    pnl: bigint;
  }[];
}

export interface ExternalTradeResult {
  success: boolean;
  txHash?: string;
  sharesOut?: bigint;
  blockNumber?: number;
  error?: string;
}

export interface ExternalTradeHistory {
  id: string;
  marketId: string;
  source: MarketSource;
  outcome: 'yes' | 'no';
  amount: string;
  sharesOut: string;
  prediction: VerifiedMarketPrediction;
  pnl: bigint;
  won: boolean;
  timestamp: number;
  txHash: string;
}

// ============================================
// SERVICE CLASS
// ============================================

class ExternalMarketAgentService {
  private zeroGPublicClient = createZeroGPublicClient();

  private flowPublicClient = createFlowPublicClient();

  private flowFallbackClient = createFlowFallbackClient();

  // Execute Flow operation with fallback
  private async executeFlowWithFallback<T>(
    operation: (client: typeof this.flowPublicClient) => Promise<T>
  ): Promise<T> {
    try {
      return await operation(this.flowPublicClient);
    } catch (error) {
      if (isTimeoutError(error)) {
        console.warn('[ExternalMarketAgent] Flow primary RPC timed out, trying fallback...');
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
   * Check if an agent can trade on a specific external market source
   */
  async canAgentTrade(agentId: bigint, source: MarketSource): Promise<boolean> {
    try {
      const isPolymarket = source === MarketSource.POLYMARKET;

      const enabled = await this.zeroGPublicClient.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'isExternalTradingEnabled',
        args: [agentId, isPolymarket],
      });

      return enabled as boolean;
    } catch (error) {
      console.error('Error checking agent trade permissions:', error);
      return false;
    }
  }

  /**
   * Check if an agent is active
   */
  async isAgentActive(agentId: bigint): Promise<boolean> {
    try {
      const active = await this.zeroGPublicClient.readContract({
        address: this.aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'isAgentActive',
        args: [agentId],
      });

      return active as boolean;
    } catch (error) {
      console.error('Error checking agent active status:', error);
      return false;
    }
  }

  /**
   * Get verified AI prediction for an external market
   */
  async getVerifiedPrediction(
    agentId: bigint,
    market: UnifiedMarket
  ): Promise<VerifiedMarketPrediction> {
    const response = await fetch('/api/0g/market-inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agentId.toString(),
        marketId: market.externalId,
        source: market.source,
        question: market.question,
        currentYesPrice: market.yesPrice,
        endTime: market.endTime,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Failed to get prediction: ${error.error || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Execute agent trade on a mirror market
   */
  async executeAgentTrade(
    agentId: bigint,
    mirrorKey: string,
    prediction: VerifiedMarketPrediction,
    amount: string
  ): Promise<ExternalTradeResult> {
    const response = await fetch('/api/agents/external-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agentId.toString(),
        mirrorKey,
        prediction,
        amount,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      return { success: false, error: error.message || error.error };
    }

    return response.json();
  }

  /**
   * Get agent's external trading performance
   */
  async getAgentExternalPerformance(
    agentId: bigint
  ): Promise<AgentExternalPerformance> {
    try {
      const [stats, tradeHistory] = await Promise.all([
        this.zeroGPublicClient.readContract({
          address: this.aiAgentINFTAddress,
          abi: AIAgentINFTAbi,
          functionName: 'getExternalTradingStats',
          args: [agentId],
        }),
        this.getExternalTradeHistory(agentId),
      ]);

      const [polymarketEnabled, kalshiEnabled, tradeCount, pnl] = stats as [
        boolean,
        boolean,
        bigint,
        bigint
      ];

      // Calculate win rate from history
      const wins = tradeHistory.filter((t) => t.won).length;
      const winRate = tradeHistory.length > 0 ? (wins / tradeHistory.length) * 100 : 0;

      // Get top performing markets
      const marketPnL = new Map<string, { source: MarketSource; pnl: bigint }>();
      for (const trade of tradeHistory) {
        const existing = marketPnL.get(trade.marketId);
        if (existing) {
          existing.pnl += trade.pnl;
        } else {
          marketPnL.set(trade.marketId, { source: trade.source, pnl: trade.pnl });
        }
      }

      const topMarkets = Array.from(marketPnL.entries())
        .map(([marketId, data]) => ({ marketId, ...data }))
        .sort((a, b) => Number(b.pnl - a.pnl))
        .slice(0, 5);

      return {
        polymarketEnabled,
        kalshiEnabled,
        externalTradeCount: Number(tradeCount),
        externalPnL: pnl,
        winRate,
        topMarkets,
      };
    } catch (error) {
      console.error('Error getting agent external performance:', error);
      return {
        polymarketEnabled: false,
        kalshiEnabled: false,
        externalTradeCount: 0,
        externalPnL: 0n,
        winRate: 0,
        topMarkets: [],
      };
    }
  }

  /**
   * Get external trade history for an agent
   */
  async getExternalTradeHistory(agentId: bigint): Promise<ExternalTradeHistory[]> {
    try {
      const response = await fetch(
        `/api/agents/${agentId.toString()}/external-trades`
      );

      if (!response.ok) return [];

      return response.json();
    } catch (error) {
      console.error('Error fetching external trade history:', error);
      return [];
    }
  }

  /**
   * Enable external trading for an agent
   */
  async enableExternalTrading(
    agentId: bigint,
    polymarket: boolean,
    kalshi: boolean,
    walletClient: ReturnType<typeof createWalletClient>
  ): Promise<string> {
    const [address] = await walletClient.getAddresses();

    const hash = await walletClient.writeContract({
      address: this.aiAgentINFTAddress,
      abi: AIAgentINFTAbi,
      functionName: 'enableExternalTrading',
      args: [agentId, polymarket, kalshi],
      account: address,
      chain: zeroGGalileo,
    });

    return hash;
  }

  /**
   * Get mirror market key for an external market
   */
  getMirrorKey(source: MarketSource, externalId: string): `0x${string}` {
    const sourceIndex = source === MarketSource.POLYMARKET ? 0 : 1;
    // Replicate Solidity's keccak256(abi.encodePacked(uint8(source), externalId))
    const encoder = new TextEncoder();
    const sourceBytes = new Uint8Array([sourceIndex]);
    const idBytes = encoder.encode(externalId);
    const combined = new Uint8Array(sourceBytes.length + idBytes.length);
    combined.set(sourceBytes);
    combined.set(idBytes, sourceBytes.length);

    return keccak256(toHex(combined));
  }

  /**
   * Check if a mirror market exists for an external market
   */
  async isMirrorMarketActive(
    source: MarketSource,
    externalId: string
  ): Promise<boolean> {
    try {
      const mirrorKey = this.getMirrorKey(source, externalId);

      const response = await fetch(`/api/flow/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getMirrorMarket',
          mirrorKey,
        }),
      });

      if (!response.ok) return false;

      const result = await response.json();
      return result?.externalLink?.isActive === true;
    } catch (error) {
      console.error('Error checking mirror market:', error);
      return false;
    }
  }

  /**
   * Get all agents that are enabled for external trading
   */
  async getExternalTradingAgents(): Promise<bigint[]> {
    try {
      const response = await fetch('/api/agents?externalEnabled=true');

      if (!response.ok) return [];

      const agents = await response.json();
      return agents.map((a: { id: string }) => BigInt(a.id));
    } catch (error) {
      console.error('Error fetching external trading agents:', error);
      return [];
    }
  }

  /**
   * Get recommended trade amount based on agent tier and market confidence
   */
  getRecommendedTradeAmount(
    agentTier: number,
    confidence: number,
    maxAmount: string
  ): string {
    // Tier multipliers: NOVICE=1, APPRENTICE=1.25, EXPERT=1.5, MASTER=1.75, GRANDMASTER=2
    const tierMultiplier = 1 + (agentTier * 0.25);

    // Confidence scaling: 50% confidence = 0.5x, 100% confidence = 1x
    const confidenceMultiplier = confidence / 100;

    const maxAmountBigInt = parseEther(maxAmount);
    const recommendedAmount = (maxAmountBigInt * BigInt(Math.floor(tierMultiplier * confidenceMultiplier * 100))) / 100n;

    // Convert back to string with 18 decimals
    return (Number(recommendedAmount) / 1e18).toFixed(4);
  }

  /**
   * Validate that an agent can execute a trade on an external market
   */
  async validateAgentTrade(
    agentId: bigint,
    market: UnifiedMarket
  ): Promise<{ valid: boolean; error?: string }> {
    // Check agent is active
    const isActive = await this.isAgentActive(agentId);
    if (!isActive) {
      return { valid: false, error: 'Agent is not active' };
    }

    // Check external trading is enabled for this source
    const canTrade = await this.canAgentTrade(agentId, market.source);
    if (!canTrade) {
      return {
        valid: false,
        error: `External trading not enabled for ${market.source}`
      };
    }

    // Check market is still open
    if (market.endTime < Date.now() / 1000) {
      return { valid: false, error: 'Market has ended' };
    }

    // Check mirror market exists
    const hasMirror = await this.isMirrorMarketActive(market.source, market.externalId);
    if (!hasMirror) {
      return { valid: false, error: 'Mirror market not available' };
    }

    return { valid: true };
  }
}

// Export singleton instance
export const externalMarketAgentService = new ExternalMarketAgentService();

// Export class for testing
export { ExternalMarketAgentService };
