/**
 * API Route: Flow Execute
 * Direct trade execution and mirror market operations on Flow chain
 *
 * Features:
 * - Create mirror markets from external sources
 * - Execute direct trades on mirror markets
 * - Query mirror market state and positions
 * - Sync prices from external markets
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseEther, formatEther, keccak256, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  createFlowWalletClient,
  executeWithFlowFallbackForKey,
  isTimeoutError,
  RPC_TIMEOUT
} from '@/lib/flowClient';
import { handleAPIError, applyRateLimit, ErrorResponses, RateLimitPresets } from '@/lib/api';
import { EXTERNAL_MARKET_MIRROR_ABI, CRWN_TOKEN_ABI } from '@/constants/abis';
import { assertOracleAuthorized } from '@/lib/oracleVerification';
import { getChainId } from '@/constants';
import { globalErrorHandler } from '@/lib/errorRecovery';
import { FlowMetrics, PerformanceTimer } from '@/lib/metrics';
import { globalAlertManager, AlertSeverity } from '@/lib/alerting/alertManager';

// ============================================================================
// Types
// ============================================================================

interface CreateMirrorRequest {
  action: 'createMirror';
  externalId: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  yesPrice: number;         // 0-10000 bps
  endTime: number;          // Unix timestamp
  initialLiquidity: string; // CRwN amount
}

interface TradeRequest {
  action: 'trade';
  mirrorKey: string;
  isYes: boolean;
  amount: string;
  minSharesOut?: string;
}

interface SyncPriceRequest {
  action: 'syncPrice';
  mirrorKey: string;
  newPrice: number;         // 0-10000 bps
}

interface ResolveRequest {
  action: 'resolve';
  mirrorKey: string;
  yesWon: boolean;
}

interface QueryRequest {
  action: 'query';
  mirrorKey: string;
}

type ExecuteRequest = CreateMirrorRequest | TradeRequest | SyncPriceRequest | ResolveRequest | QueryRequest;

// ============================================================================
// Contract Configuration
// ============================================================================
// ABIs are now imported from unified source (@/constants/abis)

// Contract addresses
const EXTERNAL_MARKET_MIRROR = process.env.EXTERNAL_MARKET_MIRROR_ADDRESS || '0x0000000000000000000000000000000000000000';
const CRWN_TOKEN = process.env.NEXT_PUBLIC_CRWN_TOKEN_ADDRESS || '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6';

// ============================================================================
// Client Setup
// ============================================================================

function getPublicClient() {
  return createFlowPublicClient();
}

function getFallbackPublicClient() {
  return createFlowFallbackClient();
}

function getWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return createFlowWalletClient(account);
}

// Wait for receipt with fallback
async function waitForReceiptWithFallback(
  hash: `0x${string}`,
  primaryClient: ReturnType<typeof getPublicClient>,
  fallbackClient: ReturnType<typeof getFallbackPublicClient>
) {
  try {
    return await primaryClient.waitForTransactionReceipt({ hash, timeout: RPC_TIMEOUT });
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[Flow Execute] Primary RPC timed out waiting for receipt, trying fallback...');
      return await fallbackClient.waitForTransactionReceipt({ hash, timeout: RPC_TIMEOUT });
    }
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSourceEnum(source: 'polymarket' | 'kalshi'): number {
  return source === 'polymarket' ? 0 : 1;
}

function computeMirrorKey(source: 'polymarket' | 'kalshi', externalId: string): `0x${string}` {
  const sourceNum = getSourceEnum(source);
  const encoded = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'string' }],
    [sourceNum, externalId]
  );
  return keccak256(encoded);
}

async function signOracleMessage(
  messageHash: `0x${string}`,
  privateKey: `0x${string}`
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signMessage({ message: { raw: messageHash } });
  return signature;
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'flow-execute',
      ...RateLimitPresets.flowExecution,
    });

    const body: ExecuteRequest = await request.json();

    // Get private key
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Server private key not configured');
    }

    // Check contract deployment
    if (EXTERNAL_MARKET_MIRROR === '0x0000000000000000000000000000000000000000') {
      throw ErrorResponses.serviceUnavailable('ExternalMarketMirror contract not deployed');
    }

    const publicClient = getPublicClient();
    const fallbackClient = getFallbackPublicClient();
    const walletClient = getWalletClient(privateKey);
    const account = walletClient.account!;

    switch (body.action) {
      // ========================================
      // Create Mirror Market
      // ========================================
      case 'createMirror': {
        const timer = new PerformanceTimer('create_mirror');

        try {
          const { externalId, source, question, yesPrice, endTime, initialLiquidity } = body;

          // Validate inputs
          if (!externalId || !source || !question || !yesPrice || !endTime || !initialLiquidity) {
            throw ErrorResponses.badRequest('Missing required fields for createMirror');
          }

          const liquidityWei = parseEther(initialLiquidity);
          const sourceEnum = getSourceEnum(source);

          // Approve CRwN if needed (wrapped with circuit breaker)
          const allowance = await globalErrorHandler.handleRPCCall(
            async () => await executeWithFlowFallbackForKey(externalId, (client) =>
              client.readContract({
                address: CRWN_TOKEN as `0x${string}`,
                abi: CRWN_TOKEN_ABI,
                functionName: 'allowance',
                args: [account.address, EXTERNAL_MARKET_MIRROR as `0x${string}`],
              })
            ),
            'check_crwn_allowance'
          );

          if (allowance < liquidityWei) {
            const approveHash = await globalErrorHandler.handleRPCCall(
              async () => await walletClient.writeContract({
                address: CRWN_TOKEN as `0x${string}`,
                abi: CRWN_TOKEN_ABI,
                functionName: 'approve',
                args: [EXTERNAL_MARKET_MIRROR as `0x${string}`, liquidityWei * 2n],
              }),
              'approve_crwn_token'
            );
            await waitForReceiptWithFallback(approveHash, publicClient, fallbackClient);
          }

          // Create mirror market (wrapped with circuit breaker)
          const txHash = await globalErrorHandler.handleRPCCall(
            async () => await walletClient.writeContract({
              address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
              abi: EXTERNAL_MARKET_MIRROR_ABI,
              functionName: 'createMirrorMarket',
              args: [
                externalId,
                sourceEnum,
                question,
                BigInt(yesPrice),
                BigInt(endTime),
                liquidityWei,
              ],
            }),
            'create_mirror_market'
          );

          const receipt = await waitForReceiptWithFallback(txHash, publicClient, fallbackClient);

          // Compute mirror key
          const mirrorKey = computeMirrorKey(source, externalId);

          // Record success metrics
          timer.end({ status: 'success' });
          FlowMetrics.recordMarketCreated(source);

          return NextResponse.json({
            success: true,
            action: 'createMirror',
            txHash,
            blockNumber: receipt.blockNumber.toString(),
            mirrorKey,
            externalId,
            source,
          });
        } catch (error: any) {
          timer.end({ status: 'error' });
          FlowMetrics.recordOperationFailed('create_mirror');
          throw error; // Re-throw to be caught by outer handler
        }
      }

      // ========================================
      // Trade on Mirror
      // ========================================
      case 'trade': {
        const timer = new PerformanceTimer('execute_trade');

        try {
          const { mirrorKey, isYes, amount, minSharesOut = '0' } = body;

          if (!mirrorKey || isYes === undefined || !amount) {
            throw ErrorResponses.badRequest('Missing required fields for trade');
          }

          const amountWei = parseEther(amount);
          const minOutWei = parseEther(minSharesOut);

          // Approve if needed (wrapped with circuit breaker)
          const allowance = await globalErrorHandler.handleRPCCall(
            async () => await executeWithFlowFallbackForKey(mirrorKey, (client) =>
              client.readContract({
                address: CRWN_TOKEN as `0x${string}`,
                abi: CRWN_TOKEN_ABI,
                functionName: 'allowance',
                args: [account.address, EXTERNAL_MARKET_MIRROR as `0x${string}`],
              })
            ),
            'check_crwn_allowance'
          );

          if (allowance < amountWei) {
            const approveHash = await globalErrorHandler.handleRPCCall(
              async () => await walletClient.writeContract({
                address: CRWN_TOKEN as `0x${string}`,
                abi: CRWN_TOKEN_ABI,
                functionName: 'approve',
                args: [EXTERNAL_MARKET_MIRROR as `0x${string}`, amountWei * 2n],
              }),
              'approve_crwn_token'
            );
            await waitForReceiptWithFallback(approveHash, publicClient, fallbackClient);
          }

          // Execute trade (wrapped with circuit breaker)
          const txHash = await globalErrorHandler.handleRPCCall(
            async () => await walletClient.writeContract({
              address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
              abi: EXTERNAL_MARKET_MIRROR_ABI,
              functionName: 'tradeMirror',
              args: [
                mirrorKey as `0x${string}`,
                isYes,
                amountWei,
                minOutWei,
              ],
            }),
            'execute_mirror_trade'
          );

          const receipt = await waitForReceiptWithFallback(txHash, publicClient, fallbackClient);

          // Record success metrics
          timer.end({ status: 'success' });
          FlowMetrics.recordTradeExecuted(mirrorKey, isYes ? 'yes' : 'no');
          FlowMetrics.recordTradeVolume(amount);

          return NextResponse.json({
            success: true,
            action: 'trade',
            txHash,
            blockNumber: receipt.blockNumber.toString(),
            mirrorKey,
            isYes,
            amount,
          });
        } catch (error: any) {
          timer.end({ status: 'error' });
          FlowMetrics.recordOperationFailed('trade');
          throw error;
        }
      }

      // ========================================
      // Sync Price
      // ========================================
      case 'syncPrice': {
        const timer = new PerformanceTimer('sync_price');

        try {
          const { mirrorKey, newPrice } = body;

          if (!mirrorKey || newPrice === undefined) {
            throw ErrorResponses.badRequest('Missing required fields for syncPrice');
          }

          // Verify oracle authorization before signing
          await assertOracleAuthorized(EXTERNAL_MARKET_MIRROR as `0x${string}`, privateKey);

          // Generate oracle signature
          const chainId = getChainId(); // Use environment config instead of hardcoded
          const messageData = encodeAbiParameters(
            [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'string' }],
            [mirrorKey as `0x${string}`, BigInt(newPrice), BigInt(chainId), 'SYNC']
          );
          const messageHash = keccak256(messageData);
          const signature = await signOracleMessage(messageHash, privateKey);

          // Execute syncPrice (wrapped with circuit breaker)
          const txHash = await globalErrorHandler.handleRPCCall(
            async () => await walletClient.writeContract({
              address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
              abi: EXTERNAL_MARKET_MIRROR_ABI,
              functionName: 'syncPrice',
              args: [
                mirrorKey as `0x${string}`,
                BigInt(newPrice),
                signature,
              ],
            }),
            'sync_mirror_price'
          );

          const receipt = await waitForReceiptWithFallback(txHash, publicClient, fallbackClient);

          // Record success metrics
          timer.end({ status: 'success' });
          FlowMetrics.recordOracleOperation('syncPrice', true);

          return NextResponse.json({
            success: true,
            action: 'syncPrice',
            txHash,
            blockNumber: receipt.blockNumber.toString(),
            mirrorKey,
            newPrice,
          });
        } catch (error: any) {
          timer.end({ status: 'error' });
          FlowMetrics.recordOracleOperation('syncPrice', false);

          await globalAlertManager.sendAlert(
            'Price Sync Failed',
            `Failed to sync price for market ${body.mirrorKey}: ${error.message}`,
            AlertSeverity.ERROR,
            { source: 'flow_execute', metadata: { mirrorKey: body.mirrorKey, error: error.message } }
          );
          throw error;
        }
      }

      // ========================================
      // Resolve Mirror
      // ========================================
      case 'resolve': {
        const timer = new PerformanceTimer('resolve_market');

        try {
          const { mirrorKey, yesWon } = body;

          if (!mirrorKey || yesWon === undefined) {
            throw ErrorResponses.badRequest('Missing required fields for resolve');
          }

          // Verify oracle authorization before signing
          await assertOracleAuthorized(EXTERNAL_MARKET_MIRROR as `0x${string}`, privateKey);

          // Generate oracle signature
          const chainId = getChainId(); // Use environment config instead of hardcoded
          const messageData = encodeAbiParameters(
            [{ type: 'bytes32' }, { type: 'bool' }, { type: 'string' }, { type: 'uint256' }],
            [mirrorKey as `0x${string}`, yesWon, 'RESOLVE', BigInt(chainId)]
          );
          const messageHash = keccak256(messageData);
          const signature = await signOracleMessage(messageHash, privateKey);

          // Execute resolve (wrapped with circuit breaker)
          const txHash = await globalErrorHandler.handleRPCCall(
            async () => await walletClient.writeContract({
              address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
              abi: EXTERNAL_MARKET_MIRROR_ABI,
              functionName: 'resolveMirror',
              args: [
                mirrorKey as `0x${string}`,
                yesWon,
                signature,
              ],
            }),
            'resolve_mirror_market'
          );

          const receipt = await waitForReceiptWithFallback(txHash, publicClient, fallbackClient);

          // Record success metrics
          timer.end({ status: 'success' });
          // Extract source from body if available
          const source = (body as any).source || 'unknown';
          FlowMetrics.recordMarketResolved(source, yesWon ? 'yes' : 'no');
          FlowMetrics.recordOracleOperation('resolve', true);

          return NextResponse.json({
            success: true,
            action: 'resolve',
            txHash,
            blockNumber: receipt.blockNumber.toString(),
            mirrorKey,
            yesWon,
          });
        } catch (error: any) {
          timer.end({ status: 'error' });
          FlowMetrics.recordOracleOperation('resolve', false);

          await globalAlertManager.sendAlert(
            'Market Resolution Failed',
            `Failed to resolve market ${body.mirrorKey}: ${error.message}`,
            AlertSeverity.ERROR,
            { source: 'flow_execute', metadata: { mirrorKey: body.mirrorKey, error: error.message } }
          );
          throw error;
        }
      }

      // ========================================
      // Query Mirror
      // ========================================
      case 'query': {
        const timer = new PerformanceTimer('query_market');

        try {
          const { mirrorKey } = body;

          if (!mirrorKey) {
            throw ErrorResponses.badRequest('Missing mirrorKey for query');
          }

          // Query market with hash-ring routing (same mirrorKey always hits same RPC)
          const mirrorMarket = await globalErrorHandler.handleRPCCall(
            async () => await executeWithFlowFallbackForKey(mirrorKey, (client) =>
              client.readContract({
                address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
                abi: EXTERNAL_MARKET_MIRROR_ABI,
                functionName: 'getMirrorMarket',
                args: [mirrorKey as `0x${string}`],
              })
            ),
            'read_mirror_market'
          );

          timer.end({ status: 'success' });

          return NextResponse.json({
            success: true,
            action: 'query',
            mirrorKey,
            market: {
              flowMarketId: mirrorMarket.flowMarketId.toString(),
              externalId: mirrorMarket.externalLink.externalId,
              source: mirrorMarket.externalLink.source === 0 ? 'polymarket' : 'kalshi',
              lastSyncPrice: mirrorMarket.externalLink.lastSyncPrice.toString(),
              lastSyncTime: new Date(Number(mirrorMarket.externalLink.lastSyncTime) * 1000).toISOString(),
              isActive: mirrorMarket.externalLink.isActive,
              totalVolume: formatEther(mirrorMarket.totalMirrorVolume),
              createdAt: new Date(Number(mirrorMarket.createdAt) * 1000).toISOString(),
              creator: mirrorMarket.creator,
            },
          });
        } catch (error: any) {
          timer.end({ status: 'error' });
          FlowMetrics.recordOperationFailed('query');
          throw error;
        }
      }

      default:
        throw ErrorResponses.badRequest('Invalid action. Use: createMirror, trade, syncPrice, resolve, query');
    }

  } catch (error) {
    return handleAPIError(error, 'API:Flow:Execute:POST');
  }
}

/**
 * GET: Query system stats
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'flow-execute-get',
      ...RateLimitPresets.apiQueries,
    });

    if (EXTERNAL_MARKET_MIRROR === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({
        success: true,
        status: 'not_deployed',
        message: 'ExternalMarketMirror contract not yet deployed',
        config: {
          contractAddress: EXTERNAL_MARKET_MIRROR,
          crwnToken: CRWN_TOKEN,
          chain: 'flow-testnet',
          chainId: flowTestnet.id,
        },
      });
    }

    // Use hash-ring routing with contract address as key (deterministic RPC selection)
    const [totalMirrors, totalVolume] = await Promise.all([
      executeWithFlowFallbackForKey(EXTERNAL_MARKET_MIRROR, (client) =>
        client.readContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: EXTERNAL_MARKET_MIRROR_ABI,
          functionName: 'totalMirrors',
        })
      ),
      executeWithFlowFallbackForKey(EXTERNAL_MARKET_MIRROR, (client) =>
        client.readContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: EXTERNAL_MARKET_MIRROR_ABI,
          functionName: 'totalMirrorVolume',
        })
      ),
    ]);

    return NextResponse.json({
      success: true,
      status: 'operational',
      stats: {
        totalMirrors: totalMirrors.toString(),
        totalVolume: formatEther(totalVolume),
      },
      config: {
        contractAddress: EXTERNAL_MARKET_MIRROR,
        crwnToken: CRWN_TOKEN,
        chain: 'flow-testnet',
        chainId: flowTestnet.id,
      },
    });

  } catch (error) {
    return handleAPIError(error, 'API:Flow:Execute:GET');
  }
}
