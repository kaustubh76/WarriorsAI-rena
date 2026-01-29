/**
 * Order Execution Service
 * Unified order placement and monitoring across Polymarket and Kalshi
 *
 * PRODUCTION IMPLEMENTATION - Uses real trading APIs
 */

import { prisma } from '@/lib/prisma';
import { kalshiTrading, kalshiService } from '../externalMarkets';
import { kalshiCircuitBreaker, polymarketCircuitBreaker } from './tradingCircuitBreaker';

// ============================================
// TYPES
// ============================================

export interface OrderParams {
  marketId: string; // External market ID (in our DB format: poly_xxx or kalshi_xxx)
  source: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  amount: number; // USD amount
  orderType?: 'market' | 'limit';
  limitPrice?: number; // For limit orders (0-1)
  userId?: string; // For audit logging
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  shares?: number;
  executionPrice?: number;
  status?: 'pending' | 'filled' | 'partially_filled';
  error?: string;
}

export interface OrderStatus {
  orderId: string;
  status: 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'failed';
  shares?: number;
  filledShares?: number;
  fillPercentage?: number;
  executionPrice?: number;
  timestamp?: number;
}

// ============================================
// ORDER EXECUTION SERVICE
// ============================================

class OrderExecutionService {
  /**
   * Place order on Polymarket using CLOB API
   */
  async placePolymarketOrder(params: OrderParams): Promise<OrderResult> {
    try {
      // Validate params
      if (params.source !== 'polymarket') {
        return {
          success: false,
          error: 'Invalid source for Polymarket order',
        };
      }

      // Get market data from database
      const market = await prisma.externalMarket.findUnique({
        where: { id: params.marketId },
      });

      if (!market) {
        return { success: false, error: 'Market not found in database' };
      }

      // Check if Polymarket trading wallet is configured
      if (!process.env.POLYMARKET_TRADING_PRIVATE_KEY) {
        return {
          success: false,
          error: 'Polymarket trading wallet not configured. Set POLYMARKET_TRADING_PRIVATE_KEY environment variable.',
        };
      }

      // Import ethers dynamically to avoid bundle issues
      const { ethers } = await import('ethers');

      // Create wallet signer from private key
      const signer = new ethers.Wallet(process.env.POLYMARKET_TRADING_PRIVATE_KEY);

      // Get current price from market
      const currentPrice = params.side === 'YES' ? market.yesPrice : market.noPrice;
      const priceDecimal = currentPrice / 10000; // Convert from basis points

      // Use limit price if provided, otherwise use market price
      const orderPrice = params.limitPrice ?? priceDecimal;

      // Calculate size (shares)
      const size = params.amount / orderPrice;

      if (size <= 0) {
        return { success: false, error: 'Insufficient amount for minimum share size' };
      }

      // Get market condition ID from metadata
      const metadata = market.metadata ? JSON.parse(market.metadata) : {};
      const conditionId = metadata.conditionId || market.externalId;

      // Prepare order for EIP-712 signing
      const timestamp = Math.floor(Date.now() / 1000);
      const order = {
        maker: await signer.getAddress(),
        market: conditionId,
        side: params.side === 'YES' ? 0 : 1, // 0 = BUY YES, 1 = BUY NO
        price: Math.round(orderPrice * 100), // Price in cents (1-99)
        size: Math.round(size * 1e6), // Size in USDC micro-units
        nonce: timestamp,
        expiration: timestamp + 3600, // 1 hour expiry
        feeRateBps: 0,
        signatureType: 0 // EOA signature
      };

      // EIP-712 Domain
      const domain = {
        name: 'Polymarket CTF Exchange',
        version: '1',
        chainId: 137, // Polygon mainnet
        verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
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
            ...(process.env.POLYMARKET_API_KEY && {
              'Authorization': `Bearer ${process.env.POLYMARKET_API_KEY}`
            })
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

      // Log the order
      await this.logOrderPlacement(params, result, 'polymarket');

      console.log(`[Polymarket Order] Placed order ${result.orderID} for ${size.toFixed(2)} shares at ${orderPrice.toFixed(4)}`);

      return {
        success: true,
        orderId: result.orderID,
        shares: result.sizeMatched || size,
        executionPrice: result.avgPrice || orderPrice,
        status: result.status === 'MATCHED' ? 'filled' : 'pending',
      };
    } catch (error) {
      console.error('[OrderExecutionService] Polymarket order error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Place order on Kalshi using real Trading API
   */
  async placeKalshiOrder(params: OrderParams): Promise<OrderResult> {
    try {
      // Validate params
      if (params.source !== 'kalshi') {
        return {
          success: false,
          error: 'Invalid source for Kalshi order',
        };
      }

      // Get market data from database
      const market = await prisma.externalMarket.findUnique({
        where: { id: params.marketId },
      });

      if (!market) {
        return { success: false, error: 'Market not found in database' };
      }

      // Get current price from market (stored as 0-10000 basis points)
      const currentPrice = params.side === 'YES' ? market.yesPrice : market.noPrice;
      const priceInCents = Math.round(currentPrice / 100); // Convert to 1-99 range

      // Use limit price if provided (convert from decimal to cents)
      const orderPriceInCents = params.limitPrice
        ? Math.round(params.limitPrice * 100)
        : priceInCents;

      // Calculate contracts based on price
      // Kalshi contracts cost (price/100) USD each, payout $1 if correct
      const contracts = Math.floor((params.amount * 100) / orderPriceInCents);

      if (contracts <= 0) {
        return { success: false, error: 'Insufficient amount for minimum contract size' };
      }

      // Get ticker from external ID
      const ticker = market.externalId;

      // Place real order via Kalshi Trading API with circuit breaker protection
      const result = await kalshiCircuitBreaker.execute(async () => {
        return await kalshiTrading.placeOrder({
          ticker,
          side: params.side.toLowerCase() as 'yes' | 'no',
          type: params.orderType === 'market' ? 'market' : 'limit',
          count: contracts,
          price: orderPriceInCents,
          client_order_id: params.userId ? `warriors_${params.userId}_${Date.now()}` : `warriors_${Date.now()}`
        });
      }, 'Kalshi order placement');

      // Calculate actual shares and execution price
      const totalFilled = (result.quantity_closed || 0) + (result.quantity_open || 0);
      const avgPrice = result.yes_price || result.no_price || orderPriceInCents;

      // Log the order
      await this.logOrderPlacement(params, result, 'kalshi');

      console.log(`[Kalshi Order] Placed order ${result.order_id} for ${totalFilled} contracts at ${avgPrice}¢`);

      return {
        success: true,
        orderId: result.order_id,
        shares: totalFilled,
        executionPrice: avgPrice / 100, // Convert back to decimal
        status: result.status === 'executed' ? 'filled' : 'pending',
      };
    } catch (error) {
      console.error('[OrderExecutionService] Kalshi order error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Place order on any supported platform
   */
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    if (params.source === 'polymarket') {
      return this.placePolymarketOrder(params);
    } else if (params.source === 'kalshi') {
      return this.placeKalshiOrder(params);
    } else {
      return {
        success: false,
        error: `Unsupported source: ${params.source}`,
      };
    }
  }

  /**
   * Monitor order fill status
   */
  async monitorOrder(orderId: string, source: 'polymarket' | 'kalshi'): Promise<OrderStatus> {
    try {
      if (source === 'polymarket') {
        return await this.monitorPolymarketOrder(orderId);
      } else if (source === 'kalshi') {
        return await this.monitorKalshiOrder(orderId);
      } else {
        throw new Error(`Unsupported source: ${source}`);
      }
    } catch (error) {
      console.error('[OrderExecutionService] Monitor order error:', error);
      return {
        orderId,
        status: 'failed',
      };
    }
  }

  /**
   * Monitor Polymarket order status via CLOB API
   */
  private async monitorPolymarketOrder(orderId: string): Promise<OrderStatus> {
    try {
      const response = await fetch(`https://clob.polymarket.com/order/${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.POLYMARKET_API_KEY && {
            'Authorization': `Bearer ${process.env.POLYMARKET_API_KEY}`
          })
        }
      });

      if (!response.ok) {
        console.error(`[OrderExecutionService] Failed to fetch Polymarket order ${orderId} status: ${response.statusText}`);
        return { orderId, status: 'failed' };
      }

      const order = await response.json();

      // Map Polymarket status to our status
      let status: OrderStatus['status'] = 'pending';
      if (order.status === 'MATCHED' || order.status === 'FILLED') {
        status = 'filled';
      } else if (order.status === 'CANCELLED') {
        status = 'cancelled';
      } else if (order.sizeMatched > 0 && order.sizeMatched < order.originalSize) {
        status = 'partially_filled';
      }

      return {
        orderId,
        status,
        shares: order.originalSize || 0,
        filledShares: order.sizeMatched || 0,
        fillPercentage: order.originalSize > 0
          ? (order.sizeMatched / order.originalSize) * 100
          : 0,
        executionPrice: order.avgPrice || 0,
        timestamp: order.timestamp ? new Date(order.timestamp).getTime() : Date.now(),
      };
    } catch (error) {
      console.error('[OrderExecutionService] Error monitoring Polymarket order:', error);
      return { orderId, status: 'failed' };
    }
  }

  /**
   * Monitor Kalshi order status via real Trading API
   */
  private async monitorKalshiOrder(orderId: string): Promise<OrderStatus> {
    try {
      // Use the real kalshiTrading.getOrder() method
      const order = await kalshiTrading.getOrder(orderId);

      // Map Kalshi status to our status
      let status: OrderStatus['status'] = 'pending';
      if (order.status === 'executed') {
        status = 'filled';
      } else if (order.status === 'canceled') {
        status = 'cancelled';
      } else if (order.status === 'resting') {
        status = order.quantity_closed > 0 ? 'partially_filled' : 'pending';
      }

      const totalQuantity = (order.quantity_closed || 0) + (order.quantity_open || 0);

      return {
        orderId,
        status,
        shares: totalQuantity,
        filledShares: order.quantity_closed || 0,
        fillPercentage: totalQuantity > 0
          ? ((order.quantity_closed || 0) / totalQuantity) * 100
          : 0,
        executionPrice: (order.yes_price || order.no_price || 0) / 100,
        timestamp: order.created_time ? new Date(order.created_time).getTime() : Date.now(),
      };
    } catch (error) {
      console.error('[OrderExecutionService] Error monitoring Kalshi order:', error);
      return { orderId, status: 'failed' };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, source: 'polymarket' | 'kalshi'): Promise<boolean> {
    try {
      if (source === 'polymarket') {
        return await this.cancelPolymarketOrder(orderId);
      } else if (source === 'kalshi') {
        return await this.cancelKalshiOrder(orderId);
      } else {
        throw new Error(`Unsupported source: ${source}`);
      }
    } catch (error) {
      console.error('[OrderExecutionService] Cancel order error:', error);
      return false;
    }
  }

  /**
   * Cancel Polymarket order via CLOB API
   */
  private async cancelPolymarketOrder(orderId: string): Promise<boolean> {
    try {
      if (!process.env.POLYMARKET_TRADING_PRIVATE_KEY) {
        console.error('[OrderExecutionService] Cannot cancel: Polymarket trading wallet not configured');
        return false;
      }

      const { ethers } = await import('ethers');
      const signer = new ethers.Wallet(process.env.POLYMARKET_TRADING_PRIVATE_KEY);

      // Prepare cancellation request with signature
      const timestamp = Math.floor(Date.now() / 1000);
      const message = JSON.stringify({ orderID: orderId, timestamp });
      const signature = await signer.signMessage(message);

      const response = await fetch(`https://clob.polymarket.com/order`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.POLYMARKET_API_KEY && {
            'Authorization': `Bearer ${process.env.POLYMARKET_API_KEY}`
          }),
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
        console.error(`[OrderExecutionService] Polymarket cancel failed: ${error.message}`);
        return false;
      }

      console.log(`[OrderExecutionService] Cancelled Polymarket order: ${orderId}`);
      return true;
    } catch (error) {
      console.error('[OrderExecutionService] Error cancelling Polymarket order:', error);
      return false;
    }
  }

  /**
   * Cancel Kalshi order via real Trading API
   */
  private async cancelKalshiOrder(orderId: string): Promise<boolean> {
    try {
      // Use the real kalshiTrading.cancelOrder() method
      await kalshiTrading.cancelOrder(orderId);
      console.log(`[OrderExecutionService] Cancelled Kalshi order: ${orderId}`);
      return true;
    } catch (error) {
      console.error('[OrderExecutionService] Error cancelling Kalshi order:', error);
      return false;
    }
  }

  /**
   * Get best available price for a market
   */
  async getBestPrice(
    marketId: string,
    source: 'polymarket' | 'kalshi',
    side: 'YES' | 'NO'
  ): Promise<number | null> {
    try {
      // Get market from database (which has recent synced prices)
      const market = await prisma.externalMarket.findUnique({
        where: { id: marketId },
      });

      if (!market) return null;

      // Return price as decimal (0-1)
      const price = side === 'YES' ? market.yesPrice : market.noPrice;
      return price / 10000; // Convert from basis points
    } catch (error) {
      console.error('[OrderExecutionService] Get best price error:', error);
      return null;
    }
  }

  /**
   * Estimate execution price including slippage
   */
  async estimateExecutionPrice(
    marketId: string,
    source: 'polymarket' | 'kalshi',
    side: 'YES' | 'NO',
    amount: number
  ): Promise<{
    price: number;
    shares: number;
    slippage: number;
  } | null> {
    try {
      const bestPrice = await this.getBestPrice(marketId, source, side);
      if (!bestPrice) return null;

      // Estimate slippage based on order size
      // Larger orders have higher slippage
      let slippage = 0.005; // 0.5% base slippage
      if (amount > 100) slippage = 0.01; // 1%
      if (amount > 500) slippage = 0.02; // 2%
      if (amount > 1000) slippage = 0.03; // 3%

      const effectivePrice = bestPrice * (1 + slippage);
      const shares = amount / effectivePrice;

      return {
        price: effectivePrice,
        shares,
        slippage,
      };
    } catch (error) {
      console.error('[OrderExecutionService] Estimate execution error:', error);
      return null;
    }
  }

  /**
   * Batch place multiple orders
   */
  async batchPlaceOrders(orders: OrderParams[]): Promise<OrderResult[]> {
    try {
      // Execute all orders in parallel
      const results = await Promise.all(
        orders.map((order) => this.placeOrder(order))
      );
      return results;
    } catch (error) {
      console.error('[OrderExecutionService] Batch place orders error:', error);
      return orders.map(() => ({
        success: false,
        error: 'Batch execution failed',
      }));
    }
  }

  /**
   * Get order history for a user from database
   */
  async getOrderHistory(
    userId: string,
    source?: 'polymarket' | 'kalshi',
    limit: number = 50
  ): Promise<OrderStatus[]> {
    try {
      const where: Record<string, unknown> = { userId };
      if (source) where.source = source;

      const bets = await prisma.marketBet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return bets.map(bet => ({
        orderId: bet.orderId || bet.id,
        status: this.mapBetStatusToOrderStatus(bet.status),
        shares: bet.shares || 0,
        filledShares: bet.status === 'placed' || bet.status === 'won' || bet.status === 'lost'
          ? (bet.shares || 0)
          : 0,
        fillPercentage: bet.status === 'placed' || bet.status === 'won' || bet.status === 'lost'
          ? 100
          : 0,
        executionPrice: bet.entryPrice,
        timestamp: bet.placedAt?.getTime() || bet.createdAt.getTime(),
      }));
    } catch (error) {
      console.error('[OrderExecutionService] Get order history error:', error);
      return [];
    }
  }

  /**
   * Map bet status to order status
   */
  private mapBetStatusToOrderStatus(betStatus: string): OrderStatus['status'] {
    switch (betStatus) {
      case 'pending':
        return 'pending';
      case 'placed':
      case 'won':
      case 'lost':
        return 'filled';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'failed';
    }
  }

  /**
   * Log order placement for audit trail
   */
  private async logOrderPlacement(
    params: OrderParams,
    result: unknown,
    source: 'polymarket' | 'kalshi'
  ): Promise<void> {
    try {
      await prisma.tradeAuditLog.create({
        data: {
          userId: params.userId || 'system',
          tradeType: 'bet',
          action: 'place_order',
          marketId: params.marketId,
          orderId: (result as { orderID?: string; order_id?: string })?.orderID ||
                   (result as { orderID?: string; order_id?: string })?.order_id ||
                   'unknown',
          amount: params.amount.toString(),
          source,
          side: params.side,
          success: true,
          metadata: JSON.stringify({ params, result }),
        },
      });
    } catch (error) {
      console.error('[OrderExecutionService] Failed to log order:', error);
      // Don't throw - logging failure shouldn't break order execution
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const orderExecutionService = new OrderExecutionService();
export default orderExecutionService;
