/**
 * API Route: Stop Event Listeners
 * Stops real-time blockchain event monitoring
 *
 * POST /api/events/stop
 */

import { NextRequest, NextResponse } from 'next/server';
import { stopAllEventListeners } from '@/lib/eventListeners';
import { handleAPIError, applyRateLimit } from '@/lib/api';

// Import shared state from start route
// Note: In production, use Redis or similar for shared state
let unwatchFunctions: any = null;
let isRunning = false;

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'events-stop',
      maxRequests: 10,
      windowMs: 60000,
    });

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

  } catch (error) {
    return handleAPIError(error, 'API:Events:Stop');
  }
}

/**
 * GET: Check stop endpoint status
 */
export async function GET(request: NextRequest) {
  try {
    applyRateLimit(request, {
      prefix: 'events-stop-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    return NextResponse.json({
      success: true,
      message: 'Event listener stop endpoint is operational',
      isRunning,
      canStop: isRunning && unwatchFunctions !== null,
    });

  } catch (error) {
    return handleAPIError(error, 'API:Events:Stop:GET');
  }
}
