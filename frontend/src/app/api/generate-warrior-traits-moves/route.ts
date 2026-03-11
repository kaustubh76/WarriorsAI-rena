/**
 * Generate DeFi Strategy Traits & Moves API Route
 * POST: Generate AI-powered DeFi trading strategy traits and actions via 0G inference
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
  withRateLimit({ prefix: 'generate-warrior-traits-moves', ...RateLimitPresets.inference }),
  async (req, ctx) => {
    const { personalityAttributes } = await req.json();

    if (!personalityAttributes || typeof personalityAttributes !== 'object') {
      throw ErrorResponses.badRequest('personalityAttributes is required and must be an object');
    }

    logger.debug('Generating DeFi strategy traits and moves');

    // Call the 0G AI inference API
    const inferenceResponse = await internalFetch(`${getApiBaseUrl()}/api/0g/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `You are a DeFi strategy architect for an AI-powered autonomous trading protocol on Flow blockchain. Based on these personality attributes derived from a user's life story, generate DeFi trading strategy traits and tactical actions.

Personality Profile: ${JSON.stringify(personalityAttributes)}

Extract behavioral signals and map them to DeFi strategy traits. Generate response as JSON with this EXACT format (traits use 0-10000 scale, where 5000 is average):
{
  "Strength": <0-10000>,
  "Wit": <0-10000>,
  "Charisma": <0-10000>,
  "Defence": <0-10000>,
  "Luck": <0-10000>,
  "strike_attack": "<rebalance strategy name — e.g. 'APY Chaser Rebalance'>",
  "taunt_attack": "<concentration play name — e.g. 'All-In Alpha Bet'>",
  "dodge": "<hedging tactic name — e.g. 'Stablecoin Shield'>",
  "recover": "<flash entry/exit name — e.g. 'VRF Precision Strike'>",
  "special_move": "<multi-hop compose name — e.g. 'Yield Cascade Protocol'>"
}

TRAIT MAPPING (use these keys but map to DeFi meaning):
- Strength = ALPHA (Conviction): High = concentrated positions, low = diversified across pools
- Wit = COMPLEXITY (Strategy Depth): High = multi-hop DeFi compositions, low = simple deposits
- Charisma = MOMENTUM (Trend Sensitivity): High = frequent rebalancing, low = buy-and-hold
- Defence = HEDGE (Downside Protection): High = heavy stablecoin allocation, low = fully exposed
- Luck = TIMING (Entry/Exit Precision): High = tight execution windows, low = wide random timing

MOVE MAPPING:
- strike_attack = REBALANCE: Shift allocation between yield pools based on APY changes
- taunt_attack = CONCENTRATE: Double down on highest-performing position
- dodge = HEDGE UP: Move capital to stablecoins/defensive positions
- recover = FLASH: VRF-optimized precise entry/exit timing
- special_move = COMPOSE: Multi-hop Flow Actions (Source→Swap→LP→Borrow)

IMPORTANT:
- Use capitalized keys: Strength, Wit, Charisma, Defence, Luck
- Use underscore keys for moves: strike_attack, taunt_attack, dodge, recover, special_move
- Trait values MUST be numbers between 0 and 10000
- Base traits on personality (e.g., risk-taker = high Strength/ALPHA, cautious = high Defence/HEDGE, analytical = high Wit/COMPLEXITY, reactive = high Charisma/MOMENTUM, precise = high Luck/TIMING)
- Move names should be creative DeFi strategy names, not generic

Respond with valid JSON only, no explanation.`,
        maxTokens: 400,
        temperature: 0.7
      })
    });

    if (!inferenceResponse.ok) {
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
        error: '0G Compute services unavailable. Cannot generate verified strategy traits.',
        fallbackMode: true,
        isVerified: false,
        message: 'Strategy trait generation requires verified 0G inference. Please try again later.'
      }, { status: 503 });
    }

    const traitsMovesJson = inferenceResult.content || inferenceResult.response;

    logger.debug('Generated DeFi strategy traits and moves');

    // Parse the response
    let traitsAndMoves;
    try {
      traitsAndMoves = typeof traitsMovesJson === 'string'
        ? extractJSON(traitsMovesJson)
        : traitsMovesJson;
    } catch (parseError) {
      logger.error('Failed to parse AI response:', traitsMovesJson);
      throw new Error('AI returned invalid JSON format');
    }

    // Validate the response has required fields
    const requiredFields = ['Strength', 'Wit', 'Charisma', 'Defence', 'Luck', 'strike_attack', 'taunt_attack', 'dodge', 'recover', 'special_move'];
    const missingFields = requiredFields.filter(field => !(field in traitsAndMoves));

    if (missingFields.length > 0) {
      logger.error('AI response missing fields:', missingFields);
      throw new Error(`AI response missing required fields: ${missingFields.join(', ')}`);
    }

    // Ensure trait values are in valid range (0-10000)
    const traitFields = ['Strength', 'Wit', 'Charisma', 'Defence', 'Luck'];
    for (const trait of traitFields) {
      const value = traitsAndMoves[trait];
      if (typeof value !== 'number' || value < 0 || value > 10000) {
        logger.warn(`Invalid ${trait} value: ${value}, clamping to valid range`);
        traitsAndMoves[trait] = Math.max(0, Math.min(10000, Number(value) || 5000));
      }
    }

    // Return as JSON string since the page expects to JSON.parse it
    return NextResponse.json({
      success: true,
      traitsAndMoves: JSON.stringify(traitsAndMoves)
    });
  },
], { errorContext: 'API:GenerateWarriorTraitsMoves:POST' });
