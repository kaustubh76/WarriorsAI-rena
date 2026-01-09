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
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string' });
    }

    logger.debug('Generating warrior attributes');

    // Call the 0G AI inference API
    const inferenceResponse = await fetch(`${getApiBaseUrl()}/api/0g/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `You are a game character designer. Generate balanced warrior attributes based on this description: ${prompt}

Generate attributes as JSON with values between 1-100:
{
  "strength": <number>,
  "wit": <number>,
  "charisma": <number>,
  "defence": <number>,
  "luck": <number>
}

Respond with JSON only.`,
        model: 'gpt-4',
        maxTokens: 150,
        temperature: 0.7
      })
    });

    if (!inferenceResponse.ok) {
      throw new Error(`0G inference failed: ${inferenceResponse.statusText}`);
    }

    const inferenceResult = await inferenceResponse.json();
    const attributesJson = inferenceResult.content || inferenceResult.response;

    logger.debug('Generated warrior attributes');

    // Parse and validate attributes
    const attributes = JSON.parse(attributesJson);

    // Return the JSON response
    res.status(200).json({
      success: true,
      attributes: attributes
    });

  } catch (error) {
    logger.error('Error generating warrior attributes:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
