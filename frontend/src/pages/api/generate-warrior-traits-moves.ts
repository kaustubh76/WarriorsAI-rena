import { NextApiRequest, NextApiResponse } from 'next';
import { getApiBaseUrl } from '../../constants';
import { logger } from '../../lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { personalityAttributes } = req.body;

    if (!personalityAttributes || typeof personalityAttributes !== 'object') {
      return res.status(400).json({ error: 'personalityAttributes is required and must be an object' });
    }

    logger.debug('Generating warrior traits and moves');

    // Call the 0G AI inference API
    const inferenceResponse = await fetch(`${getApiBaseUrl()}/api/0g/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `You are a game character designer for a blockchain warrior battle game. Based on these personality attributes, generate warrior traits and special moves.

Personality: ${JSON.stringify(personalityAttributes)}

Generate response as JSON with this EXACT format (traits use 0-10000 scale, where 5000 is average):
{
  "Strength": <0-10000>,
  "Wit": <0-10000>,
  "Charisma": <0-10000>,
  "Defence": <0-10000>,
  "Luck": <0-10000>,
  "strike_attack": "<descriptive attack move name>",
  "taunt_attack": "<descriptive taunt phrase>",
  "dodge": "<descriptive evasion move>",
  "recover": "<descriptive recovery/heal move>",
  "special_move": "<unique powerful special move name>"
}

IMPORTANT:
- Use capitalized keys: Strength, Wit, Charisma, Defence, Luck
- Use underscore keys for moves: strike_attack, taunt_attack, dodge, recover, special_move
- Trait values MUST be numbers between 0 and 10000
- Base traits on personality (e.g., aggressive = high Strength, clever = high Wit)

Respond with valid JSON only, no explanation.`,
        // Let 0G use the provider's available model
        maxTokens: 400,
        temperature: 0.7
      })
    });

    if (!inferenceResponse.ok) {
      const errorText = await inferenceResponse.text();
      logger.error('0G inference failed:', errorText);
      throw new Error(`0G inference failed: ${inferenceResponse.statusText}`);
    }

    const inferenceResult = await inferenceResponse.json();

    // Check if inference is verified (real 0G, not fallback)
    if (inferenceResult.fallbackMode === true || inferenceResult.isVerified === false) {
      logger.warn('0G inference returned unverified result - blocking for testnet');
      return res.status(503).json({
        success: false,
        error: '0G Compute services unavailable. Cannot generate verified traits.',
        fallbackMode: true,
        isVerified: false,
        message: 'Warrior trait generation requires verified 0G inference. Please try again later.'
      });
    }

    const traitsMovesJson = inferenceResult.content || inferenceResult.response;

    logger.debug('Generated warrior traits and moves');

    // Parse the response - it should already be in the correct format
    let traitsAndMoves;
    try {
      traitsAndMoves = typeof traitsMovesJson === 'string'
        ? JSON.parse(traitsMovesJson)
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
    res.status(200).json({
      success: true,
      traitsAndMoves: JSON.stringify(traitsAndMoves)
    });

  } catch (error) {
    logger.error('Error generating warrior traits and moves:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
