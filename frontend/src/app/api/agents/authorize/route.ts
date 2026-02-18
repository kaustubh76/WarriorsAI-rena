/**
 * iNFT Authorization API Endpoint
 * POST /api/agents/authorize - Prepare authorize transaction
 * GET /api/agents/authorize?tokenId=X&executor=Y - Check authorization status
 * DELETE /api/agents/authorize - Prepare revoke transaction
 *
 * Handles AI Agent iNFT usage authorization
 */

import { NextResponse } from 'next/server';
import { type Address, isAddress } from 'viem';
import { agentINFTService } from '@/services/agentINFTService';
import { RateLimitPresets, ErrorResponses } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

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
export const POST = composeMiddleware([
  withRateLimit({ prefix: 'agents-authorize', ...RateLimitPresets.agentOperations }),
  async (req, ctx) => {
    const body = await req.json();
    const { tokenId, executorAddress, durationDays } = body;

    // Validation
    if (!tokenId) {
      throw ErrorResponses.badRequest('tokenId is required');
    }

    if (!executorAddress) {
      throw ErrorResponses.badRequest('executorAddress is required');
    }

    if (!isAddress(executorAddress)) {
      throw ErrorResponses.badRequest('Invalid executorAddress format');
    }

    if (!durationDays || typeof durationDays !== 'number') {
      throw ErrorResponses.badRequest('durationDays is required and must be a number');
    }

    if (durationDays < MIN_DURATION_DAYS || durationDays > MAX_DURATION_DAYS) {
      throw ErrorResponses.badRequest(`durationDays must be between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS}`);
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
  },
], { errorContext: 'API:Agents:Authorize:POST' });

/**
 * GET - Check authorization status
 *
 * Query params:
 * - tokenId: string (required)
 * - executor: string (required)
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'agents-authorize-status', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const tokenId = searchParams.get('tokenId');
    const executor = searchParams.get('executor');

    if (!tokenId) {
      throw ErrorResponses.badRequest('tokenId query parameter is required');
    }

    if (!executor) {
      throw ErrorResponses.badRequest('executor query parameter is required');
    }

    if (!isAddress(executor)) {
      throw ErrorResponses.badRequest('Invalid executor address format');
    }

    // Check if contract is deployed
    if (!agentINFTService.isContractDeployed()) {
      throw ErrorResponses.serviceUnavailable('AIAgentINFT contract not deployed');
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
  },
], { errorContext: 'API:Agents:Authorize:GET' });

/**
 * DELETE - Prepare revoke authorization transaction
 *
 * Request body:
 * {
 *   tokenId: string,
 *   executorAddress: string
 * }
 */
export const DELETE = composeMiddleware([
  withRateLimit({ prefix: 'agents-authorize-revoke', ...RateLimitPresets.agentOperations }),
  async (req, ctx) => {
    const body = await req.json();
    const { tokenId, executorAddress } = body;

    // Validation
    if (!tokenId) {
      throw ErrorResponses.badRequest('tokenId is required');
    }

    if (!executorAddress) {
      throw ErrorResponses.badRequest('executorAddress is required');
    }

    if (!isAddress(executorAddress)) {
      throw ErrorResponses.badRequest('Invalid executorAddress format');
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
  },
], { errorContext: 'API:Agents:Authorize:DELETE' });
