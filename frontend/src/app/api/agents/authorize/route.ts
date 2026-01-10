/**
 * iNFT Authorization API Endpoint
 * POST /api/agents/authorize - Prepare authorize transaction
 * GET /api/agents/authorize?tokenId=X&executor=Y - Check authorization status
 * DELETE /api/agents/authorize - Prepare revoke transaction
 *
 * Handles AI Agent iNFT usage authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { type Address, isAddress } from 'viem';
import { agentINFTService } from '@/services/agentINFTService';

// Constants
const MIN_DURATION_DAYS = 1;
const MAX_DURATION_DAYS = 365;
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * POST - Prepare authorization transaction
 *
 * Request body:
 * {
 *   tokenId: string,
 *   executorAddress: string,
 *   durationDays: number  // 1-365
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, executorAddress, durationDays } = body;

    // Validation
    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'tokenId is required' },
        { status: 400 }
      );
    }

    if (!executorAddress) {
      return NextResponse.json(
        { success: false, error: 'executorAddress is required' },
        { status: 400 }
      );
    }

    if (!isAddress(executorAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid executorAddress format' },
        { status: 400 }
      );
    }

    if (!durationDays || typeof durationDays !== 'number') {
      return NextResponse.json(
        { success: false, error: 'durationDays is required and must be a number' },
        { status: 400 }
      );
    }

    if (durationDays < MIN_DURATION_DAYS || durationDays > MAX_DURATION_DAYS) {
      return NextResponse.json(
        {
          success: false,
          error: `durationDays must be between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS}`,
        },
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

    // Calculate duration in seconds
    const durationSeconds = BigInt(durationDays * SECONDS_PER_DAY);
    const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + durationSeconds;

    // Prepare the authorization transaction
    const authTx = agentINFTService.prepareAuthorizeUsage(
      BigInt(tokenId),
      executorAddress as Address,
      durationSeconds
    );

    // Serialize args for JSON response
    const serializedArgs = authTx.args.map((arg) =>
      typeof arg === 'bigint' ? arg.toString() : arg
    );

    return NextResponse.json({
      success: true,
      transaction: {
        address: authTx.address,
        functionName: authTx.functionName,
        args: serializedArgs,
      },
      tokenId: tokenId.toString(),
      authorization: {
        executor: executorAddress,
        durationDays,
        durationSeconds: durationSeconds.toString(),
        expiresAt: expiresAt.toString(),
      },
      chainId: agentINFTService.getChainId(),
    });
  } catch (error) {
    console.error('Authorize API Error:', error);
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
 * GET - Check authorization status
 *
 * Query params:
 * - tokenId: string (required)
 * - executor: string (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');
    const executor = searchParams.get('executor');

    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'tokenId query parameter is required' },
        { status: 400 }
      );
    }

    if (!executor) {
      return NextResponse.json(
        { success: false, error: 'executor query parameter is required' },
        { status: 400 }
      );
    }

    if (!isAddress(executor)) {
      return NextResponse.json(
        { success: false, error: 'Invalid executor address format' },
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

    // Get authorization data
    const auth = await agentINFTService.getAuthorization(
      BigInt(tokenId),
      executor as Address
    );

    // Check if authorized
    const isAuthorized = await agentINFTService.isAuthorizedExecutor(
      BigInt(tokenId),
      executor as Address
    );

    const now = BigInt(Math.floor(Date.now() / 1000));
    const isExpired = auth ? auth.expiresAt <= now : true;

    return NextResponse.json({
      success: true,
      tokenId: tokenId.toString(),
      executor,
      isAuthorized,
      authorization: auth
        ? {
            canExecute: auth.canExecute,
            canViewMetadata: auth.canViewMetadata,
            expiresAt: auth.expiresAt.toString(),
            isExpired,
          }
        : null,
    });
  } catch (error) {
    console.error('Authorization Status API Error:', error);
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
 * DELETE - Prepare revoke authorization transaction
 *
 * Request body:
 * {
 *   tokenId: string,
 *   executorAddress: string
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, executorAddress } = body;

    // Validation
    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'tokenId is required' },
        { status: 400 }
      );
    }

    if (!executorAddress) {
      return NextResponse.json(
        { success: false, error: 'executorAddress is required' },
        { status: 400 }
      );
    }

    if (!isAddress(executorAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid executorAddress format' },
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

    // Prepare the revoke transaction
    const revokeTx = agentINFTService.prepareRevokeUsage(
      BigInt(tokenId),
      executorAddress as Address
    );

    // Serialize args for JSON response
    const serializedArgs = revokeTx.args.map((arg) =>
      typeof arg === 'bigint' ? arg.toString() : arg
    );

    return NextResponse.json({
      success: true,
      transaction: {
        address: revokeTx.address,
        functionName: revokeTx.functionName,
        args: serializedArgs,
      },
      tokenId: tokenId.toString(),
      executorAddress,
      chainId: agentINFTService.getChainId(),
    });
  } catch (error) {
    console.error('Revoke API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
