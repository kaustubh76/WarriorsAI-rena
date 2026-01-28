/**
 * Scheduled Market Resolutions API
 * Handles scheduling, querying, and executing market resolutions
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  scheduleMarketResolution,
  resolveMarket,
  cancelResolution,
  getPendingResolutions,
  getReadyResolutions,
  getScheduledResolution,
  waitForSealed,
  OracleSource,
} from '@/lib/flow/marketResolutionClient';
import { polymarketService } from '@/services/externalMarkets/polymarketService';
import { kalshiService } from '@/services/externalMarkets/kalshiService';

// ============================================
// GET - Query resolutions
// ============================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // 'pending' | 'ready' | 'all'
    const resolutionId = searchParams.get('id');
    const externalMarketId = searchParams.get('externalMarketId');

    // Get specific resolution
    if (resolutionId) {
      const resolution = await prisma.scheduledResolution.findUnique({
        where: { id: resolutionId },
        include: {
          externalMarket: true,
          mirrorMarket: true,
        },
      });

      if (!resolution) {
        return NextResponse.json(
          { error: 'Resolution not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ resolution });
    }

    // Get resolutions by external market
    if (externalMarketId) {
      const resolutions = await prisma.scheduledResolution.findMany({
        where: { externalMarketId },
        include: {
          externalMarket: true,
          mirrorMarket: true,
        },
        orderBy: { scheduledTime: 'asc' },
      });

      return NextResponse.json({ resolutions });
    }

    // Get resolutions by status
    let resolutions;

    if (status === 'ready') {
      // Get resolutions ready to execute
      resolutions = await prisma.scheduledResolution.findMany({
        where: {
          status: 'pending',
          scheduledTime: { lte: new Date() },
        },
        include: {
          externalMarket: true,
          mirrorMarket: true,
        },
        orderBy: { scheduledTime: 'asc' },
      });
    } else if (status === 'pending') {
      // Get pending resolutions
      resolutions = await prisma.scheduledResolution.findMany({
        where: {
          status: 'pending',
        },
        include: {
          externalMarket: true,
          mirrorMarket: true,
        },
        orderBy: { scheduledTime: 'asc' },
      });
    } else {
      // Get all resolutions
      resolutions = await prisma.scheduledResolution.findMany({
        include: {
          externalMarket: true,
          mirrorMarket: true,
        },
        orderBy: { scheduledTime: 'desc' },
        take: 100,
      });
    }

    return NextResponse.json({ resolutions });
  } catch (error) {
    console.error('[Scheduled Resolutions API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resolutions' },
      { status: 500 }
    );
  }
}

// ============================================
// POST - Schedule new resolution
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { externalMarketId, mirrorKey, scheduledTime, oracleSource } = body;

    // Validate inputs
    if (!externalMarketId || !scheduledTime || !oracleSource) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate external market exists
    const externalMarket = await prisma.externalMarket.findUnique({
      where: { id: externalMarketId },
    });

    if (!externalMarket) {
      return NextResponse.json(
        { error: 'External market not found' },
        { status: 404 }
      );
    }

    // Validate mirror market if provided
    let mirrorMarket = null;
    if (mirrorKey) {
      mirrorMarket = await prisma.mirrorMarket.findUnique({
        where: { mirrorKey },
      });

      if (!mirrorMarket) {
        return NextResponse.json(
          { error: 'Mirror market not found' },
          { status: 404 }
        );
      }
    }

    // Convert oracle source string to enum
    const oracleSourceEnum =
      oracleSource === 'kalshi'
        ? OracleSource.KALSHI
        : oracleSource === 'polymarket'
        ? OracleSource.POLYMARKET
        : OracleSource.INTERNAL;

    // Get market ID (use mirrorMarket's flowMarketId if available, otherwise 0)
    const marketId = mirrorMarket ? parseInt(mirrorMarket.flowMarketId) : 0;

    // Schedule resolution on Flow blockchain
    const scheduledTimeSeconds = Math.floor(
      new Date(scheduledTime).getTime() / 1000
    );

    const txId = await scheduleMarketResolution({
      marketId,
      scheduledTime: scheduledTimeSeconds,
      oracleSource: oracleSourceEnum,
    });

    // Wait for transaction to be sealed
    const txResult = await waitForSealed(txId);

    // Extract resolution ID from events
    const resolutionEvent = txResult.events.find(
      (e: any) => e.type.includes('MarketResolutionScheduled')
    );
    const flowResolutionId = resolutionEvent?.data?.id
      ? BigInt(resolutionEvent.data.id)
      : null;

    // Save to database
    const resolution = await prisma.scheduledResolution.create({
      data: {
        flowResolutionId,
        scheduledTime: new Date(scheduledTime),
        externalMarketId,
        mirrorKey: mirrorKey || null,
        oracleSource,
        status: 'pending',
        scheduleTransactionHash: txId,
        creator: txResult.authorizers[0] || 'unknown',
      },
      include: {
        externalMarket: true,
        mirrorMarket: true,
      },
    });

    return NextResponse.json({
      success: true,
      resolution,
      transactionId: txId,
    });
  } catch (error) {
    console.error('[Scheduled Resolutions API] POST error:', error);
    return NextResponse.json(
      {
        error: 'Failed to schedule resolution',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================
// PUT - Execute ready resolution
// ============================================

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { resolutionId } = body;

    if (!resolutionId) {
      return NextResponse.json(
        { error: 'Missing resolutionId' },
        { status: 400 }
      );
    }

    // Get resolution from database
    const resolution = await prisma.scheduledResolution.findUnique({
      where: { id: resolutionId },
      include: {
        externalMarket: true,
        mirrorMarket: true,
      },
    });

    if (!resolution) {
      return NextResponse.json(
        { error: 'Resolution not found' },
        { status: 404 }
      );
    }

    // Verify resolution is ready
    if (resolution.status !== 'pending') {
      return NextResponse.json(
        { error: `Resolution status is ${resolution.status}, not pending` },
        { status: 400 }
      );
    }

    if (new Date(resolution.scheduledTime) > new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time has not arrived yet' },
        { status: 400 }
      );
    }

    // Update status to executing
    await prisma.scheduledResolution.update({
      where: { id: resolutionId },
      data: { status: 'executing' },
    });

    // Fetch outcome from external market
    let outcome: boolean | null = null;

    if (resolution.oracleSource === 'polymarket') {
      const outcomeData = await polymarketService.getMarketOutcome(
        resolution.externalMarket.externalId
      );

      if (outcomeData.resolved && outcomeData.outcome) {
        outcome = outcomeData.outcome === 'yes';
      }
    } else if (resolution.oracleSource === 'kalshi') {
      const marketData = await kalshiService.getMarketWithOutcome(
        resolution.externalMarket.externalId
      );

      if (marketData.outcome) {
        outcome = marketData.outcome === 'yes';
      }
    }

    // If outcome not available, fail
    if (outcome === null) {
      await prisma.scheduledResolution.update({
        where: { id: resolutionId },
        data: {
          status: 'failed',
          lastError: 'Outcome not available from external market',
          attempts: resolution.attempts + 1,
        },
      });

      return NextResponse.json(
        { error: 'Outcome not available from external market' },
        { status: 400 }
      );
    }

    // Execute resolution on Flow blockchain
    if (!resolution.flowResolutionId) {
      throw new Error('Flow resolution ID not found');
    }

    const txId = await resolveMarket(
      Number(resolution.flowResolutionId),
      outcome
    );

    // Wait for transaction to be sealed
    await waitForSealed(txId);

    // Update database
    await prisma.scheduledResolution.update({
      where: { id: resolutionId },
      data: {
        status: 'completed',
        outcome,
        executedAt: new Date(),
        executeTransactionHash: txId,
      },
    });

    // If has mirror market, resolve it too
    if (resolution.mirrorMarket) {
      try {
        // Call mirror market resolution API
        await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/flow/execute`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'resolve',
              mirrorKey: resolution.mirrorKey,
              yesWon: outcome,
            }),
          }
        );
      } catch (error) {
        console.error('[Scheduled Resolutions] Failed to resolve mirror market:', error);
      }
    }

    return NextResponse.json({
      success: true,
      outcome,
      transactionId: txId,
    });
  } catch (error) {
    console.error('[Scheduled Resolutions API] PUT error:', error);

    // Update resolution to failed
    try {
      const body = await request.json();
      if (body.resolutionId) {
        const existingResolution = await prisma.scheduledResolution.findUnique({
          where: { id: body.resolutionId },
        });

        if (existingResolution) {
          await prisma.scheduledResolution.update({
            where: { id: body.resolutionId },
            data: {
              status: 'failed',
              lastError: error instanceof Error ? error.message : 'Unknown error',
              attempts: existingResolution.attempts + 1,
            },
          });
        }
      }
    } catch (updateError) {
      console.error('[Scheduled Resolutions] Failed to update error status:', updateError);
    }

    return NextResponse.json(
      {
        error: 'Failed to execute resolution',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE - Cancel pending resolution
// ============================================

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const resolutionId = searchParams.get('id');

    if (!resolutionId) {
      return NextResponse.json(
        { error: 'Missing resolutionId' },
        { status: 400 }
      );
    }

    // Get resolution
    const resolution = await prisma.scheduledResolution.findUnique({
      where: { id: resolutionId },
    });

    if (!resolution) {
      return NextResponse.json(
        { error: 'Resolution not found' },
        { status: 404 }
      );
    }

    // Verify resolution can be cancelled
    if (resolution.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending resolutions can be cancelled' },
        { status: 400 }
      );
    }

    // Cancel on Flow blockchain
    if (resolution.flowResolutionId) {
      const txId = await cancelResolution(Number(resolution.flowResolutionId));
      await waitForSealed(txId);
    }

    // Update database
    await prisma.scheduledResolution.update({
      where: { id: resolutionId },
      data: { status: 'cancelled' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Scheduled Resolutions API] DELETE error:', error);
    return NextResponse.json(
      {
        error: 'Failed to cancel resolution',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
