/**
 * Market Tool Dispatch Service
 *
 * Typed tool registry + dispatch function for AI warrior market access.
 * NOT an MCP server — custom in-process dispatch using Zod validation.
 * Reuses existing: orderExecutionService, polymarketService, tradingCircuitBreaker.
 *
 * Usage:
 *   const result = await dispatchTool('get_market_snapshot', { marketId: '...', source: 'polymarket' });
 */

import { z } from 'zod';
import { getMarketSnapshot, type MarketSnapshotOutput } from './tools/getMarketSnapshot';
import { getOrderbookDepth, type OrderbookDepthOutput } from './tools/getOrderbookDepth';
import { checkArbitrageOpportunity, type CheckArbitrageOutput } from './tools/checkArbitrage';
import { validateTrade, type ValidateTradeOutput } from './tools/validateTrade';
import { placeOrderValidated, type PlaceOrderOutput } from './tools/placeOrder';
import { monitorPosition, type MonitorPositionOutput } from './tools/monitorPosition';
import { cancelOrder, type CancelOrderOutput } from './tools/cancelOrder';

// ============================================
// TOOL TYPE SYSTEM
// ============================================

type ToolType = 'read' | 'write';

interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  type: ToolType;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput) => Promise<TOutput>;
}

// ============================================
// ZOD SCHEMAS
// ============================================

const sourceEnum = z.enum(['polymarket', 'kalshi']);
const sideEnum = z.enum(['YES', 'NO']);

const schemas = {
  getMarketSnapshot: z.object({
    marketId: z.string().min(1),
    source: sourceEnum,
  }),

  getOrderbookDepth: z.object({
    marketId: z.string().min(1),
    source: sourceEnum,
    side: sideEnum,
    priceLevel: z.number().min(0).max(100).optional(),
  }),

  checkArbitrage: z.object({
    market1Id: z.string().min(1),
    market2Id: z.string().min(1),
  }),

  validateTrade: z.object({
    marketId: z.string().min(1),
    source: sourceEnum,
    side: sideEnum,
    amount: z.number().positive().max(100),
    userId: z.string().optional(),
  }),

  placeOrder: z.object({
    marketId: z.string().min(1),
    source: sourceEnum,
    side: sideEnum,
    amount: z.number().positive().max(100),
    maxSlippage: z.number().min(0).max(10).optional(),
    userId: z.string().min(1),
  }),

  monitorPosition: z.object({
    orderId: z.string().min(1),
    source: sourceEnum,
  }),

  cancelOrder: z.object({
    orderId: z.string().min(1),
    source: sourceEnum,
    reason: z.string().optional(),
    userId: z.string().optional(),
  }),
};

// ============================================
// TOOL REGISTRY
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const TOOL_REGISTRY: Record<string, ToolDefinition<any, any>> = {
  get_market_snapshot: {
    name: 'get_market_snapshot',
    description: 'Fetch live market data with freshness metadata',
    type: 'read',
    inputSchema: schemas.getMarketSnapshot,
    handler: getMarketSnapshot,
  },

  get_orderbook_depth: {
    name: 'get_orderbook_depth',
    description: 'Analyze orderbook liquidity at a given price level',
    type: 'read',
    inputSchema: schemas.getOrderbookDepth,
    handler: getOrderbookDepth,
  },

  check_arbitrage_opportunity: {
    name: 'check_arbitrage_opportunity',
    description: 'Assess live cross-platform price disagreement',
    type: 'read',
    inputSchema: schemas.checkArbitrage,
    handler: checkArbitrageOpportunity,
  },

  validate_trade: {
    name: 'validate_trade',
    description: 'Pre-flight validation without executing (5-step pipeline)',
    type: 'read',
    inputSchema: schemas.validateTrade,
    handler: validateTrade,
  },

  place_order_validated: {
    name: 'place_order_validated',
    description: 'Execute order after mandatory validation pipeline',
    type: 'write',
    inputSchema: schemas.placeOrder,
    handler: placeOrderValidated,
  },

  monitor_position: {
    name: 'monitor_position',
    description: 'Track order fill status and P&L',
    type: 'read',
    inputSchema: schemas.monitorPosition,
    handler: monitorPosition,
  },

  cancel_order: {
    name: 'cancel_order',
    description: 'Cancel a resting or partially filled order',
    type: 'write',
    inputSchema: schemas.cancelOrder,
    handler: cancelOrder,
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// DISPATCH FUNCTION
// ============================================

export interface DispatchResult<T = unknown> {
  success: boolean;
  tool: string;
  type: ToolType;
  data?: T;
  error?: string;
  durationMs: number;
}

/**
 * Dispatch a tool call with Zod validation and structured logging.
 *
 * @param toolName — registered tool name (e.g., 'get_market_snapshot')
 * @param params — tool input (validated against Zod schema)
 * @returns Structured result with success/error + timing
 */
export async function dispatchTool<T = unknown>(
  toolName: string,
  params: unknown
): Promise<DispatchResult<T>> {
  const start = Date.now();

  // Look up tool
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    return {
      success: false,
      tool: toolName,
      type: 'read',
      error: `Unknown tool: ${toolName}. Available: ${Object.keys(TOOL_REGISTRY).join(', ')}`,
      durationMs: Date.now() - start,
    };
  }

  // Validate input
  const parseResult = tool.inputSchema.safeParse(params);
  if (!parseResult.success) {
    const errors = parseResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');

    return {
      success: false,
      tool: toolName,
      type: tool.type,
      error: `Invalid input: ${errors}`,
      durationMs: Date.now() - start,
    };
  }

  // Execute
  try {
    const result = await tool.handler(parseResult.data);

    return {
      success: true,
      tool: toolName,
      type: tool.type,
      data: result as T,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      tool: toolName,
      type: tool.type,
      error: err instanceof Error ? err.message : 'Unknown execution error',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * List all available tools with their descriptions and types.
 */
export function listTools(): Array<{
  name: string;
  description: string;
  type: ToolType;
}> {
  return Object.values(TOOL_REGISTRY).map((tool) => ({
    name: tool.name,
    description: tool.description,
    type: tool.type,
  }));
}

// Re-export types for consumers
export type {
  MarketSnapshotOutput,
  OrderbookDepthOutput,
  CheckArbitrageOutput,
  ValidateTradeOutput,
  PlaceOrderOutput,
  MonitorPositionOutput,
  CancelOrderOutput,
};
