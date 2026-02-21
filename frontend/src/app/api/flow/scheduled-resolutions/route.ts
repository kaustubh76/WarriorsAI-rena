/**
 * Scheduled Market Resolutions API
 * Handles scheduling, querying, and executing market resolutions
 *
 * Flow:
 * 1. POST - Create scheduled resolution (saves to DB, no blockchain required)
 * 2. GET - Query resolutions with various filters
 * 3. PUT - Execute ready resolution (fetches outcome, updates status)
 * 4. DELETE - Cancel pending resolution
 *
 * Note: Flow blockchain integration is optional and happens client-side
 * when user has wallet connected. The system works without it for
 * database-based scheduling and tracking.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { polymarketService } from '@/services/externalMarkets/polymarketService';
import { kalshiService } from '@/services/externalMarkets/kalshiService';
import { resolveMirrorMarket } from '@/services/mirror/mirrorExecutionService';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// ============================================
// TYPES
// ============================================

interface ScheduleRequestBody {
  externalMarketId: string;
  mirrorKey?: string;
  scheduledTime: string;
  oracleSource: 'polymarket' | 'kalshi' | 'internal';
  creator?: string;
}

interface ExecuteRequestBody {
  resolutionId: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Fetch outcome from external market based on oracle source
 */
async function fetchOutcomeFromOracle(
  oracleSource: string,
  externalId: string
): Promise<{ outcome: boolean | null; error?: string }> {
  try {
    if (oracleSource === 'polymarket') {
      const outcomeData = await polymarketService.getMarketOutcome(externalId);

      if (outcomeData.resolved && outcomeData.outcome) {
        return { outcome: outcomeData.outcome === 'yes' };
      }

      // Check if market is still active
      if (!outcomeData.resolved) {
        return { outcome: null, error: 'Market not yet resolved on Polymarket' };
      }

      return { outcome: null, error: 'Could not determine outcome from Polymarket' };
    }

    if (oracleSource === 'kalshi') {
      const marketData = await kalshiService.getMarketWithOutcome(externalId);

      if (marketData.outcome) {
        return { outcome: marketData.outcome === 'yes' };
      }

      return { outcome: null, error: 'Market not yet resolved on Kalshi' };
    }

    if (oracleSource === 'internal') {
      // For internal oracle, we need manual resolution
      return { outcome: null, error: 'Internal oracle requires manual outcome input' };
    }

    return { outcome: null, error: `Unknown oracle source: ${oracleSource}` };
  } catch (error) {
    console.error(`[fetchOutcomeFromOracle] Error fetching from ${oracleSource}:`, error);
    return {
      outcome: null,
      error: error instanceof Error ? error.message : 'Failed to fetch outcome'
    };
  }
}

/**
 * Validate scheduled time is in the future (with small buffer)
 */
function isValidScheduledTime(scheduledTime: Date): boolean {
  const now = new Date();
  const minTime = new Date(now.getTime() - 60000); // Allow 1 minute buffer for clock drift
  return scheduledTime > minTime;
}

// ============================================
// GET - Query resolutions
// ============================================

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'scheduled-resolutions-get', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status');
    const resolutionId = searchParams.get('id');
    const externalMarketId = searchParams.get('externalMarketId');

    // Get specific resolution by ID
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

      return NextResponse.json({
        success: true,
        resolution
      });
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

      return NextResponse.json({
        success: true,
        resolutions
      });
    }

    // Build query based on status filter
    const now = new Date();
    let whereClause: any = {};

    switch (status) {
      case 'ready':
        // Ready = pending AND scheduledTime has passed
        whereClause = {
          status: 'pending',
          scheduledTime: { lte: now },
        };
        break;
      case 'pending':
        // Pending = status is pending (includes both waiting and ready)
        whereClause = { status: 'pending' };
        break;
      case 'executing':
        whereClause = { status: 'executing' };
        break;
      case 'completed':
        whereClause = { status: 'completed' };
        break;
      case 'failed':
        whereClause = { status: 'failed' };
        break;
      case 'cancelled':
        whereClause = { status: 'cancelled' };
        break;
      // 'all' or undefined - no filter
    }

    const resolutions = await prisma.scheduledResolution.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: {
        externalMarket: true,
        mirrorMarket: true,
      },
      orderBy: { scheduledTime: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      resolutions,
      count: resolutions.length,
    });
  },
], { errorContext: 'API:Flow:ScheduledResolutions:GET' });

// ============================================
// POST - Schedule new resolution
// ============================================

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'scheduled-resolutions-post', ...RateLimitPresets.marketCreation }),
  async (req, ctx) => {
    const body: ScheduleRequestBody = await req.json();
    const { externalMarketId, mirrorKey, scheduledTime, oracleSource, creator } = body;

    // Validate required fields
    if (!externalMarketId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: externalMarketId' },
        { status: 400 }
      );
    }

    if (!scheduledTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: scheduledTime' },
        { status: 400 }
      );
    }

    if (!oracleSource) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: oracleSource' },
        { status: 400 }
      );
    }

    // Validate oracle source
    const validOracleSources = ['polymarket', 'kalshi', 'internal'];
    if (!validOracleSources.includes(oracleSource)) {
      return NextResponse.json(
        { success: false, error: `Invalid oracle source. Must be one of: ${validOracleSources.join(', ')}` },
        { status: 400 }
      );
    }

    // Parse and validate scheduled time
    const parsedScheduledTime = new Date(scheduledTime);
    if (isNaN(parsedScheduledTime.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid scheduledTime format' },
        { status: 400 }
      );
    }

    // Validate external market exists
    const externalMarket = await prisma.externalMarket.findUnique({
      where: { id: externalMarketId },
    });

    if (!externalMarket) {
      return NextResponse.json(
        { success: false, error: `External market not found: ${externalMarketId}` },
        { status: 404 }
      );
    }

    // Validate oracle source matches market source (warning only)
    if (oracleSource !== 'internal' && externalMarket.source !== oracleSource) {
      console.warn(
        `[Scheduled Resolutions] Oracle source mismatch: market is ${externalMarket.source}, using ${oracleSource}`
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
          { success: false, error: `Mirror market not found: ${mirrorKey}` },
          { status: 404 }
        );
      }
    }

    // Check for duplicate pending resolution
    const existingResolution = await prisma.scheduledResolution.findFirst({
      where: {
        externalMarketId,
        status: { in: ['pending', 'executing'] },
      },
    });

    if (existingResolution) {
      return NextResponse.json(
        {
          success: false,
          error: 'A pending resolution already exists for this market',
          existingResolutionId: existingResolution.id,
        },
        { status: 409 }
      );
    }

    // Create the scheduled resolution
    const resolution = await prisma.scheduledResolution.create({
      data: {
        flowResolutionId: null, // Not using Flow blockchain for scheduling
        scheduledTime: parsedScheduledTime,
        externalMarketId,
        mirrorKey: mirrorKey || null,
        oracleSource,
        status: 'pending',
        scheduleTransactionHash: null,
        creator: creator || 'system',
        attempts: 0,
      },
      include: {
        externalMarket: true,
        mirrorMarket: true,
      },
    });

    console.log(`[Scheduled Resolutions] Created resolution ${resolution.id} for market ${externalMarket.question.substring(0, 50)}...`);

    return NextResponse.json({
      success: true,
      resolution,
      message: 'Resolution scheduled successfully',
    });
  },
], { errorContext: 'API:Flow:ScheduledResolutions:POST' });

// ============================================
// PUT - Execute ready resolution
// ============================================

export const PUT = composeMiddleware([
  withRateLimit({ prefix: 'scheduled-resolutions-put', ...RateLimitPresets.oracleOperations }),
  async (req, ctx) => {
    let resolutionId: string | null = null;

    try {
      const body: ExecuteRequestBody = await req.json();
      resolutionId = body.resolutionId;

      if (!resolutionId) {
        return NextResponse.json(
          { success: false, error: 'Missing required field: resolutionId' },
          { status: 400 }
        );
      }

      // Get resolution from database with lock-like behavior
      const resolution = await prisma.scheduledResolution.findUnique({
        where: { id: resolutionId },
        include: {
          externalMarket: true,
          mirrorMarket: true,
        },
      });

      if (!resolution) {
        return NextResponse.json(
          { success: false, error: 'Resolution not found' },
          { status: 404 }
        );
      }

      // Verify resolution status
      if (resolution.status === 'completed') {
        return NextResponse.json(
          { success: false, error: 'Resolution has already been completed' },
          { status: 400 }
        );
      }

      if (resolution.status === 'cancelled') {
        return NextResponse.json(
          { success: false, error: 'Resolution has been cancelled' },
          { status: 400 }
        );
      }

      if (resolution.status === 'executing') {
        return NextResponse.json(
          { success: false, error: 'Resolution is already being executed' },
          { status: 400 }
        );
      }

      if (resolution.status !== 'pending') {
        return NextResponse.json(
          { success: false, error: `Cannot execute resolution with status: ${resolution.status}` },
          { status: 400 }
        );
      }

      // Check if scheduled time has arrived
      const now = new Date();
      if (new Date(resolution.scheduledTime) > now) {
        const timeRemaining = new Date(resolution.scheduledTime).getTime() - now.getTime();
        const minutesRemaining = Math.ceil(timeRemaining / 60000);
        return NextResponse.json(
          {
            success: false,
            error: `Scheduled time has not arrived yet. ${minutesRemaining} minute(s) remaining.`
          },
          { status: 400 }
        );
      }

      // Update status to executing (prevents concurrent execution)
      await prisma.scheduledResolution.update({
        where: { id: resolutionId },
        data: {
          status: 'executing',
          attempts: resolution.attempts + 1,
        },
      });

      // Fetch outcome from external market
      const { outcome, error: outcomeError } = await fetchOutcomeFromOracle(
        resolution.oracleSource,
        resolution.externalMarket.externalId
      );

      if (outcome === null) {
        // Revert to pending so it can be retried
        await prisma.scheduledResolution.update({
          where: { id: resolutionId },
          data: {
            status: 'pending',
            lastError: outcomeError || 'Outcome not available from external market',
          },
        });

        return NextResponse.json(
          {
            success: false,
            error: outcomeError || 'Outcome not available from external market',
            canRetry: true,
          },
          { status: 400 }
        );
      }

      // Update the external market's outcome in the database for caching
      await prisma.externalMarket.update({
        where: { id: resolution.externalMarketId },
        data: {
          outcome: outcome ? 'yes' : 'no',
          status: 'resolved',
        },
      });

      // Update resolution as completed
      const updatedResolution = await prisma.scheduledResolution.update({
        where: { id: resolutionId },
        data: {
          status: 'completed',
          outcome,
          executedAt: new Date(),
          lastError: null,
        },
        include: {
          externalMarket: true,
          mirrorMarket: true,
        },
      });

      // If has mirror market, resolve it directly (no fragile HTTP self-call)
      let mirrorResolutionStatus = null;
      if (resolution.mirrorMarket && resolution.mirrorKey) {
        try {
          const mirrorResult = await resolveMirrorMarket(resolution.mirrorKey, outcome);
          mirrorResolutionStatus = 'success';
          console.log(`[Scheduled Resolutions] Mirror market resolved: tx=${mirrorResult.txHash}`);
        } catch (mirrorError) {
          mirrorResolutionStatus = 'error';
          console.error('[Scheduled Resolutions] Failed to resolve mirror market:', mirrorError);
        }
      }

      console.log(`[Scheduled Resolutions] Executed resolution ${resolutionId}: outcome=${outcome ? 'YES' : 'NO'}`);

      return NextResponse.json({
        success: true,
        resolution: updatedResolution,
        outcome,
        outcomeLabel: outcome ? 'YES' : 'NO',
        mirrorResolutionStatus,
        message: `Market resolved with outcome: ${outcome ? 'YES' : 'NO'}`,
      });
    } catch (error) {
      console.error('[Scheduled Resolutions API] PUT error:', error);

      // Revert status to pending on error
      if (resolutionId) {
        try {
          const existingResolution = await prisma.scheduledResolution.findUnique({
            where: { id: resolutionId },
          });

          if (existingResolution && existingResolution.status === 'executing') {
            await prisma.scheduledResolution.update({
              where: { id: resolutionId },
              data: {
                status: 'pending',
                lastError: error instanceof Error ? error.message : 'Execution failed',
              },
            });
          }
        } catch (updateError) {
          console.error('[Scheduled Resolutions] Failed to revert status:', updateError);
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to execute resolution',
          details: error instanceof Error ? error.message : 'Unknown error',
          canRetry: true,
        },
        { status: 500 }
      );
    }
  },
], { errorContext: 'API:Flow:ScheduledResolutions:PUT' });

// ============================================
// DELETE - Cancel pending resolution
// ============================================

export const DELETE = composeMiddleware([
  withRateLimit({ prefix: 'scheduled-resolutions-delete', ...RateLimitPresets.oracleOperations }),
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const resolutionId = searchParams.get('id');

    if (!resolutionId) {
      return NextResponse.json(
        { success: false, error: 'Missing required query parameter: id' },
        { status: 400 }
      );
    }

    // Get resolution
    const resolution = await prisma.scheduledResolution.findUnique({
      where: { id: resolutionId },
      include: {
        externalMarket: true,
      },
    });

    if (!resolution) {
      return NextResponse.json(
        { success: false, error: 'Resolution not found' },
        { status: 404 }
      );
    }

    // Verify resolution can be cancelled
    if (resolution.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel a completed resolution' },
        { status: 400 }
      );
    }

    if (resolution.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'Resolution is already cancelled' },
        { status: 400 }
      );
    }

    if (resolution.status === 'executing') {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel a resolution that is currently executing' },
        { status: 400 }
      );
    }

    // Update database status to cancelled
    await prisma.scheduledResolution.update({
      where: { id: resolutionId },
      data: { status: 'cancelled' },
    });

    console.log(`[Scheduled Resolutions] Cancelled resolution ${resolutionId}`);

    return NextResponse.json({
      success: true,
      message: 'Resolution cancelled successfully',
    });
  },
], { errorContext: 'API:Flow:ScheduledResolutions:DELETE' });
