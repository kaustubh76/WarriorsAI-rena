/**
 * API Route: Get User Following Agents
 * Server-side fetching for user's followed iNFT agents from 0G chain
 */

import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';
import { agentINFTService } from '@/services/agentINFTService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({
        success: false,
        error: 'Address parameter is required',
        following: [],
      }, { status: 400 });
    }

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
    console.error('[Following API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        following: [],
      },
      { status: 500 }
    );
  }
}
