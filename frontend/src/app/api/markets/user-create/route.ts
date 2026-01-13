/**
 * User-Created Markets API Route
 * POST: Create a new user market (Simmer-style)
 * PATCH: Update market with on-chain data
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      question,
      description,
      category,
      endTime,
      initialLiquidity,
      creatorAddress,
    } = body;

    // Validation
    if (!question || !endTime || !initialLiquidity || !creatorAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: question, endTime, initialLiquidity, creatorAddress',
        },
        { status: 400 }
      );
    }

    if (question.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Question must be under 500 characters' },
        { status: 400 }
      );
    }

    const liquidity = parseFloat(initialLiquidity);
    if (isNaN(liquidity) || liquidity < 100) {
      return NextResponse.json(
        { success: false, error: 'Initial liquidity must be at least 100 CRwN' },
        { status: 400 }
      );
    }

    const endTimeMs = parseInt(endTime);
    if (isNaN(endTimeMs) || endTimeMs <= Date.now()) {
      return NextResponse.json(
        { success: false, error: 'End time must be in the future' },
        { status: 400 }
      );
    }

    // Create market in database
    const market = await prisma.userCreatedMarket.create({
      data: {
        creatorAddress,
        question,
        description: description || null,
        category: category || 'other',
        initialYesPrice: 5000, // 50%
        currentYesPrice: 5000,
        currentNoPrice: 5000,
        initialLiquidity: liquidity.toString(),
        totalVolume: 0,
        creatorRevenue: 0,
        endTime: new Date(endTimeMs),
        status: 'active',
        aiTradeCount: 0,
        aiDebateCount: 0,
      },
    });

    // On-chain integration is handled by the frontend via useCreateMarket hook
    // which calls CreatorRevenueShare.setMarketCreator() after market creation

    return NextResponse.json({
      success: true,
      data: {
        marketId: `user_${market.id}`,
        market: {
          id: market.id,
          question: market.question,
          description: market.description,
          category: market.category,
          yesPrice: market.currentYesPrice / 100,
          noPrice: market.currentNoPrice / 100,
          initialLiquidity: market.initialLiquidity,
          endTime: market.endTime.getTime(),
          createdAt: market.createdAt.getTime(),
          status: market.status,
          creatorAddress: market.creatorAddress,
          creatorShare: '2%',
        },
      },
    });
  } catch (error) {
    console.error('[API] Create user market error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create market',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const creatorAddress = searchParams.get('creator');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (creatorAddress) where.creatorAddress = creatorAddress;
    if (status) where.status = status;

    const markets = await prisma.userCreatedMarket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: {
        markets: markets.map((m) => ({
          id: `user_${m.id}`,
          question: m.question,
          description: m.description,
          category: m.category,
          yesPrice: m.currentYesPrice / 100,
          noPrice: m.currentNoPrice / 100,
          initialLiquidity: m.initialLiquidity,
          totalVolume: m.totalVolume,
          creatorRevenue: m.creatorRevenue,
          endTime: m.endTime.getTime(),
          createdAt: m.createdAt.getTime(),
          status: m.status,
          creatorAddress: m.creatorAddress,
          aiTradeCount: m.aiTradeCount,
          aiDebateCount: m.aiDebateCount,
        })),
        count: markets.length,
      },
    });
  } catch (error) {
    console.error('[API] Get user markets error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch user markets',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH: Update market with on-chain data
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketId, onChainMarketId, txHash } = body;

    if (!marketId) {
      return NextResponse.json(
        { success: false, error: 'Missing marketId' },
        { status: 400 }
      );
    }

    // Update market with on-chain reference
    const market = await prisma.userCreatedMarket.update({
      where: { id: marketId },
      data: {
        onChainMarketId: onChainMarketId || null,
        txHash: txHash || null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        marketId: `user_${market.id}`,
        onChainMarketId: market.onChainMarketId,
        txHash: market.txHash,
      },
    });
  } catch (error) {
    console.error('[API] Update user market error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update market',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
