/**
 * Whale Update Config API Route
 * POST: Update copy trading configuration for a followed whale
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

interface UpdateConfigRequest {
  userAddress: string;
  whaleAddress: string;
  config: {
    maxCopyAmount?: string;
    copyPercentage?: number;
    enabledSources?: string[];
    autoMirror?: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-update-config',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body: UpdateConfigRequest = await request.json();
    const { userAddress, whaleAddress, config } = body;

    // Validate addresses
    if (!userAddress || !isAddress(userAddress)) {
      throw ErrorResponses.badRequest('Invalid user address');
    }

    if (!whaleAddress || !isAddress(whaleAddress)) {
      throw ErrorResponses.badRequest('Invalid whale address');
    }

    // Validate config
    if (!config || typeof config !== 'object') {
      throw ErrorResponses.badRequest('Invalid configuration');
    }

    // Validate copy percentage if provided
    if (config.copyPercentage !== undefined) {
      if (config.copyPercentage < 1 || config.copyPercentage > 100) {
        throw ErrorResponses.badRequest('Copy percentage must be between 1 and 100');
      }
    }

    // Get existing follow record
    const existingFollow = await prisma.whaleFollow.findUnique({
      where: {
        userAddress_whaleAddress: {
          userAddress: userAddress.toLowerCase(),
          whaleAddress: whaleAddress.toLowerCase(),
        },
      },
    });

    if (!existingFollow) {
      throw ErrorResponses.notFound('Follow relationship not found');
    }

    if (!existingFollow.isActive) {
      throw ErrorResponses.badRequest('Follow relationship is inactive');
    }

    // Merge existing config with new config
    const existingConfig = JSON.parse(existingFollow.config);
    const mergedConfig = {
      ...existingConfig,
      ...config,
    };

    // Update the config
    const updatedFollow = await prisma.whaleFollow.update({
      where: {
        userAddress_whaleAddress: {
          userAddress: userAddress.toLowerCase(),
          whaleAddress: whaleAddress.toLowerCase(),
        },
      },
      data: {
        config: JSON.stringify(mergedConfig),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedFollow.id,
        userAddress: updatedFollow.userAddress,
        whaleAddress: updatedFollow.whaleAddress,
        config: mergedConfig,
        updatedAt: updatedFollow.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:WhaleUpdateConfig:POST');
  }
}
