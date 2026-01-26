/**
 * API Route: 0G Storage Upload for iNFT Metadata
 * Server-side encrypted metadata storage via 0G Storage Network (Testnet)
 *
 * This endpoint handles uploading encrypted agent metadata for iNFT minting.
 * It uses the 0G SDK directly to upload binary data to the storage network.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// Dynamic import for 0G SDK (works better with Next.js)
let Indexer: typeof import('@0glabs/0g-ts-sdk').Indexer;
let ZgFile: typeof import('@0glabs/0g-ts-sdk').ZgFile;

async function loadSDK() {
  if (!Indexer || !ZgFile) {
    const sdk = await import('@0glabs/0g-ts-sdk');
    Indexer = sdk.Indexer;
    ZgFile = sdk.ZgFile;
  }
}

// 0G Storage Configuration (Galileo Testnet)
const STORAGE_CONFIG = {
  rpcUrl: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  indexerUrl: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai',
  privateKey: process.env.PRIVATE_KEY || process.env.ZEROG_PRIVATE_KEY || ''
};

// Singleton instances (lazily initialized)
let indexerInstance: InstanceType<typeof Indexer> | null = null;
let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;

/**
 * Initialize 0G SDK components
 */
async function initializeSDK() {
  if (!STORAGE_CONFIG.privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required for 0G Storage');
  }

  // Load SDK dynamically
  await loadSDK();

  if (!indexerInstance) {
    indexerInstance = new Indexer(STORAGE_CONFIG.indexerUrl);
  }

  if (!provider) {
    provider = new ethers.JsonRpcProvider(STORAGE_CONFIG.rpcUrl);
  }

  if (!signer) {
    signer = new ethers.Wallet(STORAGE_CONFIG.privateKey, provider);
  }

  return { indexer: indexerInstance, provider, signer };
}

/**
 * Upload binary data to 0G storage
 */
async function uploadToZeroG(data: Buffer | Uint8Array, filename: string): Promise<{
  rootHash: string;
  transactionHash: string;
}> {
  const { indexer: idx, signer: sgn } = await initializeSDK();

  // Create temporary file
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `0g_upload_${Date.now()}_${filename}`);

  try {
    // Write data to temp file
    fs.writeFileSync(tempFilePath, data);

    // Create ZgFile from file path
    const zgFile = await ZgFile.fromFilePath(tempFilePath);
    const [tree, treeErr] = await zgFile.merkleTree();

    if (treeErr !== null) {
      throw new Error(`Error generating Merkle tree: ${treeErr}`);
    }

    const rootHash = tree?.rootHash() ?? '';
    console.log(`[0G Upload] File prepared: ${filename} (${data.length} bytes)`);
    console.log(`[0G Upload] Root Hash: ${rootHash}`);

    // Check if file already exists
    try {
      const checkPath = path.join(tempDir, `0g_check_${Date.now()}`);
      const checkErr = await idx.download(rootHash, checkPath, false);
      if (checkErr === null) {
        console.log(`[0G Upload] File already exists: ${rootHash}`);
        await zgFile.close();
        // Clean up check file
        if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
        return { rootHash, transactionHash: 'existing' };
      }
      // Clean up check file if it exists
      if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
    } catch {
      // File doesn't exist, proceed with upload
      console.log('[0G Upload] File not found, uploading...');
    }

    // Upload with single attempt (retries handled by client fallback)
    let uploadResult: { txHash: string; rootHash: string } | null = null;

    try {
      console.log(`[0G Upload] Uploading to 0G network...`);
      // Cast signer to satisfy SDK type requirements (ESM/CommonJS type mismatch)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [result, uploadErr] = await idx.upload(zgFile, STORAGE_CONFIG.rpcUrl, sgn as any);

      if (uploadErr !== null) {
        // Check if data already exists
        if (String(uploadErr).toLowerCase().includes('data already exists')) {
          console.log(`[0G Upload] File already exists: ${rootHash}`);
          await zgFile.close();
          return { rootHash, transactionHash: 'existing' };
        }
        throw new Error(`Upload error: ${uploadErr}`);
      }

      uploadResult = result ?? null;
    } catch (error) {
      const lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[0G Upload] Upload failed:`, lastError.message);

      // Check if data already exists
      if (lastError.message.toLowerCase().includes('data already exists')) {
        console.log(`[0G Upload] File already exists: ${rootHash}`);
        await zgFile.close();
        return { rootHash, transactionHash: 'existing' };
      }

      // Handle "no matching receipts found" error - this often means the tx was submitted
      // but the RPC node has trouble finding the receipt. The data may still be uploaded.
      // We return the rootHash so the client can proceed and verify later.
      if (lastError.message.includes('no matching receipts found') ||
          lastError.message.includes('potential data corruption')) {
        console.warn(`[0G Upload] Transaction receipt issue - returning rootHash for verification`);
        await zgFile.close();
        // Return success with rootHash - the transaction was likely submitted
        // The client can verify the upload worked by trying to download later
        return { rootHash, transactionHash: 'pending-verification' };
      }

      await zgFile.close();
      throw lastError;
    }

    await zgFile.close();

    if (!uploadResult) {
      throw new Error('Upload returned no result');
    }

    console.log(`[0G Upload] Success: ${uploadResult?.txHash}`);
    return { rootHash, transactionHash: uploadResult?.txHash || 'unknown' };
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST: Upload encrypted metadata to 0G storage
 * Accepts FormData with a 'file' field containing the encrypted metadata
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for upload operations
    applyRateLimit(request, {
      prefix: '0g-upload',
      maxRequests: 10,
      windowMs: 60000,
    });

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw ErrorResponses.badRequest('No file provided');
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw ErrorResponses.badRequest(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Validate file size is not empty
    if (file.size === 0) {
      throw ErrorResponses.badRequest('File is empty');
    }

    console.log(`[0G Upload API] Received file: ${file.name} (${file.size} bytes)`);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to 0G
    const { rootHash, transactionHash } = await uploadToZeroG(buffer, file.name);

    return NextResponse.json({
      success: true,
      rootHash,
      transactionHash,
      size: file.size,
      filename: file.name
    });
  } catch (error) {
    return handleAPIError(error, 'API:0G:Upload:POST');
  }
}

/**
 * GET: Download data from 0G storage
 * Query params: rootHash
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting for download operations
    applyRateLimit(request, {
      prefix: '0g-upload-download',
      maxRequests: 30,
      windowMs: 60000,
    });

    const { searchParams } = new URL(request.url);
    const rootHash = searchParams.get('rootHash');

    if (!rootHash) {
      throw ErrorResponses.badRequest('rootHash query parameter is required');
    }

    const { indexer: idx } = await initializeSDK();

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `0g_download_${Date.now()}_${rootHash.substring(0, 8)}`);

    try {
      const err = await idx.download(rootHash, tempFilePath, true);

      if (err !== null) {
        throw new Error(`Download error: ${err}`);
      }

      const data = fs.readFileSync(tempFilePath);

      // Return as binary response
      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.length.toString(),
        },
      });
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  } catch (error) {
    return handleAPIError(error, 'API:0G:Upload:GET');
  }
}
