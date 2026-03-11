/**
 * Generate DeFi Strategy Profile API Route
 * POST: Generate AI DeFi strategist profile attributes via 0G inference
 */

import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/constants';
import { logger } from '@/lib/logger';
import { RateLimitPresets } from '@/lib/api';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { internalFetch } from '@/lib/api/internalFetch';

/** Extract JSON from AI response — handles markdown code fences */
function extractJSON(response: string): unknown {
  const trimmed = response.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1].trim());
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);
    throw new Error('Could not extract JSON from AI response');
  }
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'generate-warrior-attributes', ...RateLimitPresets.inference }),
  async (req, ctx) => {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      throw ErrorResponses.badRequest('Prompt is required and must be a string');
    }

    logger.debug('Generating DeFi strategy profile');

    // Call the 0G AI inference API
    const inferenceResponse = await internalFetch(`${getApiBaseUrl()}/api/0g/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `You are an AI-powered DeFi strategy architect for an autonomous trading protocol on Flow blockchain. Based on this life story, create a unique DeFi trading strategy profile: ${prompt}

Generate a COMPLETE strategy profile as JSON with this EXACT format:
{
  "name": "<creative strategy name — e.g. 'The Surgeon', 'Momentum Hawk', 'Yield Fortress'>",
  "bio": "<2-3 sentence strategy thesis explaining the trading philosophy and approach>",
  "life_history": "<paragraph about how this person's life experiences shape their DeFi strategy — risk tolerance, decision-making speed, analytical depth, protective instincts, timing intuition>",
  "adjectives": ["<strategy characteristic 1>", "<char 2>", "<char 3>", "<char 4>", "<char 5>"],
  "knowledge_areas": ["<DeFi expertise 1>", "<expertise 2>", "<expertise 3>", "<expertise 4>"]
}

IMPORTANT:
- Be creative and derive the strategy personality from the user's life story
- adjectives should be DeFi strategy characteristics like: Yield-hunting, Risk-averse, Momentum-driven, Hedge-heavy, Precision-timed, Alpha-seeking, Composable, Contrarian, etc.
- knowledge_areas should be DeFi protocol expertise like: DEX Aggregation, Lending Protocols, Yield Farming, Liquidity Provision, Stablecoin Vaults, Flash Loans, Cross-chain Bridges, Options Strategies, etc.
- The strategy name should reflect the person's personality (e.g., a surgeon → "The Surgeon" with precise timing)

Respond with valid JSON only, no explanation.`,
        maxTokens: 600,
        temperature: 0.8
      })
    });

    if (!inferenceResponse.ok) {
      // Forward the 0G error response with its diagnostic info
      let errorData;
      try {
        errorData = await inferenceResponse.json();
      } catch {
        errorData = { error: inferenceResponse.statusText };
      }
      logger.error('0G inference failed:', errorData);
      return NextResponse.json({
        success: false,
        error: errorData.message || errorData.error || '0G inference failed',
        errorCode: errorData.errorCode,
        walletAddress: errorData.walletAddress,
        diagnosticUrl: errorData.diagnosticUrl,
      }, { status: inferenceResponse.status });
    }

    const inferenceResult = await inferenceResponse.json();

    // Check if inference is verified (real 0G, not fallback)
    if (inferenceResult.fallbackMode === true || inferenceResult.isVerified === false) {
      logger.warn('0G inference returned unverified result - blocking for testnet');
      return NextResponse.json({
        success: false,
        error: '0G Compute services unavailable. Cannot generate verified strategy profile.',
        fallbackMode: true,
        isVerified: false,
        message: 'Strategy profile generation requires verified 0G inference. Please try again later.'
      }, { status: 503 });
    }

    const attributesJson = inferenceResult.content || inferenceResult.response;

    logger.debug('Generated DeFi strategy profile');

    // Parse and validate attributes
    let attributes;
    try {
      attributes = typeof attributesJson === 'string'
        ? extractJSON(attributesJson)
        : attributesJson;
    } catch (parseError) {
      logger.error('Failed to parse AI response:', attributesJson);
      throw new Error('AI returned invalid JSON format');
    }

    // Validate required fields
    const requiredFields = ['name', 'bio', 'life_history', 'adjectives', 'knowledge_areas'];
    const missingFields = requiredFields.filter(field => !(field in attributes));

    if (missingFields.length > 0) {
      logger.error('AI response missing fields:', missingFields);
      throw new Error(`AI response missing required fields: ${missingFields.join(', ')}`);
    }

    // Ensure arrays are arrays
    if (!Array.isArray(attributes.adjectives)) {
      attributes.adjectives = typeof attributes.adjectives === 'string'
        ? attributes.adjectives.split(',').map((s: string) => s.trim())
        : ['Yield-hunting', 'Risk-aware', 'Strategic'];
    }

    if (!Array.isArray(attributes.knowledge_areas)) {
      attributes.knowledge_areas = typeof attributes.knowledge_areas === 'string'
        ? attributes.knowledge_areas.split(',').map((s: string) => s.trim())
        : ['Yield Farming', 'DEX Aggregation', 'Risk Management'];
    }

    // Return the JSON response as string (page expects to JSON.parse it)
    return NextResponse.json({
      success: true,
      attributes: JSON.stringify(attributes)
    });
  },
], { errorContext: 'API:GenerateWarriorAttributes:POST' });
