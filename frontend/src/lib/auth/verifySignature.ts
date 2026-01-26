/**
 * Signature Verification Utilities
 *
 * Verifies wallet signatures for API authentication.
 * Uses EIP-191 personal_sign verification.
 */

import { verifyMessage } from 'viem';
import { logger } from '../logger';

export interface SignatureVerificationResult {
  valid: boolean;
  address?: string;
  error?: string;
}

export interface SignedRequest {
  address: string;
  signature: string;
  message: string;
  timestamp: number;
}

// Maximum age for a signed message (5 minutes)
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

/**
 * Create the message that should be signed by the client
 */
export function createSignMessage(action: string, timestamp: number, data?: string): string {
  const baseMessage = `WarriorsAI Arena\nAction: ${action}\nTimestamp: ${timestamp}`;
  if (data) {
    return `${baseMessage}\nData: ${data}`;
  }
  return baseMessage;
}

/**
 * Verify a signature against an expected address
 */
export async function verifySignature(
  signature: string,
  message: string,
  expectedAddress: string
): Promise<SignatureVerificationResult> {
  try {
    // Verify the signature using viem
    const isValid = await verifyMessage({
      address: expectedAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (isValid) {
      return { valid: true, address: expectedAddress };
    }

    return { valid: false, error: 'Signature verification failed' };
  } catch (error) {
    logger.error('Signature verification error:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Verify a signed request with timestamp validation
 */
export async function verifySignedRequest(
  request: SignedRequest
): Promise<SignatureVerificationResult> {
  const { address, signature, message, timestamp } = request;

  // Check timestamp freshness
  const now = Date.now();
  const messageAge = now - timestamp;

  if (messageAge > MAX_MESSAGE_AGE_MS) {
    return { valid: false, error: 'Signature expired' };
  }

  if (messageAge < 0) {
    return { valid: false, error: 'Invalid timestamp (future date)' };
  }

  // Verify the signature
  return verifySignature(signature, message, address);
}

/**
 * Extract authentication headers from a request
 */
export function extractAuthHeaders(headers: Headers): {
  address: string | null;
  signature: string | null;
  timestamp: string | null;
  message: string | null;
} {
  return {
    address: headers.get('X-Address'),
    signature: headers.get('X-Signature'),
    timestamp: headers.get('X-Timestamp'),
    message: headers.get('X-Message'),
  };
}

/**
 * Validate that all required auth headers are present
 */
export function hasRequiredAuthHeaders(headers: Headers): boolean {
  const { address, signature, timestamp, message } = extractAuthHeaders(headers);
  return !!(address && signature && timestamp && message);
}
