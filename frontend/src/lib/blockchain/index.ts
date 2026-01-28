/**
 * Blockchain Utilities
 * Helper functions for blockchain interactions, contract calls, and formatting
 */

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Normalize address to lowercase checksum format
 */
export function normalizeAddress(address: string): string {
  if (!isValidAddress(address)) {
    throw new Error(`Invalid address format: ${address}`);
  }
  return address.toLowerCase();
}

/**
 * Compare two addresses for equality (case-insensitive)
 */
export function addressesEqual(a: string, b: string): boolean {
  try {
    return normalizeAddress(a) === normalizeAddress(b);
  } catch {
    return false;
  }
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (!isValidAddress(address)) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(
  amount: string | number | bigint,
  decimals: number = 18,
  maxDecimals: number = 4
): string {
  const value = typeof amount === 'bigint' ? amount.toString() : String(amount);
  const num = BigInt(value);

  // Convert from wei to ether
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = num / divisor;
  const remainder = num % divisor;

  if (remainder === BigInt(0)) {
    return whole.toString();
  }

  // Format fractional part
  const fractional = remainder.toString().padStart(decimals, '0');
  const trimmed = fractional.slice(0, maxDecimals).replace(/0+$/, '');

  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

/**
 * Parse token amount to wei
 */
export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  const [whole = '0', fractional = '0'] = amount.split('.');
  const wholeBigInt = BigInt(whole) * (BigInt(10) ** BigInt(decimals));
  const fractionalPadded = fractional.padEnd(decimals, '0').slice(0, decimals);
  const fractionalBigInt = BigInt(fractionalPadded);

  return wholeBigInt + fractionalBigInt;
}

/**
 * Format gas price in Gwei
 */
export function formatGasPrice(wei: string | number | bigint): string {
  const value = typeof wei === 'bigint' ? wei.toString() : String(wei);
  const gwei = Number(value) / 1e9;
  return `${gwei.toFixed(2)} Gwei`;
}

/**
 * Calculate transaction fee
 */
export function calculateTxFee(gasUsed: bigint, gasPrice: bigint): bigint {
  return gasUsed * gasPrice;
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(hash: string, chars: number = 6): string {
  if (!hash.startsWith('0x')) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/**
 * Get block explorer URL for different chains
 */
export function getExplorerUrl(
  chainId: number,
  type: 'tx' | 'address' | 'block' | 'token',
  value: string
): string {
  const explorers: Record<number, { name: string; url: string }> = {
    1: { name: 'Etherscan', url: 'https://etherscan.io' },
    545: { name: 'Flow Testnet', url: 'https://testnet.flowscan.org' },
    16602: { name: '0G Galileo', url: 'https://chainscan-galileo.0g.ai' },
    137: { name: 'Polygonscan', url: 'https://polygonscan.com' },
    42161: { name: 'Arbiscan', url: 'https://arbiscan.io' },
  };

  const explorer = explorers[chainId];
  if (!explorer) {
    return '#';
  }

  const paths = {
    tx: 'tx',
    address: 'address',
    block: 'block',
    token: 'token',
  };

  return `${explorer.url}/${paths[type]}/${value}`;
}

/**
 * Get chain name from ID
 */
export function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: 'Ethereum Mainnet',
    545: 'Flow Testnet',
    16602: '0G Galileo Testnet',
    137: 'Polygon',
    42161: 'Arbitrum One',
    10: 'Optimism',
    8453: 'Base',
  };

  return chains[chainId] || `Chain ${chainId}`;
}

/**
 * Check if chain is testnet
 */
export function isTestnet(chainId: number): boolean {
  const testnets = [545, 16602, 5, 11155111, 80001, 421613];
  return testnets.includes(chainId);
}

/**
 * Encode function call data
 */
export function encodeFunctionCall(
  signature: string,
  params: (string | number | boolean | bigint)[]
): string {
  // Simple encoding - in production use proper ABI encoding
  const paramStrings = params.map(p => String(p));
  return `${signature}(${paramStrings.join(',')})`;
}

/**
 * Decode function call result
 */
export function decodeFunctionResult<T>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    return data as unknown as T;
  }
}

/**
 * Contract interaction helpers
 */
export interface ContractCallOptions {
  address: string;
  method: string;
  args?: unknown[];
  value?: bigint;
  gasLimit?: bigint;
}

/**
 * Build contract call parameters
 */
export function buildContractCall(options: ContractCallOptions): {
  to: string;
  data: string;
  value?: string;
  gas?: string;
} {
  const { address, method, args = [], value, gasLimit } = options;

  return {
    to: address,
    data: encodeFunctionCall(method, args as (string | number | boolean | bigint)[]),
    ...(value && { value: '0x' + value.toString(16) }),
    ...(gasLimit && { gas: '0x' + gasLimit.toString(16) }),
  };
}

/**
 * Event log parsing
 */
export interface EventLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

/**
 * Parse event logs by topic
 */
export function filterEventsByTopic(logs: EventLog[], topic: string): EventLog[] {
  return logs.filter(log => log.topics.includes(topic));
}

/**
 * Decode event data (simplified)
 */
export function decodeEventData<T>(log: EventLog): T {
  try {
    return JSON.parse(log.data) as T;
  } catch {
    return log.data as unknown as T;
  }
}

/**
 * Transaction status helpers
 */
export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  REPLACED = 'replaced',
}

/**
 * Check transaction status from receipt
 */
export function getTransactionStatus(receipt: {
  status?: number | string;
  blockNumber?: number;
}): TransactionStatus {
  if (!receipt.blockNumber) {
    return TransactionStatus.PENDING;
  }

  const status = typeof receipt.status === 'string'
    ? parseInt(receipt.status, 16)
    : receipt.status;

  return status === 1 ? TransactionStatus.CONFIRMED : TransactionStatus.FAILED;
}

/**
 * Wait for transaction with timeout
 */
export async function waitForTransaction(
  getTxReceipt: () => Promise<{ status?: number; blockNumber?: number } | null>,
  options?: {
    timeout?: number;
    interval?: number;
  }
): Promise<{ status?: number; blockNumber?: number }> {
  const { timeout = 60000, interval = 1000 } = options || {};
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const receipt = await getTxReceipt();
    if (receipt?.blockNumber) {
      return receipt;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Transaction confirmation timeout');
}

/**
 * Gas estimation helpers
 */
export function estimateGasBuffer(estimatedGas: bigint, bufferPercent: number = 20): bigint {
  return estimatedGas + (estimatedGas * BigInt(bufferPercent)) / BigInt(100);
}

/**
 * Calculate max priority fee
 */
export function calculateMaxPriorityFee(
  baseFee: bigint,
  priorityMultiplier: number = 1.5
): bigint {
  return (baseFee * BigInt(Math.floor(priorityMultiplier * 100))) / BigInt(100);
}

/**
 * Token metadata
 */
export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

/**
 * Common token addresses
 */
export const CommonTokens: Record<number, Record<string, TokenInfo>> = {
  1: {
    USDC: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    USDT: {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
    },
    DAI: {
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      decimals: 18,
    },
  },
};

/**
 * Get token info by address
 */
export function getTokenInfo(chainId: number, address: string): TokenInfo | null {
  const tokens = CommonTokens[chainId];
  if (!tokens) return null;

  const normalizedAddress = normalizeAddress(address);
  return Object.values(tokens).find(
    t => normalizeAddress(t.address) === normalizedAddress
  ) || null;
}

/**
 * Signature helpers
 */
export interface TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
}

/**
 * Create EIP-712 typed data for signing
 */
export function createTypedData(
  domain: TypedData['domain'],
  types: TypedData['types'],
  message: Record<string, unknown>
): TypedData {
  return {
    domain,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        ...(domain.verifyingContract ? [{ name: 'verifyingContract', type: 'address' }] : []),
      ],
      ...types,
    },
    message,
  };
}

/**
 * Nonce management for transactions
 */
const nonceCache = new Map<string, { nonce: number; timestamp: number }>();

/**
 * Get next nonce for address (with caching)
 */
export function getNextNonce(address: string, currentNonce: number): number {
  const cached = nonceCache.get(address);
  const now = Date.now();

  // Cache expires after 10 seconds
  if (cached && now - cached.timestamp < 10000) {
    const nextNonce = Math.max(cached.nonce + 1, currentNonce);
    nonceCache.set(address, { nonce: nextNonce, timestamp: now });
    return nextNonce;
  }

  nonceCache.set(address, { nonce: currentNonce, timestamp: now });
  return currentNonce;
}

/**
 * Reset nonce cache for address
 */
export function resetNonceCache(address: string): void {
  nonceCache.delete(address);
}

/**
 * Batch transaction builder
 */
export interface BatchTransaction {
  to: string;
  data: string;
  value?: bigint;
}

/**
 * Encode batch transactions for multicall
 */
export function encodeBatchTransactions(transactions: BatchTransaction[]): string[] {
  return transactions.map(tx => tx.data);
}

/**
 * Calculate total value for batch
 */
export function calculateBatchValue(transactions: BatchTransaction[]): bigint {
  return transactions.reduce((sum, tx) => sum + (tx.value || BigInt(0)), BigInt(0));
}

/**
 * Error handling utilities
 */
export interface BlockchainError {
  code: string;
  message: string;
  originalError?: unknown;
}

/**
 * Parse blockchain errors to user-friendly messages
 */
export function parseBlockchainError(error: unknown): BlockchainError {
  if (typeof error === 'string') {
    return {
      code: 'UNKNOWN_ERROR',
      message: error,
    };
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);

    // User rejected transaction
    if (message.includes('user rejected') || message.includes('User denied')) {
      return {
        code: 'USER_REJECTED',
        message: 'Transaction was rejected by user',
        originalError: error,
      };
    }

    // Insufficient funds
    if (message.includes('insufficient funds')) {
      return {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Insufficient funds to complete transaction',
        originalError: error,
      };
    }

    // Gas estimation failed
    if (message.includes('cannot estimate gas') || message.includes('gas required exceeds')) {
      return {
        code: 'GAS_ESTIMATION_FAILED',
        message: 'Transaction may fail - please check parameters',
        originalError: error,
      };
    }

    // Network error
    if (message.includes('network') || message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error - please try again',
        originalError: error,
      };
    }

    // Nonce too low
    if (message.includes('nonce too low')) {
      return {
        code: 'NONCE_TOO_LOW',
        message: 'Transaction nonce is too low - please refresh',
        originalError: error,
      };
    }

    // Replacement transaction underpriced
    if (message.includes('replacement transaction underpriced')) {
      return {
        code: 'UNDERPRICED',
        message: 'Gas price too low - please increase gas price',
        originalError: error,
      };
    }

    // Contract revert with reason
    const revertMatch = message.match(/revert (.+?)(?:"|$)/);
    if (revertMatch) {
      return {
        code: 'CONTRACT_REVERT',
        message: revertMatch[1],
        originalError: error,
      };
    }

    // Generic execution revert
    if (message.includes('execution reverted')) {
      return {
        code: 'EXECUTION_REVERTED',
        message: 'Transaction failed - contract execution reverted',
        originalError: error,
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message,
      originalError: error,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    originalError: error,
  };
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  }
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
  } = options || {};

  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const parsedError = parseBlockchainError(error);

      // Don't retry user rejections or insufficient funds
      if (
        parsedError.code === 'USER_REJECTED' ||
        parsedError.code === 'INSUFFICIENT_FUNDS'
      ) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Transaction simulation
 */
export interface SimulationResult {
  success: boolean;
  gasEstimate?: bigint;
  error?: BlockchainError;
}

/**
 * Contract method signature parser
 */
export function parseMethodSignature(signature: string): {
  name: string;
  params: string[];
} {
  const match = signature.match(/^(\w+)\((.*)\)$/);
  if (!match) {
    throw new Error(`Invalid method signature: ${signature}`);
  }

  const [, name, paramsStr] = match;
  const params = paramsStr ? paramsStr.split(',').map(p => p.trim()) : [];

  return { name, params };
}

/**
 * ABI encoding helpers
 */
export const ABI = {
  /**
   * Encode address
   */
  encodeAddress(address: string): string {
    if (!isValidAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }
    return address.toLowerCase().padStart(66, '0');
  },

  /**
   * Encode uint256
   */
  encodeUint256(value: bigint): string {
    const hex = value.toString(16);
    return '0x' + hex.padStart(64, '0');
  },

  /**
   * Encode bool
   */
  encodeBool(value: boolean): string {
    return '0x' + (value ? '1' : '0').padStart(64, '0');
  },

  /**
   * Encode bytes32
   */
  encodeBytes32(value: string): string {
    if (value.startsWith('0x')) {
      return value.padEnd(66, '0');
    }
    return '0x' + value.padEnd(64, '0');
  },

  /**
   * Decode address
   */
  decodeAddress(data: string): string {
    const cleaned = data.replace('0x', '').slice(-40);
    return '0x' + cleaned;
  },

  /**
   * Decode uint256
   */
  decodeUint256(data: string): bigint {
    return BigInt(data);
  },

  /**
   * Decode bool
   */
  decodeBool(data: string): boolean {
    return BigInt(data) !== BigInt(0);
  },
};

/**
 * Multi-chain utilities
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  iconUrls?: string[];
}

/**
 * Switch network request parameters
 */
export function buildAddChainParams(config: ChainConfig): {
  chainId: string;
  chainName: string;
  nativeCurrency: ChainConfig['nativeCurrency'];
  rpcUrls: string[];
  blockExplorerUrls: string[];
  iconUrls?: string[];
} {
  return {
    chainId: '0x' + config.chainId.toString(16),
    chainName: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: config.rpcUrls,
    blockExplorerUrls: config.blockExplorerUrls,
    ...(config.iconUrls && { iconUrls: config.iconUrls }),
  };
}

/**
 * Transaction queue manager
 */
export class TransactionQueue {
  private queue: Array<{
    id: string;
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  private processing = false;

  /**
   * Add transaction to queue
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(7);
      this.queue.push({ id, fn, resolve, reject });
      this.process();
    });
  }

  /**
   * Process queue
   */
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }

      // Add small delay between transactions
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.processing = false;
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length;
  }
}

/**
 * Gas price monitor
 */
export class GasPriceMonitor {
  private prices: bigint[] = [];
  private readonly maxHistory = 100;

  /**
   * Add gas price sample
   */
  addSample(price: bigint): void {
    this.prices.push(price);
    if (this.prices.length > this.maxHistory) {
      this.prices.shift();
    }
  }

  /**
   * Get average gas price
   */
  getAverage(): bigint {
    if (this.prices.length === 0) return BigInt(0);

    const sum = this.prices.reduce((a, b) => a + b, BigInt(0));
    return sum / BigInt(this.prices.length);
  }

  /**
   * Get median gas price
   */
  getMedian(): bigint {
    if (this.prices.length === 0) return BigInt(0);

    const sorted = [...this.prices].sort((a, b) => (a < b ? -1 : 1));
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / BigInt(2);
    }

    return sorted[mid];
  }

  /**
   * Get percentile gas price
   */
  getPercentile(percentile: number): bigint {
    if (this.prices.length === 0) return BigInt(0);
    if (percentile < 0 || percentile > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }

    const sorted = [...this.prices].sort((a, b) => (a < b ? -1 : 1));
    const index = Math.floor((sorted.length - 1) * (percentile / 100));

    return sorted[index];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.prices = [];
  }
}

/**
 * Contract event listener
 */
export class EventListener {
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  /**
   * Subscribe to event
   */
  on(eventName: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * Unsubscribe from event
   */
  off(eventName: string, callback: (data: unknown) => void): void {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  /**
   * Emit event
   */
  emit(eventName: string, data: unknown): void {
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(eventName?: string): void {
    if (eventName) {
      this.listeners.delete(eventName);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get listener count
   */
  listenerCount(eventName: string): number {
    return this.listeners.get(eventName)?.size || 0;
  }
}
