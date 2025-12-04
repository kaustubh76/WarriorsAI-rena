import { NextApiRequest, NextApiResponse } from 'next';
import { generateBattleMoves } from '../../../0G/demo-compute-flow';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { battlePrompt } = req.body;

    if (!battlePrompt || typeof battlePrompt !== 'object') {
      return res.status(400).json({ error: 'battlePrompt is required and must be an object' });
    }

    console.log('API: Generating battle moves for battle prompt:', battlePrompt);
    
    // Call the 0G AI function
    const battleMoves = await generateBattleMoves(battlePrompt);
    
    console.log('API: Generated battle moves:', battleMoves);
    
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

    console.log('API: Mapped moves:', { 
      agent_1: parsedMoves.agent_1, 
      agent_2: parsedMoves.agent_2,
      warriorsOneMove, 
      warriorsTwoMove 
    });

    // Generate signature for the arena contract using the AI signer private key
    // IMPORTANT: This key should be set as an environment variable, never hardcoded
    const aiSignerPrivateKey = process.env.AI_SIGNER_PRIVATE_KEY;

    if (!aiSignerPrivateKey) {
      console.error('AI_SIGNER_PRIVATE_KEY environment variable is not set');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: AI signer key not configured'
      });
    }
    
    // Create signature exactly as the contract expects
    const dataToSign = encodePacked(['uint8', 'uint8'], [warriorsOneMove, warriorsTwoMove]);
    const dataHash = keccak256(dataToSign);
    
    // Sign with AI signer private key (viem automatically adds Ethereum message prefix)
    const aiSignerAccount = privateKeyToAccount(aiSignerPrivateKey as `0x${string}`);
    const signature = await aiSignerAccount.signMessage({
      message: { raw: dataHash }
    });

    console.log('API: Generated signature for arena contract:', signature);
    
    // Return the response in the expected format with signature
    res.status(200).json({ 
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
    
  } catch (error) {
    console.error('API: Error generating battle moves:', error);
    
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
} 