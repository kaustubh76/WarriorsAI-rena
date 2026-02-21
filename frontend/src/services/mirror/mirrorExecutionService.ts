/**
 * Mirror Market Execution Service
 * Shared service for resolving mirror markets on Flow EVM.
 *
 * Extracted from flow/execute/route.ts so that cron jobs and API routes
 * can resolve mirrors directly without fragile HTTP self-calls.
 */

import { keccak256, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  createFlowWalletClient,
  isTimeoutError,
  RPC_TIMEOUT,
} from '@/lib/flowClient';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis';
import { assertOracleAuthorized } from '@/lib/oracleVerification';
import { getChainId } from '@/constants';

const EXTERNAL_MARKET_MIRROR =
  process.env.EXTERNAL_MARKET_MIRROR_ADDRESS ||
  '0x0000000000000000000000000000000000000000';

/**
 * Resolve a mirror market on-chain with oracle signature.
 *
 * @param mirrorKey - The bytes32 mirror key identifying the market
 * @param yesWon - Whether the YES outcome won
 * @returns Transaction hash and block number
 * @throws If private key missing, contract not deployed, or tx fails
 */
export async function resolveMirrorMarket(
  mirrorKey: string,
  yesWon: boolean
): Promise<{ txHash: string; blockNumber: string }> {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    throw new Error('Server private key not configured');
  }
  if (EXTERNAL_MARKET_MIRROR === '0x0000000000000000000000000000000000000000') {
    throw new Error('ExternalMarketMirror contract not deployed');
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createFlowWalletClient(account);
  const publicClient = createFlowPublicClient();
  const fallbackClient = createFlowFallbackClient();

  // Verify oracle authorization before signing
  await assertOracleAuthorized(
    EXTERNAL_MARKET_MIRROR as `0x${string}`,
    privateKey
  );

  // Generate oracle signature
  const chainId = getChainId();
  const messageData = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'bool' },
      { type: 'string' },
      { type: 'uint256' },
    ],
    [mirrorKey as `0x${string}`, yesWon, 'RESOLVE', BigInt(chainId)]
  );
  const messageHash = keccak256(messageData);
  const signature = await account.signMessage({
    message: { raw: messageHash },
  });

  // Execute resolve on-chain
  const txHash = await walletClient.writeContract({
    address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
    abi: EXTERNAL_MARKET_MIRROR_ABI,
    functionName: 'resolveMirror',
    args: [mirrorKey as `0x${string}`, yesWon, signature],
  });

  // Wait for receipt with fallback
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: RPC_TIMEOUT,
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn(
        '[MirrorExecutionService] Primary RPC timed out, trying fallback...'
      );
      receipt = await fallbackClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: RPC_TIMEOUT,
      });
    } else {
      throw error;
    }
  }

  return { txHash, blockNumber: receipt.blockNumber.toString() };
}
