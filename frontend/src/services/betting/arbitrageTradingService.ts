/**
 * Arbitrage Trading Service
 * Handles automated arbitrage execution across Polymarket and Kalshi
 *
 * PRODUCTION IMPLEMENTATION - Uses real trading, escrow, and config
 */

import { prisma } from '@/lib/prisma';
import { ArbitrageTrade } from '@prisma/client';
import { externalMarketsService } from '../externalMarkets';
import { ArbitrageOpportunity } from '@/types/externalMarket';
import { arbitrageCircuitBreaker } from './tradingCircuitBreaker';
import { escrowService } from '../escrow';
import { tradingConfig } from '../config';

// ============================================
// TYPES
// ============================================

export interface ExecuteArbitrageParams {
  userId: string;
  opportunityId: string;
  investmentAmount: bigint; // Total CRwN to invest
}

export interface ArbitrageTradeResult {
  success: boolean;
  tradeId?: string;
  market1OrderId?: string;
  market2OrderId?: string;
  expectedProfit?: number;
  error?: string;
}

export interface TradeStatus {
  trade: ArbitrageTrade;
  market1OrderStatus?: 'pending' | 'filled' | 'cancelled';
  market2OrderStatus?: 'pending' | 'filled' | 'cancelled';
  profitLoss?: bigint;
}

export interface CloseResult {
  success: boolean;
  profit?: bigint;
  market1Payout?: bigint;
  market2Payout?: bigint;
  error?: string;
}

export interface PnLResult {
  tradeId: string;
  investmentAmount: bigint;
  market1Cost: bigint;
  market2Cost: bigint;
  market1Payout: bigint;
  market2Payout: bigint;
  totalPayout: bigint;
  profitLoss: bigint;
  profitPercentage: number;
}

// ============================================
// ARBITRAGE TRADING SERVICE
// ============================================

class ArbitrageTradingService {
  // Retry tracking for background monitoring tasks
  private monitorRetryCount: Map<string, number> = new Map();
  private resolutionRetryCount: Map<string, number> = new Map();

  // Configuration for retry limits
  private readonly MAX_MONITOR_RETRIES = 60; // 5 minutes max (60 * 5 seconds)
  private readonly MAX_RESOLUTION_RETRIES = 720; // 1 hour max (720 * 5 seconds)
  private readonly MONITOR_INTERVAL_MS = 5000; // 5 seconds
  private readonly RESOLUTION_INTERVAL_MS = 5000; // 5 seconds

  /**
   * Find current arbitrage opportunities
   */
  async findOpportunities(minSpread: number = 5): Promise<ArbitrageOpportunity[]> {
    try {
      return await externalMarketsService.findArbitrageOpportunities(minSpread);
    } catch (error) {
      console.error('[ArbitrageTradingService] Error finding opportunities:', error);
      return [];
    }
  }

  /**
   * Execute arbitrage trade
   */
  async executeArbitrage(params: ExecuteArbitrageParams): Promise<ArbitrageTradeResult> {
    let escrowLockId: string | undefined;

    try {
      // 0. Validate trading is enabled
      if (!tradingConfig.isArbitrageAllowed()) {
        return {
          success: false,
          error: 'Arbitrage trading is currently disabled',
        };
      }

      // Convert to USD for limit checks (assuming 1 CRwN = $1 for simplicity)
      const investmentUSD = Number(params.investmentAmount) / 1e18;

      // Validate trading prerequisites
      const prerequisiteCheck = tradingConfig.validateTradingPrerequisites({
        userId: params.userId,
        amountUSD: investmentUSD,
        platform: 'polymarket', // Primary platform
        isArbitrage: true,
      });

      if (!prerequisiteCheck.allowed) {
        return {
          success: false,
          error: prerequisiteCheck.reason,
        };
      }

      // 1. Find the opportunity from database
      const opportunity = await prisma.arbitrageOpportunity.findUnique({
        where: { id: params.opportunityId },
      });

      if (!opportunity) {
        return {
          success: false,
          error: 'Opportunity not found',
        };
      }

      if (opportunity.status !== 'active') {
        return {
          success: false,
          error: `Opportunity is ${opportunity.status}`,
        };
      }

      // Check if opportunity expired
      if (new Date(opportunity.expiresAt) < new Date()) {
        await prisma.arbitrageOpportunity.update({
          where: { id: opportunity.id },
          data: { status: 'expired' },
        });

        return {
          success: false,
          error: 'Opportunity expired',
        };
      }

      // Check profit margin is sufficient
      const profitCheck = tradingConfig.checkProfitMargin(opportunity.potentialProfit);
      if (!profitCheck.allowed) {
        return {
          success: false,
          error: profitCheck.reason,
        };
      }

      // 2. Calculate position sizes
      // Split investment proportionally based on prices
      const market1Price = opportunity.market1YesPrice / 10000; // Convert from bps
      const market2Price = opportunity.market2NoPrice / 10000;
      const totalCost = market1Price + market2Price;

      const market1Allocation = (market1Price / totalCost) * Number(params.investmentAmount);
      const market2Allocation = (market2Price / totalCost) * Number(params.investmentAmount);

      // 3. Create trade record
      const trade = await prisma.arbitrageTrade.create({
        data: {
          userId: params.userId,
          opportunityId: opportunity.id,
          market1Source: opportunity.market1Source,
          market1Id: opportunity.market1Id,
          market1Question: opportunity.market1Question,
          market1Side: true, // YES
          market2Source: opportunity.market2Source,
          market2Id: opportunity.market2Id,
          market2Question: opportunity.market2Question,
          market2Side: false, // NO
          investmentAmount: params.investmentAmount,
          market1Amount: BigInt(Math.floor(market1Allocation)),
          market2Amount: BigInt(Math.floor(market2Allocation)),
          expectedProfit: opportunity.potentialProfit,
          expectedSpread: opportunity.spread / 100,
          status: 'pending',
        },
      });

      // 4. Lock funds in escrow BEFORE placing orders
      const escrowResult = await escrowService.lockFunds({
        userId: params.userId,
        amount: params.investmentAmount,
        purpose: 'arbitrage_trade',
        referenceId: trade.id,
      });

      if (!escrowResult.success) {
        // Update trade status and return error
        await prisma.arbitrageTrade.update({
          where: { id: trade.id },
          data: { status: 'failed', error: `Escrow lock failed: ${escrowResult.error}` },
        });

        return {
          success: false,
          error: escrowResult.error || 'Failed to lock funds in escrow',
        };
      }

      escrowLockId = escrowResult.lockId;
      console.log(`[ArbitrageTradingService] Locked ${params.investmentAmount} in escrow (${escrowLockId})`);

      // 5. Place orders on both markets simultaneously with atomic execution
      // Use circuit breaker to protect against cascade failures
      const [market1Result, market2Result] = await arbitrageCircuitBreaker.execute(async () => {
        return await Promise.allSettled([
          this.placeMarket1Order(trade),
          this.placeMarket2Order(trade),
        ]);
      }, 'Arbitrage dual order placement');

      // Check if both orders succeeded
      if (market1Result.status === 'rejected' || market2Result.status === 'rejected') {
        // At least one order failed - attempt rollback
        const rollbackErrors: string[] = [];

        // Cancel successful orders
        if (market1Result.status === 'fulfilled' && market1Result.value.orderId) {
          try {
            await this.cancelOrder(
              trade.market1Source as 'polymarket' | 'kalshi',
              market1Result.value.orderId
            );
          } catch (error) {
            rollbackErrors.push(`Failed to cancel market 1 order: ${(error as Error).message}`);
          }
        }

        if (market2Result.status === 'fulfilled' && market2Result.value.orderId) {
          try {
            await this.cancelOrder(
              trade.market2Source as 'polymarket' | 'kalshi',
              market2Result.value.orderId
            );
          } catch (error) {
            rollbackErrors.push(`Failed to cancel market 2 order: ${(error as Error).message}`);
          }
        }

        // Release escrow on failure
        if (escrowLockId) {
          try {
            await escrowService.releaseFunds(escrowLockId, 'Order placement failed - rollback');
            console.log(`[ArbitrageTradingService] Released escrow ${escrowLockId} after order failure`);
          } catch (error) {
            rollbackErrors.push(`Failed to release escrow: ${(error as Error).message}`);
          }
        }

        // Mark trade as failed
        await prisma.arbitrageTrade.update({
          where: { id: trade.id },
          data: {
            status: 'failed',
            error: `Atomic execution failed: ${
              market1Result.status === 'rejected' ? market1Result.reason : market2Result.reason
            }${rollbackErrors.length > 0 ? `. Rollback errors: ${rollbackErrors.join(', ')}` : ''}`,
            attempts: 1,
          },
        });

        return {
          success: false,
          error: `Arbitrage execution failed - orders cancelled. ${rollbackErrors.length > 0 ? 'Rollback issues detected.' : ''}`,
        };
      }

      // Both orders succeeded - update trade record
      const market1Data = market1Result.value;
      const market2Data = market2Result.value;

      await prisma.arbitrageTrade.update({
        where: { id: trade.id },
        data: {
          market1OrderId: market1Data.orderId,
          market1Shares: market1Data.shares,
          market1ExecutionPrice: market1Data.executionPrice,
          market2OrderId: market2Data.orderId,
          market2Shares: market2Data.shares,
          market2ExecutionPrice: market2Data.executionPrice,
          status: 'partial',
          executedAt: new Date(),
        },
      });

      // 6. Monitor order fills (background task)
      this.monitorTrade(trade.id).catch(console.error);

      // Record trade for daily volume tracking
      tradingConfig.recordTrade(params.userId, investmentUSD);

      return {
        success: true,
        tradeId: trade.id,
        market1OrderId: market1Data.orderId,
        market2OrderId: market2Data.orderId,
        expectedProfit: opportunity.potentialProfit,
      };
    } catch (error) {
      console.error('[ArbitrageTradingService] Error executing arbitrage:', error);

      // Release escrow on any unexpected error
      if (escrowLockId) {
        try {
          await escrowService.releaseFunds(escrowLockId, `Unexpected error: ${(error as Error).message}`);
          console.log(`[ArbitrageTradingService] Released escrow ${escrowLockId} after unexpected error`);
        } catch (escrowError) {
          console.error('[ArbitrageTradingService] Failed to release escrow after error:', escrowError);
        }
      }

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Monitor trade status with retry limits
   */
  async monitorTrade(tradeId: string): Promise<void> {
    try {
      // Check retry limit to prevent infinite monitoring
      const retries = this.monitorRetryCount.get(tradeId) || 0;
      if (retries >= this.MAX_MONITOR_RETRIES) {
        console.error(`[ArbitrageTradingService] Max monitoring retries (${this.MAX_MONITOR_RETRIES}) reached for trade ${tradeId}`);
        await this.markTradeStale(tradeId, 'Order fill monitoring timed out');
        this.monitorRetryCount.delete(tradeId);
        return;
      }

      const trade = await prisma.arbitrageTrade.findUnique({
        where: { id: tradeId },
      });

      if (!trade || trade.status === 'failed' || trade.status === 'settled' || trade.status === 'stale') {
        // Cleanup retry tracking when done
        this.monitorRetryCount.delete(tradeId);
        return;
      }

      // Check order fill status on both platforms
      const market1Filled = await this.checkOrderFillStatus(
        trade.market1Source as 'polymarket' | 'kalshi',
        trade.market1OrderId!
      );

      const market2Filled = await this.checkOrderFillStatus(
        trade.market2Source as 'polymarket' | 'kalshi',
        trade.market2OrderId!
      );

      // Update fill status
      const updates: Record<string, unknown> = {};
      if (market1Filled && !trade.market1Filled) {
        updates.market1Filled = true;
        updates.market1FilledAt = new Date();
      }
      if (market2Filled && !trade.market2Filled) {
        updates.market2Filled = true;
        updates.market2FilledAt = new Date();
      }

      // If both filled, mark as completed
      if (market1Filled && market2Filled) {
        updates.status = 'completed';
      }

      if (Object.keys(updates).length > 0) {
        await prisma.arbitrageTrade.update({
          where: { id: tradeId },
          data: updates,
        });
      }

      // If completed, start resolution monitoring (and cleanup fill monitoring)
      if (market1Filled && market2Filled) {
        this.monitorRetryCount.delete(tradeId);
        this.waitForResolution(tradeId).catch(console.error);
      } else {
        // Increment retry count and continue monitoring
        this.monitorRetryCount.set(tradeId, retries + 1);
        setTimeout(() => this.monitorTrade(tradeId), this.MONITOR_INTERVAL_MS);
      }
    } catch (error) {
      console.error('[ArbitrageTradingService] Error monitoring trade:', error);
      // Still increment retry count on errors to prevent infinite loops
      const retries = this.monitorRetryCount.get(tradeId) || 0;
      this.monitorRetryCount.set(tradeId, retries + 1);
      // Retry after error with same interval
      setTimeout(() => this.monitorTrade(tradeId), this.MONITOR_INTERVAL_MS);
    }
  }

  /**
   * Mark a trade as stale (requires manual intervention)
   */
  private async markTradeStale(tradeId: string, reason: string): Promise<void> {
    try {
      await prisma.arbitrageTrade.update({
        where: { id: tradeId },
        data: {
          status: 'stale',
          error: reason,
        },
      });

      // Log for alerting
      await prisma.tradeAuditLog.create({
        data: {
          tradeType: 'arbitrage',
          action: 'mark_stale',
          tradeId,
          success: false,
          metadata: JSON.stringify({ reason }),
        },
      });

      console.error(`[ALERT] Trade ${tradeId} marked as stale: ${reason} - requires manual review`);
    } catch (error) {
      console.error(`[ArbitrageTradingService] Failed to mark trade ${tradeId} as stale:`, error);
    }
  }

  /**
   * Wait for market resolution and auto-settle with retry limits
   */
  async waitForResolution(tradeId: string): Promise<void> {
    try {
      // Check retry limit for resolution monitoring
      const retries = this.resolutionRetryCount.get(tradeId) || 0;
      if (retries >= this.MAX_RESOLUTION_RETRIES) {
        console.warn(`[ArbitrageTradingService] Max resolution retries (${this.MAX_RESOLUTION_RETRIES}) reached for trade ${tradeId} - will rely on manual/cron settlement`);
        this.resolutionRetryCount.delete(tradeId);
        // Don't mark as stale - just stop active monitoring, cron job will settle later
        return;
      }

      const trade = await prisma.arbitrageTrade.findUnique({
        where: { id: tradeId },
      });

      if (!trade || trade.settled || trade.status === 'stale' || trade.status === 'failed') {
        this.resolutionRetryCount.delete(tradeId);
        return;
      }

      // Get market status
      const [market1, market2] = await Promise.all([
        prisma.externalMarket.findUnique({
          where: { id: trade.market1Id },
        }),
        prisma.externalMarket.findUnique({
          where: { id: trade.market2Id },
        }),
      ]);

      // Check if both markets resolved
      if (
        market1?.status === 'resolved' &&
        market2?.status === 'resolved' &&
        market1.outcome &&
        market2.outcome
      ) {
        // Close positions and calculate profit
        this.resolutionRetryCount.delete(tradeId);
        await this.closePositions(tradeId);
      } else {
        // Markets not yet resolved, continue monitoring
        this.resolutionRetryCount.set(tradeId, retries + 1);
        setTimeout(() => this.waitForResolution(tradeId), this.RESOLUTION_INTERVAL_MS);
      }
    } catch (error) {
      console.error('[ArbitrageTradingService] Error waiting for resolution:', error);
      // Increment retry count on error
      const retries = this.resolutionRetryCount.get(tradeId) || 0;
      this.resolutionRetryCount.set(tradeId, retries + 1);
      // Retry after error
      setTimeout(() => this.waitForResolution(tradeId), this.RESOLUTION_INTERVAL_MS);
    }
  }

  /**
   * Close positions when markets resolve
   */
  async closePositions(tradeId: string): Promise<CloseResult> {
    try {
      const trade = await prisma.arbitrageTrade.findUnique({
        where: { id: tradeId },
      });

      if (!trade) {
        return {
          success: false,
          error: 'Trade not found',
        };
      }

      if (trade.settled) {
        return {
          success: false,
          error: 'Trade already settled',
        };
      }

      // Get market outcomes
      const [market1, market2] = await Promise.all([
        prisma.externalMarket.findUnique({
          where: { id: trade.market1Id },
        }),
        prisma.externalMarket.findUnique({
          where: { id: trade.market2Id },
        }),
      ]);

      if (!market1 || !market2) {
        return {
          success: false,
          error: 'Markets not found',
        };
      }

      // Calculate payouts
      const market1Outcome = market1.outcome === 'yes';
      const market2Outcome = market2.outcome === 'yes';

      // Market 1: We bought YES
      const market1Payout = market1Outcome
        ? BigInt(Math.floor((trade.market1Shares || 0) * 100))
        : BigInt(0);

      // Market 2: We bought NO
      const market2Payout = !market2Outcome
        ? BigInt(Math.floor((trade.market2Shares || 0) * 100))
        : BigInt(0);

      const totalPayout = market1Payout + market2Payout;
      const profit = totalPayout - trade.investmentAmount;

      // Update trade
      await prisma.arbitrageTrade.update({
        where: { id: tradeId },
        data: {
          market1Outcome,
          market2Outcome,
          actualProfit: profit,
          settled: true,
          settledAt: new Date(),
          status: 'settled',
        },
      });

      // Release funds from escrow
      const escrowLock = await escrowService.getEscrowLockByReference(tradeId);
      if (escrowLock) {
        await escrowService.releaseFunds(escrowLock.id, 'Trade settled successfully');
        console.log(`[ArbitrageTradingService] Released escrow ${escrowLock.id} after settlement`);
      }

      // Credit profit to user's balance
      if (profit > 0n) {
        await escrowService.creditFunds(
          trade.userId,
          profit,
          `Arbitrage profit from trade ${tradeId}`
        );
        console.log(`[ArbitrageTradingService] Credited ${profit} profit to user ${trade.userId}`);
      }

      return {
        success: true,
        profit,
        market1Payout,
        market2Payout,
      };
    } catch (error) {
      console.error('[ArbitrageTradingService] Error closing positions:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Calculate profit/loss for a trade
   */
  async calculatePnL(tradeId: string): Promise<PnLResult | null> {
    try {
      const trade = await prisma.arbitrageTrade.findUnique({
        where: { id: tradeId },
      });

      if (!trade) {
        return null;
      }

      const market1Cost = trade.market1Amount;
      const market2Cost = trade.market2Amount;
      const totalCost = market1Cost + market2Cost;

      // If not settled, calculate expected payout
      let market1Payout = BigInt(0);
      let market2Payout = BigInt(0);

      if (trade.settled && trade.actualProfit !== null) {
        // Use actual payouts
        if (trade.market1Outcome) {
          market1Payout = BigInt(Math.floor((trade.market1Shares || 0) * 100));
        }
        if (!trade.market2Outcome) {
          market2Payout = BigInt(Math.floor((trade.market2Shares || 0) * 100));
        }
      } else {
        // Calculate expected payouts (assuming arbitrage succeeds)
        market1Payout = BigInt(Math.floor((trade.market1Shares || 0) * 100));
        market2Payout = BigInt(Math.floor((trade.market2Shares || 0) * 100));
      }

      const totalPayout = market1Payout + market2Payout;
      const profitLoss = totalPayout - totalCost;
      const profitPercentage = Number(profitLoss) / Number(totalCost) * 100;

      return {
        tradeId: trade.id,
        investmentAmount: trade.investmentAmount,
        market1Cost,
        market2Cost,
        market1Payout,
        market2Payout,
        totalPayout,
        profitLoss,
        profitPercentage,
      };
    } catch (error) {
      console.error('[ArbitrageTradingService] Error calculating P&L:', error);
      return null;
    }
  }

  /**
   * Get user's trades
   */
  async getUserTrades(
    userId: string,
    filters?: {
      status?: string;
      settled?: boolean;
      limit?: number;
    }
  ): Promise<ArbitrageTrade[]> {
    try {
      const where: any = { userId };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.settled !== undefined) {
        where.settled = filters.settled;
      }

      const trades = await prisma.arbitrageTrade.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 100,
      });

      return trades;
    } catch (error) {
      console.error('[ArbitrageTradingService] Error getting user trades:', error);
      return [];
    }
  }

  // ============================================
  // PRIVATE METHODS - ORDER EXECUTION
  // ============================================

  /**
   * Cancel an order (for rollback)
   */
  private async cancelOrder(
    source: 'polymarket' | 'kalshi',
    orderId: string
  ): Promise<void> {
    try {
      if (source === 'kalshi') {
        const { kalshiTrading } = await import('@/services/externalMarkets');
        await kalshiTrading.cancelOrder(orderId);
        console.log(`[ArbitrageTradingService] Cancelled Kalshi order: ${orderId}`);
      } else if (source === 'polymarket') {
        // Cancel Polymarket order via CLOB API
        if (!process.env.POLYMARKET_TRADING_PRIVATE_KEY) {
          throw new Error('Polymarket trading wallet not configured for order cancellation');
        }

        const { ethers } = await import('ethers');
        const signer = new ethers.Wallet(process.env.POLYMARKET_TRADING_PRIVATE_KEY);

        // Prepare cancellation request with L2 signature
        const timestamp = Math.floor(Date.now() / 1000);
        const message = {
          orderID: orderId,
          timestamp
        };

        // Sign the cancellation message
        const signature = await signer.signMessage(JSON.stringify(message));

        // Submit cancellation to CLOB API
        const response = await fetch(`https://clob.polymarket.com/order`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.POLYMARKET_API_KEY}`,
            'X-Signature': signature,
            'X-Timestamp': timestamp.toString()
          },
          body: JSON.stringify({
            orderID: orderId,
            owner: await signer.getAddress()
          })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(`Polymarket cancellation failed: ${error.message || response.statusText}`);
        }

        const result = await response.json();
        console.log(`[ArbitrageTradingService] Cancelled Polymarket order: ${orderId}`, result);
      }
    } catch (error) {
      console.error(`[ArbitrageTradingService] Failed to cancel ${source} order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Check if an order is filled
   */
  private async checkOrderFillStatus(
    source: 'polymarket' | 'kalshi',
    orderId: string
  ): Promise<boolean> {
    try {
      if (source === 'kalshi') {
        const { kalshiTrading } = await import('@/services/externalMarkets');
        const order = await kalshiTrading.getOrder(orderId);

        // Order is filled if status is 'executed' or quantity_open is 0
        return order.status === 'executed' || order.quantity_open === 0;
      } else if (source === 'polymarket') {
        // Check Polymarket order status via CLOB API
        const response = await fetch(`https://clob.polymarket.com/order/${orderId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.POLYMARKET_API_KEY}`
          }
        });

        if (!response.ok) {
          console.error(`[ArbitrageTradingService] Failed to fetch Polymarket order ${orderId} status: ${response.statusText}`);
          return false;
        }

        const order = await response.json();

        // Order is filled if:
        // - status is 'MATCHED' or 'FILLED'
        // - OR sizeMatched >= original size (fully filled)
        // - OR remaining size is 0
        const isFilled =
          order.status === 'MATCHED' ||
          order.status === 'FILLED' ||
          (order.sizeMatched && order.sizeMatched >= order.originalSize) ||
          (order.size && order.size === 0);

        if (isFilled) {
          console.log(`[ArbitrageTradingService] Polymarket order ${orderId} is filled. Status: ${order.status}, Size matched: ${order.sizeMatched}`);
        }

        return isFilled;
      }
      return false;
    } catch (error) {
      console.error(`[ArbitrageTradingService] Failed to check ${source} order ${orderId} status:`, error);
      return false; // Assume not filled if check fails
    }
  }

  /**
   * Place order on Market 1 (usually Polymarket)
   */
  private async placeMarket1Order(trade: ArbitrageTrade): Promise<{
    orderId: string;
    shares: number;
    executionPrice: number;
  }> {
    try {
      const { marketBettingService } = await import('./marketBettingService');

      // Place real order via marketBettingService
      const result = await marketBettingService.placeBet({
        userId: trade.userId,
        externalMarketId: trade.market1Id,
        source: trade.market1Source as 'polymarket' | 'kalshi',
        side: trade.market1Side ? 'YES' : 'NO',
        amount: BigInt(trade.market1Amount)
      });

      if (!result.success || !result.orderId) {
        throw new Error(result.error || 'Order placement failed');
      }

      return {
        orderId: result.orderId,
        shares: result.shares || 0,
        executionPrice: result.executionPrice || 0
      };
    } catch (error) {
      console.error('[ArbitrageTradingService] Market 1 order failed:', error);
      throw new Error(`Failed to place market 1 order: ${(error as Error).message}`);
    }
  }

  /**
   * Place order on Market 2 (usually Kalshi)
   */
  private async placeMarket2Order(trade: ArbitrageTrade): Promise<{
    orderId: string;
    shares: number;
    executionPrice: number;
  }> {
    try {
      const { marketBettingService } = await import('./marketBettingService');

      // Place real order via marketBettingService
      const result = await marketBettingService.placeBet({
        userId: trade.userId,
        externalMarketId: trade.market2Id,
        source: trade.market2Source as 'polymarket' | 'kalshi',
        side: trade.market2Side ? 'YES' : 'NO',
        amount: BigInt(trade.market2Amount)
      });

      if (!result.success || !result.orderId) {
        throw new Error(result.error || 'Order placement failed');
      }

      return {
        orderId: result.orderId,
        shares: result.shares || 0,
        executionPrice: result.executionPrice || 0
      };
    } catch (error) {
      console.error('[ArbitrageTradingService] Market 2 order failed:', error);
      throw new Error(`Failed to place market 2 order: ${(error as Error).message}`);
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const arbitrageTradingService = new ArbitrageTradingService();
export default arbitrageTradingService;
