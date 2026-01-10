/**
 * API Route: Sign Warrior Traits
 * Server-side signing of warrior traits and moves using Game Master private key
 * This keeps the private key secure on the server
 */

import { NextRequest, NextResponse } from 'next/server';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

interface SignTraitsRequest {
  tokenId: number;
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
  strike: string;
  taunt: string;
  dodge: string;
  special: string;
  recover: string;
}

/**
 * POST /api/sign-traits
 * Sign warrior traits data with Game Master private key
 */
export async function POST(request: NextRequest) {
  try {
    const body: SignTraitsRequest = await request.json();
    const {
      tokenId,
      strength,
      wit,
      charisma,
      defence,
      luck,
      strike,
      taunt,
      dodge,
      special,
      recover
    } = body;

    // Validate required fields
    if (tokenId === undefined || tokenId < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid tokenId' },
        { status: 400 }
      );
    }

    // Validate trait values (0-10000 range)
    const traitValues = { strength, wit, charisma, defence, luck };
    for (const [name, value] of Object.entries(traitValues)) {
      if (typeof value !== 'number' || value < 0 || value > 10000) {
        return NextResponse.json(
          { success: false, error: `Invalid ${name} value: must be 0-10000` },
          { status: 400 }
        );
      }
    }

    // Validate move strings
    const moves = { strike, taunt, dodge, special, recover };
    for (const [name, value] of Object.entries(moves)) {
      if (!value || typeof value !== 'string') {
        return NextResponse.json(
          { success: false, error: `Invalid ${name}: must be a non-empty string` },
          { status: 400 }
        );
      }
    }

    // Get Game Master private key
    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Game Master key not configured' },
        { status: 500 }
      );
    }

    // Create account from private key
    const formattedKey = privateKey.startsWith('0x')
      ? privateKey as `0x${string}`
      : `0x${privateKey}` as `0x${string}`;

    const account = privateKeyToAccount(formattedKey);

    // Encode the data in the same order as the contract expects (uint16 for tokenId and traits)
    const encodedData = encodePacked(
      ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
      [
        tokenId,
        strength,
        wit,
        charisma,
        defence,
        luck,
        strike,
        taunt,
        dodge,
        special,
        recover
      ]
    );

    // Hash the encoded data
    const messageHash = keccak256(encodedData);

    // Sign the hash
    const signature = await account.signMessage({
      message: { raw: messageHash }
    });

    console.log('Game Master signed traits for token:', tokenId);
    console.log('Signature:', signature);

    return NextResponse.json({
      success: true,
      signature,
      gameMasterAddress: account.address,
      tokenId,
      traits: {
        strength,
        wit,
        charisma,
        defence,
        luck
      },
      moves: {
        strike,
        taunt,
        dodge,
        special,
        recover
      }
    });

  } catch (error) {
    console.error('Sign traits error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sign-traits
 * Returns the Game Master address for verification
 */
export async function GET() {
  try {
    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: 'Game Master key not configured' },
        { status: 500 }
      );
    }

    const formattedKey = privateKey.startsWith('0x')
      ? privateKey as `0x${string}`
      : `0x${privateKey}` as `0x${string}`;

    const account = privateKeyToAccount(formattedKey);

    return NextResponse.json({
      success: true,
      gameMasterAddress: account.address
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
