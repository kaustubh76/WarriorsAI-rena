/**
 * Whale Follow API Route
 * POST: Add a whale to user's follow list for copy trading
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';

interface FollowRequest {
  userAddress: string;
  whaleAddress: string;
  config: {
    maxCopyAmount: string;
    copyPercentage: number;
    enabledSources: string[];
    autoMirror: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: FollowRequest = await request.json();
    const { userAddress, whaleAddress, config } = body;

    // Validate addresses
    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid user address' },
        { status: 400 }
      );
    }

    if (!whaleAddress || !isAddress(whaleAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid whale address' },
        { status: 400 }
      );
    }

    // Validate config
    if (!config || typeof config.copyPercentage !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid configuration' },
        { status: 400 }
      );
    }

    // Ensure copy percentage is between 1 and 100
    if (config.copyPercentage < 1 || config.copyPercentage > 100) {
      return NextResponse.json(
        { success: false, error: 'Copy percentage must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Upsert the follow record
    const follow = await prisma.whaleFollow.upsert({
      where: {
        userAddress_whaleAddress: {
          userAddress: userAddress.toLowerCase(),
          whaleAddress: whaleAddress.toLowerCase(),
        },
      },
      update: {
        config: JSON.stringify(config),
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId: userAddress.toLowerCase(),
        userAddress: userAddress.toLowerCase(),
        whaleAddress: whaleAddress.toLowerCase(),
        config: JSON.stringify(config),
        isActive: true,
      },
    });

    // Increment follower count on TrackedTrader if exists
    await prisma.trackedTrader.updateMany({
      where: { address: whaleAddress.toLowerCase() },
      data: { followers: { increment: 1 } },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: follow.id,
        userAddress: follow.userAddress,
        whaleAddress: follow.whaleAddress,
        config: JSON.parse(follow.config),
        isActive: follow.isActive,
        createdAt: follow.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[API] Whale follow error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to follow whale',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
