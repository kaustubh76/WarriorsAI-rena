/**
 * Tool: check_arbitrage_opportunity
 * Type: READ
 *
 * Assesses live cross-platform price disagreement between two markets.
 * No cache — always recalculates.
 */

import { prisma } from '@/lib/prisma';

export interface CheckArbitrageInput {
  market1Id: string; // Polymarket market
  market2Id: string; // Kalshi market
}

export interface ArbitrageMarketData {
  source: string;
  question: string;
  yesPrice: number;  // 0-100
  noPrice: number;   // 0-100
  volume: string;
}

export interface CheckArbitrageOutput {
  market1: ArbitrageMarketData;
  market2: ArbitrageMarketData;
  spread: number;          // Absolute price difference
  spreadPercent: number;   // Spread as % of average price
  profitEstimate: number;  // Expected profit per $100 invested
  confidence: 'low' | 'medium' | 'high';
  freshness: {
    market1Age: number;    // seconds since last update
    market2Age: number;
    bothFresh: boolean;    // both < 300s
  };
  recommendation: string;
}

const STALENESS_THRESHOLD = 300; // 5 minutes

function parseVolume(volume: string): number {
  if (!volume) return 0;
  const cleaned = volume.replace(/[$,]/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([KkMmBb])?$/);
  if (match) {
    const num = parseFloat(match[1]);
    const suffix = (match[2] || '').toUpperCase();
    switch (suffix) {
      case 'K': return num * 1_000;
      case 'M': return num * 1_000_000;
      case 'B': return num * 1_000_000_000;
      default: return num;
    }
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export async function checkArbitrageOpportunity(
  input: CheckArbitrageInput
): Promise<CheckArbitrageOutput> {
  const [m1, m2] = await Promise.all([
    prisma.externalMarket.findUnique({
      where: { id: input.market1Id },
      select: {
        source: true,
        question: true,
        yesPrice: true,
        noPrice: true,
        volume: true,
        lastSyncAt: true,
      },
    }),
    prisma.externalMarket.findUnique({
      where: { id: input.market2Id },
      select: {
        source: true,
        question: true,
        yesPrice: true,
        noPrice: true,
        volume: true,
        lastSyncAt: true,
      },
    }),
  ]);

  if (!m1) throw new Error(`Market ${input.market1Id} not found`);
  if (!m2) throw new Error(`Market ${input.market2Id} not found`);

  const m1Yes = m1.yesPrice / 100; // Convert bp to 0-100
  const m2Yes = m2.yesPrice / 100;
  const m1No = m1.noPrice / 100;
  const m2No = m2.noPrice / 100;

  const spread = Math.abs(m1Yes - m2Yes);
  const avgPrice = (m1Yes + m2Yes) / 2;
  const spreadPercent = avgPrice > 0 ? (spread / avgPrice) * 100 : 0;

  // Profit estimate: if you buy YES on cheaper, NO on expensive
  // Profit per $100 = spread as % of investment
  const profitEstimate = spread;

  // Confidence based on volume + freshness
  const vol1 = parseVolume(m1.volume);
  const vol2 = parseVolume(m2.volume);
  const m1Age = (Date.now() - m1.lastSyncAt.getTime()) / 1000;
  const m2Age = (Date.now() - m2.lastSyncAt.getTime()) / 1000;
  const bothFresh = m1Age < STALENESS_THRESHOLD && m2Age < STALENESS_THRESHOLD;

  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (bothFresh && vol1 > 100_000 && vol2 > 100_000) {
    confidence = 'high';
  } else if (bothFresh && (vol1 > 10_000 || vol2 > 10_000)) {
    confidence = 'medium';
  }

  const recommendation = spread >= 5
    ? `Markets disagree by ${Math.round(spread)}% — great debate topic!`
    : `Markets are closely aligned (${Math.round(spread)}% gap)`;

  return {
    market1: {
      source: m1.source,
      question: m1.question,
      yesPrice: m1Yes,
      noPrice: m1No,
      volume: m1.volume,
    },
    market2: {
      source: m2.source,
      question: m2.question,
      yesPrice: m2Yes,
      noPrice: m2No,
      volume: m2.volume,
    },
    spread: Math.round(spread * 100) / 100,
    spreadPercent: Math.round(spreadPercent * 100) / 100,
    profitEstimate: Math.round(profitEstimate * 100) / 100,
    confidence,
    freshness: {
      market1Age: Math.round(m1Age),
      market2Age: Math.round(m2Age),
      bothFresh,
    },
    recommendation,
  };
}
