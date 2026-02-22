/**
 * API Route: Warriors NFT File Upload
 * Uploads warrior image + metadata to 0G Storage Network directly via SDK.
 *
 * Accepts multipart form data with file, name, bio, life_history,
 * adjectives, and knowledge_areas fields.
 */

import { NextResponse } from "next/server";
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// Dynamic import for 0G SDK (works better with Next.js)
let Indexer: typeof import('@0gfoundation/0g-ts-sdk').Indexer;
let ZgFile: typeof import('@0gfoundation/0g-ts-sdk').ZgFile;

async function loadSDK() {
  if (!Indexer || !ZgFile) {
    const sdk = await import('@0gfoundation/0g-ts-sdk');
    Indexer = sdk.Indexer;
    ZgFile = sdk.ZgFile;
  }
}

// 0G Storage Configuration (Galileo Testnet)
const STORAGE_CONFIG = {
  rpcUrl: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  indexerUrl: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai',
  privateKey: (process.env.PRIVATE_KEY || process.env.ZEROG_PRIVATE_KEY || '').trim()
};

// Singleton instances
let indexerInstance: InstanceType<typeof Indexer> | null = null;
let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;

async function initializeSDK() {
  if (!STORAGE_CONFIG.privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required for 0G Storage');
  }
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
  return { indexer: indexerInstance, signer };
}

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Upload binary data to 0G storage via SDK
 */
async function uploadToZeroG(data: Buffer, filename: string): Promise<{
  rootHash: string;
  transactionHash: string;
}> {
  const { indexer: idx, signer: sgn } = await initializeSDK();

  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `0g_upload_${Date.now()}_${filename}`);

  try {
    fs.writeFileSync(tempFilePath, data);

    const zgFile = await ZgFile.fromFilePath(tempFilePath);
    const [tree, treeErr] = await zgFile.merkleTree();

    if (treeErr !== null) {
      throw new Error(`Error generating Merkle tree: ${treeErr}`);
    }

    const rootHash = tree?.rootHash() ?? '';
    console.log(`[Files Upload] File prepared: ${filename} (${data.length} bytes), rootHash: ${rootHash}`);

    // Check if file already exists on 0G
    try {
      const checkPath = path.join(tempDir, `0g_check_${Date.now()}`);
      const checkErr = await idx.download(rootHash, checkPath, false);
      if (checkErr === null) {
        console.log(`[Files Upload] File already exists: ${rootHash}`);
        await zgFile.close();
        if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
        return { rootHash, transactionHash: 'existing' };
      }
      if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
    } catch {
      // File doesn't exist, proceed with upload
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [result, uploadErr] = await idx.upload(zgFile, STORAGE_CONFIG.rpcUrl, sgn as any);

      if (uploadErr !== null) {
        if (String(uploadErr).toLowerCase().includes('data already exists')) {
          await zgFile.close();
          return { rootHash, transactionHash: 'existing' };
        }
        throw new Error(`Upload error: ${uploadErr}`);
      }

      await zgFile.close();
      const txHash = result && 'txHash' in result ? result.txHash : 'unknown';
      console.log(`[Files Upload] Success: ${txHash}`);
      return { rootHash, transactionHash: txHash };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (err.message.toLowerCase().includes('data already exists')) {
        await zgFile.close();
        return { rootHash, transactionHash: 'existing' };
      }

      // Transaction submitted but receipt not found — data likely uploaded
      if (err.message.includes('no matching receipts found') ||
          err.message.includes('potential data corruption')) {
        await zgFile.close();
        return { rootHash, transactionHash: 'pending-verification' };
      }

      await zgFile.close();

      // Provide a clearer message for contract reverts (0G testnet issues)
      if (err.message.includes('execution reverted') || err.message.includes('require(false)')) {
        throw new Error(
          '0G Storage Network transaction reverted. This usually means the 0G testnet storage contract ' +
          'is temporarily unavailable. Please try again later.'
        );
      }

      throw err;
    }
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'files-upload', ...RateLimitPresets.fileUpload }),
  async (req, ctx) => {
    const data = await req.formData();
    const file: File | null = data.get("file") as unknown as File;

    // Get form data for JSON metadata
    const name = data.get("name") as string;
    const bio = data.get("bio") as string;
    const life_history = data.get("life_history") as string;
    const adjectives = data.get("adjectives") as string;
    const knowledge_areas = data.get("knowledge_areas") as string;

    if (!file) {
      throw ErrorResponses.badRequest("No file received");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw ErrorResponses.badRequest(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    if (file.size === 0) {
      throw ErrorResponses.badRequest("File is empty");
    }

    console.log("[Files Upload] Uploading:", file.name, "(" + (file.size / 1024 / 1024).toFixed(2) + " MB)");

    // Step 1: Upload image to 0G Storage via SDK
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const { rootHash: imageRootHash, transactionHash: imageTransactionHash } =
      await uploadToZeroG(imageBuffer, file.name);

    console.log("[Files Upload] Image uploaded — rootHash:", imageRootHash);

    // Step 2: Create JSON metadata with 0G Storage image reference
    const metadata = {
      name: name || "Unknown Warrior",
      bio: bio || "A legendary warrior",
      life_history: life_history || "History unknown",
      personality: adjectives ? adjectives.split(', ').map(trait => trait.trim()) : ["Brave", "Skilled"],
      knowledge_areas: knowledge_areas ? knowledge_areas.split(', ').map(area => area.trim()) : ["Combat", "Strategy"],
      image: `0g://${imageRootHash}`,
      image_root_hash: imageRootHash,
      image_transaction_hash: imageTransactionHash
    };

    // Step 3: Upload JSON metadata to 0G Storage via SDK
    const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
    const { rootHash: metadataRootHash, transactionHash: metadataTransactionHash } =
      await uploadToZeroG(metadataBuffer, 'metadata.json');

    console.log("[Files Upload] Metadata uploaded — rootHash:", metadataRootHash);

    return NextResponse.json({
      success: true,
      imageRootHash,
      imageTransactionHash,
      metadataRootHash,
      metadataTransactionHash,
      metadata,
      size: file.size,
      // Legacy compatibility fields
      imageCid: imageRootHash,
      metadataCid: metadataRootHash,
      imageUrl: `0g://${imageRootHash}`,
      metadataUrl: `0g://${metadataRootHash}`
    });
  },
], { errorContext: 'API:Files:POST' });
