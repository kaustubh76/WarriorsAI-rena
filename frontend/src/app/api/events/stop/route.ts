/**
 * API Route: Stop Event Listeners
 * Stops real-time blockchain event monitoring
 *
 * POST /api/events/stop
 */

import { NextResponse } from 'next/server';
import { stopAllEventListeners } from '@/lib/eventListeners';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// Import shared state from start route
// Note: In production, use Redis or similar for shared state
let unwatchFunctions: any = null;
let isRunning = false;

export const POST = composeMiddleware([
  withRateLimit({
    prefix: 'events-stop',
    ...RateLimitPresets.agentOperations,
  }),
  async (req, ctx) => {
    // Check if listeners are running
    if (!isRunning || !unwatchFunctions) {
      return NextResponse.json(
        {
          success: false,
          error: 'Event listeners are not running',
          message: 'No active event listeners to stop',
        },
        { status: 400 }
      );
    }

    console.log('[API:Events] Stopping event listeners...');

    // Stop all listeners
    stopAllEventListeners(unwatchFunctions);

    isRunning = false;
    unwatchFunctions = null;

    console.log('[API:Events] ✅ Event listeners stopped successfully');

    return NextResponse.json({
      success: true,
      message: 'Event listeners stopped successfully',
      timestamp: new Date().toISOString(),
    });
  },
], { errorContext: 'API:Events:Stop' });

/**
 * GET: Check stop endpoint status
 */
export const GET = composeMiddleware([
  withRateLimit({
    prefix: 'events-stop-get',
    ...RateLimitPresets.apiQueries,
  }),
  async (req, ctx) => {
    return NextResponse.json({
      success: true,
      message: 'Event listener stop endpoint is operational',
      isRunning,
      canStop: isRunning && unwatchFunctions !== null,
    });
  },
], { errorContext: 'API:Events:Stop:GET' });
