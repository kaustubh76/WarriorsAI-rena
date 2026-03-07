/**
 * POST /api/market-tools
 *
 * Dispatch endpoint for market tool calls.
 * Accepts { tool: string, params: object } and routes to the appropriate tool.
 *
 * Read tools use moderateReads rate limit; write tools use marketBetting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { dispatchTool, listTools } from '@/services/marketTools/marketToolDispatch';

/** GET — List available tools */
export const GET = composeMiddleware([
  withRateLimit({ prefix: 'market-tools-list', ...RateLimitPresets.readOperations }),
  async () => {
    return NextResponse.json({
      success: true,
      tools: listTools(),
      timestamp: new Date().toISOString(),
    });
  },
]);

/** POST — Dispatch a tool call */
export const POST = composeMiddleware([
  withRateLimit({ prefix: 'market-tools-dispatch', ...RateLimitPresets.marketBetting }),
  async (request: NextRequest) => {
    let body: { tool?: string; params?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { tool, params } = body;

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: tool (string)' },
        { status: 400 }
      );
    }

    const result = await dispatchTool(tool, params ?? {});

    const status = result.success ? 200 : 400;

    return NextResponse.json(
      {
        success: result.success,
        tool: result.tool,
        type: result.type,
        data: result.data,
        error: result.error,
        durationMs: result.durationMs,
        timestamp: new Date().toISOString(),
      },
      { status }
    );
  },
]);
