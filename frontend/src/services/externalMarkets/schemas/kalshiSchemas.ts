/**
 * Kalshi API Response Schemas
 * Zod validation for Kalshi Trade API responses
 *
 * API Docs: https://docs.kalshi.com
 */

import { z } from 'zod';

// ============================================
// MARKET SCHEMAS
// ============================================

/**
 * Single market from Kalshi API
 */
export const KalshiMarketSchema = z.object({
  ticker: z.string(),
  event_ticker: z.string().optional(),
  market_type: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional().default(''),
  yes_sub_title: z.string().optional(),
  no_sub_title: z.string().optional(),
  open_time: z.string().optional(),
  close_time: z.string().optional(),
  expiration_time: z.string().optional(),
  expected_expiration_time: z.string().optional(),
  status: z.enum(['open', 'closed', 'settled', 'unopened']).optional(),
  result: z.enum(['yes', 'no', 'all_no', 'all_yes', '']).optional(),
  yes_bid: z.number().optional().default(0),
  yes_ask: z.number().optional().default(100),
  no_bid: z.number().optional().default(0),
  no_ask: z.number().optional().default(100),
  last_price: z.number().optional(),
  previous_yes_bid: z.number().optional(),
  previous_yes_ask: z.number().optional(),
  previous_price: z.number().optional(),
  volume: z.number().optional().default(0),
  volume_24h: z.number().optional().default(0),
  liquidity: z.number().optional().default(0),
  open_interest: z.number().optional().default(0),
  dollar_volume: z.number().optional().default(0),
  dollar_open_interest: z.number().optional().default(0),
  settlement_value: z.number().optional(),
  cap_strike: z.number().optional(),
  floor_strike: z.number().optional(),
  category: z.string().optional(),
  rules_primary: z.string().optional(),
  rules_secondary: z.string().optional(),
  settlement_timer_seconds: z.number().optional(),
  functional_strike: z.string().optional(),
  can_close_early: z.boolean().optional().default(false),
  expiration_value: z.string().optional(),
  response_price_units: z.string().optional(),
  notional_value: z.number().optional(),
  tick_size: z.number().optional(),
  yes_ticker: z.string().optional(),
  no_ticker: z.string().optional(),
  strike_type: z.string().optional(),
});

export type ValidatedKalshiMarket = z.infer<typeof KalshiMarketSchema>;

/**
 * Markets list response
 */
export const KalshiMarketsResponseSchema = z.object({
  markets: z.array(KalshiMarketSchema).optional().default([]),
  cursor: z.string().optional(),
});

export type ValidatedKalshiMarketsResponse = z.infer<
  typeof KalshiMarketsResponseSchema
>;

// ============================================
// ORDER SCHEMAS
// ============================================

/**
 * Order status enum
 */
export const KalshiOrderStatusSchema = z.enum([
  'resting',
  'canceled',
  'executed',
  'pending',
]);

/**
 * Single order
 */
export const KalshiOrderSchema = z.object({
  order_id: z.string(),
  ticker: z.string(),
  status: KalshiOrderStatusSchema,
  side: z.enum(['yes', 'no']),
  action: z.enum(['buy', 'sell']).optional(),
  type: z.enum(['limit', 'market']),
  yes_price: z.number(),
  no_price: z.number(),
  count: z.number(),
  remaining_count: z.number(),
  created_time: z.string(),
  expiration_time: z.string().optional(),
  place_count: z.number().optional(),
  decrease_count: z.number().optional(),
  maker_fill_count: z.number().optional(),
  taker_fill_count: z.number().optional(),
  maker_fill_cost: z.number().optional(),
  taker_fill_cost: z.number().optional(),
  taker_fees: z.number().optional(),
  user_id: z.string().optional(),
  last_update_time: z.string().optional(),
  client_order_id: z.string().optional(),
});

export type ValidatedKalshiOrder = z.infer<typeof KalshiOrderSchema>;

/**
 * Orders list response
 */
export const KalshiOrdersResponseSchema = z.object({
  orders: z.array(KalshiOrderSchema).optional().default([]),
  cursor: z.string().optional(),
});

export type ValidatedKalshiOrdersResponse = z.infer<
  typeof KalshiOrdersResponseSchema
>;

/**
 * Create order response
 */
export const KalshiCreateOrderResponseSchema = z.object({
  order: KalshiOrderSchema,
});

// ============================================
// POSITION SCHEMAS
// ============================================

/**
 * Single position
 */
export const KalshiPositionSchema = z.object({
  ticker: z.string(),
  market_title: z.string().optional(),
  event_ticker: z.string().optional(),
  position: z.number(), // Positive = yes contracts, negative = no contracts
  total_traded: z.number().optional(),
  resting_orders_count: z.number().optional(),
  realized_pnl: z.number().optional().default(0),
  market_exposure: z.number().optional(),
  fees_paid: z.number().optional(),
  settlement_fee: z.number().optional(),
});

export type ValidatedKalshiPosition = z.infer<typeof KalshiPositionSchema>;

/**
 * Positions list response
 */
export const KalshiPositionsResponseSchema = z.object({
  market_positions: z.array(KalshiPositionSchema).optional().default([]),
  event_positions: z.array(z.any()).optional().default([]),
  cursor: z.string().optional(),
});

export type ValidatedKalshiPositionsResponse = z.infer<
  typeof KalshiPositionsResponseSchema
>;

// ============================================
// BALANCE SCHEMAS
// ============================================

/**
 * Account balance
 */
export const KalshiBalanceSchema = z.object({
  balance: z.number(),
  payout: z.number().optional().default(0),
  available_balance: z.number().optional(),
  total_value: z.number().optional(),
  portfolio_value: z.number().optional(),
});

export type ValidatedKalshiBalance = z.infer<typeof KalshiBalanceSchema>;

// ============================================
// TRADE SCHEMAS
// ============================================

/**
 * Single trade
 */
export const KalshiTradeSchema = z.object({
  trade_id: z.string().optional(),
  ticker: z.string(),
  count: z.number(),
  yes_price: z.number(),
  no_price: z.number().optional(),
  created_time: z.string(),
  taker_side: z.enum(['yes', 'no']).optional(),
  side: z.enum(['yes', 'no']).optional(),
  is_taker: z.boolean().optional(),
});

export type ValidatedKalshiTrade = z.infer<typeof KalshiTradeSchema>;

/**
 * Trades list response
 */
export const KalshiTradesResponseSchema = z.object({
  trades: z.array(KalshiTradeSchema).optional().default([]),
  cursor: z.string().optional(),
});

export type ValidatedKalshiTradesResponse = z.infer<
  typeof KalshiTradesResponseSchema
>;

// ============================================
// AUTH SCHEMAS
// ============================================

/**
 * Authentication response
 */
export const KalshiAuthResponseSchema = z.object({
  token: z.string(),
  member_id: z.string(),
});

export type ValidatedKalshiAuthResponse = z.infer<
  typeof KalshiAuthResponseSchema
>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate and parse Kalshi API response
 */
export async function validateKalshiResponse<T>(
  response: Response,
  schema: z.ZodSchema<T>,
  context: string
): Promise<T> {
  // Validate content type
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    console.warn(`[${context}] Expected JSON, got ${contentType}`);
  }

  // Parse JSON
  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new KalshiValidationError(
      `[${context}] Invalid JSON response`,
      'JSON_PARSE_ERROR'
    );
  }

  // Validate against schema
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[${context}] Schema validation failed:`, result.error.issues);
    console.debug(`[${context}] Raw data:`, JSON.stringify(data).slice(0, 500));

    throw new KalshiValidationError(
      `[${context}] Invalid response structure: ${result.error.message}`,
      'SCHEMA_VALIDATION_ERROR',
      result.error.issues
    );
  }

  return result.data;
}

/**
 * Safely validate data without throwing
 */
export function safeValidateKalshi<T>(
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

export class KalshiValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public issues?: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'KalshiValidationError';
  }
}
