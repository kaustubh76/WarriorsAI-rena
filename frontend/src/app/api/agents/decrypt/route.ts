/**
 * iNFT Decrypt API Endpoint
 * POST /api/agents/decrypt - Fetch encrypted metadata for authorized users
 *
 * Returns encrypted data that can be decrypted client-side by authorized users
 */

import { NextRequest, NextResponse } from 'next/server';
import { type Address, isAddress } from 'viem';
import { agentINFTService } from '@/services/agentINFTService';

// 0G Storage configuration
const STORAGE_API_URL =
  process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001';

/**
 * Check if user is authorized to decrypt metadata
 */
async function checkDecryptAuthorization(
  tokenId: bigint,
  userAddress: Address,
  owner: Address
): Promise<{ authorized: boolean; reason?: string }> {
  // Owner can always decrypt
  if (userAddress.toLowerCase() === owner.toLowerCase()) {
    return { authorized: true };
  }

  // Check if authorized executor with metadata viewing permission
  const auth = await agentINFTService.getAuthorization(tokenId, userAddress);
  if (!auth) {
    return { authorized: false, reason: 'No authorization found' };
  }

  // Check if authorization allows metadata viewing
  if (!auth.canViewMetadata) {
    return { authorized: false, reason: 'Not authorized to view metadata' };
  }

  // Check if authorization is still valid
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (auth.expiresAt <= now) {
    return { authorized: false, reason: 'Authorization expired' };
  }

  return { authorized: true };
}

/**
 * Fetch encrypted data from 0G Storage
 */
async function fetchFromStorage(rootHash: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(`${STORAGE_API_URL}/download/${rootHash}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Storage fetch failed: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.warn('0G Storage fetch error:', error);
    return null;
  }
}

/**
 * POST - Fetch encrypted metadata for decryption
 *
 * Request body:
 * {
 *   tokenId: string,
 *   userAddress: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   tokenId: string,
 *   encryptedData?: {
 *     ciphertext: number[],
 *     iv: number[],
 *     salt: number[],
 *     version: number
 *   },
 *   storageRef: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, userAddress } = body;

    // Validation
    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'tokenId is required' },
        { status: 400 }
      );
    }

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'userAddress is required' },
        { status: 400 }
      );
    }

    if (!isAddress(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid userAddress format' },
        { status: 400 }
      );
    }

    // Check if contract is deployed
    if (!agentINFTService.isContractDeployed()) {
      return NextResponse.json(
        { success: false, error: 'AIAgentINFT contract not deployed' },
        { status: 503 }
      );
    }

    // Verify iNFT exists
    const inft = await agentINFTService.getINFT(BigInt(tokenId));
    if (!inft) {
      return NextResponse.json(
        { success: false, error: 'iNFT not found' },
        { status: 404 }
      );
    }

    // Check authorization
    const authCheck = await checkDecryptAuthorization(
      BigInt(tokenId),
      userAddress as Address,
      inft.owner
    );

    if (!authCheck.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: authCheck.reason || 'Not authorized to decrypt metadata',
        },
        { status: 403 }
      );
    }

    // Check if encrypted metadata reference exists
    if (!inft.encryptedMetadataRef || inft.encryptedMetadataRef.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No encrypted metadata found for this iNFT' },
        { status: 404 }
      );
    }

    // Try to fetch from 0G Storage
    const encryptedBytes = await fetchFromStorage(inft.encryptedMetadataRef);

    if (encryptedBytes) {
      // Parse the encrypted data structure
      // Format: [version (1 byte)][salt (16 bytes)][iv (12 bytes)][ciphertext (rest)]
      const version = encryptedBytes[0];
      const salt = Array.from(encryptedBytes.slice(1, 17));
      const iv = Array.from(encryptedBytes.slice(17, 29));
      const ciphertext = Array.from(encryptedBytes.slice(29));

      return NextResponse.json({
        success: true,
        tokenId: tokenId.toString(),
        encryptedData: {
          ciphertext,
          iv,
          salt,
          version,
        },
        storageRef: inft.encryptedMetadataRef,
        metadataHash: inft.metadataHash,
        fetchedAt: Date.now(),
      });
    } else {
      // Storage unavailable or data not found
      // Return storage reference so client can try alternative fetch methods
      return NextResponse.json({
        success: true,
        tokenId: tokenId.toString(),
        encryptedData: null,
        storageRef: inft.encryptedMetadataRef,
        metadataHash: inft.metadataHash,
        warning: '0G Storage unavailable, use storageRef to fetch directly',
        fetchedAt: Date.now(),
      });
    }
  } catch (error) {
    console.error('Decrypt API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Check if user can decrypt metadata (without fetching)
 *
 * Query params:
 * - tokenId: string (required)
 * - userAddress: string (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');
    const userAddress = searchParams.get('userAddress');

    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'tokenId query parameter is required' },
        { status: 400 }
      );
    }

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'userAddress query parameter is required' },
        { status: 400 }
      );
    }

    if (!isAddress(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid userAddress format' },
        { status: 400 }
      );
    }

    // Check if contract is deployed
    if (!agentINFTService.isContractDeployed()) {
      return NextResponse.json(
        { success: false, error: 'AIAgentINFT contract not deployed' },
        { status: 503 }
      );
    }

    // Verify iNFT exists
    const inft = await agentINFTService.getINFT(BigInt(tokenId));
    if (!inft) {
      return NextResponse.json(
        { success: false, error: 'iNFT not found' },
        { status: 404 }
      );
    }

    // Check authorization
    const authCheck = await checkDecryptAuthorization(
      BigInt(tokenId),
      userAddress as Address,
      inft.owner
    );

    const isOwner = userAddress.toLowerCase() === inft.owner.toLowerCase();

    return NextResponse.json({
      success: true,
      tokenId: tokenId.toString(),
      userAddress,
      canDecrypt: authCheck.authorized,
      isOwner,
      hasEncryptedMetadata:
        inft.encryptedMetadataRef && inft.encryptedMetadataRef.length > 0,
      reason: authCheck.reason,
    });
  } catch (error) {
    console.error('Decrypt Check API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
