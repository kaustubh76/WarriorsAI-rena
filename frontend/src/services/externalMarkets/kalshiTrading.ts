/**
 * Kalshi Trading Service
 * Complete trading API implementation for Kalshi
 *
 * Features:
 * - Order placement (limit and market)
 * - Order cancellation
 * - Order status tracking
 * - Position management
 * - Balance queries
 */

import { kalshiAuth, KalshiAuthError } from './kalshiAuth';
import { kalshiAdaptiveRateLimiter } from '@/lib/adaptiveRateLimiter';
import { monitoredCall } from './monitoring';
import {
  validateKalshiResponse,
  KalshiOrderSchema,
  KalshiOrdersResponseSchema,
  KalshiPositionsResponseSchema,
  KalshiBalanceSchema,
  KalshiCreateOrderResponseSchema,
  type ValidatedKalshiOrder,
  type ValidatedKalshiPosition,
  type ValidatedKalshiBalance,
} from './schemas/kalshiSchemas';

// ============================================
// CONSTANTS
// ============================================

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// ============================================
// TYPES
// ============================================

export interface KalshiOrderRequest {
  ticker: string;
  side: 'yes' | 'no';
  type: 'limit' | 'market';
  count: number;
  price?: number; // Required for limit orders (cents, 1-99)
  expiration_ts?: number; // Optional order expiration (Unix timestamp)
  client_order_id?: string; // For idempotency
}

export type KalshiOrder = ValidatedKalshiOrder;
export type KalshiPosition = ValidatedKalshiPosition;
export type KalshiBalance = ValidatedKalshiBalance;

// ============================================
// ERROR CLASS
// ============================================

export class KalshiOrderError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'KalshiOrderError';
  }
}

// ============================================
// TRADING SERVICE CLASS
// ============================================

class KalshiTradingService {
  /**
   * Place a new order
   */
  async placeOrder(order: KalshiOrderRequest): Promise<KalshiOrder> {
    return monitoredCall(
      'kalshi',
      'placeOrder',
      async () => {
        // Validate order
        this.validateOrder(order);

        await kalshiAdaptiveRateLimiter.acquire();
        const headers = await kalshiAuth.getAuthHeaders();

        const response = await fetch(`${KALSHI_API_BASE}/portfolio/orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ticker: order.ticker,
            action: 'buy', // Kalshi uses buy/sell for action
            side: order.side,
            type: order.type,
            count: order.count,
            ...(order.type === 'limit' && { yes_price: order.price }),
            ...(order.expiration_ts && { expiration_ts: order.expiration_ts }),
            ...(order.client_order_id && {
              client_order_id: order.client_order_id,
            }),
          }),
        });

        kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

        if (!response.ok) {
          await this.handleOrderError(response);
        }

        const data = await validateKalshiResponse(
          response,
          KalshiCreateOrderResponseSchema,
          'KalshiTrading.placeOrder'
        );

        return data.order;
      },
      { ticker: order.ticker, side: order.side, type: order.type }
    );
  }

  /**
   * Cancel an existing order
   */
  async cancelOrder(orderId: string): Promise<void> {
    return monitoredCall('kalshi', 'cancelOrder', async () => {
      await kalshiAdaptiveRateLimiter.acquire();
      const headers = await kalshiAuth.getAuthHeaders();

      const response = await fetch(
        `${KALSHI_API_BASE}/portfolio/orders/${orderId}`,
        {
          method: 'DELETE',
          headers,
        }
      );

      kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        throw new KalshiOrderError(
          'CANCEL_FAILED',
          `Failed to cancel order: ${response.status} - ${errorText}`,
          response.status
        );
      }
    });
  }

  /**
   * Get order status by ID
   */
  async getOrder(orderId: string): Promise<KalshiOrder> {
    return monitoredCall('kalshi', 'getOrder', async () => {
      await kalshiAdaptiveRateLimiter.acquire();
      const headers = await kalshiAuth.getAuthHeaders();

      const response = await fetch(
        `${KALSHI_API_BASE}/portfolio/orders/${orderId}`,
        {
          method: 'GET',
          headers,
        }
      );

      kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

      if (!response.ok) {
        throw new KalshiOrderError(
          'GET_ORDER_FAILED',
          `Failed to get order: ${response.status}`,
          response.status
        );
      }

      const data = await validateKalshiResponse(
        response,
        KalshiCreateOrderResponseSchema,
        'KalshiTrading.getOrder'
      );

      return data.order;
    });
  }

  /**
   * Get all open orders, optionally filtered by ticker
   */
  async getOpenOrders(ticker?: string): Promise<KalshiOrder[]> {
    return monitoredCall('kalshi', 'getOpenOrders', async () => {
      await kalshiAdaptiveRateLimiter.acquire();
      const headers = await kalshiAuth.getAuthHeaders();

      const params = new URLSearchParams({ status: 'resting' });
      if (ticker) params.set('ticker', ticker);

      const response = await fetch(
        `${KALSHI_API_BASE}/portfolio/orders?${params}`,
        {
          method: 'GET',
          headers,
        }
      );

      kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

      if (!response.ok) {
        throw new KalshiOrderError(
          'GET_ORDERS_FAILED',
          `Failed to get orders: ${response.status}`,
          response.status
        );
      }

      const data = await validateKalshiResponse(
        response,
        KalshiOrdersResponseSchema,
        'KalshiTrading.getOpenOrders'
      );

      return data.orders;
    });
  }

  /**
   * Get all orders (including filled, cancelled)
   */
  async getAllOrders(
    status?: 'resting' | 'canceled' | 'executed' | 'pending',
    limit: number = 100
  ): Promise<KalshiOrder[]> {
    return monitoredCall('kalshi', 'getAllOrders', async () => {
      await kalshiAdaptiveRateLimiter.acquire();
      const headers = await kalshiAuth.getAuthHeaders();

      const params = new URLSearchParams({ limit: limit.toString() });
      if (status) params.set('status', status);

      const response = await fetch(
        `${KALSHI_API_BASE}/portfolio/orders?${params}`,
        {
          method: 'GET',
          headers,
        }
      );

      kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

      if (!response.ok) {
        throw new KalshiOrderError(
          'GET_ORDERS_FAILED',
          `Failed to get orders: ${response.status}`,
          response.status
        );
      }

      const data = await validateKalshiResponse(
        response,
        KalshiOrdersResponseSchema,
        'KalshiTrading.getAllOrders'
      );

      return data.orders;
    });
  }

  /**
   * Get portfolio positions
   */
  async getPositions(): Promise<KalshiPosition[]> {
    return monitoredCall('kalshi', 'getPositions', async () => {
      await kalshiAdaptiveRateLimiter.acquire();
      const headers = await kalshiAuth.getAuthHeaders();

      const response = await fetch(`${KALSHI_API_BASE}/portfolio/positions`, {
        method: 'GET',
        headers,
      });

      kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

      if (!response.ok) {
        throw new KalshiOrderError(
          'GET_POSITIONS_FAILED',
          `Failed to get positions: ${response.status}`,
          response.status
        );
      }

      const data = await validateKalshiResponse(
        response,
        KalshiPositionsResponseSchema,
        'KalshiTrading.getPositions'
      );

      return data.market_positions;
    });
  }

  /**
   * Get position for a specific ticker
   */
  async getPosition(ticker: string): Promise<KalshiPosition | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.ticker === ticker) || null;
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<KalshiBalance> {
    return monitoredCall('kalshi', 'getBalance', async () => {
      await kalshiAdaptiveRateLimiter.acquire();
      const headers = await kalshiAuth.getAuthHeaders();

      const response = await fetch(`${KALSHI_API_BASE}/portfolio/balance`, {
        method: 'GET',
        headers,
      });

      kalshiAdaptiveRateLimiter.updateFromHeaders(response.headers);

      if (!response.ok) {
        throw new KalshiOrderError(
          'GET_BALANCE_FAILED',
          `Failed to get balance: ${response.status}`,
          response.status
        );
      }

      const data = await validateKalshiResponse(
        response,
        KalshiBalanceSchema,
        'KalshiTrading.getBalance'
      );

      return data;
    });
  }

  /**
   * Cancel all open orders, optionally filtered by ticker
   */
  async cancelAllOrders(ticker?: string): Promise<number> {
    const openOrders = await this.getOpenOrders(ticker);
    let cancelledCount = 0;

    for (const order of openOrders) {
      try {
        await this.cancelOrder(order.order_id);
        cancelledCount++;
      } catch (err) {
        console.error(`Failed to cancel order ${order.order_id}:`, err);
      }
    }

    return cancelledCount;
  }

  /**
   * Validate order before submission
   */
  private validateOrder(order: KalshiOrderRequest): void {
    if (!order.ticker) {
      throw new KalshiOrderError('INVALID_ORDER', 'Order ticker is required');
    }
    if (!['yes', 'no'].includes(order.side)) {
      throw new KalshiOrderError(
        'INVALID_ORDER',
        'Order side must be "yes" or "no"'
      );
    }
    if (!['limit', 'market'].includes(order.type)) {
      throw new KalshiOrderError(
        'INVALID_ORDER',
        'Order type must be "limit" or "market"'
      );
    }
    if (order.count < 1) {
      throw new KalshiOrderError(
        'INVALID_ORDER',
        'Order count must be at least 1'
      );
    }
    if (order.type === 'limit') {
      if (!order.price || order.price < 1 || order.price > 99) {
        throw new KalshiOrderError(
          'INVALID_ORDER',
          'Limit order price must be between 1 and 99 cents'
        );
      }
    }
  }

  /**
   * Handle order API errors
   */
  private async handleOrderError(response: Response): Promise<never> {
    let errorMessage = `Order failed: ${response.status}`;
    let errorCode = 'UNKNOWN';

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;

      // Handle specific error codes
      if (response.status === 400) {
        errorCode = 'INVALID_ORDER';
      } else if (response.status === 401) {
        kalshiAuth.invalidateToken();
        errorCode = 'AUTH_EXPIRED';
        errorMessage = 'Authentication expired';
      } else if (response.status === 403) {
        errorCode = 'FORBIDDEN';
        errorMessage = 'Not authorized for this operation';
      } else if (response.status === 422) {
        errorCode = 'INSUFFICIENT_FUNDS';
      } else if (response.status === 429) {
        errorCode = 'RATE_LIMITED';
      }
    } catch (e) {
      // JSON parse failed, use default message
    }

    throw new KalshiOrderError(errorCode, errorMessage, response.status);
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const kalshiTrading = new KalshiTradingService();

// Export class for custom instances
export { KalshiTradingService };
