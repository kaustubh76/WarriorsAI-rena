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
        prompt: `You are a game character designer. Based on these personality attributes, generate warrior traits and special moves:

Personality: ${JSON.stringify(personalityAttributes)}

Generate response as JSON:
{
  "traits": {
    "strength": <1-100>,
    "wit": <1-100>,
    "charisma": <1-100>,
    "defence": <1-100>,
    "luck": <1-100>
  },
  "moves": {
    "strike": "<descriptive move name>",
    "taunt": "<descriptive taunt>",
    "dodge": "<descriptive dodge>",
    "special": "<unique special move name>",
    "recover": "<descriptive recovery move>"
  }
}

Respond with JSON only.`,
        model: 'gpt-4',
        maxTokens: 300,
        temperature: 0.7
      })
    });

    if (!inferenceResponse.ok) {
      throw new Error(`0G inference failed: ${inferenceResponse.statusText}`);
    }

    const inferenceResult = await inferenceResponse.json();
    const traitsMovesJson = inferenceResult.content || inferenceResult.response;

    logger.debug('Generated warrior traits and moves');

    // Parse the response
    const traitsAndMoves = JSON.parse(traitsMovesJson);

    // Return the JSON response
    res.status(200).json({
      success: true,
      traitsAndMoves: traitsAndMoves
    });

  } catch (error) {
    logger.error('Error generating warrior traits and moves:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
