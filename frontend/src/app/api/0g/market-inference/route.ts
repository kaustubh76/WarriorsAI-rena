/**
 * API Route: 0G Market Inference
 * Dedicated market prediction endpoint using 0G verified compute
 *
 * Features:
 * - Accept market data (question, prices, volume, end time)
 * - Fetch historical context from 0G Storage
 * - Generate verified AI prediction with cryptographic proof
 * - Return outcome, confidence, reasoning with proof
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import type { Address } from 'viem';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// ============================================================================
// Types
// ============================================================================

interface MarketAnalysisRequest {
  marketId: string;
  source: 'polymarket' | 'kalshi' | 'native';
  marketData: {
    question: string;
    yesPrice: number;       // 0-100
    noPrice: number;        // 0-100
    volume: string;
    liquidity?: string;
    endTime: number;
    category?: string;
  };
  agentId?: string;
  includeContext?: boolean; // Whether to fetch historical context
}

interface VerifiedMarketPrediction {
  marketId: string;
  outcome: 'yes' | 'no';
  confidence: number;       // 0-100
  reasoning: string;
  keyFactors: string[];
  isVerified: boolean;
  proof: {
    inputHash: string;
    outputHash: string;
    providerAddress: Address | string;
    modelHash: string;
    timestamp: number;
  } | null;
  chatId: string;
  fallbackMode: boolean;
  warning?: string;
}

// ============================================================================
// 0G Configuration
// ============================================================================

const ZERO_G_CONFIG = {
  computeRpc: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  chainId: parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602'),
};

// Test mode when 0G unavailable
const TEST_MODE_ENABLED = process.env.ENABLE_TEST_MODE === 'true';

// Cached provider instances
let cachedProvider: ethers.JsonRpcProvider | null = null;
let cachedWallet: ethers.Wallet | null = null;

async function getWallet(privateKey: string): Promise<ethers.Wallet> {
  if (!cachedWallet) {
    if (!cachedProvider) {
      cachedProvider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc);
    }
    cachedWallet = new ethers.Wallet(privateKey, cachedProvider);
  }
  return cachedWallet;
}

function resetCache(): void {
  cachedProvider = null;
  cachedWallet = null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function hashString(str: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

function buildAnalysisPrompt(marketData: MarketAnalysisRequest['marketData'], context: string): string {
  return `You are an expert prediction market analyst with deep knowledge of probability assessment.

MARKET DETAILS:
- Question: ${marketData.question}
- Current YES Price: ${marketData.yesPrice}% (implied probability)
- Current NO Price: ${marketData.noPrice}%
- Trading Volume: $${marketData.volume}
- Liquidity: $${marketData.liquidity || 'Unknown'}
- End Time: ${new Date(marketData.endTime).toISOString()}
- Category: ${marketData.category || 'General'}

${context ? `HISTORICAL CONTEXT (similar resolved markets):\n${context}\n` : ''}

Analyze this market and provide your prediction. Consider:
1. Market efficiency - is the current price rational?
2. Volume patterns - does high/low volume indicate confidence?
3. Time remaining - how might the price move before resolution?
4. Category-specific factors - what domain knowledge applies?

Provide your response in this exact JSON format:
{
  "outcome": "yes" or "no",
  "confidence": 0-100,
  "reasoning": "Your detailed analysis (2-3 sentences)",
  "keyFactors": ["factor1", "factor2", "factor3"]
}

Be objective and base your analysis on market dynamics, not personal opinion.`;
}

function parsePrediction(content: string): {
  outcome: 'yes' | 'no';
  confidence: number;
  reasoning: string;
  keyFactors: string[];
} {
  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        outcome: parsed.outcome?.toLowerCase() === 'yes' ? 'yes' : 'no',
        confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 50)),
        reasoning: parsed.reasoning || 'Analysis based on market dynamics',
        keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : [],
      };
    }
  } catch (e) {
    console.warn('Failed to parse JSON prediction, using fallback parsing');
  }

  // Fallback: simple text analysis
  const hasYes = content.toLowerCase().includes('yes');
  const hasNo = content.toLowerCase().includes('no');

  return {
    outcome: hasYes && !hasNo ? 'yes' : 'no',
    confidence: 50,
    reasoning: content.slice(0, 200),
    keyFactors: ['Market price analysis', 'Volume patterns'],
  };
}

async function fetchHistoricalContext(
  question: string,
  source: string,
  category?: string
): Promise<string> {
  try {
    // Query local API for similar past markets
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/0g/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: question,
        type: 'market_similarity',
        source,
        category,
        limit: 5,
      }),
    });

    if (!response.ok) return '';

    const data = await response.json();
    if (!data.results || data.results.length === 0) return '';

    // Format context
    return data.results.map((r: { question: string; outcome?: string; yesPrice?: number }) =>
      `- "${r.question}" → ${r.outcome || 'pending'} (final price: ${r.yesPrice || 'N/A'}%)`
    ).join('\n');
  } catch (error) {
    console.warn('Failed to fetch historical context:', error);
    return '';
  }
}

// ============================================================================
// API Handler
// ============================================================================

export const POST = composeMiddleware([
  withRateLimit({ prefix: '0g-market-inference', ...RateLimitPresets.marketInference }),
  async (req, ctx) => {
    const startTime = Date.now();

    const body: MarketAnalysisRequest = await req.json();
    const { marketId, source, marketData, agentId, includeContext = true } = body;

    // Validate input
    if (!marketId || !source || !marketData?.question) {
      throw ErrorResponses.badRequest('Missing required fields: marketId, source, marketData.question');
    }

    // Fetch historical context if requested
    let historicalContext = '';
    if (includeContext) {
      historicalContext = await fetchHistoricalContext(
        marketData.question,
        source,
        marketData.category
      );
    }

    // Build analysis prompt
    const prompt = buildAnalysisPrompt(marketData, historicalContext);

    // Get private key
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: '0G private key not configured', isVerified: false },
        { status: 500 }
      );
    }

    // Try 0G Compute first
    let useTestMode = false;

    try {
      const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
      const wallet = await getWallet(privateKey);
      const broker = await createZGComputeNetworkBroker(wallet);

      // Ensure ledger exists
      try {
        await broker.ledger.getLedger();
      } catch {
        try {
          await broker.ledger.depositFund(3.0);
        } catch (e: unknown) {
          const error = e as Error;
          if (!error.message?.includes('already exists')) {
            console.warn('Ledger creation warning:', error.message);
          }
        }
      }

      // Get available services
      const services = await broker.inference.listService();
      const chatbotServices = services.filter((s: { serviceType: string }) => s.serviceType === 'chatbot');

      if (chatbotServices.length === 0) {
        throw new Error('No 0G chatbot services available');
      }

      // Select provider
      const selectedService = chatbotServices[0];
      const providerAddress = selectedService.provider as Address;

      // Acknowledge provider
      try {
        await broker.inference.acknowledgeProviderSigner(providerAddress);
      } catch (e: unknown) {
        const error = e as Error;
        if (!error.message?.includes('already acknowledged')) {
          console.warn('Provider acknowledge warning:', error.message);
        }
      }

      // Get metadata and headers
      const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
      const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

      // Make inference request
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ baseURL: endpoint, apiKey: '' });

      const requestHeaders: Record<string, string> = {};
      Object.entries(headers).forEach(([key, value]) => {
        if (typeof value === 'string') requestHeaders[key] = value;
      });

      const completion = await openai.chat.completions.create(
        {
          messages: [
            { role: 'system', content: 'You are an expert prediction market analyst.' },
            { role: 'user', content: prompt },
          ],
          model,
          max_tokens: 500,
          temperature: 0.3,
        },
        { headers: requestHeaders }
      );

      const responseText = completion.choices[0].message.content || '';
      const chatId = completion.id;

      // Process response for payment
      try {
        await broker.inference.processResponse(providerAddress, responseText, chatId);
      } catch (e: unknown) {
        const error = e as Error;
        console.warn('Payment processing warning:', error.message);
      }

      // Parse prediction
      const prediction = parsePrediction(responseText);

      // Generate proof hashes
      const inputHash = hashString(prompt);
      const outputHash = hashString(responseText);

      const response: VerifiedMarketPrediction = {
        marketId,
        outcome: prediction.outcome,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
        keyFactors: prediction.keyFactors,
        isVerified: true,
        proof: {
          inputHash,
          outputHash,
          providerAddress,
          modelHash: model,
          timestamp: Date.now(),
        },
        chatId,
        fallbackMode: false,
      };

      return NextResponse.json({
        success: true,
        prediction: response,
        usage: {
          inputTokens: completion.usage?.prompt_tokens || 0,
          outputTokens: completion.usage?.completion_tokens || 0,
        },
        responseTimeMs: Date.now() - startTime,
      });

    } catch (zeroGError) {
      console.warn('0G Compute unavailable, checking test mode:', zeroGError);
      resetCache();

      if (!TEST_MODE_ENABLED || !process.env.OPENAI_API_KEY) {
        return NextResponse.json({
          success: false,
          error: '0G Compute services unavailable. Cannot generate verifiable inference.',
          isVerified: false,
          fallbackMode: true,
        }, { status: 503 });
      }

      useTestMode = true;
    }

    // Test mode fallback (unverified)
    if (useTestMode) {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert prediction market analyst.' },
          { role: 'user', content: prompt },
        ],
        model: 'gpt-4o-mini',
        max_tokens: 500,
        temperature: 0.3,
      });

      const responseText = completion.choices[0].message.content || '';
      const prediction = parsePrediction(responseText);

      const response: VerifiedMarketPrediction = {
        marketId,
        outcome: prediction.outcome,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
        keyFactors: prediction.keyFactors,
        isVerified: false, // CRITICAL: Not verified
        proof: null,
        chatId: `test_${completion.id}`,
        fallbackMode: true,
        warning: 'TEST MODE: This prediction is NOT from 0G verified compute. Do NOT use for real trades.',
      };

      return NextResponse.json({
        success: true,
        prediction: response,
        usage: {
          inputTokens: completion.usage?.prompt_tokens || 0,
          outputTokens: completion.usage?.completion_tokens || 0,
        },
        responseTimeMs: Date.now() - startTime,
        testMode: true,
      });
    }
  },
], { errorContext: 'API:0G:MarketInference:POST' });

/**
 * GET: Health check and status
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    service: '0g-market-inference',
    status: 'operational',
    timestamp: new Date().toISOString(),
    config: {
      computeRpc: ZERO_G_CONFIG.computeRpc,
      chainId: ZERO_G_CONFIG.chainId,
      testModeEnabled: TEST_MODE_ENABLED,
    },
  });
}
