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
import { createWalletClient, createPublicClient, http, parseEther, formatEther, keccak256, toBytes, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';

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

const ExternalMarketMirrorABI = [
  {
    name: 'createMirrorMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'externalId', type: 'string' },
      { name: 'source', type: 'uint8' },
      { name: 'question', type: 'string' },
      { name: 'externalYesPrice', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'initialLiquidity', type: 'uint256' },
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },
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
    name: 'syncPrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'newExternalPrice', type: 'uint256' },
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'resolveMirror',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'yesWon', type: 'bool' },
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [],
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
  {
    name: 'getMirrorKey',
    type: 'function',
    stateMutability: 'pure',
    inputs: [
      { name: 'source', type: 'uint8' },
      { name: 'externalId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'isMirrored',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'source', type: 'uint8' },
      { name: 'externalId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'totalMirrors',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalMirrorVolume',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

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
] as const;

// Contract addresses
const EXTERNAL_MARKET_MIRROR = process.env.EXTERNAL_MARKET_MIRROR_ADDRESS || '0x0000000000000000000000000000000000000000';
const CRWN_TOKEN = process.env.NEXT_PUBLIC_CRWN_TOKEN_ADDRESS || '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6';

// ============================================================================
// Client Setup
// ============================================================================

function getPublicClient() {
  return createPublicClient({
    chain: flowTestnet,
    transport: http(),
  });
}

function getWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: flowTestnet,
    transport: http(),
  });
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
    const body: ExecuteRequest = await request.json();

    // Get private key
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Server private key not configured' },
        { status: 500 }
      );
    }

    // Check contract deployment
    if (EXTERNAL_MARKET_MIRROR === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json(
        { success: false, error: 'ExternalMarketMirror contract not deployed' },
        { status: 500 }
      );
    }

    const publicClient = getPublicClient();
    const walletClient = getWalletClient(privateKey);
    const account = walletClient.account;

    switch (body.action) {
      // ========================================
      // Create Mirror Market
      // ========================================
      case 'createMirror': {
        const { externalId, source, question, yesPrice, endTime, initialLiquidity } = body;

        // Validate inputs
        if (!externalId || !source || !question || !yesPrice || !endTime || !initialLiquidity) {
          return NextResponse.json(
            { success: false, error: 'Missing required fields for createMirror' },
            { status: 400 }
          );
        }

        const liquidityWei = parseEther(initialLiquidity);
        const sourceEnum = getSourceEnum(source);

        // Approve CRwN if needed
        const allowance = await publicClient.readContract({
          address: CRWN_TOKEN as `0x${string}`,
          abi: CRwNTokenABI,
          functionName: 'allowance',
          args: [account.address, EXTERNAL_MARKET_MIRROR as `0x${string}`],
        });

        if (allowance < liquidityWei) {
          const approveHash = await walletClient.writeContract({
            address: CRWN_TOKEN as `0x${string}`,
            abi: CRwNTokenABI,
            functionName: 'approve',
            args: [EXTERNAL_MARKET_MIRROR as `0x${string}`, liquidityWei * 2n],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        // Create mirror market
        const txHash = await walletClient.writeContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: ExternalMarketMirrorABI,
          functionName: 'createMirrorMarket',
          args: [
            externalId,
            sourceEnum,
            question,
            BigInt(yesPrice),
            BigInt(endTime),
            liquidityWei,
          ],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        // Compute mirror key
        const mirrorKey = computeMirrorKey(source, externalId);

        return NextResponse.json({
          success: true,
          action: 'createMirror',
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          mirrorKey,
          externalId,
          source,
        });
      }

      // ========================================
      // Trade on Mirror
      // ========================================
      case 'trade': {
        const { mirrorKey, isYes, amount, minSharesOut = '0' } = body;

        if (!mirrorKey || isYes === undefined || !amount) {
          return NextResponse.json(
            { success: false, error: 'Missing required fields for trade' },
            { status: 400 }
          );
        }

        const amountWei = parseEther(amount);
        const minOutWei = parseEther(minSharesOut);

        // Approve if needed
        const allowance = await publicClient.readContract({
          address: CRWN_TOKEN as `0x${string}`,
          abi: CRwNTokenABI,
          functionName: 'allowance',
          args: [account.address, EXTERNAL_MARKET_MIRROR as `0x${string}`],
        });

        if (allowance < amountWei) {
          const approveHash = await walletClient.writeContract({
            address: CRWN_TOKEN as `0x${string}`,
            abi: CRwNTokenABI,
            functionName: 'approve',
            args: [EXTERNAL_MARKET_MIRROR as `0x${string}`, amountWei * 2n],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        const txHash = await walletClient.writeContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: ExternalMarketMirrorABI,
          functionName: 'tradeMirror',
          args: [
            mirrorKey as `0x${string}`,
            isYes,
            amountWei,
            minOutWei,
          ],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        return NextResponse.json({
          success: true,
          action: 'trade',
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          mirrorKey,
          isYes,
          amount,
        });
      }

      // ========================================
      // Sync Price
      // ========================================
      case 'syncPrice': {
        const { mirrorKey, newPrice } = body;

        if (!mirrorKey || newPrice === undefined) {
          return NextResponse.json(
            { success: false, error: 'Missing required fields for syncPrice' },
            { status: 400 }
          );
        }

        // Generate oracle signature
        const chainId = flowTestnet.id;
        const messageData = encodeAbiParameters(
          [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'string' }],
          [mirrorKey as `0x${string}`, BigInt(newPrice), BigInt(chainId), 'SYNC']
        );
        const messageHash = keccak256(messageData);
        const signature = await signOracleMessage(messageHash, privateKey);

        const txHash = await walletClient.writeContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: ExternalMarketMirrorABI,
          functionName: 'syncPrice',
          args: [
            mirrorKey as `0x${string}`,
            BigInt(newPrice),
            signature,
          ],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        return NextResponse.json({
          success: true,
          action: 'syncPrice',
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          mirrorKey,
          newPrice,
        });
      }

      // ========================================
      // Resolve Mirror
      // ========================================
      case 'resolve': {
        const { mirrorKey, yesWon } = body;

        if (!mirrorKey || yesWon === undefined) {
          return NextResponse.json(
            { success: false, error: 'Missing required fields for resolve' },
            { status: 400 }
          );
        }

        // Generate oracle signature
        const chainId = flowTestnet.id;
        const messageData = encodeAbiParameters(
          [{ type: 'bytes32' }, { type: 'bool' }, { type: 'string' }, { type: 'uint256' }],
          [mirrorKey as `0x${string}`, yesWon, 'RESOLVE', BigInt(chainId)]
        );
        const messageHash = keccak256(messageData);
        const signature = await signOracleMessage(messageHash, privateKey);

        const txHash = await walletClient.writeContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: ExternalMarketMirrorABI,
          functionName: 'resolveMirror',
          args: [
            mirrorKey as `0x${string}`,
            yesWon,
            signature,
          ],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        return NextResponse.json({
          success: true,
          action: 'resolve',
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          mirrorKey,
          yesWon,
        });
      }

      // ========================================
      // Query Mirror
      // ========================================
      case 'query': {
        const { mirrorKey } = body;

        if (!mirrorKey) {
          return NextResponse.json(
            { success: false, error: 'Missing mirrorKey for query' },
            { status: 400 }
          );
        }

        const mirrorMarket = await publicClient.readContract({
          address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
          abi: ExternalMarketMirrorABI,
          functionName: 'getMirrorMarket',
          args: [mirrorKey as `0x${string}`],
        });

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
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use: createMirror, trade, syncPrice, resolve, query' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Flow execute error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Query system stats
 */
export async function GET() {
  try {
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

    const publicClient = getPublicClient();

    const [totalMirrors, totalVolume] = await Promise.all([
      publicClient.readContract({
        address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
        abi: ExternalMarketMirrorABI,
        functionName: 'totalMirrors',
      }),
      publicClient.readContract({
        address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
        abi: ExternalMarketMirrorABI,
        functionName: 'totalMirrorVolume',
      }),
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
    console.error('Flow execute GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
