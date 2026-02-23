/**
 * Shared Flow Client Factory with Fallback Support
 * @layer Flow EVM — Solidity contracts via viem/wagmi (NOT Cadence/FCL)
 *
 * This module provides reusable Flow EVM blockchain clients with:
 * - 60-second timeout (increased from default 30s)
 * - Automatic fallback RPC when primary times out
 * - Retry support with exponential backoff
 * - Hash-ring based RPC routing for load distribution
 *
 * RPC: testnet.evm.nodes.onflow.org (chain 545)
 * For Cadence (FCL) operations, see lib/flow/cadenceClient.ts and lib/flow/serverAuth.ts.
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type Account, type Chain } from 'viem';
import { flowTestnet, flowMainnet } from 'viem/chains';
import { getFlowRpcUrl, getFlowFallbackRpcUrl, getChainId } from '@/constants';
import { getFlowRpcForKey } from '@/lib/hashing';

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
 * Create a Flow public client routed via consistent hash ring.
 * The same routing key always hits the same RPC node, enabling node-level caching.
 *
 * @param routingKey - Deterministic key (e.g., marketId, walletAddress)
 */
export function createFlowPublicClientForKey(routingKey: string): PublicClient {
  const rpcUrl = getFlowRpcForKey(routingKey, getFlowRpcUrl());
  return createPublicClient({
    chain: getFlowChain(),
    transport: http(rpcUrl, {
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
export function createFlowWalletClient(account: Account) {
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
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  const errMsg = (error as Error).message || '';
  return errMsg.includes('timeout') ||
         errMsg.includes('timed out') ||
         errMsg.includes('took too long') ||
         errMsg.includes('TimeoutError');
}

/**
 * Execute an operation with hash-ring-based RPC routing and fallback.
 * The routing key ensures the same entity always hits the same RPC node.
 *
 * @param routingKey - Deterministic key (e.g., marketId, walletAddress)
 * @param operation - Function that takes a PublicClient and returns a Promise
 */
export async function executeWithFlowFallbackForKey<T>(
  routingKey: string,
  operation: (client: PublicClient) => Promise<T>
): Promise<T> {
  const primaryClient = createFlowPublicClientForKey(routingKey);

  try {
    return await operation(primaryClient);
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[Flow RPC] Hash-routed endpoint timed out, trying fallback...');
      const fallbackClient = createFlowFallbackClient();
      return await operation(fallbackClient);
    }
    throw error;
  }
}

// Re-export timeout constant for convenience
export { RPC_TIMEOUT };
