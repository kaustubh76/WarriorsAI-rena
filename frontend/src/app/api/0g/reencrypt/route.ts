/**
 * API Route: 0G TEE Oracle Re-encryption
 * Handles iNFT metadata re-encryption for transfers via 0G TEE Oracle
 *
 * This endpoint interfaces with the 0G TEE Oracle to:
 * 1. Fetch encrypted metadata from 0G Storage
 * 2. Request re-encryption for the new owner
 * 3. Return cryptographic proofs for on-chain verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// ============================================================================
// Configuration
// ============================================================================

const ZERO_G_ORACLE_URL = process.env.ZERO_G_ORACLE_URL;
const ZERO_G_ORACLE_API_KEY = process.env.ZERO_G_ORACLE_API_KEY;
const ZERO_G_STORAGE_URL = process.env.NEXT_PUBLIC_0G_STORAGE_URL || 'https://indexer-storage-testnet-standard.0g.ai';

// ============================================================================
// Types
// ============================================================================

interface ReEncryptRequest {
  tokenId: string;
  currentOwner: string;
  newOwner: string;
  encryptedMetadataRef: string;
}

interface OracleResponse {
  success: boolean;
  proof: string;
  sealedKey: string;
  newMetadataHash: string;
  oracleSignature: string;
  error?: string;
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    if (!ZERO_G_ORACLE_URL) {
      return NextResponse.json(
        {
          success: false,
          error: 'TEE Oracle not configured. ZERO_G_ORACLE_URL environment variable is required.',
          code: 'ORACLE_NOT_CONFIGURED'
        },
        { status: 503 }
      );
    }

    // Parse request body
    const body: ReEncryptRequest = await request.json();

    // Validate required fields
    if (!body.tokenId || !body.currentOwner || !body.newOwner || !body.encryptedMetadataRef) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: tokenId, currentOwner, newOwner, encryptedMetadataRef',
          code: 'INVALID_REQUEST'
        },
        { status: 400 }
      );
    }

    // Validate addresses
    if (!ethers.isAddress(body.currentOwner) || !ethers.isAddress(body.newOwner)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid address format',
          code: 'INVALID_ADDRESS'
        },
        { status: 400 }
      );
    }

    // Validate metadata reference format
    if (!body.encryptedMetadataRef.startsWith('0g://')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid metadata reference. Must be a 0G Storage reference (0g://...)',
          code: 'INVALID_METADATA_REF'
        },
        { status: 400 }
      );
    }

    // Request re-encryption from TEE Oracle
    const oracleResponse = await fetch(`${ZERO_G_ORACLE_URL}/reencrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ZERO_G_ORACLE_API_KEY && { 'Authorization': `Bearer ${ZERO_G_ORACLE_API_KEY}` })
      },
      body: JSON.stringify({
        tokenId: body.tokenId,
        currentOwner: body.currentOwner.toLowerCase(),
        newOwner: body.newOwner.toLowerCase(),
        encryptedMetadataRef: body.encryptedMetadataRef,
        storageUrl: ZERO_G_STORAGE_URL
      })
    });

    if (!oracleResponse.ok) {
      const errorText = await oracleResponse.text();
      console.error('TEE Oracle error:', errorText);

      return NextResponse.json(
        {
          success: false,
          error: `TEE Oracle request failed: ${oracleResponse.status}`,
          code: 'ORACLE_ERROR'
        },
        { status: 502 }
      );
    }

    const result: OracleResponse = await oracleResponse.json();

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Oracle re-encryption failed',
          code: 'REENCRYPT_FAILED'
        },
        { status: 400 }
      );
    }

    // Validate oracle response
    if (!result.proof || !result.sealedKey || !result.oracleSignature) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid oracle response: missing proof, sealedKey, or signature',
          code: 'INVALID_ORACLE_RESPONSE'
        },
        { status: 502 }
      );
    }

    // Return the re-encryption proof
    return NextResponse.json({
      success: true,
      proof: result.proof,
      sealedKey: result.sealedKey,
      newMetadataHash: result.newMetadataHash,
      oracleSignature: result.oracleSignature
    });

  } catch (error) {
    console.error('Re-encryption API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
