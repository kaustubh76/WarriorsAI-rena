/**
 * Market Betting Service
 * Handles direct betting on Polymarket and Kalshi markets
 */

import { prisma } from '@/lib/prisma';
import { MarketBet } from '@prisma/client';
import { polymarketService } from '../externalMarkets/polymarketService';
import { kalshiService } from '../externalMarkets/kalshiService';
import { kalshiCircuitBreaker, polymarketCircuitBreaker } from './tradingCircuitBreaker';
import { tradingConfig } from '../config';
import { escrowService } from '../escrow';

// ============================================
// TYPES
// ============================================

export interface PlaceBetParams {
  userId: string;
  externalMarketId: string;
  source: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  amount: bigint; // CRwN amount
  warriorId?: number;
}

export interface BetResult {
  success: boolean;
  betId?: string;
  orderId?: string;
  shares?: number;
  executionPrice?: number;
  error?: string;
}

export interface BetStatus {
  bet: MarketBet;
  orderStatus?: 'pending' | 'filled' | 'partially_filled' | 'cancelled';
  fillPercentage?: number;
}

export interface ClaimResult {
  success: boolean;
  payout?: bigint;
  txHash?: string;
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_TRADE_SIZE_CRWN = parseFloat(process.env.MAX_TRADE_SIZE_CRWN || '100');
const MAX_SLIPPAGE_PERCENT = parseFloat(process.env.MAX_SLIPPAGE_PERCENT || '5');
const MAX_USER_EXPOSURE_CRWN = parseFloat(process.env.MAX_USER_EXPOSURE_CRWN || '1000');

// ============================================
// MARKET BETTING SERVICE
// ============================================

class MarketBettingService {
  /**
   * Place bet on external market (Polymarket or Kalshi)
   */
  async placeBet(params: PlaceBetParams): Promise<BetResult> {
    let escrowLockId: string | undefined;

    try {
      // 0. Check if trading is enabled
      if (!tradingConfig.isTradingAllowed()) {
        return {
          success: false,
          error: 'Trading is currently disabled',
        };
      }

      // Validate trading prerequisites
      const amountCRwN = Number(params.amount) / 1e18;
      const prerequisiteCheck = tradingConfig.validateTradingPrerequisites({
        userId: params.userId,
        amountUSD: amountCRwN,
        platform: params.source,
      });

      if (!prerequisiteCheck.allowed) {
        return {
          success: false,
          error: prerequisiteCheck.reason,
        };
      }

      // 1. Validate trade size
      this.validateTradeSize(amountCRwN);

      // 2. Validate user's total exposure
      await this.validateUserExposure(params.userId, amountCRwN);

      // 3. Validate market exists and is active
      const market = await prisma.externalMarket.findUnique({
        where: { id: params.externalMarketId },
      });

      if (!market) {
        return {
          success: false,
          error: 'Market not found',
        };
      }

      if (market.status !== 'active' && market.status !== 'unopened') {
        return {
          success: false,
          error: `Market is ${market.status}, cannot place bet`,
        };
      }

      // 4. Get current market price
      const currentPrice =
        params.side === 'YES' ? market.yesPrice / 100 : market.noPrice / 100;

      // 5. Validate slippage (use current price as expected)
      await this.validateSlippage(params.externalMarketId, params.side, currentPrice);

      // 6. Create bet AND lock escrow in a single atomic transaction
      // This prevents race conditions where bet is created but escrow fails
      let bet;
      try {
        const transactionResult = await prisma.$transaction(async (tx) => {
          // Create bet record
          const newBet = await tx.marketBet.create({
            data: {
              userId: params.userId,
              warriorId: params.warriorId,
              externalMarketId: params.externalMarketId,
              source: params.source,
              question: market.question,
              side: params.side === 'YES',
              amount: params.amount,
              entryPrice: currentPrice,
              status: 'pending',
            },
          });

          // Lock funds in escrow (using transaction context)
          const escrowResult = await escrowService.lockFundsWithTx(tx, {
            userId: params.userId,
            amount: params.amount,
            purpose: 'market_bet',
            referenceId: newBet.id,
          });

          if (!escrowResult.success) {
            // Throwing will rollback the entire transaction
            throw new Error(escrowResult.error || 'Failed to lock funds in escrow');
          }

          return { bet: newBet, escrowLockId: escrowResult.lockId };
        });

        bet = transactionResult.bet;
        escrowLockId = transactionResult.escrowLockId;
        console.log(`[MarketBettingService] Created bet ${bet.id} with escrow lock ${escrowLockId}`);
      } catch (transactionError) {
        // Transaction rolled back - neither bet nor escrow lock exists
        return {
          success: false,
          error: (transactionError as Error).message || 'Failed to create bet with escrow',
        };
      }

      // 5. Place order on external platform
      let orderResult;
      try {
        if (params.source === 'polymarket') {
          orderResult = await this.placePolymarketOrder(bet, params);
        } else if (params.source === 'kalshi') {
          orderResult = await this.placeKalshiOrder(bet, params);
        } else {
          throw new Error(`Unsupported source: ${params.source}`);
        }
      } catch (error) {
        // Release escrow on order placement failure
        if (escrowLockId) {
          await escrowService.releaseFunds(escrowLockId, `Order placement failed: ${(error as Error).message}`);
        }

        // Update bet status to failed
        await prisma.marketBet.update({
          where: { id: bet.id },
          data: {
            status: 'cancelled',
          },
        });

        return {
          success: false,
          error: `Failed to place order: ${(error as Error).message}`,
        };
      }

      // 6. Update bet with order details
      await prisma.marketBet.update({
        where: { id: bet.id },
        data: {
          status: 'placed',
          orderId: orderResult.orderId,
          shares: orderResult.shares,
          placedAt: new Date(),
        },
      });

      return {
        success: true,
        betId: bet.id,
        orderId: orderResult.orderId,
        shares: orderResult.shares,
        executionPrice: orderResult.executionPrice,
      };
    } catch (error) {
      console.error('[MarketBettingService] Error placing bet:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get bet status
   */
  async getBetStatus(betId: string): Promise<BetStatus | null> {
    try {
      const bet = await prisma.marketBet.findUnique({
        where: { id: betId },
      });

      if (!bet) {
        return null;
      }

      // If bet is placed, check order status on external platform
      let orderStatus: 'pending' | 'filled' | 'partially_filled' | 'cancelled' | undefined;
      let fillPercentage: number | undefined;

      if (bet.status === 'placed' && bet.orderId) {
        try {
          if (bet.source === 'polymarket') {
            // Polymarket order status check would go here
            // For now, assume filled
            orderStatus = 'filled';
            fillPercentage = 100;
          } else if (bet.source === 'kalshi') {
            // Kalshi order status check would go here
            orderStatus = 'filled';
            fillPercentage = 100;
          }
        } catch (error) {
          console.error('[MarketBettingService] Error checking order status:', error);
        }
      }

      return {
        bet,
        orderStatus,
        fillPercentage,
      };
    } catch (error) {
      console.error('[MarketBettingService] Error getting bet status:', error);
      return null;
    }
  }

  /**
   * Get user's bets
   */
  async getUserBets(
    userId: string,
    filters?: {
      status?: string;
      source?: string;
      limit?: number;
    }
  ): Promise<MarketBet[]> {
    try {
      const where: any = { userId };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.source) {
        where.source = filters.source;
      }

      const bets = await prisma.marketBet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 100,
      });

      return bets;
    } catch (error) {
      console.error('[MarketBettingService] Error getting user bets:', error);
      return [];
    }
  }

  /**
   * Claim winnings for resolved bet
   */
  async claimWinnings(betId: string): Promise<ClaimResult> {
    try {
      const bet = await prisma.marketBet.findUnique({
        where: { id: betId },
        include: { externalMarket: true },
      });

      if (!bet) {
        return {
          success: false,
          error: 'Bet not found',
        };
      }

      if (bet.status !== 'placed') {
        return {
          success: false,
          error: `Cannot claim bet with status: ${bet.status}`,
        };
      }

      // Check if market is resolved
      if (bet.externalMarket.status !== 'resolved') {
        return {
          success: false,
          error: 'Market not yet resolved',
        };
      }

      if (!bet.externalMarket.outcome) {
        return {
          success: false,
          error: 'Market outcome not available',
        };
      }

      // Determine if bet won
      const marketOutcome = bet.externalMarket.outcome === 'yes';
      const betWon = bet.side === marketOutcome;

      if (!betWon) {
        // Bet lost - forfeit escrow funds
        const escrowLock = await escrowService.getEscrowLockByReference(betId);
        if (escrowLock) {
          const forfeitResult = await escrowService.forfeitFunds(escrowLock.id, 'bet_lost');
          if (!forfeitResult.success) {
            console.error(`[MarketBettingService] Failed to forfeit escrow for lost bet ${betId}:`, forfeitResult.error);
          }
        }

        // Log the loss for audit
        await prisma.tradeAuditLog.create({
          data: {
            userId: bet.userId,
            tradeType: 'bet',
            action: 'bet_lost',
            marketId: bet.externalMarketId,
            orderId: bet.orderId || undefined,
            amount: bet.amount.toString(),
            source: bet.source || undefined,
            success: true,
            metadata: JSON.stringify({
              betId,
              outcome: marketOutcome ? 'yes' : 'no',
              userBetSide: bet.side ? 'yes' : 'no',
            }),
          },
        });

        await prisma.marketBet.update({
          where: { id: betId },
          data: {
            status: 'lost',
            outcome: marketOutcome,
            settledAt: new Date(),
          },
        });

        console.log(`[MarketBettingService] Bet ${betId} lost - escrow forfeited`);

        return {
          success: false,
          error: 'Bet lost',
        };
      }

      // Calculate payout (shares purchased * $1 payout per share for winning outcome)
      const shares = bet.shares || 0;
      // Payout = shares * $1.00 per share, converted to token units (18 decimals)
      const payoutUSD = shares; // Each share pays $1 if correct
      const payout = BigInt(Math.floor(payoutUSD * 1e18)); // Convert to CRwN token units

      // 1. Release escrow lock (the original bet amount)
      const escrowLock = await escrowService.getEscrowLockByReference(betId);
      if (escrowLock) {
        const releaseResult = await escrowService.releaseFunds(escrowLock.id, 'bet_won');
        if (!releaseResult.success) {
          console.error(`[MarketBettingService] Failed to release escrow for bet ${betId}:`, releaseResult.error);
        }
      }

      // 2. Credit winnings to user balance
      const creditResult = await escrowService.creditFunds(
        bet.userId,
        payout,
        `Bet winnings for bet ${betId}`
      );

      if (!creditResult) {
        console.error(`[MarketBettingService] Failed to credit winnings for bet ${betId}`);
        return {
          success: false,
          error: 'Failed to credit winnings to user balance',
        };
      }

      // 3. Create settlement transaction record
      const settlement = await prisma.settlementTransaction.create({
        data: {
          recipient: bet.userId,
          amount: payout,
          type: 'BET_PAYOUT',
          status: 'completed',
          sourceType: 'bet',
          sourceId: betId,
          settledAt: new Date(),
        },
      });

      // 4. Log the settlement for audit
      await prisma.tradeAuditLog.create({
        data: {
          userId: bet.userId,
          tradeType: 'bet',
          action: 'claim_winnings',
          marketId: bet.externalMarketId,
          orderId: bet.orderId || undefined,
          amount: payout.toString(),
          source: bet.source || undefined,
          success: true,
          metadata: JSON.stringify({
            betId,
            shares,
            payoutUSD,
            settlementId: settlement.id,
            escrowReleased: !!escrowLock,
          }),
        },
      });

      // 5. Update bet status
      await prisma.marketBet.update({
        where: { id: betId },
        data: {
          status: 'won',
          outcome: marketOutcome,
          payout,
          settledAt: new Date(),
        },
      });

      console.log(`[MarketBettingService] Successfully claimed winnings for bet ${betId}: ${payoutUSD} USD`);

      return {
        success: true,
        payout,
        txHash: settlement.id,
      };
    } catch (error) {
      console.error('[MarketBettingService] Error claiming winnings:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Monitor market resolution and auto-settle bets
   */
  async monitorResolution(betId: string): Promise<void> {
    try {
      const bet = await prisma.marketBet.findUnique({
        where: { id: betId },
        include: { externalMarket: true },
      });

      if (!bet || bet.status !== 'placed') {
        return;
      }

      // Check if market resolved
      if (bet.externalMarket.status === 'resolved') {
        // Auto-claim or mark for claiming
        await this.claimWinnings(betId);
      }
    } catch (error) {
      console.error('[MarketBettingService] Error monitoring resolution:', error);
    }
  }

  // ============================================
  // PRIVATE METHODS - HELPERS
  // ============================================

  /**
   * Get external market data from database
   */
  private async getExternalMarket(marketId: string) {
    return await prisma.externalMarket.findUnique({
      where: { id: marketId }
    });
  }

  /**
   * Validate trade size limits
   */
  private validateTradeSize(amountCRwN: number): void {
    if (amountCRwN > MAX_TRADE_SIZE_CRWN) {
      throw new Error(
        `Trade size ${amountCRwN.toFixed(2)} CRwN exceeds maximum ${MAX_TRADE_SIZE_CRWN} CRwN`
      );
    }

    if (amountCRwN < 0.1) {
      throw new Error('Minimum trade size is 0.1 CRwN');
    }
  }

  /**
   * Validate user's total exposure
   */
  private async validateUserExposure(userId: string, proposedAmountCRwN: number): Promise<void> {
    // Get user's total active positions
    const activePositions = await prisma.marketBet.aggregate({
      where: {
        userId,
        status: { in: ['pending', 'filled'] }
      },
      _sum: { amount: true }
    });

    const currentExposure = parseFloat(activePositions._sum.amount || '0') / 1e18;
    const totalExposure = currentExposure + proposedAmountCRwN;

    if (totalExposure > MAX_USER_EXPOSURE_CRWN) {
      throw new Error(
        `Total exposure ${totalExposure.toFixed(2)} CRwN exceeds limit ${MAX_USER_EXPOSURE_CRWN} CRwN. ` +
        `Current exposure: ${currentExposure.toFixed(2)} CRwN`
      );
    }
  }

  /**
   * Validate price slippage
   */
  private async validateSlippage(
    marketId: string,
    side: 'YES' | 'NO',
    expectedPrice: number
  ): Promise<void> {
    // Get latest price from market
    const market = await this.getExternalMarket(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    const currentPrice = side === 'YES' ? market.yesPrice : market.noPrice;
    const currentPriceDecimal = currentPrice / 100;

    // Calculate slippage percentage
    const slippage = Math.abs((currentPriceDecimal - expectedPrice) / expectedPrice) * 100;

    if (slippage > MAX_SLIPPAGE_PERCENT) {
      throw new Error(
        `Slippage ${slippage.toFixed(2)}% exceeds maximum ${MAX_SLIPPAGE_PERCENT}%. ` +
        `Expected price: ${expectedPrice.toFixed(4)}, Current price: ${currentPriceDecimal.toFixed(4)}`
      );
    }
  }

  // ============================================
  // PRIVATE METHODS - ORDER PLACEMENT
  // ============================================

  /**
   * Place order on Polymarket
   */
  private async placePolymarketOrder(
    bet: MarketBet,
    params: PlaceBetParams
  ): Promise<{
    orderId: string;
    shares: number;
    executionPrice: number;
  }> {
    try {
      const market = await this.getExternalMarket(bet.externalMarketId);
      if (!market) {
        throw new Error('Market not found');
      }

      // Convert CRwN to USDC (1:1 for simplicity)
      const usdcAmount = Number(params.amount) / 1e18;

      // Get current price from market
      const currentPrice = params.side === 'YES' ? market.yesPrice : market.noPrice;
      const priceDecimal = currentPrice / 100;

      // Calculate size (shares)
      const size = usdcAmount / priceDecimal;

      if (size <= 0) {
        throw new Error('Insufficient amount for minimum share size');
      }

      // Check if we have a server-side wallet configured
      if (!process.env.POLYMARKET_TRADING_PRIVATE_KEY) {
        throw new Error(
          'Polymarket trading wallet not configured. Set POLYMARKET_TRADING_PRIVATE_KEY environment variable to enable real order placement.'
        );
      }

      // Import ethers dynamically to avoid bundle issues
      const { ethers } = await import('ethers');

      // Create wallet signer from private key
      const signer = new ethers.Wallet(process.env.POLYMARKET_TRADING_PRIVATE_KEY);

      // Get market condition ID from metadata
      const metadata = market.metadata ? JSON.parse(market.metadata) : {};
      const conditionId = metadata.conditionId || market.externalId;

      // Prepare order for EIP-712 signing
      const timestamp = Math.floor(Date.now() / 1000);
      const order = {
        maker: await signer.getAddress(),
        market: conditionId,
        side: params.side === 'YES' ? 0 : 1, // 0 = BUY (YES), 1 = SELL (NO)
        price: Math.round(priceDecimal * 100), // Price in cents (1-99)
        size: Math.round(size * 1e6), // Size in USDC micro-units
        nonce: timestamp,
        expiration: timestamp + 3600, // 1 hour expiry
        feeRateBps: 0, // Fee rate in basis points
        signatureType: 0 // EOA signature
      };

      // EIP-712 Domain
      const domain = {
        name: 'Polymarket CTF Exchange',
        version: '1',
        chainId: 137, // Polygon mainnet
        verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' // Polymarket CLOB contract
      };

      // EIP-712 Types
      const types = {
        Order: [
          { name: 'maker', type: 'address' },
          { name: 'market', type: 'bytes32' },
          { name: 'side', type: 'uint8' },
          { name: 'price', type: 'uint256' },
          { name: 'size', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiration', type: 'uint256' },
          { name: 'feeRateBps', type: 'uint256' },
          { name: 'signatureType', type: 'uint8' }
        ]
      };

      // Sign the order
      const signature = await signer.signTypedData(domain, types, order);

      // Submit to Polymarket CLOB API with circuit breaker protection
      const result = await polymarketCircuitBreaker.execute(async () => {
        const response = await fetch('https://clob.polymarket.com/order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.POLYMARKET_API_KEY}`
          },
          body: JSON.stringify({
            order,
            signature,
            owner: await signer.getAddress()
          })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(`Polymarket API error: ${error.message || response.statusText}`);
        }

        return await response.json();
      }, 'Polymarket order placement');

      console.log(`[Polymarket Order] Placed order ${result.orderID} for ${size.toFixed(2)} shares at ${priceDecimal.toFixed(4)}`);

      return {
        orderId: result.orderID,
        shares: result.sizeMatched || size,
        executionPrice: result.avgPrice || priceDecimal
      };
    } catch (error) {
      console.error('[Polymarket Order] Failed to place order:', error);
      throw new Error(`Failed to place Polymarket order: ${(error as Error).message}`);
    }
  }

  /**
   * Place order on Kalshi
   */
  private async placeKalshiOrder(
    bet: MarketBet,
    params: PlaceBetParams
  ): Promise<{
    orderId: string;
    shares: number;
    executionPrice: number;
  }> {
    try {
      const market = await this.getExternalMarket(bet.externalMarketId);
      if (!market) {
        throw new Error('Market not found');
      }

      // Convert CRwN to USD (1:1 for simplicity)
      const usdAmount = Number(params.amount) / 1e18;

      // Get current price from market
      const currentPrice = params.side === 'YES' ? market.yesPrice : market.noPrice;
      const priceInCents = Math.round((currentPrice / 100) * 100); // Convert to 1-99 range

      // Calculate contracts based on price
      const contracts = Math.floor((usdAmount * 100) / priceInCents);

      if (contracts <= 0) {
        throw new Error('Insufficient amount for minimum contract size');
      }

      // Get external market ID (ticker)
      const ticker = market.externalId;

      // Place real order via Kalshi Trading API with circuit breaker protection
      const { kalshiTrading } = await import('@/services/externalMarkets');
      const result = await kalshiCircuitBreaker.execute(async () => {
        return await kalshiTrading.placeOrder({
          ticker,
          side: params.side.toLowerCase() as 'yes' | 'no',
          type: 'limit',
          count: contracts,
          price: priceInCents,
          client_order_id: `${params.userId}_${Date.now()}`
        });
      }, 'Kalshi order placement');

      // Calculate actual shares and execution price
      const totalFilled = result.quantity_closed + result.quantity_open;
      const avgPrice = result.yes_price || result.no_price || priceInCents;

      console.log(`[Kalshi Order] Placed order ${result.order_id} for ${totalFilled} contracts at ${avgPrice}¢`);

      return {
        orderId: result.order_id,
        shares: totalFilled,
        executionPrice: avgPrice / 100 // Convert back to decimal
      };
    } catch (error) {
      console.error('[Kalshi Order] Failed to place order:', error);
      throw new Error(`Failed to place Kalshi order: ${(error as Error).message}`);
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const marketBettingService = new MarketBettingService();
export default marketBettingService;
