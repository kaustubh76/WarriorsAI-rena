/**
 * API Route: Sign Warrior Traits
 * Server-side signing of warrior traits and moves using Game Master private key
 * This keeps the private key secure on the server
 */

import { NextRequest, NextResponse } from 'next/server';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// Maximum signature validity period (5 minutes)
const SIGNATURE_EXPIRY_MS = 5 * 60 * 1000;

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
  timestamp?: number; // Optional: client-provided timestamp for additional security
}

/**
 * POST /api/sign-traits
 * Sign warrior traits data with Game Master private key
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (20 signings per minute)
    applyRateLimit(request, {
      prefix: 'sign-traits-post',
      maxRequests: 20,
      windowMs: 60000,
    });

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
      recover,
      timestamp: clientTimestamp
    } = body;

    // Validate required fields
    if (tokenId === undefined || tokenId < 0) {
      throw ErrorResponses.badRequest('Invalid tokenId');
    }

    // Validate client timestamp if provided (must be recent)
    const now = Date.now();
    if (clientTimestamp !== undefined) {
      if (typeof clientTimestamp !== 'number' || isNaN(clientTimestamp)) {
        throw ErrorResponses.badRequest('Invalid timestamp format');
      }
      // Timestamp must be within 5 minutes of server time
      if (Math.abs(now - clientTimestamp) > SIGNATURE_EXPIRY_MS) {
        throw ErrorResponses.badRequest('Timestamp expired or too far in future. Please retry.');
      }
    }

    // Generate server timestamp for signature
    const signatureTimestamp = Math.floor(now / 1000); // Unix timestamp in seconds

    // Validate trait values (0-10000 range)
    const traitValues = { strength, wit, charisma, defence, luck };
    for (const [name, value] of Object.entries(traitValues)) {
      if (typeof value !== 'number' || value < 0 || value > 10000) {
        throw ErrorResponses.badRequest(`Invalid ${name} value: must be 0-10000`);
      }
    }

    // Validate move strings
    const moves = { strike, taunt, dodge, special, recover };
    for (const [name, value] of Object.entries(moves)) {
      if (!value || typeof value !== 'string') {
        throw ErrorResponses.badRequest(`Invalid ${name}: must be a non-empty string`);
      }
    }

    // Get Game Master private key
    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY;
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Game Master key not configured');
    }

    // Create account from private key
    const formattedKey = privateKey.startsWith('0x')
      ? privateKey as `0x${string}`
      : `0x${privateKey}` as `0x${string}`;

    const account = privateKeyToAccount(formattedKey);

    // Encode the data including timestamp for replay attack prevention
    // The contract should verify the timestamp is recent when consuming the signature
    const encodedData = encodePacked(
      ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string', 'uint64'],
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
        recover,
        BigInt(signatureTimestamp) // Include timestamp in signed data
      ]
    );

    // Hash the encoded data
    const messageHash = keccak256(encodedData);

    // Sign the hash
    const signature = await account.signMessage({
      message: { raw: messageHash }
    });

    // Calculate expiration time
    const expiresAt = signatureTimestamp + Math.floor(SIGNATURE_EXPIRY_MS / 1000);

    console.log('Game Master signed traits for token:', tokenId, 'expires at:', new Date(expiresAt * 1000).toISOString());

    return NextResponse.json({
      success: true,
      signature,
      gameMasterAddress: account.address,
      tokenId,
      timestamp: signatureTimestamp,
      expiresAt,
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
    return handleAPIError(error, 'API:SignTraits:POST');
  }
}

/**
 * GET /api/sign-traits
 * Returns the Game Master address for verification
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'sign-traits-get',
      maxRequests: 60,
      windowMs: 60000,
    });

    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY;
    if (!privateKey) {
      throw ErrorResponses.serviceUnavailable('Game Master key not configured');
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
    return handleAPIError(error, 'API:SignTraits:GET');
  }
}
