/**
 * Creator Fee Recording API Route
 * POST: Record a trade fee for a creator
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (30 fee recordings per minute)
    applyRateLimit(request, {
      prefix: 'creator-record-fee-post',
      maxRequests: 30,
      windowMs: 60000,
    });

    const body = await request.json();
    const {
      marketId,
      creatorAddress,
      tradeVolume,
      feeAmount,
      traderAddress,
      txHash,
    } = body;

    // Validation
    if (!marketId || !creatorAddress || !tradeVolume) {
      throw ErrorResponses.badRequest('Missing required fields: marketId, creatorAddress, tradeVolume');
    }

    const volume = parseFloat(tradeVolume);
    if (isNaN(volume) || volume <= 0) {
      throw ErrorResponses.badRequest('Invalid trade volume');
    }

    // Calculate fee (2% of trade volume by default)
    const calculatedFee = feeAmount ? parseFloat(feeAmount) : volume * 0.02;

    // Check if creator exists
    let creator = await prisma.creator.findUnique({
      where: { address: creatorAddress },
    });

    // Auto-register creator if they don't exist
    if (!creator) {
      creator = await prisma.creator.create({
        data: {
          address: creatorAddress,
          type: 'market',
          tier: 'bronze',
          totalVolumeGenerated: '0',
          totalFeesEarned: '0',
          pendingRewards: '0',
          totalClaimed: '0',
          marketsCreated: 1,
          warriorsCreated: 0,
          agentsOperated: 0,
        },
      });
    }

    // Update creator stats
    const updatedCreator = await prisma.creator.update({
      where: { address: creatorAddress },
      data: {
        totalVolumeGenerated: (
          parseFloat(creator.totalVolumeGenerated) + volume
        ).toString(),
        totalFeesEarned: (
          parseFloat(creator.totalFeesEarned) + calculatedFee
        ).toString(),
        pendingRewards: (
          parseFloat(creator.pendingRewards) + calculatedFee
        ).toString(),
        lastActiveAt: new Date(),
      },
    });

    // Record the fee entry
    const feeEntry = await prisma.creatorFeeEntry.create({
      data: {
        creatorAddress,
        marketId: marketId.toString(),
        tradeVolume: volume.toString(),
        feeAmount: calculatedFee.toString(),
        traderAddress: traderAddress || null,
        txHash: txHash || null,
        source: 'market_trade',
      },
    });

    // Update market revenue if it's a user-created market
    if (marketId.toString().startsWith('user_') || typeof marketId === 'number') {
      const numericId = typeof marketId === 'number' ? marketId : parseInt(marketId.replace('user_', ''));
      if (!isNaN(numericId)) {
        try {
          await prisma.userCreatedMarket.update({
            where: { id: numericId },
            data: {
              totalVolume: {
                increment: volume,
              },
              creatorRevenue: {
                increment: calculatedFee,
              },
            },
          });
        } catch (e) {
          // Market might not exist in user created markets table
          console.log('[API] Market not in user created table:', numericId);
        }
      }
    }

    // Check and update creator tier based on total volume
    const newTier = calculateTier(parseFloat(updatedCreator.totalVolumeGenerated));
    if (newTier !== updatedCreator.tier) {
      await prisma.creator.update({
        where: { address: creatorAddress },
        data: { tier: newTier },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        feeRecorded: calculatedFee,
        totalPending: updatedCreator.pendingRewards,
        totalEarned: updatedCreator.totalFeesEarned,
        tier: newTier || updatedCreator.tier,
        feeEntryId: feeEntry.id,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Creator:RecordFee:POST');
  }
}

function calculateTier(totalVolume: number): string {
  // Tier thresholds in CRwN
  if (totalVolume >= 1000000) return 'diamond';
  if (totalVolume >= 100000) return 'gold';
  if (totalVolume >= 10000) return 'silver';
  return 'bronze';
}

/**
 * GET: Get fee history for a creator
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'creator-record-fee-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const creatorAddress = searchParams.get('creator');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!creatorAddress) {
      throw ErrorResponses.badRequest('Missing creator address');
    }

    const feeEntries = await prisma.creatorFeeEntry.findMany({
      where: { creatorAddress },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const creator = await prisma.creator.findUnique({
      where: { address: creatorAddress },
    });

    return NextResponse.json({
      success: true,
      data: {
        feeHistory: feeEntries.map((entry) => ({
          id: entry.id,
          marketId: entry.marketId,
          tradeVolume: entry.tradeVolume,
          feeAmount: entry.feeAmount,
          source: entry.source,
          timestamp: entry.createdAt.getTime(),
        })),
        summary: creator
          ? {
              totalVolumeGenerated: creator.totalVolumeGenerated,
              totalFeesEarned: creator.totalFeesEarned,
              pendingRewards: creator.pendingRewards,
              totalClaimed: creator.totalClaimed,
              tier: creator.tier,
            }
          : null,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Creator:RecordFee:GET');
  }
}
