/**
 * Arbitrage Detection API Route
 * GET: Fetch current arbitrage opportunities
 * POST: Trigger manual arbitrage scan
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit } from '@/lib/api';

// Minimum spread percentage to consider an opportunity
const DEFAULT_MIN_SPREAD = 5;

// Arbitrage opportunity interface
interface ArbitrageOpportunity {
  id: string;
  market1: {
    source: string;
    id: string;
    question: string;
    yesPrice: number;
    noPrice: number;
  };
  market2: {
    source: string;
    id: string;
    question: string;
    yesPrice: number;
    noPrice: number;
  };
  spread: number;
  potentialProfit: number;
  confidence: number;
  status: 'active' | 'expired' | 'executed';
  detectedAt: number;
  expiresAt: number;
}

/**
 * Calculate similarity between two market questions using Jaccard index
 */
function calculateSimilarity(question1: string, question2: string): number {
  const words1 = new Set(question1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set(question2.toLowerCase().split(/\W+/).filter(w => w.length > 2));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Find arbitrage opportunities between markets
 */
function findArbitrageOpportunities(
  polymarketData: any[],
  kalshiData: any[],
  minSpread: number
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  const SIMILARITY_THRESHOLD = 0.5;

  for (const polyMarket of polymarketData) {
    for (const kalshiMarket of kalshiData) {
      // Check if markets are similar
      const similarity = calculateSimilarity(polyMarket.question, kalshiMarket.question);

      if (similarity < SIMILARITY_THRESHOLD) continue;

      // Get prices (normalized to 0-1)
      const polyYes = polyMarket.yesPrice / 100;
      const polyNo = polyMarket.noPrice / 100;
      const kalshiYes = kalshiMarket.yesPrice / 100;
      const kalshiNo = kalshiMarket.noPrice / 100;

      // Check for arbitrage: buy YES on one, buy NO on another
      // Arbitrage exists if combined cost < 1.0

      // Strategy 1: Buy YES on Polymarket, buy NO on Kalshi
      const cost1 = polyYes + kalshiNo;
      if (cost1 < 1.0) {
        const profit1 = (1 - cost1) * 100;
        if (profit1 >= minSpread) {
          opportunities.push({
            id: `arb_${polyMarket.id}_${kalshiMarket.id}_1`,
            market1: {
              source: 'polymarket',
              id: polyMarket.id,
              question: polyMarket.question,
              yesPrice: polyMarket.yesPrice,
              noPrice: polyMarket.noPrice,
            },
            market2: {
              source: 'kalshi',
              id: kalshiMarket.id,
              question: kalshiMarket.question,
              yesPrice: kalshiMarket.yesPrice,
              noPrice: kalshiMarket.noPrice,
            },
            spread: profit1,
            potentialProfit: profit1,
            confidence: similarity * 100,
            status: 'active',
            detectedAt: Date.now(),
            expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
          });
        }
      }

      // Strategy 2: Buy NO on Polymarket, buy YES on Kalshi
      const cost2 = polyNo + kalshiYes;
      if (cost2 < 1.0) {
        const profit2 = (1 - cost2) * 100;
        if (profit2 >= minSpread) {
          opportunities.push({
            id: `arb_${polyMarket.id}_${kalshiMarket.id}_2`,
            market1: {
              source: 'polymarket',
              id: polyMarket.id,
              question: polyMarket.question,
              yesPrice: polyMarket.yesPrice,
              noPrice: polyMarket.noPrice,
            },
            market2: {
              source: 'kalshi',
              id: kalshiMarket.id,
              question: kalshiMarket.question,
              yesPrice: kalshiMarket.yesPrice,
              noPrice: kalshiMarket.noPrice,
            },
            spread: profit2,
            potentialProfit: profit2,
            confidence: similarity * 100,
            status: 'active',
            detectedAt: Date.now(),
            expiresAt: Date.now() + 15 * 60 * 1000,
          });
        }
      }
    }
  }

  // Sort by profit potential
  return opportunities.sort((a, b) => b.potentialProfit - a.potentialProfit);
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'external-arbitrage-get',
      maxRequests: 30,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const minSpread = parseFloat(searchParams.get('minSpread') || String(DEFAULT_MIN_SPREAD));
    const includeExpired = searchParams.get('includeExpired') === 'true';

    // Get cached opportunities from database
    const dbOpportunities = await prisma.arbitrageOpportunity.findMany({
      where: includeExpired
        ? {}
        : {
            status: 'active',
            expiresAt: { gt: new Date() },
          },
      orderBy: { potentialProfit: 'desc' },
      take: 50,
    });

    // If no recent opportunities, scan for new ones
    if (dbOpportunities.length === 0) {
      // Fetch markets from both sources
      const [polyResponse, kalshiResponse] = await Promise.all([
        prisma.externalMarket.findMany({
          where: { source: 'polymarket', status: 'active' },
          take: 100,
        }),
        prisma.externalMarket.findMany({
          where: { source: 'kalshi', status: 'active' },
          take: 100,
        }),
      ]);

      const opportunities = findArbitrageOpportunities(
        polyResponse.map(m => ({
          id: m.externalId,
          question: m.question,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
        })),
        kalshiResponse.map(m => ({
          id: m.externalId,
          question: m.question,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
        })),
        minSpread
      );

      // Save to database
      for (const opp of opportunities.slice(0, 20)) {
        try {
          await prisma.arbitrageOpportunity.upsert({
            where: { id: opp.id },
            update: {
              spread: opp.spread,
              potentialProfit: opp.potentialProfit,
              status: opp.status,
              expiresAt: new Date(opp.expiresAt),
            },
            create: {
              id: opp.id,
              market1Source: opp.market1.source,
              market1Id: opp.market1.id,
              market1Question: opp.market1.question,
              market1YesPrice: opp.market1.yesPrice,
              market1NoPrice: opp.market1.noPrice,
              market2Source: opp.market2.source,
              market2Id: opp.market2.id,
              market2Question: opp.market2.question,
              market2YesPrice: opp.market2.yesPrice,
              market2NoPrice: opp.market2.noPrice,
              spread: opp.spread,
              potentialProfit: opp.potentialProfit,
              confidence: opp.confidence,
              status: opp.status,
              detectedAt: new Date(opp.detectedAt),
              expiresAt: new Date(opp.expiresAt),
            },
          });
        } catch (e) {
          // Ignore duplicate key errors
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          opportunities,
          count: opportunities.length,
          scanTime: Date.now(),
          fromCache: false,
        },
      });
    }

    // Return cached opportunities
    const opportunities = dbOpportunities.map((opp) => ({
      id: opp.id,
      market1: {
        source: opp.market1Source,
        id: opp.market1Id,
        question: opp.market1Question,
        yesPrice: opp.market1YesPrice,
        noPrice: opp.market1NoPrice,
      },
      market2: {
        source: opp.market2Source,
        id: opp.market2Id,
        question: opp.market2Question,
        yesPrice: opp.market2YesPrice,
        noPrice: opp.market2NoPrice,
      },
      spread: opp.spread,
      potentialProfit: opp.potentialProfit,
      confidence: opp.confidence,
      status: opp.status,
      detectedAt: opp.detectedAt.getTime(),
      expiresAt: opp.expiresAt.getTime(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        opportunities: opportunities.filter(o => o.spread >= minSpread),
        count: opportunities.length,
        scanTime: dbOpportunities[0]?.detectedAt.getTime() || Date.now(),
        fromCache: true,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:External:Arbitrage:GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'external-arbitrage-post',
      maxRequests: 5,
      windowMs: 60000,
    });

    const body = await request.json();
    const minSpread = body.minSpread || DEFAULT_MIN_SPREAD;

    // Force a fresh scan
    // Mark all existing opportunities as expired
    await prisma.arbitrageOpportunity.updateMany({
      where: { status: 'active' },
      data: { status: 'expired' },
    });

    // Fetch fresh data from external markets
    const [polyResponse, kalshiResponse] = await Promise.all([
      prisma.externalMarket.findMany({
        where: { source: 'polymarket', status: 'active' },
        take: 100,
      }),
      prisma.externalMarket.findMany({
        where: { source: 'kalshi', status: 'active' },
        take: 100,
      }),
    ]);

    const opportunities = findArbitrageOpportunities(
      polyResponse.map(m => ({
        id: m.externalId,
        question: m.question,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
      })),
      kalshiResponse.map(m => ({
        id: m.externalId,
        question: m.question,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
      })),
      minSpread
    );

    // Save new opportunities
    for (const opp of opportunities.slice(0, 20)) {
      try {
        await prisma.arbitrageOpportunity.create({
          data: {
            id: opp.id,
            market1Source: opp.market1.source,
            market1Id: opp.market1.id,
            market1Question: opp.market1.question,
            market1YesPrice: opp.market1.yesPrice,
            market1NoPrice: opp.market1.noPrice,
            market2Source: opp.market2.source,
            market2Id: opp.market2.id,
            market2Question: opp.market2.question,
            market2YesPrice: opp.market2.yesPrice,
            market2NoPrice: opp.market2.noPrice,
            spread: opp.spread,
            potentialProfit: opp.potentialProfit,
            confidence: opp.confidence,
            status: opp.status,
            detectedAt: new Date(opp.detectedAt),
            expiresAt: new Date(opp.expiresAt),
          },
        });
      } catch (e) {
        // Ignore duplicate key errors
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        opportunities,
        count: opportunities.length,
        scanTime: Date.now(),
        marketsScanned: {
          polymarket: polyResponse.length,
          kalshi: kalshiResponse.length,
        },
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:External:Arbitrage:POST');
  }
}
