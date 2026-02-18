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

import { NextResponse } from 'next/server';
import {
  parseEther,
  encodePacked,
  keccak256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainsToContracts, getZeroGChainId } from '@/constants';
import {
  createFlowWalletClient,
  executeWithFlowFallbackForKey,
} from '@/lib/flowClient';
import { createZeroGPublicClient } from '@/lib/zeroGClient';
import { AIAgentINFTAbi } from '@/constants/aiAgentINFTAbi';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';

const FLOW_CHAIN_ID = 545;

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

const zeroGPublicClient = createZeroGPublicClient();


// ============================================
// ROUTE HANDLER
// ============================================

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'agent-external-trade', ...RateLimitPresets.agentOperations }),
  async (req, ctx) => {
    const body: ExternalTradeRequest = await req.json();

    // Validate request
    if (!body.agentId || !body.mirrorKey || !body.prediction || !body.amount) {
      throw ErrorResponses.badRequest('Missing required fields: agentId, mirrorKey, prediction, amount');
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
      throw ErrorResponses.serviceUnavailable('AI Agent iNFT contract not deployed');
    }

    if (!externalMarketMirrorAddress || externalMarketMirrorAddress === '0x0000000000000000000000000000000000000000') {
      throw ErrorResponses.serviceUnavailable('External Market Mirror contract not deployed');
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
      throw ErrorResponses.forbidden('Agent is not active');
    }

    // Get mirror market info to determine source (hash-ring routed)
    const mirrorMarket = await executeWithFlowFallbackForKey(body.mirrorKey, (client) =>
      client.readContract({
        address: externalMarketMirrorAddress,
        abi: externalMarketMirrorAbi,
        functionName: 'getMirrorMarket',
        args: [mirrorKey],
      })
    );

    if (!mirrorMarket.externalLink.isActive) {
      throw ErrorResponses.badRequest('Mirror market is not active');
    }

    const isPolymarket = mirrorMarket.externalLink.source === 0; // POLYMARKET = 0
    const [polymarketEnabled, kalshiEnabled] = externalStats as [boolean, boolean, bigint, bigint];

    if (isPolymarket && !polymarketEnabled) {
      throw ErrorResponses.forbidden('Agent does not have Polymarket trading enabled');
    }

    if (!isPolymarket && !kalshiEnabled) {
      throw ErrorResponses.forbidden('Agent does not have Kalshi trading enabled');
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
          BigInt(FLOW_CHAIN_ID),
        ]
      )
    );

    const oracleSignature = await oracleAccount.signMessage({
      message: { raw: messageHash },
    });

    // Step 3: Create wallet client for Flow using shared infrastructure
    const flowWalletClient = createFlowWalletClient(oracleAccount);

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

    // Wait for confirmation via hash-ring routed client
    const receipt = await executeWithFlowFallbackForKey(body.mirrorKey, (client) =>
      client.waitForTransactionReceipt({ hash: txHash })
    );

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
  },
], { errorContext: 'API:Agents:ExternalTrade:POST' });

/**
 * GET: Get agent external trade history
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'agent-external-trade-get', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      throw ErrorResponses.badRequest('Missing agentId parameter');
    }

    // Parse optional query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Query the database for agent trades
    const [trades, total] = await Promise.all([
      prisma.agentTrade.findMany({
        where: {
          agentId: agentId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.agentTrade.count({
        where: {
          agentId: agentId,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      agentId,
      trades: trades.map(trade => ({
        id: trade.id,
        marketId: trade.marketId,
        isYes: trade.isYes,
        amount: trade.amount,
        txHash: trade.txHash,
        isCopyTrade: trade.isCopyTrade,
        copiedFrom: trade.copiedFrom,
        outcome: trade.outcome,
        pnl: trade.pnl,
        recordedOn0G: trade.recordedOn0G,
        createdAt: trade.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  },
], { errorContext: 'API:Agents:ExternalTrade:GET' });
