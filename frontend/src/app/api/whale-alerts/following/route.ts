/**
 * Whale Following API Route
 * GET: Get list of whales a user is following with their configs
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAddress } from 'viem';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'whale-following',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    // Validate address
    if (!address || !isAddress(address)) {
      throw ErrorResponses.badRequest('Invalid or missing address parameter');
    }

    // Get all active follows for this user
    const follows = await prisma.whaleFollow.findMany({
      where: {
        userAddress: address.toLowerCase(),
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get whale addresses to fetch their stats
    const whaleAddresses = follows.map((f) => f.whaleAddress);

    // Fetch tracked trader info for these whales
    const traders = await prisma.trackedTrader.findMany({
      where: {
        address: { in: whaleAddresses },
      },
    });

    // Create lookup map
    const traderMap = new Map(traders.map((t) => [t.address.toLowerCase(), t]));

    // Get copy trade stats for each whale
    const copyStats = await prisma.mirrorCopyTrade.groupBy({
      by: ['whaleAddress'],
      where: {
        userId: address.toLowerCase(),
        status: 'completed',
      },
      _sum: {
        copyAmount: true,
      },
      _count: {
        id: true,
      },
    });

    const copyStatsMap = new Map(
      copyStats.map((s) => [
        s.whaleAddress.toLowerCase(),
        {
          totalCopied: s._sum.copyAmount || '0',
          copyCount: s._count.id,
        },
      ])
    );

    // Combine data
    const following = follows.map((follow) => {
      const trader = traderMap.get(follow.whaleAddress.toLowerCase());
      const stats = copyStatsMap.get(follow.whaleAddress.toLowerCase());

      return {
        id: follow.id,
        whaleAddress: follow.whaleAddress,
        config: JSON.parse(follow.config),
        isActive: follow.isActive,
        createdAt: follow.createdAt.toISOString(),
        updatedAt: follow.updatedAt.toISOString(),
        // Trader info
        alias: trader?.alias || null,
        totalVolume: trader?.totalVolume || '0',
        winRate: trader?.winRate || null,
        source: trader?.source || 'unknown',
        // Copy stats
        totalCopied: stats?.totalCopied || '0',
        copyCount: stats?.copyCount || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        following,
        count: following.length,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:WhaleFollowing:GET');
  }
}
