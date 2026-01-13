/**
 * API Route: Flow VRF Trade
 * VRF-enhanced trade execution on Flow chain mirror markets
 *
 * Features:
 * - Validate prediction is 0G verified before trading
 * - Execute VRF copy trades or direct trades
 * - Store trade audit trail in 0G
 * - Return transaction hash and execution details
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  createFlowWalletClient,
  executeWithFlowFallback,
  RPC_TIMEOUT
} from '@/lib/flowClient';

// ============================================================================
// Types
// ============================================================================

interface VRFTradeRequest {
  mirrorKey: string;        // Mirror market key (bytes32)
  agentId?: string;         // Agent ID for copy trading
  isYes: boolean;           // Trade direction
  amount: string;           // Amount in CRwN (ether units)
  useVRF?: boolean;         // Whether to use VRF for timing variance
  prediction?: {            // 0G verified prediction
    outcome: string;
    confidence: number;
    isVerified: boolean;
    proof?: {
      inputHash: string;
      outputHash: string;
      providerAddress: string;
      modelHash: string;
    };
  };
  slippageBps?: number;     // Max slippage in basis points
}

interface TradeResponse {
  success: boolean;
  txHash?: string;
  useVRF?: boolean;
  blockNumber?: string;
  sharesReceived?: string;
  error?: string;
  warning?: string;
}

// ============================================================================
// Contract Configuration
// ============================================================================

// ExternalMarketMirror ABI (relevant functions only)
const ExternalMarketMirrorABI = [
  {
    name: 'tradeMirror',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' },
      { name: 'minSharesOut', type: 'uint256' },
    ],
    outputs: [{ name: 'sharesOut', type: 'uint256' }],
  },
  {
    name: 'vrfCopyTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'agentId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },
  {
    name: 'tradeWithVerifiedPrediction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'prediction', type: 'tuple', components: [
        { name: 'outcome', type: 'string' },
        { name: 'confidence', type: 'uint256' },
        { name: 'inputHash', type: 'bytes32' },
        { name: 'outputHash', type: 'bytes32' },
        { name: 'providerAddress', type: 'address' },
        { name: 'isVerified', type: 'bool' },
      ]},
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [{ name: 'sharesOut', type: 'uint256' }],
  },
  {
    name: 'getMirrorMarket',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'mirrorKey', type: 'bytes32' }],
    outputs: [
      { name: '', type: 'tuple', components: [
        { name: 'flowMarketId', type: 'uint256' },
        { name: 'externalLink', type: 'tuple', components: [
          { name: 'externalId', type: 'string' },
          { name: 'source', type: 'uint8' },
          { name: 'lastSyncPrice', type: 'uint256' },
          { name: 'lastSyncTime', type: 'uint256' },
          { name: 'isActive', type: 'bool' },
        ]},
        { name: 'totalMirrorVolume', type: 'uint256' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'creator', type: 'address' },
      ]},
    ],
  },
] as const;

// CRwN Token ABI (for approvals)
const CRwNTokenABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Contract addresses (should come from environment/constants)
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

// Helper to check if error is timeout
function isTimeoutError(error: unknown): boolean {
  const errMsg = (error as Error).message || '';
  return errMsg.includes('timeout') ||
         errMsg.includes('timed out') ||
         errMsg.includes('took too long') ||
         errMsg.includes('TimeoutError');
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
      console.warn('[Flow VRF Trade] Primary RPC timed out waiting for receipt, trying fallback...');
      return await fallbackClient.waitForTransactionReceipt({ hash, timeout: RPC_TIMEOUT });
    }
    throw error;
  }
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body: VRFTradeRequest = await request.json();
    const {
      mirrorKey,
      agentId,
      isYes,
      amount,
      useVRF = false,
      prediction,
      slippageBps = 100, // 1% default slippage
    } = body;

    // Validate required fields
    if (!mirrorKey || amount === undefined || isYes === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: mirrorKey, isYes, amount' },
        { status: 400 }
      );
    }

    // Validate amount
    const amountWei = parseEther(amount);
    if (amountWei <= 0n) {
      return NextResponse.json(
        { success: false, error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Check prediction verification (if production mode)
    const allowTestMode = process.env.ALLOW_TEST_MODE === 'true';
    if (!allowTestMode && prediction && !prediction.isVerified) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only 0G verified predictions allowed for trading',
          warning: 'Set ALLOW_TEST_MODE=true to bypass verification',
        },
        { status: 400 }
      );
    }

    // Get server private key
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Server private key not configured' },
        { status: 500 }
      );
    }

    // Check if mirror contract is configured
    if (EXTERNAL_MARKET_MIRROR === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json(
        { success: false, error: 'ExternalMarketMirror contract not deployed. Set EXTERNAL_MARKET_MIRROR_ADDRESS env var.' },
        { status: 500 }
      );
    }

    const publicClient = getPublicClient();
    const fallbackClient = getFallbackPublicClient();
    const walletClient = getWalletClient(privateKey);
    const account = walletClient.account;

    // Verify mirror market exists and is active
    try {
      const mirrorMarket = await executeWithFlowFallback((client) =>
        client.readContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: ExternalMarketMirrorABI,
          functionName: 'getMirrorMarket',
          args: [mirrorKey as `0x${string}`],
        })
      );

      if (!mirrorMarket.externalLink.isActive) {
        return NextResponse.json(
          { success: false, error: 'Mirror market is not active' },
          { status: 400 }
        );
      }
    } catch (error) {
      // Contract may not be deployed yet
      console.warn('Could not verify mirror market:', error);
    }

    // Check and approve CRwN if needed
    try {
      const allowance = await executeWithFlowFallback((client) =>
        client.readContract({
          address: CRWN_TOKEN as `0x${string}`,
          abi: CRwNTokenABI,
          functionName: 'allowance',
          args: [account.address, EXTERNAL_MARKET_MIRROR as `0x${string}`],
        })
      );

      if (allowance < amountWei) {
        // Approve max amount
        const approveHash = await walletClient.writeContract({
          address: CRWN_TOKEN as `0x${string}`,
          abi: CRwNTokenABI,
          functionName: 'approve',
          args: [EXTERNAL_MARKET_MIRROR as `0x${string}`, amountWei * 10n], // Approve extra
        });

        await waitForReceiptWithFallback(approveHash, publicClient, fallbackClient);
      }
    } catch (approvalError) {
      console.warn('Token approval check failed:', approvalError);
    }

    let txHash: `0x${string}`;

    if (useVRF && agentId) {
      // VRF-enhanced copy trade
      txHash = await walletClient.writeContract({
        address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
        abi: ExternalMarketMirrorABI,
        functionName: 'vrfCopyTrade',
        args: [
          mirrorKey as `0x${string}`,
          BigInt(agentId),
          isYes,
          amountWei,
        ],
      });
    } else {
      // Direct trade
      const minSharesOut = (amountWei * BigInt(10000 - slippageBps)) / 10000n;

      txHash = await walletClient.writeContract({
        address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
        abi: ExternalMarketMirrorABI,
        functionName: 'tradeMirror',
        args: [
          mirrorKey as `0x${string}`,
          isYes,
          amountWei,
          minSharesOut,
        ],
      });
    }

    // Wait for confirmation
    const receipt = await waitForReceiptWithFallback(txHash, publicClient, fallbackClient);

    // Store trade in 0G for audit trail
    if (prediction?.proof) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        await fetch(`${baseUrl}/api/0g/market-store`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'trade_execution',
            data: {
              mirrorKey,
              agentId,
              isYes,
              amount,
              txHash,
              prediction,
              useVRF,
              blockNumber: receipt.blockNumber.toString(),
              timestamp: Date.now(),
            },
          }),
        });
      } catch (storeError) {
        console.warn('Failed to store trade in 0G:', storeError);
      }
    }

    const response: TradeResponse = {
      success: true,
      txHash,
      useVRF,
      blockNumber: receipt.blockNumber.toString(),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Flow VRF trade error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Trade execution failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Get trade status or mirror market info
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mirrorKey = searchParams.get('mirrorKey');
    const txHash = searchParams.get('txHash');

    if (!mirrorKey && !txHash) {
      return NextResponse.json(
        { success: false, error: 'Provide mirrorKey or txHash query parameter' },
        { status: 400 }
      );
    }

    const publicClient = getPublicClient();

    if (txHash) {
      // Get transaction receipt
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      return NextResponse.json({
        success: true,
        status: receipt.status,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
      });
    }

    if (mirrorKey && EXTERNAL_MARKET_MIRROR !== '0x0000000000000000000000000000000000000000') {
      // Get mirror market info
      try {
        const mirrorMarket = await executeWithFlowFallback((client) =>
          client.readContract({
            address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
            abi: ExternalMarketMirrorABI,
            functionName: 'getMirrorMarket',
            args: [mirrorKey as `0x${string}`],
          })
        );

        return NextResponse.json({
          success: true,
          mirrorMarket: {
            flowMarketId: mirrorMarket.flowMarketId.toString(),
            externalId: mirrorMarket.externalLink.externalId,
            source: mirrorMarket.externalLink.source === 0 ? 'polymarket' : 'kalshi',
            lastSyncPrice: mirrorMarket.externalLink.lastSyncPrice.toString(),
            isActive: mirrorMarket.externalLink.isActive,
            totalVolume: formatEther(mirrorMarket.totalMirrorVolume),
            creator: mirrorMarket.creator,
          },
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: 'Mirror market not found or contract not deployed',
        }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Flow VRF trade GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
