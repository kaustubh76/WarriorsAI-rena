/**
 * Tool: get_orderbook_depth
 * Type: READ
 *
 * Analyzes orderbook liquidity at a given price level.
 * Wraps polymarketService.getOrderbook() with depth analysis.
 */

import { prisma } from '@/lib/prisma';
import { polymarketService } from '@/services/externalMarkets';
import { rpcResponseCache } from '@/lib/cache/hashedCache';

export interface OrderbookDepthInput {
  marketId: string;
  source: 'polymarket' | 'kalshi';
  side: 'YES' | 'NO';
  priceLevel?: number; // Optional: specific price to check (0-100)
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookDepthOutput {
  bids: OrderbookLevel[];    // Top 5
  asks: OrderbookLevel[];    // Top 5
  totalBidDepth: number;     // USD value of all bids
  totalAskDepth: number;     // USD value of all asks
  midpoint: number;          // (best bid + best ask) / 2
  spread: number;            // best ask - best bid
  estimatedFillPrice: number; // Weighted avg if filling $100
  estimatedSlippage: number;  // % difference from midpoint
  hasSufficientDepth: boolean; // > $500 total
}

const MIN_DEPTH_USD = 500;

function parseLevel(
  price: string | number,
  size: string | number
): OrderbookLevel | null {
  const p = typeof price === 'string' ? parseFloat(price) : price;
  const s = typeof size === 'string' ? parseFloat(size) : size;
  if (isNaN(p) || isNaN(s)) return null;
  return { price: p, size: s };
}

export async function getOrderbookDepth(
  input: OrderbookDepthInput
): Promise<OrderbookDepthOutput> {
  const cacheKey = `orderbook:${input.marketId}:${input.side}`;
  const cached = rpcResponseCache.get(cacheKey) as OrderbookDepthOutput | undefined;
  if (cached) return cached;

  if (input.source !== 'polymarket') {
    // Kalshi orderbook not yet integrated — fail safe
    return {
      bids: [],
      asks: [],
      totalBidDepth: 0,
      totalAskDepth: 0,
      midpoint: 50,
      spread: 0,
      estimatedFillPrice: 50,
      estimatedSlippage: 0,
      hasSufficientDepth: false,
    };
  }

  // Get tokenId from market metadata
  const market = await prisma.externalMarket.findUnique({
    where: { id: input.marketId },
    select: { metadata: true },
  });

  if (!market?.metadata) {
    throw new Error(`Market ${input.marketId} has no metadata`);
  }

  const meta = JSON.parse(market.metadata);
  const tokenIdx = input.side === 'YES' ? 0 : 1;
  const tokenId = meta.clobTokenIds?.[tokenIdx];

  if (!tokenId) {
    throw new Error(`No CLOB token ID for ${input.side} side of market ${input.marketId}`);
  }

  const orderbook = await polymarketService.getOrderbook(tokenId);

  // Parse and sort levels
  const bids: OrderbookLevel[] = (orderbook.bids || [])
    .map((l: { price: string | number; size: string | number }) => parseLevel(l.price, l.size))
    .filter((l: OrderbookLevel | null): l is OrderbookLevel => l !== null)
    .sort((a: OrderbookLevel, b: OrderbookLevel) => b.price - a.price);

  const asks: OrderbookLevel[] = (orderbook.asks || [])
    .map((l: { price: string | number; size: string | number }) => parseLevel(l.price, l.size))
    .filter((l: OrderbookLevel | null): l is OrderbookLevel => l !== null)
    .sort((a: OrderbookLevel, b: OrderbookLevel) => a.price - b.price);

  // Calculate depths
  const totalBidDepth = bids.reduce((sum, l) => sum + l.price * l.size, 0);
  const totalAskDepth = asks.reduce((sum, l) => sum + l.price * l.size, 0);

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 1;
  const midpoint = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  // Estimate fill price for $100 order walking the book
  let remainingAmount = 100;
  let totalCost = 0;
  let totalShares = 0;

  for (const level of asks) {
    if (remainingAmount <= 0) break;
    const levelValue = level.price * level.size;
    const fillAmount = Math.min(remainingAmount, levelValue);
    const shares = fillAmount / level.price;
    totalCost += fillAmount;
    totalShares += shares;
    remainingAmount -= fillAmount;
  }

  const estimatedFillPrice = totalShares > 0 ? totalCost / totalShares : midpoint;
  const estimatedSlippage = midpoint > 0
    ? Math.abs(estimatedFillPrice - midpoint) / midpoint * 100
    : 0;

  const result: OrderbookDepthOutput = {
    bids: bids.slice(0, 5),
    asks: asks.slice(0, 5),
    totalBidDepth: Math.round(totalBidDepth * 100) / 100,
    totalAskDepth: Math.round(totalAskDepth * 100) / 100,
    midpoint: Math.round(midpoint * 10000) / 10000,
    spread: Math.round(spread * 10000) / 10000,
    estimatedFillPrice: Math.round(estimatedFillPrice * 10000) / 10000,
    estimatedSlippage: Math.round(estimatedSlippage * 100) / 100,
    hasSufficientDepth: totalAskDepth >= MIN_DEPTH_USD,
  };

  // Cache for 10 seconds
  rpcResponseCache.set(cacheKey, result, 10 * 1000);

  return result;
}
