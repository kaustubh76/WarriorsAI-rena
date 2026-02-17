/**
 * Shared 0G Client Factory
 *
 * This module provides reusable 0G Galileo blockchain clients with:
 * - 60-second timeout
 * - Retry support
 * - Shared chain definition (eliminates duplication across services/routes)
 */

import { createPublicClient, createWalletClient, http, defineChain, type PublicClient, type Account } from 'viem';
import { getZeroGComputeRpc } from '@/constants';

// Configuration
const RPC_TIMEOUT = 60000; // 60 seconds
const RETRY_COUNT = 2;
const RETRY_DELAY = 1000; // 1 second

/**
 * 0G Galileo Testnet chain definition
 */
export const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: '0G Token', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: [getZeroGComputeRpc()] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
});

/**
 * Create a 0G public client with proper timeout configuration
 */
export function createZeroGPublicClient(): PublicClient {
  return createPublicClient({
    chain: zeroGGalileo,
    transport: http(getZeroGComputeRpc(), {
      timeout: RPC_TIMEOUT,
      retryCount: RETRY_COUNT,
      retryDelay: RETRY_DELAY,
    }),
  });
}

/**
 * Create a 0G wallet client with proper timeout configuration
 */
export function createZeroGWalletClient(account: Account) {
  return createWalletClient({
    account,
    chain: zeroGGalileo,
    transport: http(getZeroGComputeRpc(), {
      timeout: RPC_TIMEOUT,
      retryCount: RETRY_COUNT,
      retryDelay: RETRY_DELAY,
    }),
  });
}
