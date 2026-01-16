/**
 * Opinion API Response Schemas
 * Zod validation for Opinion (opinion.trade) API responses
 *
 * Ensures type safety and catches API changes early
 */

import { z } from 'zod';

// ============================================
// MARKET SCHEMAS
// ============================================

/**
 * Single market from Opinion API
 */
export const OpinionMarketSchema = z.object({
  marketId: z.number(),
  marketTitle: z.string(),
  status: z.number(), // 1=Created, 2=Activated, 3=Resolving, 4=Resolved, 5=Failed, 6=Deleted
  statusEnum: z.string().optional().default(''),
  marketType: z.number().optional().default(0), // 0=Binary, 1=Categorical
  yesLabel: z.string().optional(),
  noLabel: z.string().optional(),
  volume: z.string().optional().default('0'),
  volume24h: z.string().optional(),
  volume7d: z.string().optional(),
  quoteToken: z.string().optional().default(''),
  chainId: z.string().optional().default(''),
  yesTokenId: z.string().optional().default(''),
  noTokenId: z.string().optional().default(''),
  conditionId: z.string().optional(),
  resultTokenId: z.string().optional(),
  createdAt: z.string().optional().default(''),
  cutoffAt: z.string().optional().default(''),
  resolvedAt: z.string().optional(),
  childMarkets: z.array(z.lazy(() => OpinionMarketSchema)).optional(),
});

export type ValidatedOpinionMarket = z.infer<typeof OpinionMarketSchema>;

/**
 * Markets list response from Opinion API
 */
export const OpinionMarketsResponseSchema = z.object({
  code: z.number(),
  msg: z.string(),
  result: z.object({
    total: z.number().optional().default(0),
    list: z.array(OpinionMarketSchema).optional().default([]),
  }),
});

export type ValidatedOpinionMarketsResponse = z.infer<
  typeof OpinionMarketsResponseSchema
>;

/**
 * Single market detail response
 */
export const OpinionMarketDetailResponseSchema = z.object({
  code: z.number(),
  msg: z.string(),
  result: OpinionMarketSchema.optional(),
});

export type ValidatedOpinionMarketDetailResponse = z.infer<
  typeof OpinionMarketDetailResponseSchema
>;

// ============================================
// PRICE SCHEMAS
// ============================================

/**
 * Latest price for a token
 */
export const OpinionPriceSchema = z.object({
  tokenId: z.string(),
  price: z.string(),
  side: z.string().optional(),
  size: z.string().optional(),
  timestamp: z.number().optional(),
});

export type ValidatedOpinionPrice = z.infer<typeof OpinionPriceSchema>;

/**
 * Latest price response
 */
export const OpinionPriceResponseSchema = z.object({
  code: z.number(),
  msg: z.string(),
  result: OpinionPriceSchema.optional(),
});

export type ValidatedOpinionPriceResponse = z.infer<
  typeof OpinionPriceResponseSchema
>;

/**
 * Price history entry
 */
export const OpinionPriceHistoryEntrySchema = z.object({
  price: z.string(),
  timestamp: z.number(),
  open: z.string().optional(),
  high: z.string().optional(),
  low: z.string().optional(),
  close: z.string().optional(),
  volume: z.string().optional(),
});

/**
 * Price history response
 */
export const OpinionPriceHistoryResponseSchema = z.object({
  code: z.number(),
  msg: z.string(),
  result: z.object({
    tokenId: z.string().optional(),
    prices: z.array(OpinionPriceHistoryEntrySchema).optional().default([]),
  }).optional(),
});

export type ValidatedOpinionPriceHistoryResponse = z.infer<
  typeof OpinionPriceHistoryResponseSchema
>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate and parse Opinion API response
 * @param response - Fetch response object
 * @param schema - Zod schema to validate against
 * @param context - Context string for error messages
 * @returns Validated data
 */
export async function validateOpinionResponse<T>(
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
    throw new OpinionValidationError(
      `[${context}] Invalid JSON response`,
      'JSON_PARSE_ERROR'
    );
  }

  // Validate against schema
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[${context}] Schema validation failed:`, result.error.issues);
    console.debug(`[${context}] Raw data:`, JSON.stringify(data).slice(0, 500));

    throw new OpinionValidationError(
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
export function safeValidateOpinion<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context: string
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[Opinion:${context}] Validation failed:`, result.error.issues);
    return null;
  }
  return result.data;
}

// ============================================
// ERROR CLASS
// ============================================

export class OpinionValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public issues?: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'OpinionValidationError';
  }
}
