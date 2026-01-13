/**
 * Agent External Trade API
 * Executes trades on mirror markets on behalf of AI agents
 *
 * Flow:
 * 1. Verify agent permissions on 0G chain
 * 2. Generate oracle signature for verified prediction
 * 3. Execute trade on Flow mirror market
 * 4. Record trade in database
 * 5. Cross-chain callback to record on 0G
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  encodePacked,
  keccak256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainsToContracts, getZeroGChainId, getZeroGComputeRpc, getFlowRpcUrl } from '@/constants';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';

// ============================================
// CHAIN DEFINITIONS
// ============================================

const ZEROG_CHAIN = {
  id: 16602,
  name: '0G Galileo Testnet',
  network: '0g-galileo',
  nativeCurrency: { decimals: 18, name: '0G Token', symbol: '0G' },
  rpcUrls: {
    default: { http: [getZeroGComputeRpc()] },
    public: { http: [getZeroGComputeRpc()] },
  },
} as const;

const FLOW_CHAIN = {
  id: 545,
  name: 'Flow Testnet',
  network: 'flow-testnet',
  nativeCurrency: { decimals: 18, name: 'Flow', symbol: 'FLOW' },
  rpcUrls: {
    default: { http: [getFlowRpcUrl()] },
    public: { http: [getFlowRpcUrl()] },
  },
} as const;

// ============================================
// TYPES
// ============================================

interface ExternalTradeRequest {
  agentId: string;
  mirrorKey: string;
  prediction: {
    outcome: 'yes' | 'no';
    confidence: number;
    inputHash: `0x${string}`;
    outputHash: `0x${string}`;
    providerAddress: `0x${string}`;
    modelHash?: `0x${string}`;
    isVerified: boolean;
    signature?: `0x${string}`;
  };
  amount: string;
}

// Simplified ABI for ExternalMarketMirror
const externalMarketMirrorAbi = [
  {
    type: 'function',
    name: 'agentTradeMirror',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'agentId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      {
        name: 'prediction',
        type: 'tuple',
        components: [
          { name: 'outcome', type: 'string' },
          { name: 'confidence', type: 'uint256' },
          { name: 'inputHash', type: 'bytes32' },
          { name: 'outputHash', type: 'bytes32' },
          { name: 'providerAddress', type: 'address' },
          { name: 'isVerified', type: 'bool' },
        ],
      },
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [{ name: 'sharesOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMirrorMarket',
    inputs: [{ name: 'mirrorKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'flowMarketId', type: 'uint256' },
          {
            name: 'externalLink',
            type: 'tuple',
            components: [
              { name: 'externalId', type: 'string' },
              { name: 'source', type: 'uint8' },
              { name: 'lastSyncPrice', type: 'uint256' },
              { name: 'lastSyncTime', type: 'uint256' },
              { name: 'isActive', type: 'bool' },
            ],
          },
          { name: 'totalMirrorVolume', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'creator', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

// ============================================
// CLIENTS
// ============================================

function getOracleAccount() {
  const privateKey = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Oracle private key not configured');
  }
  return privateKeyToAccount(privateKey as `0x${string}`);
}

const zeroGPublicClient = createPublicClient({
  chain: ZEROG_CHAIN,
  transport: http(),
});

const flowPublicClient = createPublicClient({
  chain: FLOW_CHAIN,
  transport: http(),
});

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: ExternalTradeRequest = await request.json();

    // Validate request
    if (!body.agentId || !body.mirrorKey || !body.prediction || !body.amount) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, mirrorKey, prediction, amount' },
        { status: 400 }
      );
    }

    const agentId = BigInt(body.agentId);
    const mirrorKey = body.mirrorKey as `0x${string}`;
    const amount = parseEther(body.amount);

    // Get contract addresses
    const zeroGContracts = chainsToContracts[getZeroGChainId()];
    const flowContracts = chainsToContracts[545];

    const aiAgentINFTAddress = zeroGContracts?.aiAgentINFT as `0x${string}`;
    const externalMarketMirrorAddress = flowContracts?.externalMarketMirror as `0x${string}`;

    if (!aiAgentINFTAddress || aiAgentINFTAddress === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json(
        { error: 'AI Agent iNFT contract not deployed' },
        { status: 500 }
      );
    }

    if (!externalMarketMirrorAddress || externalMarketMirrorAddress === '0x0000000000000000000000000000000000000000') {
      return NextResponse.json(
        { error: 'External Market Mirror contract not deployed' },
        { status: 500 }
      );
    }

    // Step 1: Verify agent permissions on 0G chain
    const [isActive, externalStats] = await Promise.all([
      zeroGPublicClient.readContract({
        address: aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'isAgentActive',
        args: [agentId],
      }),
      zeroGPublicClient.readContract({
        address: aiAgentINFTAddress,
        abi: AIAgentINFTAbi,
        functionName: 'getExternalTradingStats',
        args: [agentId],
      }),
    ]);

    if (!isActive) {
      return NextResponse.json(
        { error: 'Agent is not active' },
        { status: 403 }
      );
    }

    // Get mirror market info to determine source
    const mirrorMarket = await flowPublicClient.readContract({
      address: externalMarketMirrorAddress,
      abi: externalMarketMirrorAbi,
      functionName: 'getMirrorMarket',
      args: [mirrorKey],
    });

    if (!mirrorMarket.externalLink.isActive) {
      return NextResponse.json(
        { error: 'Mirror market is not active' },
        { status: 400 }
      );
    }

    const isPolymarket = mirrorMarket.externalLink.source === 0; // POLYMARKET = 0
    const [polymarketEnabled, kalshiEnabled] = externalStats as [boolean, boolean, bigint, bigint];

    if (isPolymarket && !polymarketEnabled) {
      return NextResponse.json(
        { error: 'Agent does not have Polymarket trading enabled' },
        { status: 403 }
      );
    }

    if (!isPolymarket && !kalshiEnabled) {
      return NextResponse.json(
        { error: 'Agent does not have Kalshi trading enabled' },
        { status: 403 }
      );
    }

    // Step 2: Generate oracle signature for agent trade
    const oracleAccount = getOracleAccount();

    const messageHash = keccak256(
      encodePacked(
        ['bytes32', 'uint256', 'string', 'uint256', 'bytes32', 'bytes32', 'address', 'bool', 'uint256'],
        [
          mirrorKey,
          agentId,
          body.prediction.outcome,
          BigInt(body.prediction.confidence),
          body.prediction.inputHash,
          body.prediction.outputHash,
          body.prediction.providerAddress,
          isPolymarket,
          BigInt(FLOW_CHAIN.id),
        ]
      )
    );

    const oracleSignature = await oracleAccount.signMessage({
      message: { raw: messageHash },
    });

    // Step 3: Create wallet client for Flow
    const flowWalletClient = createWalletClient({
      chain: FLOW_CHAIN,
      transport: http(),
      account: oracleAccount,
    });

    // Step 4: Execute trade on Flow mirror market
    const txHash = await flowWalletClient.writeContract({
      address: externalMarketMirrorAddress,
      abi: externalMarketMirrorAbi,
      functionName: 'agentTradeMirror',
      args: [
        mirrorKey,
        agentId,
        amount,
        {
          outcome: body.prediction.outcome,
          confidence: BigInt(body.prediction.confidence),
          inputHash: body.prediction.inputHash,
          outputHash: body.prediction.outputHash,
          providerAddress: body.prediction.providerAddress,
          isVerified: body.prediction.isVerified,
        },
        oracleSignature,
      ],
    });

    // Wait for confirmation
    const receipt = await flowPublicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Step 5: Return success response
    return NextResponse.json({
      success: receipt.status === 'success',
      txHash,
      blockNumber: Number(receipt.blockNumber),
      status: receipt.status,
      mirrorKey: body.mirrorKey,
      agentId: body.agentId,
      amount: body.amount,
      prediction: {
        outcome: body.prediction.outcome,
        confidence: body.prediction.confidence,
      },
    });

  } catch (error) {
    console.error('Agent external trade error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Trade execution failed',
        success: false,
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Get agent external trade history
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');

  if (!agentId) {
    return NextResponse.json(
      { error: 'Missing agentId parameter' },
      { status: 400 }
    );
  }

  try {
    // In production, this would query the database
    // For now, return empty array
    return NextResponse.json({
      success: true,
      agentId,
      trades: [],
      total: 0,
    });
  } catch (error) {
    console.error('Error fetching trade history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trade history' },
      { status: 500 }
    );
  }
}
