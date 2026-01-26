/**
 * API Route: Get User Following Agents
 * Server-side fetching for user's followed iNFT agents from 0G chain
 */

import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { agentINFTService } from '@/services/agentINFTService';
import { handleAPIError, validateAddress } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
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

    // Convert bigint array to string array for JSON serialization
    const followingStrings = following.map(id => id.toString());

    return NextResponse.json({
      success: true,
      following: followingStrings,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Agents:Following:GET');
  }
}
