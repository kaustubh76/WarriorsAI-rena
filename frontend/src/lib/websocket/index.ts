/**
 * WebSocket Utilities
 * Real-time connection management with reconnection and heartbeat
 */

/**
 * WebSocket connection state
 */
export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * WebSocket message types
 */
export interface WSMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: number;
  id?: string;
}

/**
 * WebSocket event handlers
 */
export interface WSEventHandlers<T = unknown> {
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (message: WSMessage<T>) => void;
  onReconnect?: (attempt: number) => void;
  onStateChange?: (state: ConnectionState) => void;
}

/**
 * WebSocket manager with automatic reconnection
 */
export class WebSocketManager<T = unknown> {
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private messageQueue: WSMessage<T>[] = [];
  private handlers: WSEventHandlers<T> = {};

  constructor(
    private url: string,
    private options?: {
      reconnect?: boolean;
      reconnectInterval?: number;
      maxReconnectAttempts?: number;
      heartbeatInterval?: number;
      queueMessages?: boolean;
    }
  ) {
    this.options = {
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      queueMessages: true,
      ...options,
    };
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateState(ConnectionState.CONNECTING);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = (event) => {
        this.updateState(ConnectionState.CONNECTED);
        this.reconnectAttempts = 0;
        this.handlers.onOpen?.(event);
        this.startHeartbeat();
        this.flushMessageQueue();
      };

      this.ws.onclose = (event) => {
        this.updateState(ConnectionState.DISCONNECTED);
        this.handlers.onClose?.(event);
        this.stopHeartbeat();
        this.handleReconnect();
      };

      this.ws.onerror = (event) => {
        this.handlers.onError?.(event);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage<T>;
          this.handlers.onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.updateState(ConnectionState.FAILED);
      this.handleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.options = { ...this.options, reconnect: false };
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateState(ConnectionState.DISCONNECTED);
  }

  /**
   * Send message to server
   */
  send(type: string, payload: T): void {
    const message: WSMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      id: this.generateMessageId(),
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else if (this.options?.queueMessages) {
      this.messageQueue.push(message);
    }
  }

  /**
   * Register event handlers
   */
  on(handlers: WSEventHandlers<T>): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  private updateState(state: ConnectionState): void {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  private handleReconnect(): void {
    if (!this.options?.reconnect) return;

    const maxAttempts = this.options.maxReconnectAttempts ?? 10;
    if (this.reconnectAttempts >= maxAttempts) {
      this.updateState(ConnectionState.FAILED);
      return;
    }

    this.updateState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;

    const interval = this.options.reconnectInterval ?? 3000;
    const backoff = Math.min(interval * Math.pow(2, this.reconnectAttempts - 1), 30000);

    this.reconnectTimeout = setTimeout(() => {
      this.handlers.onReconnect?.(this.reconnectAttempts);
      this.connect();
    }, backoff);
  }

  private startHeartbeat(): void {
    const interval = this.options?.heartbeatInterval ?? 30000;
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('ping', {} as T);
      }
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a WebSocket manager instance
 */
export function createWebSocket<T = unknown>(
  url: string,
  options?: {
    reconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    heartbeatInterval?: number;
    queueMessages?: boolean;
  }
): WebSocketManager<T> {
  return new WebSocketManager<T>(url, options);
}

/**
 * WebSocket channel for pub/sub pattern
 */
export class WSChannel<T = unknown> {
  private subscriptions = new Map<string, Set<(data: T) => void>>();

  constructor(private ws: WebSocketManager<T>) {
    ws.on({
      onMessage: (message) => {
        this.emit(message.type, message.payload);
      },
    });
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string, callback: (data: T) => void): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);

    // Send subscription message to server
    this.ws.send('subscribe', { channel } as T);

    // Return unsubscribe function
    return () => {
      this.unsubscribe(channel, callback);
    };
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string, callback: (data: T) => void): void {
    const subscribers = this.subscriptions.get(channel);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.subscriptions.delete(channel);
        // Send unsubscribe message to server
        this.ws.send('unsubscribe', { channel } as T);
      }
    }
  }

  /**
   * Publish to a channel
   */
  publish(channel: string, data: T): void {
    this.ws.send('publish', { channel, data } as T);
  }

  /**
   * Emit event to local subscribers
   */
  private emit(channel: string, data: T): void {
    const subscribers = this.subscriptions.get(channel);
    if (subscribers) {
      subscribers.forEach(callback => callback(data));
    }
  }
}

/**
 * Real-time data sync helper
 */
export class RealtimeSync<T extends { id: string }> {
  private data = new Map<string, T>();
  private subscribers = new Set<(data: Map<string, T>) => void>();

  constructor(private channel: WSChannel<T>) {
    this.setupSync();
  }

  /**
   * Subscribe to data changes
   */
  subscribe(callback: (data: Map<string, T>) => void): () => void {
    this.subscribers.add(callback);
    callback(this.data);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get all data
   */
  getAll(): T[] {
    return Array.from(this.data.values());
  }

  /**
   * Get item by ID
   */
  get(id: string): T | undefined {
    return this.data.get(id);
  }

  private setupSync(): void {
    // Subscribe to create events
    this.channel.subscribe('create', (item: T) => {
      this.data.set(item.id, item);
      this.notifySubscribers();
    });

    // Subscribe to update events
    this.channel.subscribe('update', (item: T) => {
      this.data.set(item.id, item);
      this.notifySubscribers();
    });

    // Subscribe to delete events
    this.channel.subscribe('delete', (item: T) => {
      this.data.delete(item.id);
      this.notifySubscribers();
    });
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.data));
  }
}

/**
 * WebSocket connection pool for multiple endpoints
 */
export class WSConnectionPool {
  private connections = new Map<string, WebSocketManager>();

  /**
   * Get or create connection
   */
  getConnection<T = unknown>(url: string, options?: Parameters<typeof createWebSocket>[1]): WebSocketManager<T> {
    if (!this.connections.has(url)) {
      const ws = createWebSocket<T>(url, options);
      this.connections.set(url, ws as WebSocketManager);
      ws.connect();
    }
    return this.connections.get(url) as WebSocketManager<T>;
  }

  /**
   * Close connection
   */
  closeConnection(url: string): void {
    const connection = this.connections.get(url);
    if (connection) {
      connection.disconnect();
      this.connections.delete(url);
    }
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.connections.forEach(connection => connection.disconnect());
    this.connections.clear();
  }

  /**
   * Get all connections
   */
  getAllConnections(): Map<string, WebSocketManager> {
    return new Map(this.connections);
  }
}

/**
 * Global connection pool instance
 */
export const connectionPool = new WSConnectionPool();
