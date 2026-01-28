/**
 * API Route: Start Event Listeners
 * Starts real-time blockchain event monitoring
 *
 * POST /api/events/start
 *
 * Body:
 * {
 *   "backfill": true,           // Optional: backfill from last synced block
 *   "fromBlock": "91000000"     // Optional: specific block to start from
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { startAllEventListeners } from '@/lib/eventListeners';
import { handleAPIError, applyRateLimit } from '@/lib/api';

// Global state to track running listeners
let unwatchFunctions: any = null;
let isRunning = false;

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'events-start',
      maxRequests: 5,
      windowMs: 60000, // Max 5 starts per minute
    });

    // Check if already running
    if (isRunning && unwatchFunctions) {
      return NextResponse.json(
        {
          success: false,
          error: 'Event listeners are already running',
          message: 'Call POST /api/events/stop first to stop existing listeners',
        },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { backfill = true, fromBlock } = body;

    console.log('[API:Events] Starting event listeners...', { backfill, fromBlock });

    // Start listeners
    unwatchFunctions = await startAllEventListeners({
      backfill,
      fromBlock: fromBlock ? BigInt(fromBlock) : undefined,
    });

    isRunning = true;

    console.log('[API:Events] ✅ Event listeners started successfully');

    return NextResponse.json({
      success: true,
      message: 'Event listeners started successfully',
      config: {
        backfill,
        fromBlock: fromBlock || 'latest',
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    isRunning = false;
    unwatchFunctions = null;
    return handleAPIError(error, 'API:Events:Start');
  }
}

/**
 * GET: Check if event listeners are running
 */
export async function GET(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'events-start-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    return NextResponse.json({
      success: true,
      isRunning,
      uptime: isRunning ? 'running' : 'stopped',
      message: isRunning
        ? 'Event listeners are running'
        : 'Event listeners are not running. Call POST /api/events/start to start.',
    });

  } catch (error) {
    return handleAPIError(error, 'API:Events:Start:GET');
  }
}
