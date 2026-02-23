/**
 * Shared Server-Side FCL Authorization Utility
 * @layer Cadence — Flow native layer (NOT Flow EVM)
 *
 * Provides server-side transaction signing for Flow Cadence operations
 * that run without a user wallet (cron jobs, API routes, automated execution).
 *
 * Uses ECDSA P256 signing with FLOW_CADENCE_PRIVATE_KEY.
 * Access node: rest-testnet.onflow.org (Cadence REST API, NOT EVM RPC).
 */

import * as fcl from '@onflow/fcl';

// Cadence layer environment configuration (with backward-compatible fallbacks)
const SERVER_ADDRESS = process.env.FLOW_CADENCE_ACCOUNT_ADDRESS || process.env.FLOW_TESTNET_ADDRESS;
const PRIVATE_KEY = process.env.FLOW_CADENCE_PRIVATE_KEY || process.env.FLOW_TESTNET_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FLOW_CADENCE_ADDRESS || process.env.NEXT_PUBLIC_FLOW_TESTNET_ADDRESS;
const ACCESS_NODE = process.env.FLOW_CADENCE_ACCESS_NODE || process.env.FLOW_RPC_URL || 'https://rest-testnet.onflow.org';

/**
 * Configure FCL for server-side operations.
 * Call this once at module load in any server-side route that uses FCL.
 */
export function configureServerFCL() {
  fcl.config({
    'flow.network': 'testnet',
    'accessNode.api': ACCESS_NODE,
  });
}

/**
 * Get the contract deployment address.
 * Returns the NEXT_PUBLIC_FLOW_CADENCE_ADDRESS or falls back to FLOW_CADENCE_ACCOUNT_ADDRESS.
 */
export function getContractAddress(): string {
  const addr = CONTRACT_ADDRESS || SERVER_ADDRESS;
  if (!addr) {
    throw new Error(
      'Flow Cadence contract address not configured. Set NEXT_PUBLIC_FLOW_CADENCE_ADDRESS or FLOW_CADENCE_ACCOUNT_ADDRESS.'
    );
  }
  return addr;
}

/**
 * Get the server account address (the account that signs automated transactions).
 */
export function getServerAddress(): string {
  if (!SERVER_ADDRESS) {
    throw new Error('FLOW_CADENCE_ACCOUNT_ADDRESS not configured for server-side Cadence operations.');
  }
  return SERVER_ADDRESS;
}

/**
 * Validate that server-side Flow credentials are configured.
 * Throws a descriptive error if any required env var is missing.
 */
export function validateServerConfig(): { address: string; hasPrivateKey: boolean; contractAddress: string } {
  const errors: string[] = [];

  if (!SERVER_ADDRESS) errors.push('FLOW_CADENCE_ACCOUNT_ADDRESS');
  if (!PRIVATE_KEY) errors.push('FLOW_CADENCE_PRIVATE_KEY');
  if (!CONTRACT_ADDRESS && !SERVER_ADDRESS) errors.push('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS');

  if (errors.length > 0) {
    throw new Error(
      `Missing Flow server config: ${errors.join(', ')}. ` +
      'Server-side Flow operations will fail until these are configured.'
    );
  }

  return {
    address: SERVER_ADDRESS!,
    hasPrivateKey: !!PRIVATE_KEY,
    contractAddress: (CONTRACT_ADDRESS || SERVER_ADDRESS)!,
  };
}

/**
 * Create a server-side FCL authorization function.
 *
 * This authorization function uses the server's private key (ECDSA P256)
 * to sign transactions without requiring a user wallet. Used by cron jobs
 * and automated API routes for battle execution and market resolution.
 *
 * @returns An FCL authorization function suitable for proposer/payer/authorizations
 * @throws Error if FLOW_CADENCE_ACCOUNT_ADDRESS or FLOW_CADENCE_PRIVATE_KEY are not set
 */
export function createServerAuthorization() {
  if (!SERVER_ADDRESS || !PRIVATE_KEY) {
    throw new Error(
      'Server-side Cadence authorization requires FLOW_CADENCE_ACCOUNT_ADDRESS and FLOW_CADENCE_PRIVATE_KEY. ' +
      'These must be set in environment variables for automated Flow Cadence operations.'
    );
  }

  const address = SERVER_ADDRESS;
  const privateKey = PRIVATE_KEY;

  return function serverAuthorizationFunction(account: any) {
    return {
      ...account,
      tempId: `${address}-0`,
      addr: fcl.sansPrefix(address),
      keyId: 0,
      signingFunction: async (signable: any) => {
        const { SHA3 } = await import('sha3');
        // @ts-ignore - elliptic has no bundled types
        const { ec: EC } = await import('elliptic');
        const ec = new EC('p256');

        const sha3 = new SHA3(256);
        sha3.update(Buffer.from(signable.message, 'hex'));
        const digest = sha3.digest();

        const key = ec.keyFromPrivate(Buffer.from(privateKey, 'hex'));
        const sig = key.sign(digest);

        const n = 32;
        const r = sig.r.toArrayLike(Buffer, 'be', n);
        const s = sig.s.toArrayLike(Buffer, 'be', n);
        const signature = Buffer.concat([r, s]).toString('hex');

        return {
          addr: fcl.sansPrefix(address),
          keyId: 0,
          signature,
        };
      },
    };
  };
}

/**
 * Check if server-side Flow operations are available.
 * Returns false during build time or when credentials are missing.
 */
export function isServerFlowConfigured(): boolean {
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
  if (isBuildTime) return false;
  return !!(SERVER_ADDRESS && PRIVATE_KEY && (CONTRACT_ADDRESS || SERVER_ADDRESS));
}
