/**
 * External Market Schema Validation
 * Re-exports all schemas for Polymarket, Kalshi, and Opinion APIs
 */

// Polymarket schemas
export {
  PolymarketMarketSchema,
  PolymarketMarketsResponseSchema,
  PolymarketOrderbookSchema,
  PolymarketOrderSchema,
  PolymarketTradeSchema,
  PolymarketTradesResponseSchema,
  PolymarketPriceUpdateSchema,
  validatePolymarketResponse,
  safeValidatePolymarket,
  PolymarketValidationError,
  type ValidatedPolymarketMarket,
  type ValidatedPolymarketMarketsResponse,
  type ValidatedPolymarketOrderbook,
  type ValidatedPolymarketTrade,
  type ValidatedPolymarketTradesResponse,
  type ValidatedPolymarketPriceUpdate,
} from './polymarketSchemas';

// Kalshi schemas
export {
  KalshiMarketSchema,
  KalshiMarketsResponseSchema,
  KalshiOrderSchema,
  KalshiOrdersResponseSchema,
  KalshiOrderStatusSchema,
  KalshiCreateOrderResponseSchema,
  KalshiPositionSchema,
  KalshiPositionsResponseSchema,
  KalshiBalanceSchema,
  KalshiTradeSchema,
  KalshiTradesResponseSchema,
  KalshiAuthResponseSchema,
  validateKalshiResponse,
  safeValidateKalshi,
  KalshiValidationError,
  type ValidatedKalshiMarket,
  type ValidatedKalshiMarketsResponse,
  type ValidatedKalshiOrder,
  type ValidatedKalshiOrdersResponse,
  type ValidatedKalshiPosition,
  type ValidatedKalshiPositionsResponse,
  type ValidatedKalshiBalance,
  type ValidatedKalshiTrade,
  type ValidatedKalshiTradesResponse,
  type ValidatedKalshiAuthResponse,
} from './kalshiSchemas';

// Opinion schemas
export {
  OpinionMarketSchema,
  OpinionMarketsResponseSchema,
  OpinionMarketDetailResponseSchema,
  OpinionPriceSchema,
  OpinionPriceResponseSchema,
  OpinionPriceHistoryEntrySchema,
  OpinionPriceHistoryResponseSchema,
  validateOpinionResponse,
  safeValidateOpinion,
  OpinionValidationError,
  type ValidatedOpinionMarket,
  type ValidatedOpinionMarketsResponse,
  type ValidatedOpinionMarketDetailResponse,
  type ValidatedOpinionPrice,
  type ValidatedOpinionPriceResponse,
  type ValidatedOpinionPriceHistoryResponse,
} from './opinionSchemas';
