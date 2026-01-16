/**
 * Whale Unfollow API Route
 * POST: Remove a whale from user's follow list (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';

interface UnfollowRequest {
  userAddress: string;
  whaleAddress: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: UnfollowRequest = await request.json();
    const { userAddress, whaleAddress } = body;

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

    // Soft delete by setting isActive = false
    const result = await prisma.whaleFollow.updateMany({
      where: {
        userAddress: userAddress.toLowerCase(),
        whaleAddress: whaleAddress.toLowerCase(),
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Follow relationship not found' },
        { status: 404 }
      );
    }

    // Decrement follower count on TrackedTrader if exists
    await prisma.trackedTrader.updateMany({
      where: {
        address: whaleAddress.toLowerCase(),
        followers: { gt: 0 },
      },
      data: { followers: { decrement: 1 } },
    });

    return NextResponse.json({
      success: true,
      data: {
        userAddress,
        whaleAddress,
        unfollowed: true,
      },
    });
  } catch (error) {
    console.error('[API] Whale unfollow error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to unfollow whale',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
