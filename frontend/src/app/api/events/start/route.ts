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

import { NextResponse } from 'next/server';
import { startAllEventListeners } from '@/lib/eventListeners';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// Global state to track running listeners
let unwatchFunctions: any = null;
let isRunning = false;

export const POST = composeMiddleware([
  withRateLimit({
    prefix: 'events-start',
    ...RateLimitPresets.copyTrade,
  }),
  async (req, ctx) => {
    try {
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
      const body = await req.json().catch(() => ({}));
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
      // Reset state on failure before re-throwing
      isRunning = false;
      unwatchFunctions = null;
      throw error;
    }
  },
], { errorContext: 'API:Events:Start' });

/**
 * GET: Check if event listeners are running
 */
export const GET = composeMiddleware([
  withRateLimit({
    prefix: 'events-start-get',
    ...RateLimitPresets.apiQueries,
  }),
  async (req, ctx) => {
    return NextResponse.json({
      success: true,
      isRunning,
      uptime: isRunning ? 'running' : 'stopped',
      message: isRunning
        ? 'Event listeners are running'
        : 'Event listeners are not running. Call POST /api/events/start to start.',
    });
  },
], { errorContext: 'API:Events:Start:GET' });
