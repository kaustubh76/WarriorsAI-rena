/**
 * Generate Battle Moves API Route
 * POST: Generate AI battle moves via 0G inference with crypto signing
 */

import { NextResponse } from 'next/server';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getApiBaseUrl } from '@/constants';
import { logger } from '@/lib/logger';
import { RateLimitPresets } from '@/lib/api';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { internalFetch } from '@/lib/api/internalFetch';

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'generate-battle-moves', ...RateLimitPresets.inference }),
  async (req, ctx) => {
    const { battlePrompt } = await req.json();

    if (!battlePrompt || typeof battlePrompt !== 'object') {
      throw ErrorResponses.badRequest('battlePrompt is required and must be an object');
    }

    logger.debug('Generating battle moves for battle prompt');

    // Call the 0G AI inference API
    const inferenceResponse = await internalFetch(`${getApiBaseUrl()}/api/0g/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `You are a battle AI. Given the following warriors and their stats, determine what move each warrior should make.

Warrior 1: ${JSON.stringify(battlePrompt.warrior1)}
Warrior 2: ${JSON.stringify(battlePrompt.warrior2)}

Available moves: ${battlePrompt.availableMoves?.join(', ') || 'strike, taunt, dodge, recover, special_move'}

Respond with JSON only: {"agent_1": "<move>", "agent_2": "<move>"}`,
        model: 'gpt-4',
        maxTokens: 100,
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
      return NextResponse.json({
        success: false,
        error: errorData.message || errorData.error || '0G inference failed',
        errorCode: errorData.errorCode,
        diagnosticUrl: errorData.diagnosticUrl,
      }, { status: inferenceResponse.status });
    }

    const inferenceResult = await inferenceResponse.json();
    const battleMoves = inferenceResult.content || inferenceResult.response;

    logger.debug('Generated battle moves');

    // Parse the AI response to get the moves
    const parsedMoves = JSON.parse(battleMoves);

    // Map move names to contract enum values (same as arena page)
    const moveMapping: { [key: string]: number } = {
      'strike': 0,
      'taunt': 1,
      'dodge': 2,
      'special_move': 3,
      'recover': 4
    };

    const warriorsOneMove = moveMapping[parsedMoves.agent_1.toLowerCase()] ?? 0;
    const warriorsTwoMove = moveMapping[parsedMoves.agent_2.toLowerCase()] ?? 0;

    logger.debug('API: Mapped moves:', {
      agent_1: parsedMoves.agent_1,
      agent_2: parsedMoves.agent_2,
      warriorsOneMove,
      warriorsTwoMove
    });

    // Generate signature for the arena contract using the AI signer private key
    const aiSignerPrivateKey = process.env.AI_SIGNER_PRIVATE_KEY;

    if (!aiSignerPrivateKey) {
      logger.error('AI_SIGNER_PRIVATE_KEY environment variable is not set');
      return NextResponse.json({
        success: false,
        error: 'Server configuration error: AI signer key not configured'
      }, { status: 500 });
    }

    // Create signature exactly as the contract expects
    const dataToSign = encodePacked(['uint8', 'uint8'], [warriorsOneMove, warriorsTwoMove]);
    const dataHash = keccak256(dataToSign);

    // Sign with AI signer private key (viem automatically adds Ethereum message prefix)
    const aiSignerAccount = privateKeyToAccount(aiSignerPrivateKey as `0x${string}`);
    const signature = await aiSignerAccount.signMessage({
      message: { raw: dataHash }
    });

    logger.debug('API: Generated signature for arena contract:', signature);

    return NextResponse.json({
      success: true,
      response: battleMoves,
      signature: signature,
      moves: {
        agent_1: { move: parsedMoves.agent_1 },
        agent_2: { move: parsedMoves.agent_2 }
      },
      contractMoves: {
        warriorsOneMove,
        warriorsTwoMove
      }
    });
  },
], { errorContext: 'API:GenerateBattleMoves:POST' });
