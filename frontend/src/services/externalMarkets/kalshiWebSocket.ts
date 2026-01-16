/**
 * Kalshi WebSocket Manager
 * Real-time data streaming from Kalshi Trade API
 *
 * Features:
 * - Authenticated WebSocket connection
 * - Orderbook subscriptions
 * - Trade subscriptions
 * - Market status updates
 * - Automatic reconnection
 */

import { kalshiAuth } from './kalshiAuth';
import { externalMarketMonitor } from './monitoring';

// ============================================
// TYPES
// ============================================

export interface KalshiWSMessage {
  type:
    | 'orderbook'
    | 'trade'
    | 'market_status'
    | 'subscribed'
    | 'unsubscribed'
    | 'error'
    | 'auth_success'
    | 'ping'
    | 'pong';
  ticker?: string;
  data?: KalshiOrderbookData | KalshiTradeData | KalshiMarketStatusData;
  error?: string;
  msg?: string;
  channel?: string;
}

export interface KalshiOrderbookData {
  ticker: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
}

export interface KalshiTradeData {
  ticker: string;
  trade_id: string;
  price: number;
  count: number;
  taker_side: 'yes' | 'no';
  created_time: string;
}

export interface KalshiMarketStatusData {
  ticker: string;
  status: 'open' | 'closed' | 'settled';
  result?: 'yes' | 'no';
}

type KalshiWSCallback = (msg: KalshiWSMessage) => void;

// ============================================
// WEBSOCKET MANAGER CLASS
// ============================================

class KalshiWebSocketManager {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<KalshiWSCallback>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionState: 'disconnected' | 'connecting' | 'connected' =
    'disconnected';
  private isAuthenticated = false;

  /**
   * Connect to Kalshi WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected' && this.isAuthenticated) {
      return;
    }

    if (this.connectionState === 'connecting') {
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.connectionState === 'connected' && this.isAuthenticated) {
            clearInterval(checkInterval);
            resolve();
          } else if (this.connectionState === 'disconnected') {
            clearInterval(checkInterval);
            reject(new Error('Connection failed'));
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (this.connectionState !== 'connected') {
            reject(new Error('Connection timeout'));
          }
        }, 15000);
      });
    }

    this.connectionState = 'connecting';
    this.isAuthenticated = false;

    // Get auth token first
    const token = await kalshiAuth.getValidToken();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(
          `wss://api.elections.kalshi.com/trade-api/ws/v2`
        );

        this.ws.onopen = () => {
          console.log('[Kalshi WS] Connected, authenticating...');

          // Send authentication message
          this.ws!.send(
            JSON.stringify({
              type: 'auth',
              token: token,
            })
          );
        };

        this.ws.onmessage = (event) => {
          const msg: KalshiWSMessage = JSON.parse(event.data);

          // Handle auth response
          if (msg.type === 'auth_success') {
            console.log('[Kalshi WS] Authenticated');
            this.connectionState = 'connected';
            this.isAuthenticated = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.resubscribeAll();
            externalMarketMonitor.setWebSocketConnected('kalshi', true);
            resolve();
            return;
          }

          // Handle pong
          if (msg.type === 'pong') {
            return;
          }

          // Handle subscription confirmations
          if (msg.type === 'subscribed') {
            console.log(
              `[Kalshi WS] Subscribed to ${msg.channel}:${msg.ticker}`
            );
            return;
          }

          // Handle errors
          if (msg.type === 'error') {
            console.error('[Kalshi WS] Error:', msg.error || msg.msg);
            if (
              msg.error?.includes('auth') ||
              msg.msg?.includes('unauthorized')
            ) {
              this.handleAuthError();
            }
            return;
          }

          // Route to subscribers
          if (msg.ticker) {
            this.notifySubscribers(msg);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[Kalshi WS] Error:', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log(
            `[Kalshi WS] Closed: ${event.code} - ${event.reason || 'No reason'}`
          );
          this.connectionState = 'disconnected';
          this.isAuthenticated = false;
          this.stopHeartbeat();
          externalMarketMonitor.setWebSocketConnected('kalshi', false);
          this.scheduleReconnect();
        };

        // Auth timeout
        setTimeout(() => {
          if (!this.isAuthenticated) {
            this.ws?.close();
            this.connectionState = 'disconnected';
            reject(new Error('WebSocket authentication timeout'));
          }
        }, 10000);
      } catch (error) {
        this.connectionState = 'disconnected';
        reject(error);
      }
    });
  }

  /**
   * Subscribe to orderbook updates for a ticker
   */
  subscribeToOrderbook(
    ticker: string,
    callback: KalshiWSCallback
  ): () => void {
    const key = `orderbook:${ticker}`;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
      this.sendSubscription(ticker, 'orderbook');
    }
    this.subscriptions.get(key)!.add(callback);

    return () => this.unsubscribe(key, callback);
  }

  /**
   * Subscribe to trade updates for a ticker
   */
  subscribeToTrades(ticker: string, callback: KalshiWSCallback): () => void {
    const key = `trade:${ticker}`;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
      this.sendSubscription(ticker, 'trade');
    }
    this.subscriptions.get(key)!.add(callback);

    return () => this.unsubscribe(key, callback);
  }

  /**
   * Subscribe to market status updates
   */
  subscribeToMarketStatus(
    ticker: string,
    callback: KalshiWSCallback
  ): () => void {
    const key = `market_status:${ticker}`;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
      this.sendSubscription(ticker, 'market_status');
    }
    this.subscriptions.get(key)!.add(callback);

    return () => this.unsubscribe(key, callback);
  }

  /**
   * Send subscription message to server
   */
  private sendSubscription(ticker: string, channel: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          channels: [channel],
          market_tickers: [ticker],
        })
      );
    }
  }

  /**
   * Unsubscribe from a channel
   */
  private unsubscribe(key: string, callback: KalshiWSCallback): void {
    const callbacks = this.subscriptions.get(key);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(key);
        // Send unsubscribe message
        const [channel, ticker] = key.split(':');
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'unsubscribe',
              channels: [channel],
              market_tickers: [ticker],
            })
          );
        }
      }
    }
  }

  /**
   * Notify subscribers of a message
   */
  private notifySubscribers(msg: KalshiWSMessage): void {
    if (!msg.ticker) return;

    // Check all relevant keys
    const keys = [
      `${msg.type}:${msg.ticker}`,
      `orderbook:${msg.ticker}`,
      `trade:${msg.ticker}`,
      `market_status:${msg.ticker}`,
    ];

    for (const key of keys) {
      const callbacks = this.subscriptions.get(key);
      callbacks?.forEach((cb) => {
        try {
          cb(msg);
        } catch (err) {
          console.error('[Kalshi WS] Callback error:', err);
        }
      });
    }
  }

  /**
   * Start heartbeat ping mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle authentication errors
   */
  private async handleAuthError(): Promise<void> {
    kalshiAuth.invalidateToken();
    this.isAuthenticated = false;
    await this.reconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Kalshi WS] Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      60000
    );
    this.reconnectAttempts++;

    console.log(
      `[Kalshi WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        console.error('[Kalshi WS] Reconnection failed:', err);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Force reconnection
   */
  private async reconnect(): Promise<void> {
    this.ws?.close();
    this.connectionState = 'disconnected';
    await this.connect();
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  private resubscribeAll(): void {
    for (const key of this.subscriptions.keys()) {
      const [channel, ticker] = key.split(':');
      this.sendSubscription(ticker, channel);
    }
  }

  /**
   * Get connection state
   */
  getState(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionState;
  }

  /**
   * Check if connected and authenticated
   */
  isConnected(): boolean {
    return this.connectionState === 'connected' && this.isAuthenticated;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.subscriptions.clear();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connectionState = 'disconnected';
    this.isAuthenticated = false;
    externalMarketMonitor.setWebSocketConnected('kalshi', false);
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const kalshiWS = new KalshiWebSocketManager();

// Export class for custom instances
export { KalshiWebSocketManager };
