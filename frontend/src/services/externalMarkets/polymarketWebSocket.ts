/**
 * Robust Polymarket WebSocket Manager
 * Production-ready WebSocket connection with:
 * - Heartbeat/ping-pong mechanism
 * - Automatic reconnection with exponential backoff
 * - Message queue for offline periods
 * - Callback memory management
 * - Resubscription after reconnect
 */

import { externalMarketMonitor } from './monitoring';

// ============================================
// TYPES
// ============================================

export interface WebSocketConfig {
  url: string;
  heartbeatInterval: number;
  reconnectMaxDelay: number;
  maxReconnectAttempts: number;
}

export type PriceCallback = (data: PolymarketPriceData) => void;

export interface PolymarketPriceData {
  type?: string;
  asset_id?: string;
  token_id?: string;
  price?: string;
  timestamp?: number;
  bid?: string;
  ask?: string;
  last_price?: string;
  market?: string;
  error?: string;
}

interface QueuedMessage {
  type: 'subscribe' | 'unsubscribe';
  tokenId: string;
}

// ============================================
// WEBSOCKET MANAGER CLASS
// ============================================

class RobustWebSocketManager {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private subscriptions = new Map<string, Set<PriceCallback>>();
  private messageQueue: QueuedMessage[] = [];
  private isReconnecting = false;
  private lastPongTime = 0;
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(private config: WebSocketConfig) {}

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected') {
      return;
    }

    if (this.connectionState === 'connecting') {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.connectionState === 'connected') {
            clearInterval(checkInterval);
            resolve();
          } else if (this.connectionState === 'disconnected') {
            clearInterval(checkInterval);
            reject(new Error('Connection failed'));
          }
        }, 100);

        // Timeout after 15 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if (this.connectionState !== 'connected') {
            reject(new Error('Connection timeout'));
          }
        }, 15000);
      });
    }

    this.connectionState = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          console.log('[Polymarket WS] Connected');
          this.connectionState = 'connected';
          this.reconnectAttempts = 0;
          this.lastPongTime = Date.now();
          this.startHeartbeat();
          this.resubscribeAll();
          this.flushMessageQueue();
          externalMarketMonitor.setWebSocketConnected('polymarket', true);
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          console.error('[Polymarket WS] Error:', error);
          this.notifySubscribersOfError(new Error('WebSocket error'));
        };

        this.ws.onclose = (event) => {
          console.log(
            `[Polymarket WS] Closed: ${event.code} - ${event.reason || 'No reason'}`
          );
          this.connectionState = 'disconnected';
          this.stopHeartbeat();
          externalMarketMonitor.setWebSocketConnected('polymarket', false);
          this.scheduleReconnect();
        };

        // Connection timeout
        setTimeout(() => {
          if (this.connectionState !== 'connected') {
            this.ws?.close();
            this.connectionState = 'disconnected';
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        this.connectionState = 'disconnected';
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data: PolymarketPriceData = JSON.parse(event.data);

      // Handle pong response
      if (data.type === 'pong') {
        this.lastPongTime = Date.now();
        return;
      }

      // Route to subscribers
      const tokenId = data.asset_id || data.token_id;
      if (tokenId && this.subscriptions.has(tokenId)) {
        const callbacks = this.subscriptions.get(tokenId);
        callbacks?.forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error('[Polymarket WS] Callback error:', err);
          }
        });
      }

      // Also check for market-based routing
      if (data.market && this.subscriptions.has(data.market)) {
        const callbacks = this.subscriptions.get(data.market);
        callbacks?.forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error('[Polymarket WS] Callback error:', err);
          }
        });
      }
    } catch (err) {
      console.error('[Polymarket WS] Failed to parse message:', err);
    }
  }

  /**
   * Start heartbeat ping/pong mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Check if we've received a pong recently
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > this.config.heartbeatInterval * 2) {
          console.warn('[Polymarket WS] Heartbeat timeout, reconnecting...');
          this.ws?.close(4000, 'Heartbeat timeout');
          return;
        }

        // Send ping
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isReconnecting) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[Polymarket WS] Max reconnection attempts reached');
      this.notifySubscribersOfDisconnect();
      return;
    }

    this.isReconnecting = true;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay
    );

    console.log(
      `[Polymarket WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`
    );

    setTimeout(async () => {
      this.reconnectAttempts++;
      this.isReconnecting = false;
      try {
        await this.connect();
      } catch (err) {
        console.error('[Polymarket WS] Reconnection failed:', err);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Resubscribe to all active subscriptions after reconnect
   */
  private resubscribeAll(): void {
    for (const tokenId of this.subscriptions.keys()) {
      this.sendSubscription(tokenId);
    }
  }

  /**
   * Send subscription message to server
   */
  private sendSubscription(tokenId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          channel: 'price',
          assets: [tokenId],
        })
      );
    } else {
      this.messageQueue.push({ type: 'subscribe', tokenId });
    }
  }

  /**
   * Send unsubscription message to server
   */
  private sendUnsubscription(tokenId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: 'price',
          assets: [tokenId],
        })
      );
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    while (
      this.messageQueue.length > 0 &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      const msg = this.messageQueue.shift();
      if (msg?.type === 'subscribe') {
        this.sendSubscription(msg.tokenId);
      }
    }
  }

  /**
   * Subscribe to price updates for a token
   * @returns Unsubscribe function
   */
  subscribe(tokenId: string, callback: PriceCallback): () => void {
    if (!this.subscriptions.has(tokenId)) {
      this.subscriptions.set(tokenId, new Set());
      this.sendSubscription(tokenId);
    }
    this.subscriptions.get(tokenId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.unsubscribe(tokenId, callback);
    };
  }

  /**
   * Unsubscribe from price updates
   */
  private unsubscribe(tokenId: string, callback: PriceCallback): void {
    const callbacks = this.subscriptions.get(tokenId);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(tokenId);
        this.sendUnsubscription(tokenId);
      }
    }
  }

  /**
   * Notify all subscribers of an error
   */
  private notifySubscribersOfError(error: Error): void {
    for (const [tokenId, callbacks] of this.subscriptions) {
      callbacks.forEach((cb) => {
        try {
          cb({ type: 'error', error: error.message, token_id: tokenId });
        } catch {
          // Ignore callback errors
        }
      });
    }
  }

  /**
   * Notify all subscribers that connection is permanently lost
   */
  private notifySubscribersOfDisconnect(): void {
    for (const [tokenId, callbacks] of this.subscriptions) {
      callbacks.forEach((cb) => {
        try {
          cb({ type: 'disconnected', token_id: tokenId });
        } catch {
          // Ignore callback errors
        }
      });
    }
  }

  /**
   * Get connection state
   */
  getState(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Get number of active subscriptions
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.subscriptions.clear();
    this.messageQueue = [];
    this.reconnectAttempts = this.config.maxReconnectAttempts; // Prevent reconnection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connectionState = 'disconnected';
    externalMarketMonitor.setWebSocketConnected('polymarket', false);
  }

  /**
   * Reset reconnection attempts (for manual retry)
   */
  resetReconnect(): void {
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const polymarketWS = new RobustWebSocketManager({
  url: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
  heartbeatInterval: 30000, // 30 seconds
  reconnectMaxDelay: 60000, // Max 60 seconds between retries
  maxReconnectAttempts: 10,
});

// Export class for custom instances
export { RobustWebSocketManager };
