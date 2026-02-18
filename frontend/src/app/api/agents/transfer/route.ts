/**
 * iNFT Transfer API Endpoint
 * POST /api/agents/transfer - Prepare transfer transaction
 * GET /api/agents/transfer?tokenId=X - Check transfer status
 *
 * Handles AI Agent iNFT transfer operations
 */

import { NextResponse } from 'next/server';
import { type Address, isAddress } from 'viem';
import { agentINFTService } from '@/services/agentINFTService';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

/**
 * POST - Prepare iNFT transfer transaction
 *
 * Request body:
 * {
 *   tokenId: string,        // BigInt as string
 *   recipientAddress: string // 0x address
 * }
 */
export const POST = composeMiddleware([
  withRateLimit({ prefix: 'agents-transfer', ...RateLimitPresets.copyTrade }),
  async (req, ctx) => {
    const body = await req.json();
    const { tokenId, recipientAddress } = body;

    // Validation
    if (!tokenId) {
      throw ErrorResponses.badRequest('tokenId is required');
    }

    if (!recipientAddress) {
      throw ErrorResponses.badRequest('recipientAddress is required');
    }

    if (!isAddress(recipientAddress)) {
      throw ErrorResponses.badRequest('Invalid recipientAddress format');
    }

    // Check if contract is deployed
    if (!agentINFTService.isContractDeployed()) {
      throw ErrorResponses.serviceUnavailable('AIAgentINFT contract not deployed');
    }

    // Verify iNFT exists
    const inft = await agentINFTService.getINFT(BigInt(tokenId));
    if (!inft) {
      throw ErrorResponses.notFound('iNFT not found');
    }

    // Check if there's already a pending transfer
    if (inft.pendingTransfer) {
      throw ErrorResponses.conflict('Transfer already pending', {
        pendingTransfer: {
          to: inft.pendingTransfer.to,
          initiatedAt: inft.pendingTransfer.initiatedAt.toString(),
        },
      });
    }

    // Prepare the transfer transaction
    const transferTx = agentINFTService.prepareInitiateTransfer(
      recipientAddress as Address,
      BigInt(tokenId)
    );

    // Serialize args for JSON response
    const serializedArgs = transferTx.args.map((arg) =>
      typeof arg === 'bigint' ? arg.toString() : arg
    );

    return NextResponse.json({
      success: true,
      transaction: {
        address: transferTx.address,
        functionName: transferTx.functionName,
        args: serializedArgs,
      },
      tokenId: tokenId.toString(),
      recipientAddress,
      currentOwner: inft.owner,
      chainId: agentINFTService.getChainId(),
    });
  },
], { errorContext: 'API:Agents:Transfer:POST' });

/**
 * GET - Check transfer status for an iNFT
 *
 * Query params:
 * - tokenId: string (required)
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'agents-transfer-status', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const tokenId = searchParams.get('tokenId');

    if (!tokenId) {
      throw ErrorResponses.badRequest('tokenId query parameter is required');
    }

    // Check if contract is deployed
    if (!agentINFTService.isContractDeployed()) {
      throw ErrorResponses.serviceUnavailable('AIAgentINFT contract not deployed');
    }

    // Get iNFT data
    const inft = await agentINFTService.getINFT(BigInt(tokenId));
    if (!inft) {
      throw ErrorResponses.notFound('iNFT not found');
    }

    // Check for pending transfer
    const pendingTransfer = inft.pendingTransfer
      ? {
          isPending: true,
          to: inft.pendingTransfer.to,
          initiatedAt: inft.pendingTransfer.initiatedAt.toString(),
        }
      : { isPending: false };

    return NextResponse.json({
      success: true,
      tokenId: tokenId.toString(),
      owner: inft.owner,
      pendingTransfer,
      isActive: inft.onChainData.isActive,
    });
  },
], { errorContext: 'API:Agents:Transfer:GET' });
