/**
 * Whale Follow API Route
 * POST: Add a whale to user's follow list for copy trading
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

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
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-follow',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body: FollowRequest = await request.json();
    const { userAddress, whaleAddress, config } = body;

    // Validate addresses
    if (!userAddress || !isAddress(userAddress)) {
      throw ErrorResponses.badRequest('Invalid user address');
    }

    if (!whaleAddress || !isAddress(whaleAddress)) {
      throw ErrorResponses.badRequest('Invalid whale address');
    }

    // Validate config
    if (!config || typeof config.copyPercentage !== 'number') {
      throw ErrorResponses.badRequest('Invalid configuration');
    }

    // Ensure copy percentage is between 1 and 100
    if (config.copyPercentage < 1 || config.copyPercentage > 100) {
      throw ErrorResponses.badRequest('Copy percentage must be between 1 and 100');
    }

    // Use a transaction to ensure atomicity and prevent double-increment
    const follow = await prisma.$transaction(async (tx) => {
      // Check if this is a new follow or reactivation
      const existing = await tx.whaleFollow.findUnique({
        where: {
          userAddress_whaleAddress: {
            userAddress: userAddress.toLowerCase(),
            whaleAddress: whaleAddress.toLowerCase(),
          },
        },
      });

      const isNewFollow = !existing || !existing.isActive;

      // Upsert the follow record
      const followRecord = await tx.whaleFollow.upsert({
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

      // Only increment follower count if this is a new follow (not reactivation of same record)
      if (isNewFollow) {
        await tx.trackedTrader.updateMany({
          where: { address: whaleAddress.toLowerCase() },
          data: { followers: { increment: 1 } },
        });
      }

      return followRecord;
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
    return handleAPIError(error, 'API:WhaleFollow:POST');
  }
}
