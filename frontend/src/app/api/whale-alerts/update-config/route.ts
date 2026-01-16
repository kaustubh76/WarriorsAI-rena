/**
 * Whale Update Config API Route
 * POST: Update copy trading configuration for a followed whale
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';

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
    const body: UpdateConfigRequest = await request.json();
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
    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid configuration' },
        { status: 400 }
      );
    }

    // Validate copy percentage if provided
    if (config.copyPercentage !== undefined) {
      if (config.copyPercentage < 1 || config.copyPercentage > 100) {
        return NextResponse.json(
          { success: false, error: 'Copy percentage must be between 1 and 100' },
          { status: 400 }
        );
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
      return NextResponse.json(
        { success: false, error: 'Follow relationship not found' },
        { status: 404 }
      );
    }

    if (!existingFollow.isActive) {
      return NextResponse.json(
        { success: false, error: 'Follow relationship is inactive' },
        { status: 400 }
      );
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
    console.error('[API] Whale update config error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update configuration',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
