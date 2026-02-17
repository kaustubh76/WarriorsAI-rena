/**
 * 0G Market Context API
 * Retrieves historical context from 0G storage for AI market predictions
 *
 * POST /api/0g/market-context
 * Body: { question: string, source: 'polymarket' | 'kalshi', maxResults?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: '0g-market-context',
      maxRequests: 30,
      windowMs: 60000,
    });

    const body = await request.json();
    const { question, source, maxResults = 5 } = body;

    // Validate input
    if (!question || typeof question !== 'string') {
      throw ErrorResponses.badRequest('Question is required');
    }

    if (!source || !['polymarket', 'kalshi'].includes(source)) {
      throw ErrorResponses.badRequest('Valid source (polymarket or kalshi) is required');
    }

    // Try to get context from 0G storage
    let context = '';

    try {
      // Query 0G storage for relevant market history
      const storageContext = await query0GStorage(question, source, maxResults);
      if (storageContext) {
        context = storageContext;
      }
    } catch (storageError) {
      console.warn('[MarketContext] 0G storage query failed:', storageError);
      // Continue without storage context
    }

    // If no 0G context, try to build from recent trades
    if (!context) {
      try {
        const tradeContext = await buildTradeContext(question, source);
        if (tradeContext) {
          context = tradeContext;
        }
      } catch (tradeError) {
        console.warn('[MarketContext] Trade context build failed:', tradeError);
      }
    }

    return NextResponse.json({
      success: true,
      context,
      source,
      query: question,
      timestamp: Date.now(),
    });
  } catch (error) {
    return handleAPIError(error, 'API:0G:MarketContext:POST');
  }
}

/**
 * Query 0G storage for relevant market context
 */
async function query0GStorage(
  question: string,
  source: string,
  maxResults: number
): Promise<string> {
  const ZEROG_STORAGE_RPC = process.env.NEXT_PUBLIC_0G_STORAGE_RPC;
  const ZEROG_INDEXER = process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER;

  if (!ZEROG_STORAGE_RPC || !ZEROG_INDEXER) {
    console.log('[MarketContext] 0G storage not configured');
    return '';
  }

  try {
    // Build search query based on question keywords
    const keywords = extractKeywords(question);
    const searchQuery = {
      type: 'market_snapshot',
      source,
      keywords,
      limit: maxResults,
    };

    // Query the 0G indexer for relevant snapshots
    const response = await fetch(`${ZEROG_INDEXER}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchQuery),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return '';
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return '';
    }

    // Format results into context string
    const contextParts: string[] = [];
    for (const result of data.results.slice(0, maxResults)) {
      if (result.content) {
        contextParts.push(formatSnapshotContext(result));
      }
    }

    return contextParts.join('\n\n');
  } catch (error) {
    console.warn('[MarketContext] 0G query error:', error);
    return '';
  }
}

/**
 * Build context from recent trade data
 */
async function buildTradeContext(
  question: string,
  source: string
): Promise<string> {
  try {
    // Get app URL for internal API calls
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Fetch recent markets
    const marketsResponse = await fetch(
      `${appUrl}/api/external/markets?source=${source}&limit=10`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!marketsResponse.ok) {
      return '';
    }

    const { markets } = await marketsResponse.json();

    if (!markets || markets.length === 0) {
      return '';
    }

    // Find relevant markets based on question keywords
    const keywords = extractKeywords(question);
    const relevantMarkets = markets.filter((market: any) => {
      const marketText = `${market.question} ${market.description || ''}`.toLowerCase();
      return keywords.some((kw) => marketText.includes(kw.toLowerCase()));
    });

    if (relevantMarkets.length === 0) {
      return '';
    }

    // Format into context
    const contextParts = relevantMarkets.slice(0, 3).map((market: any) => {
      return `Market: ${market.question}
Current YES Price: ${market.yesPrice}%
Volume: $${formatVolume(market.volume)}
Status: ${market.status}`;
    });

    return `Related Markets from ${source}:\n${contextParts.join('\n\n')}`;
  } catch (error) {
    console.warn('[MarketContext] Trade context error:', error);
    return '';
  }
}

/**
 * Extract keywords from question for search
 */
function extractKeywords(question: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'will', 'be', 'to', 'of', 'in', 'on',
    'for', 'by', 'at', 'with', 'from', 'or', 'and', 'if', 'it', 'as',
    'this', 'that', 'what', 'when', 'where', 'how', 'who', 'which',
  ]);

  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 10);
}

/**
 * Format a storage snapshot into context string
 */
function formatSnapshotContext(snapshot: any): string {
  const date = new Date(snapshot.timestamp || Date.now()).toLocaleDateString();
  return `[${date}] ${snapshot.content}`;
}

/**
 * Format volume number for display
 */
function formatVolume(volume: number | string): string {
  const num = typeof volume === 'string' ? parseFloat(volume) : volume;
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}
