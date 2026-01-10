/**
 * iNFT Transfer API Endpoint
 * POST /api/agents/transfer - Prepare transfer transaction
 * GET /api/agents/transfer?tokenId=X - Check transfer status
 *
 * Handles AI Agent iNFT transfer operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { type Address, isAddress } from 'viem';
import { agentINFTService } from '@/services/agentINFTService';

/**
 * POST - Prepare iNFT transfer transaction
 *
 * Request body:
 * {
 *   tokenId: string,        // BigInt as string
 *   recipientAddress: string // 0x address
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, recipientAddress } = body;

    // Validation
    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'tokenId is required' },
        { status: 400 }
      );
    }

    if (!recipientAddress) {
      return NextResponse.json(
        { success: false, error: 'recipientAddress is required' },
        { status: 400 }
      );
    }

    if (!isAddress(recipientAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid recipientAddress format' },
        { status: 400 }
      );
    }

    // Check if contract is deployed
    if (!agentINFTService.isContractDeployed()) {
      return NextResponse.json(
        { success: false, error: 'AIAgentINFT contract not deployed' },
        { status: 503 }
      );
    }

    // Verify iNFT exists
    const inft = await agentINFTService.getINFT(BigInt(tokenId));
    if (!inft) {
      return NextResponse.json(
        { success: false, error: 'iNFT not found' },
        { status: 404 }
      );
    }

    // Check if there's already a pending transfer
    if (inft.pendingTransfer) {
      return NextResponse.json(
        {
          success: false,
          error: 'Transfer already pending',
          pendingTransfer: {
            to: inft.pendingTransfer.to,
            initiatedAt: inft.pendingTransfer.initiatedAt.toString(),
          },
        },
        { status: 409 }
      );
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
  } catch (error) {
    console.error('Transfer API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Check transfer status for an iNFT
 *
 * Query params:
 * - tokenId: string (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'tokenId query parameter is required' },
        { status: 400 }
      );
    }

    // Check if contract is deployed
    if (!agentINFTService.isContractDeployed()) {
      return NextResponse.json(
        { success: false, error: 'AIAgentINFT contract not deployed' },
        { status: 503 }
      );
    }

    // Get iNFT data
    const inft = await agentINFTService.getINFT(BigInt(tokenId));
    if (!inft) {
      return NextResponse.json(
        { success: false, error: 'iNFT not found' },
        { status: 404 }
      );
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
  } catch (error) {
    console.error('Transfer Status API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
