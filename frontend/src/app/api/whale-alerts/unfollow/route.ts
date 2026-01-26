/**
 * Whale Unfollow API Route
 * POST: Remove a whale from user's follow list (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

interface UnfollowRequest {
  userAddress: string;
  whaleAddress: string;
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-unfollow',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body: UnfollowRequest = await request.json();
    const { userAddress, whaleAddress } = body;

    // Validate addresses
    if (!userAddress || !isAddress(userAddress)) {
      throw ErrorResponses.badRequest('Invalid user address');
    }

    if (!whaleAddress || !isAddress(whaleAddress)) {
      throw ErrorResponses.badRequest('Invalid whale address');
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
      throw ErrorResponses.notFound('Follow relationship not found');
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
    return handleAPIError(error, 'API:WhaleUnfollow:POST');
  }
}
