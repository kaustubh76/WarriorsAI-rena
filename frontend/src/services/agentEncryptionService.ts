/**
 * Agent Encryption Service
 * Handles AES-256-GCM encryption/decryption for iNFT metadata
 * Uses Web Crypto API with signature-derived keys
 */

import { keccak256, toBytes, toHex } from 'viem';
import type { WalletClient } from 'viem';
import type { EncryptedAgentMetadata, EncryptedData, SealedKey } from '@/types/agentINFT';

// ============================================================================
// Constants
// ============================================================================

const ENCRYPTION_VERSION = '1.0.0';
const KEY_DERIVATION_MESSAGE = 'Sign this message to derive your AI Agent encryption key. This signature will not cost any gas.';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive an encryption key from a wallet signature
 * This allows users to encrypt/decrypt without managing separate keys
 */
export async function deriveKeyFromWallet(
  walletClient: WalletClient,
  account: `0x${string}`
): Promise<CryptoKey> {
  // Request signature
  const signature = await walletClient.signMessage({
    account,
    message: KEY_DERIVATION_MESSAGE
  });

  // Convert signature to key material
  const signatureBytes = toBytes(signature);

  // Import as raw key material for HKDF
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    signatureBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  // Derive AES key using HKDF
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('ai-agent-inft-v1'),
      info: new TextEncoder().encode('encryption-key')
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH
    },
    true, // extractable for debugging
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * Derive a public key component for key sealing
 */
export async function derivePublicKeyComponent(
  walletClient: WalletClient,
  account: `0x${string}`
): Promise<string> {
  const signature = await walletClient.signMessage({
    account,
    message: KEY_DERIVATION_MESSAGE + '\n\nPublic key derivation.'
  });

  // Hash signature to create a deterministic public key representation
  const hash = keccak256(toBytes(signature));
  return hash;
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypt metadata using AES-256-GCM
 */
export async function encryptMetadata(
  metadata: EncryptedAgentMetadata,
  key: CryptoKey
): Promise<EncryptedData> {
  // Add encryption timestamp
  const metadataWithTimestamp: EncryptedAgentMetadata = {
    ...metadata,
    encryptedAt: Date.now(),
    encryptionVersion: ENCRYPTION_VERSION
  };

  // Convert to bytes
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(metadataWithTimestamp));

  // Generate random IV and salt
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    plaintext
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    salt,
    version: ENCRYPTION_VERSION
  };
}

/**
 * Decrypt metadata using AES-256-GCM
 */
export async function decryptMetadata(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<EncryptedAgentMetadata> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: encryptedData.iv
    },
    key,
    encryptedData.ciphertext
  );

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(plaintext);

  return JSON.parse(jsonString) as EncryptedAgentMetadata;
}

// ============================================================================
// Hash Functions
// ============================================================================

/**
 * Compute keccak256 hash of metadata for on-chain verification
 */
export function computeMetadataHash(metadata: EncryptedAgentMetadata): `0x${string}` {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(JSON.stringify(metadata));
  return keccak256(bytes);
}

/**
 * Compute hash of encrypted data package
 */
export function computeEncryptedDataHash(data: EncryptedData): `0x${string}` {
  // Combine all components
  const combined = new Uint8Array([
    ...data.ciphertext,
    ...data.iv,
    ...data.salt
  ]);
  return keccak256(combined);
}

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Serialize encrypted data for storage
 */
export function serializeEncryptedData(data: EncryptedData): Uint8Array {
  // Format: [version_length (1)] [version] [iv_length (1)] [iv] [salt_length (1)] [salt] [ciphertext]
  const versionBytes = new TextEncoder().encode(data.version);

  const result = new Uint8Array(
    1 + versionBytes.length +
    1 + data.iv.length +
    1 + data.salt.length +
    data.ciphertext.length
  );

  let offset = 0;

  // Version
  result[offset++] = versionBytes.length;
  result.set(versionBytes, offset);
  offset += versionBytes.length;

  // IV
  result[offset++] = data.iv.length;
  result.set(data.iv, offset);
  offset += data.iv.length;

  // Salt
  result[offset++] = data.salt.length;
  result.set(data.salt, offset);
  offset += data.salt.length;

  // Ciphertext
  result.set(data.ciphertext, offset);

  return result;
}

/**
 * Deserialize encrypted data from storage
 */
export function deserializeEncryptedData(bytes: Uint8Array): EncryptedData {
  let offset = 0;

  // Version
  const versionLength = bytes[offset++];
  const versionBytes = bytes.slice(offset, offset + versionLength);
  const version = new TextDecoder().decode(versionBytes);
  offset += versionLength;

  // IV
  const ivLength = bytes[offset++];
  const iv = bytes.slice(offset, offset + ivLength);
  offset += ivLength;

  // Salt
  const saltLength = bytes[offset++];
  const salt = bytes.slice(offset, offset + saltLength);
  offset += saltLength;

  // Ciphertext (rest of the data)
  const ciphertext = bytes.slice(offset);

  return {
    ciphertext,
    iv,
    salt,
    version
  };
}

/**
 * Convert encrypted data to hex string for display/storage
 */
export function encryptedDataToHex(data: EncryptedData): string {
  const serialized = serializeEncryptedData(data);
  return toHex(serialized);
}

/**
 * Convert hex string back to encrypted data
 */
export function hexToEncryptedData(hex: string): EncryptedData {
  const bytes = toBytes(hex as `0x${string}`);
  return deserializeEncryptedData(bytes);
}

// ============================================================================
// Oracle Proof Types (Real Implementation Required)
// ============================================================================

/**
 * Re-encryption proof from TEE oracle
 * Must be obtained from the 0G TEE oracle service
 */
export interface ReEncryptionProof {
  proof: Uint8Array;
  sealedKey: Uint8Array;
  newMetadataHash: `0x${string}`;
  oracleSignature: `0x${string}`;
}

/**
 * Request re-encryption proof from the TEE oracle
 * This calls the actual 0G oracle service
 */
export async function requestReEncryptionProof(
  tokenId: bigint,
  currentOwner: `0x${string}`,
  newOwner: `0x${string}`,
  encryptedMetadataRef: string
): Promise<ReEncryptionProof> {
  const response = await fetch('/api/0g/reencrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tokenId: tokenId.toString(),
      currentOwner,
      newOwner,
      encryptedMetadataRef
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get re-encryption proof from oracle');
  }

  const result = await response.json();

  if (!result.proof || !result.sealedKey) {
    throw new Error('Invalid response from oracle: missing proof or sealed key');
  }

  return {
    proof: new Uint8Array(Buffer.from(result.proof, 'hex')),
    sealedKey: new Uint8Array(Buffer.from(result.sealedKey, 'hex')),
    newMetadataHash: result.newMetadataHash,
    oracleSignature: result.oracleSignature
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if browser supports required crypto APIs
 */
export function isCryptoSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function' &&
    typeof crypto.subtle.decrypt === 'function' &&
    typeof crypto.subtle.deriveKey === 'function'
  );
}

/**
 * Export key for storage (if needed)
 */
export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exported);
}

/**
 * Import key from storage
 */
export async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH
    },
    true,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// Singleton Service
// ============================================================================

class AgentEncryptionService {
  private keyCache: Map<string, CryptoKey> = new Map();

  /**
   * Get or derive encryption key for an account
   */
  async getKey(
    walletClient: WalletClient,
    account: `0x${string}`
  ): Promise<CryptoKey> {
    const cacheKey = account.toLowerCase();

    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    const key = await deriveKeyFromWallet(walletClient, account);
    this.keyCache.set(cacheKey, key);

    return key;
  }

  /**
   * Clear cached keys (e.g., on disconnect)
   */
  clearCache(): void {
    this.keyCache.clear();
  }

  /**
   * Clear key for specific account
   */
  clearKeyFor(account: `0x${string}`): void {
    this.keyCache.delete(account.toLowerCase());
  }

  /**
   * Encrypt metadata with account's key
   */
  async encrypt(
    metadata: EncryptedAgentMetadata,
    walletClient: WalletClient,
    account: `0x${string}`
  ): Promise<EncryptedData> {
    const key = await this.getKey(walletClient, account);
    return encryptMetadata(metadata, key);
  }

  /**
   * Decrypt metadata with account's key
   */
  async decrypt(
    encryptedData: EncryptedData,
    walletClient: WalletClient,
    account: `0x${string}`
  ): Promise<EncryptedAgentMetadata> {
    const key = await this.getKey(walletClient, account);
    return decryptMetadata(encryptedData, key);
  }
}

// Export singleton instance
export const agentEncryptionService = new AgentEncryptionService();

// Export class for testing
export { AgentEncryptionService };
