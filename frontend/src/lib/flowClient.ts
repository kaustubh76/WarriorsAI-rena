/**
 * Shared Flow Client Factory with Fallback Support
 *
 * This module provides reusable Flow blockchain clients with:
 * - 60-second timeout (increased from default 30s)
 * - Automatic fallback to Tatum RPC when primary times out
 * - Retry support with exponential backoff
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Account, type Chain } from 'viem';
import { flowTestnet, flowMainnet } from 'viem/chains';
import { getFlowRpcUrl, getFlowFallbackRpcUrl, getChainId } from '@/constants';

// Configuration
const RPC_TIMEOUT = 60000; // 60 seconds
const RETRY_COUNT = 2;
const RETRY_DELAY = 1000; // 1 second

/**
 * Get the appropriate Flow chain based on environment
 */
export function getFlowChain(): Chain {
  const chainId = getChainId();
  return chainId === 747 ? flowMainnet : flowTestnet;
}

/**
 * Create a Flow public client with proper timeout configuration
 */
export function createFlowPublicClient(): PublicClient {
  return createPublicClient({
    chain: getFlowChain(),
    transport: http(getFlowRpcUrl(), {
      timeout: RPC_TIMEOUT,
      retryCount: RETRY_COUNT,
      retryDelay: RETRY_DELAY,
    }),
  });
}

/**
 * Create a Flow fallback public client using Tatum RPC
 */
export function createFlowFallbackClient(): PublicClient {
  return createPublicClient({
    chain: getFlowChain(),
    transport: http(getFlowFallbackRpcUrl(), {
      timeout: RPC_TIMEOUT,
      retryCount: RETRY_COUNT,
      retryDelay: RETRY_DELAY,
    }),
  });
}

/**
 * Create a Flow wallet client with proper timeout configuration
 */
export function createFlowWalletClient(account: Account): WalletClient {
  return createWalletClient({
    account,
    chain: getFlowChain(),
    transport: http(getFlowRpcUrl(), {
      timeout: RPC_TIMEOUT,
      retryCount: RETRY_COUNT,
      retryDelay: RETRY_DELAY,
    }),
  });
}

/**
 * Create a Flow fallback wallet client using Tatum RPC
 */
export function createFlowFallbackWalletClient(account: Account): WalletClient {
  return createWalletClient({
    account,
    chain: getFlowChain(),
    transport: http(getFlowFallbackRpcUrl(), {
      timeout: RPC_TIMEOUT,
      retryCount: RETRY_COUNT,
      retryDelay: RETRY_DELAY,
    }),
  });
}

/**
 * Check if an error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  const errMsg = (error as Error).message || '';
  return errMsg.includes('timeout') ||
         errMsg.includes('timed out') ||
         errMsg.includes('took too long') ||
         errMsg.includes('TimeoutError');
}

/**
 * Execute an operation with automatic fallback to secondary RPC on timeout
 *
 * @param operation - Function that takes a PublicClient and returns a Promise
 * @returns The result of the operation
 * @throws The original error if it's not a timeout error
 *
 * @example
 * const result = await executeWithFlowFallback((client) =>
 *   client.readContract({
 *     address: '0x...',
 *     abi: myAbi,
 *     functionName: 'myFunction',
 *   })
 * );
 */
export async function executeWithFlowFallback<T>(
  operation: (client: PublicClient) => Promise<T>
): Promise<T> {
  const primaryClient = createFlowPublicClient();

  try {
    return await operation(primaryClient);
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[Flow RPC] Primary endpoint timed out, trying fallback...');
      const fallbackClient = createFlowFallbackClient();
      return await operation(fallbackClient);
    }
    throw error;
  }
}

/**
 * Execute a wallet operation with automatic fallback to secondary RPC on timeout
 *
 * @param account - The account to use for the wallet client
 * @param operation - Function that takes a WalletClient and PublicClient and returns a Promise
 * @returns The result of the operation
 *
 * @example
 * const hash = await executeWalletWithFlowFallback(account, async (wallet, public) => {
 *   const hash = await wallet.writeContract({ ... });
 *   await public.waitForTransactionReceipt({ hash });
 *   return hash;
 * });
 */
export async function executeWalletWithFlowFallback<T>(
  account: Account,
  operation: (walletClient: WalletClient, publicClient: PublicClient) => Promise<T>
): Promise<T> {
  const primaryWallet = createFlowWalletClient(account);
  const primaryPublic = createFlowPublicClient();

  try {
    return await operation(primaryWallet, primaryPublic);
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[Flow RPC] Primary endpoint timed out, trying fallback...');
      const fallbackWallet = createFlowFallbackWalletClient(account);
      const fallbackPublic = createFlowFallbackClient();
      return await operation(fallbackWallet, fallbackPublic);
    }
    throw error;
  }
}

// Re-export constants for convenience
export { RPC_TIMEOUT, RETRY_COUNT, RETRY_DELAY };
