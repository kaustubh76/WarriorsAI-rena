/**
 * Testing Utilities
 * Helper functions and mocks for testing React components and blockchain interactions
 */

/**
 * Mock wallet provider for testing
 */
export class MockWalletProvider {
  public chainId: number;
  public accounts: string[];
  public connected: boolean = false;

  private eventListeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor(options?: {
    chainId?: number;
    accounts?: string[];
  }) {
    this.chainId = options?.chainId || 1;
    this.accounts = options?.accounts || ['0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'];
  }

  /**
   * Request account connection
   */
  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    switch (args.method) {
      case 'eth_requestAccounts':
        this.connected = true;
        this.emit('connect', { chainId: `0x${this.chainId.toString(16)}` });
        return this.accounts;

      case 'eth_accounts':
        return this.connected ? this.accounts : [];

      case 'eth_chainId':
        return `0x${this.chainId.toString(16)}`;

      case 'eth_getBalance':
        return '0x' + (BigInt(10) ** BigInt(18)).toString(16);

      case 'eth_sendTransaction':
        return '0x' + Math.random().toString(16).substring(2);

      case 'eth_call':
        return '0x0000000000000000000000000000000000000000000000000000000000000001';

      case 'eth_estimateGas':
        return '0x5208'; // 21000 gas

      case 'eth_gasPrice':
        return '0x' + (BigInt(20) * BigInt(10) ** BigInt(9)).toString(16);

      case 'wallet_switchEthereumChain':
        if (args.params && Array.isArray(args.params)) {
          const chainId = parseInt((args.params[0] as { chainId: string }).chainId, 16);
          this.switchChain(chainId);
        }
        return null;

      case 'wallet_addEthereumChain':
        return null;

      default:
        throw new Error(`Method not implemented: ${args.method}`);
    }
  }

  /**
   * Add event listener
   */
  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  removeListener(event: string, callback: (...args: unknown[]) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: string, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach(callback => callback(...args));
  }

  /**
   * Switch chain
   */
  switchChain(chainId: number): void {
    const oldChainId = this.chainId;
    this.chainId = chainId;
    this.emit('chainChanged', `0x${chainId.toString(16)}`);
    this.emit('networkChanged', chainId.toString());
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.connected = false;
    this.accounts = [];
    this.emit('disconnect');
  }

  /**
   * Change account
   */
  changeAccount(newAccount: string): void {
    this.accounts = [newAccount];
    this.emit('accountsChanged', this.accounts);
  }
}

/**
 * Mock contract for testing
 */
export class MockContract {
  private methods: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map();
  private events: Map<string, unknown[]> = new Map();

  constructor(public address: string) {}

  /**
   * Mock a contract method
   */
  mockMethod(name: string, implementation: (...args: unknown[]) => Promise<unknown>): void {
    this.methods.set(name, implementation);
  }

  /**
   * Call contract method
   */
  async call(method: string, ...args: unknown[]): Promise<unknown> {
    const implementation = this.methods.get(method);
    if (!implementation) {
      throw new Error(`Method ${method} not mocked`);
    }
    return implementation(...args);
  }

  /**
   * Mock event emission
   */
  emitEvent(eventName: string, ...args: unknown[]): void {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName)!.push(args);
  }

  /**
   * Get emitted events
   */
  getEvents(eventName: string): unknown[][] {
    return this.events.get(eventName) || [];
  }

  /**
   * Clear events
   */
  clearEvents(eventName?: string): void {
    if (eventName) {
      this.events.delete(eventName);
    } else {
      this.events.clear();
    }
  }
}

/**
 * Test data generators
 */
export const TestDataGenerator = {
  /**
   * Generate random address
   */
  address(): string {
    const hex = Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `0x${hex}`;
  },

  /**
   * Generate random transaction hash
   */
  txHash(): string {
    const hex = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `0x${hex}`;
  },

  /**
   * Generate random BigInt
   */
  bigInt(min: bigint = BigInt(0), max: bigint = BigInt(1000000)): bigint {
    const range = max - min;
    const randomNum = Math.floor(Math.random() * Number(range));
    return min + BigInt(randomNum);
  },

  /**
   * Generate random warrior NFT
   */
  warrior(overrides?: Partial<{
    id: number;
    name: string;
    strength: number;
    wit: number;
    charisma: number;
    defence: number;
    luck: number;
    wins: number;
    losses: number;
    owner: string;
  }>): {
    id: number;
    name: string;
    strength: number;
    wit: number;
    charisma: number;
    defence: number;
    luck: number;
    wins: number;
    losses: number;
    owner: string;
  } {
    return {
      id: Math.floor(Math.random() * 10000),
      name: `Warrior ${Math.floor(Math.random() * 1000)}`,
      strength: Math.floor(Math.random() * 100),
      wit: Math.floor(Math.random() * 100),
      charisma: Math.floor(Math.random() * 100),
      defence: Math.floor(Math.random() * 100),
      luck: Math.floor(Math.random() * 100),
      wins: Math.floor(Math.random() * 50),
      losses: Math.floor(Math.random() * 50),
      owner: TestDataGenerator.address(),
      ...overrides,
    };
  },

  /**
   * Generate random battle
   */
  battle(overrides?: Partial<{
    id: string;
    warrior1Id: number;
    warrior2Id: number;
    warrior1Owner: string;
    warrior2Owner: string;
    betAmount: bigint;
    status: string;
    winner: number | null;
    createdAt: Date;
  }>): {
    id: string;
    warrior1Id: number;
    warrior2Id: number;
    warrior1Owner: string;
    warrior2Owner: string;
    betAmount: bigint;
    status: string;
    winner: number | null;
    createdAt: Date;
  } {
    return {
      id: TestDataGenerator.txHash(),
      warrior1Id: Math.floor(Math.random() * 10000),
      warrior2Id: Math.floor(Math.random() * 10000),
      warrior1Owner: TestDataGenerator.address(),
      warrior2Owner: TestDataGenerator.address(),
      betAmount: TestDataGenerator.bigInt(BigInt(1), BigInt(1000)),
      status: ['pending', 'active', 'completed'][Math.floor(Math.random() * 3)],
      winner: Math.random() > 0.5 ? Math.floor(Math.random() * 2) : null,
      createdAt: new Date(),
      ...overrides,
    };
  },

  /**
   * Generate random agent
   */
  agent(overrides?: Partial<{
    id: string;
    name: string;
    walletAddress: string;
    balance: bigint;
    stakedAmount: bigint;
    followers: number;
    winRate: number;
    totalTrades: number;
  }>): {
    id: string;
    name: string;
    walletAddress: string;
    balance: bigint;
    stakedAmount: bigint;
    followers: number;
    winRate: number;
    totalTrades: number;
  } {
    return {
      id: Math.random().toString(36).substring(7),
      name: `Agent ${Math.floor(Math.random() * 1000)}`,
      walletAddress: TestDataGenerator.address(),
      balance: TestDataGenerator.bigInt(BigInt(0), BigInt(10000)),
      stakedAmount: TestDataGenerator.bigInt(BigInt(0), BigInt(5000)),
      followers: Math.floor(Math.random() * 1000),
      winRate: Math.random() * 100,
      totalTrades: Math.floor(Math.random() * 500),
      ...overrides,
    };
  },

  /**
   * Generate random market
   */
  market(overrides?: Partial<{
    id: number;
    question: string;
    yesPool: bigint;
    noPool: bigint;
    resolved: boolean;
    outcome: boolean | null;
    endDate: Date;
  }>): {
    id: number;
    question: string;
    yesPool: bigint;
    noPool: bigint;
    resolved: boolean;
    outcome: boolean | null;
    endDate: Date;
  } {
    return {
      id: Math.floor(Math.random() * 10000),
      question: `Will event ${Math.floor(Math.random() * 1000)} happen?`,
      yesPool: TestDataGenerator.bigInt(BigInt(1000), BigInt(100000)),
      noPool: TestDataGenerator.bigInt(BigInt(1000), BigInt(100000)),
      resolved: Math.random() > 0.7,
      outcome: Math.random() > 0.5 ? Math.random() > 0.5 : null,
      endDate: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
      ...overrides,
    };
  },
};

/**
 * Async test helpers
 */
export const AsyncTestHelpers = {
  /**
   * Wait for condition to be true
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    options?: {
      timeout?: number;
      interval?: number;
    }
  ): Promise<void> {
    const { timeout = 5000, interval = 100 } = options || {};
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Timeout waiting for condition');
  },

  /**
   * Wait for specified time
   */
  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Flush all pending promises
   */
  async flushPromises(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
  },
};

/**
 * Mock API responses
 */
export const MockAPIResponses = {
  /**
   * Create successful response
   */
  success<T>(data: T): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * Create error response
   */
  error(message: string, status: number = 400): Response {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * Create network error
   */
  networkError(): Promise<Response> {
    return Promise.reject(new Error('Network error'));
  },

  /**
   * Create timeout error
   */
  timeout(delay: number = 5000): Promise<Response> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), delay);
    });
  },
};

/**
 * Component test helpers
 */
export const ComponentTestHelpers = {
  /**
   * Simulate wallet connection
   */
  async connectWallet(provider: MockWalletProvider): Promise<void> {
    await provider.request({ method: 'eth_requestAccounts' });
  },

  /**
   * Simulate wallet disconnection
   */
  disconnectWallet(provider: MockWalletProvider): void {
    provider.disconnect();
  },

  /**
   * Simulate chain switch
   */
  async switchChain(provider: MockWalletProvider, chainId: number): Promise<void> {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
  },

  /**
   * Simulate account change
   */
  changeAccount(provider: MockWalletProvider, newAccount: string): void {
    provider.changeAccount(newAccount);
  },
};

/**
 * Storage mocks
 */
export class MockLocalStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/**
 * Performance measurement helpers
 */
export const PerformanceTestHelpers = {
  /**
   * Measure function execution time
   */
  async measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; time: number }> {
    const start = performance.now();
    const result = await fn();
    const time = performance.now() - start;
    return { result, time };
  },

  /**
   * Measure multiple executions
   */
  async measureMultiple<T>(
    fn: () => Promise<T> | T,
    iterations: number
  ): Promise<{
    results: T[];
    times: number[];
    avg: number;
    min: number;
    max: number;
  }> {
    const results: T[] = [];
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { result, time } = await PerformanceTestHelpers.measureTime(fn);
      results.push(result);
      times.push(time);
    }

    const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { results, times, avg, min, max };
  },

  /**
   * Create performance snapshot
   */
  snapshot(): {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
    timing: PerformanceTiming;
  } {
    return {
      memory: (performance as Performance & { memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      }}).memory,
      timing: performance.timing,
    };
  },
};

/**
 * Assertion helpers
 */
export const AssertionHelpers = {
  /**
   * Assert address is valid
   */
  assertValidAddress(address: string, message?: string): void {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(message || `Invalid address: ${address}`);
    }
  },

  /**
   * Assert BigInt is positive
   */
  assertPositiveBigInt(value: bigint, message?: string): void {
    if (value < BigInt(0)) {
      throw new Error(message || `Expected positive BigInt, got ${value}`);
    }
  },

  /**
   * Assert value is in range
   */
  assertInRange(value: number, min: number, max: number, message?: string): void {
    if (value < min || value > max) {
      throw new Error(message || `Expected value between ${min} and ${max}, got ${value}`);
    }
  },

  /**
   * Assert arrays are equal
   */
  assertArraysEqual<T>(arr1: T[], arr2: T[], message?: string): void {
    if (arr1.length !== arr2.length) {
      throw new Error(message || `Arrays have different lengths: ${arr1.length} vs ${arr2.length}`);
    }

    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) {
        throw new Error(message || `Arrays differ at index ${i}: ${arr1[i]} vs ${arr2[i]}`);
      }
    }
  },
};

/**
 * Test fixture loader
 */
export class FixtureLoader {
  private fixtures = new Map<string, unknown>();

  /**
   * Load fixture
   */
  load<T>(name: string, data: T): void {
    this.fixtures.set(name, data);
  }

  /**
   * Get fixture
   */
  get<T>(name: string): T {
    const fixture = this.fixtures.get(name);
    if (!fixture) {
      throw new Error(`Fixture not found: ${name}`);
    }
    return fixture as T;
  }

  /**
   * Clear all fixtures
   */
  clear(): void {
    this.fixtures.clear();
  }

  /**
   * Check if fixture exists
   */
  has(name: string): boolean {
    return this.fixtures.has(name);
  }
}

/**
 * Spy/Mock function creator
 */
export class Spy<T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown> {
  public calls: Array<{ args: unknown[]; result?: unknown; error?: unknown }> = [];
  public callCount = 0;

  constructor(private implementation?: T) {}

  /**
   * Execute spy
   */
  execute(...args: Parameters<T>): ReturnType<T> {
    this.callCount++;

    try {
      const result = this.implementation ? this.implementation(...args) : undefined;
      this.calls.push({ args, result });
      return result as ReturnType<T>;
    } catch (error) {
      this.calls.push({ args, error });
      throw error;
    }
  }

  /**
   * Reset spy
   */
  reset(): void {
    this.calls = [];
    this.callCount = 0;
  }

  /**
   * Get call arguments by index
   */
  getCall(index: number): { args: unknown[]; result?: unknown; error?: unknown } | undefined {
    return this.calls[index];
  }

  /**
   * Check if called with specific arguments
   */
  calledWith(...args: unknown[]): boolean {
    return this.calls.some(call =>
      call.args.length === args.length &&
      call.args.every((arg, i) => arg === args[i])
    );
  }
}
