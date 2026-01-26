/**
 * User-Created Markets API Route
 * POST: Create a new user market (Simmer-style)
 * PATCH: Update market with on-chain data
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';
import { isAddress } from 'viem';

/**
 * Sanitize user input to prevent XSS and injection attacks
 * Strips HTML tags and dangerous characters while preserving readability
 */
function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove script-related patterns
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    // Remove dangerous characters that could be used for injection
    .replace(/[<>]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate category is from allowed list
 */
const ALLOWED_CATEGORIES = ['politics', 'crypto', 'sports', 'entertainment', 'science', 'technology', 'finance', 'other'] as const;
type MarketCategory = typeof ALLOWED_CATEGORIES[number];

function validateCategory(category: string | undefined): MarketCategory {
  if (!category) return 'other';
  const normalized = category.toLowerCase().trim();
  return ALLOWED_CATEGORIES.includes(normalized as MarketCategory)
    ? (normalized as MarketCategory)
    : 'other';
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (10 market creations per minute)
    applyRateLimit(request, {
      prefix: 'markets-user-create-post',
      maxRequests: 10,
      windowMs: 60000,
    });

    const body = await request.json();
    const {
      question,
      description,
      category,
      endTime,
      initialLiquidity,
      creatorAddress,
    } = body;

    // Validation
    if (!question || !endTime || !initialLiquidity || !creatorAddress) {
      throw ErrorResponses.badRequest('Missing required fields: question, endTime, initialLiquidity, creatorAddress');
    }

    // Validate creator address format
    if (!isAddress(creatorAddress)) {
      throw ErrorResponses.badRequest('Invalid creator address format');
    }

    // Sanitize user-provided text inputs to prevent XSS
    const sanitizedQuestion = sanitizeInput(question);
    const sanitizedDescription = description ? sanitizeInput(description) : null;
    const validatedCategory = validateCategory(category);

    if (sanitizedQuestion.length > 500) {
      throw ErrorResponses.badRequest('Question must be under 500 characters');
    }

    if (sanitizedQuestion.length < 10) {
      throw ErrorResponses.badRequest('Question must be at least 10 characters');
    }

    if (sanitizedDescription && sanitizedDescription.length > 2000) {
      throw ErrorResponses.badRequest('Description must be under 2000 characters');
    }

    const liquidity = parseFloat(initialLiquidity);
    if (isNaN(liquidity) || liquidity < 100) {
      throw ErrorResponses.badRequest('Initial liquidity must be at least 100 CRwN');
    }

    // Cap maximum liquidity to prevent abuse
    if (liquidity > 1000000) {
      throw ErrorResponses.badRequest('Initial liquidity cannot exceed 1,000,000 CRwN');
    }

    const endTimeMs = parseInt(endTime);
    if (isNaN(endTimeMs) || endTimeMs <= Date.now()) {
      throw ErrorResponses.badRequest('End time must be in the future');
    }

    // Ensure end time is not too far in the future (max 1 year)
    const maxEndTime = Date.now() + 365 * 24 * 60 * 60 * 1000;
    if (endTimeMs > maxEndTime) {
      throw ErrorResponses.badRequest('End time cannot be more than 1 year in the future');
    }

    // Create market in database with sanitized inputs
    const market = await prisma.userCreatedMarket.create({
      data: {
        creatorAddress: creatorAddress.toLowerCase(),
        question: sanitizedQuestion,
        description: sanitizedDescription,
        category: validatedCategory,
        initialYesPrice: 5000, // 50%
        currentYesPrice: 5000,
        currentNoPrice: 5000,
        initialLiquidity: liquidity.toString(),
        totalVolume: 0,
        creatorRevenue: 0,
        endTime: new Date(endTimeMs),
        status: 'active',
        aiTradeCount: 0,
        aiDebateCount: 0,
      },
    });

    // On-chain integration is handled by the frontend via useCreateMarket hook
    // which calls CreatorRevenueShare.setMarketCreator() after market creation

    return NextResponse.json({
      success: true,
      data: {
        marketId: `user_${market.id}`,
        market: {
          id: market.id,
          question: market.question,
          description: market.description,
          category: market.category,
          yesPrice: market.currentYesPrice / 100,
          noPrice: market.currentNoPrice / 100,
          initialLiquidity: market.initialLiquidity,
          endTime: market.endTime.getTime(),
          createdAt: market.createdAt.getTime(),
          status: market.status,
          creatorAddress: market.creatorAddress,
          creatorShare: '2%',
        },
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Markets:UserCreate:POST');
  }
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'markets-user-create-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const creatorAddress = searchParams.get('creator');
    const status = searchParams.get('status');
    // Parse and validate limit with max constraints
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(rawLimit, 1), 100); // Clamp between 1 and 100

    const where: Record<string, unknown> = {};
    if (creatorAddress) where.creatorAddress = creatorAddress;
    if (status) where.status = status;

    const markets = await prisma.userCreatedMarket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: {
        markets: markets.map((m) => ({
          id: `user_${m.id}`,
          question: m.question,
          description: m.description,
          category: m.category,
          yesPrice: m.currentYesPrice / 100,
          noPrice: m.currentNoPrice / 100,
          initialLiquidity: m.initialLiquidity,
          totalVolume: m.totalVolume,
          creatorRevenue: m.creatorRevenue,
          endTime: m.endTime.getTime(),
          createdAt: m.createdAt.getTime(),
          status: m.status,
          creatorAddress: m.creatorAddress,
          aiTradeCount: m.aiTradeCount,
          aiDebateCount: m.aiDebateCount,
        })),
        count: markets.length,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Markets:UserCreate:GET');
  }
}

/**
 * PATCH: Update market with on-chain data
 */
export async function PATCH(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'markets-user-create-patch',
      maxRequests: 30,
      windowMs: 60000,
    });

    const body = await request.json();
    const { marketId, onChainMarketId, txHash } = body;

    if (!marketId) {
      throw ErrorResponses.badRequest('Missing marketId');
    }

    // Update market with on-chain reference
    const market = await prisma.userCreatedMarket.update({
      where: { id: marketId },
      data: {
        onChainMarketId: onChainMarketId || null,
        txHash: txHash || null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        marketId: `user_${market.id}`,
        onChainMarketId: market.onChainMarketId,
        txHash: market.txHash,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Markets:UserCreate:PATCH');
  }
}
