/**
 * Polymarket API Response Schemas
 * Zod validation for Polymarket API responses
 *
 * Ensures type safety and catches API changes early
 */

import { z } from 'zod';

// ============================================
// MARKET SCHEMAS
// ============================================

/**
 * Single market from Polymarket API
 */
export const PolymarketMarketSchema = z.object({
  conditionId: z.string(),
  questionId: z.string().optional(),
  question: z.string(),
  description: z.string().optional().default(''),
  outcomes: z.array(z.string()).optional().default(['Yes', 'No']),
  outcomePrices: z.array(z.string()).optional(),
  volume: z.string().optional().default('0'),
  volume24h: z.string().optional().default('0'),
  liquidity: z.string().optional().default('0'),
  endDate: z.string().optional(),
  closed: z.boolean().optional().default(false),
  resolved: z.boolean().optional().default(false),
  resolutionSource: z.string().optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  clobTokenIds: z.array(z.string()).optional(),
  slug: z.string().optional(),
  active: z.boolean().optional().default(true),
  enableOrderBook: z.boolean().optional().default(true),
  new: z.boolean().optional().default(false),
  featured: z.boolean().optional().default(false),
  commentCount: z.number().optional().default(0),
});

export type ValidatedPolymarketMarket = z.infer<typeof PolymarketMarketSchema>;

/**
 * Markets list response from Gamma API
 */
export const PolymarketMarketsResponseSchema = z.object({
  markets: z.array(PolymarketMarketSchema).optional().default([]),
  next_cursor: z.string().optional(),
  count: z.number().optional(),
});

export type ValidatedPolymarketMarketsResponse = z.infer<
  typeof PolymarketMarketsResponseSchema
>;

// ============================================
// ORDERBOOK SCHEMAS
// ============================================

/**
 * Order in orderbook
 */
export const PolymarketOrderSchema = z.object({
  price: z.string(),
  size: z.string(),
});

/**
 * Orderbook response
 */
export const PolymarketOrderbookSchema = z.object({
  market: z.string().optional(),
  asset_id: z.string().optional(),
  hash: z.string().optional(),
  bids: z.array(PolymarketOrderSchema).optional().default([]),
  asks: z.array(PolymarketOrderSchema).optional().default([]),
  timestamp: z.number().optional(),
});

export type ValidatedPolymarketOrderbook = z.infer<
  typeof PolymarketOrderbookSchema
>;

// ============================================
// TRADE SCHEMAS
// ============================================

/**
 * Single trade
 */
export const PolymarketTradeSchema = z.object({
  id: z.string().optional(),
  market: z.string().optional(),
  asset_id: z.string(),
  side: z.enum(['BUY', 'SELL', 'buy', 'sell']),
  price: z.string(),
  size: z.string(),
  timestamp: z.number(),
  maker: z.string().optional(),
  taker: z.string().optional(),
  transaction_hash: z.string().optional(),
  outcome: z.string().optional(),
  fee_rate_bps: z.number().optional(),
});

export type ValidatedPolymarketTrade = z.infer<typeof PolymarketTradeSchema>;

/**
 * Trades list response
 */
export const PolymarketTradesResponseSchema = z.object({
  trades: z.array(PolymarketTradeSchema).optional().default([]),
  next_cursor: z.string().optional(),
});

export type ValidatedPolymarketTradesResponse = z.infer<
  typeof PolymarketTradesResponseSchema
>;

// ============================================
// PRICE UPDATE SCHEMAS (WebSocket)
// ============================================

export const PolymarketPriceUpdateSchema = z.object({
  type: z.string().optional(),
  asset_id: z.string().optional(),
  token_id: z.string().optional(),
  price: z.string().optional(),
  timestamp: z.number().optional(),
  bid: z.string().optional(),
  ask: z.string().optional(),
  last_price: z.string().optional(),
  market: z.string().optional(),
});

export type ValidatedPolymarketPriceUpdate = z.infer<
  typeof PolymarketPriceUpdateSchema
>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate and parse Polymarket API response
 * @param response - Fetch response object
 * @param schema - Zod schema to validate against
 * @param context - Context string for error messages
 * @returns Validated data
 */
export async function validatePolymarketResponse<T>(
  response: Response,
  schema: z.ZodSchema<T>,
  context: string
): Promise<T> {
  // Validate content type
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    console.warn(`[${context}] Expected JSON, got ${contentType}`);
    // Try to parse anyway
  }

  // Parse JSON
  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new PolymarketValidationError(
      `[${context}] Invalid JSON response`,
      'JSON_PARSE_ERROR'
    );
  }

  // Validate against schema
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[${context}] Schema validation failed:`, result.error.issues);
    // Log the actual data for debugging
    console.debug(`[${context}] Raw data:`, JSON.stringify(data).slice(0, 500));

    throw new PolymarketValidationError(
      `[${context}] Invalid response structure: ${result.error.message}`,
      'SCHEMA_VALIDATION_ERROR',
      result.error.issues
    );
  }

  return result.data;
}

/**
 * Safely validate data without throwing
 * Returns null on failure with logging
 */
export function safeValidatePolymarket<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context: string
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[${context}] Validation failed:`, result.error.issues);
    return null;
  }
  return result.data;
}

// ============================================
// ERROR CLASS
// ============================================

export class PolymarketValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public issues?: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'PolymarketValidationError';
  }
}
