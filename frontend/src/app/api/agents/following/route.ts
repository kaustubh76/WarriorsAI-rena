/**
 * API Route: Get User Following Agents
 * Server-side fetching for user's followed iNFT agents from 0G chain
 */

import { NextResponse } from 'next/server';
import { agentINFTService } from '@/services/agentINFTService';
import { validateAddress, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'agents-following', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const addressParam = searchParams.get('address');

    // Validate address parameter
    const address = validateAddress(addressParam || '', 'address');

    const isDeployed = agentINFTService.isContractDeployed();

    if (!isDeployed) {
      return NextResponse.json({
        success: true,
        following: [],
      });
    }

    // Get user's following list from contract
    const following = await agentINFTService.getUserFollowing(address as `0x${string}`);

    // Convert bigint array to string arrays for JSON serialization
    const followingStrings = following.map(id => id.toString());

    return NextResponse.json({
      success: true,
      following: followingStrings,
    });
  },
], { errorContext: 'API:Agents:Following:GET' });
