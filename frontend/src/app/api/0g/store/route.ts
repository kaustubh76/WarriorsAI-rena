/**
 * API Route: 0G Storage
 * Server-side battle data storage via 0G Storage Network (Testnet)
 *
 * Features:
 * - Direct integration with @0gfoundation/0g-ts-sdk
 * - Battle data validation
 * - Automatic indexing after storage
 * - Cryptographic integrity verification
 * - Storage status monitoring
 */

import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { internalFetch } from '@/lib/api/internalFetch';

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

// Battle data structure for storage
interface BattleDataIndex {
  battleId: string;
  timestamp: number;
  warriors: {
    id: string;
    name?: string;
    traits: {
      strength: number;
      wit: number;
      charisma: number;
      defence: number;
      luck: number;
    };
    ranking?: number;
    totalBattles: number;
    wins: number;
    losses: number;
  }[];
  rounds: {
    roundNumber: number;
    moves: {
      warriorId: string;
      move: 'strike' | 'taunt' | 'dodge' | 'recover' | 'special_move';
    }[];
    damage: {
      warriorId: string;
      damageDealt: number;
      damageTaken: number;
    }[];
    roundWinner?: string;
  }[];
  outcome: 'warrior1' | 'warrior2' | 'draw';
  totalDamage: {
    warrior1: number;
    warrior2: number;
  };
  totalRounds: number;
  marketData?: {
    marketId?: string;
    finalOdds: { yes: number; no: number };
    totalVolume: string;
    aiPredictionAccuracy?: number;
  };
}

interface StoreRequest {
  battle: BattleDataIndex;
}

interface StoreResponse {
  success: boolean;
  rootHash?: string;
  transactionHash?: string;
  dataHash?: string;
  message?: string;
  error?: string;
  indexed?: boolean;
  cached?: boolean;
  warning?: string;
}

// Extended battle data with optional prediction data
interface BattleDataWithPrediction extends BattleDataIndex {
  _predictionData?: {
    prediction: string;
    confidence: number;
    reasoning?: string;
  };
}

// 0G Storage Configuration (Galileo Testnet)
const STORAGE_CONFIG = {
  rpcUrl: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  indexerUrl: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai',
  privateKey: (process.env.PRIVATE_KEY || process.env.ZEROG_PRIVATE_KEY || '').trim()
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
 * Generate keccak256 hash for data integrity
 */
function hashData(data: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(data));
}

/**
 * Index battle in query API for RAG queries
 */
async function indexBattle(rootHash: string, battle: BattleDataIndex): Promise<boolean> {
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim();
    const response = await internalFetch(`${baseUrl}/api/0g/query`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootHash, battle })
    });
    return response.ok;
  } catch (error) {
    console.warn('Failed to index battle:', error);
    return false;
  }
}

/**
 * Check network health
 */
async function checkNetworkHealth(): Promise<{
  healthy: boolean;
  connectedPeers: number;
  error?: string;
}> {
  try {
    const { indexer: idx } = await initializeSDK();
    const [nodeStatus, nodeErr] = await idx.selectNodes(1);

    if (nodeErr !== null) {
      return { healthy: false, connectedPeers: 0, error: String(nodeErr) };
    }

    return {
      healthy: nodeStatus.length > 0,
      connectedPeers: nodeStatus.length,
      error: nodeStatus.length === 0 ? 'No nodes available' : undefined
    };
  } catch (error) {
    return {
      healthy: false,
      connectedPeers: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Upload data to 0G storage
 */
async function uploadToZeroG(data: string, filename: string): Promise<{
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
    console.log(`📁 File prepared: ${filename} (${data.length} bytes)`);
    console.log(`🔑 Root Hash: ${rootHash}`);

    // Check if file already exists
    try {
      const checkPath = path.join(tempDir, `0g_check_${Date.now()}`);
      const checkErr = await idx.download(rootHash, checkPath, false);
      if (checkErr === null) {
        console.log(`✅ File already exists in 0G storage: ${rootHash}`);
        await zgFile.close();
        // Clean up check file
        if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
        return { rootHash, transactionHash: 'existing' };
      }
      // Clean up check file if it exists
      if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
    } catch {
      // File doesn't exist, proceed with upload
      console.log('📤 File not found, uploading...');
    }

    // Upload with retries and improved error handling
    let uploadResult: { txHash: string; rootHash: string } | null = null;
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🚀 Upload attempt ${attempt}/${maxRetries}`);
        // Cast signer to satisfy SDK type requirements (ESM/CommonJS type mismatch)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [result, uploadErr] = await idx.upload(zgFile, STORAGE_CONFIG.rpcUrl, sgn as any);

        if (uploadErr !== null) {
          throw new Error(`Upload error: ${uploadErr}`);
        }

        uploadResult = result && 'txHash' in result ? result : null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();
        console.warn(`❌ Upload attempt ${attempt} failed:`, lastError.message);

        // Check if data already exists
        if (errorMessage.includes('data already exists')) {
          console.log(`✅ File already exists in 0G storage: ${rootHash}`);
          await zgFile.close();
          return { rootHash, transactionHash: 'existing' };
        }

        // Handle transaction receipt errors gracefully
        // These are often transient and the upload may have actually succeeded
        if (errorMessage.includes('no matching receipts found') ||
            errorMessage.includes('potential data corruption')) {
          console.warn(`⚠️ Transaction receipt error - upload may have succeeded. Verifying...`);
          // Wait a bit for the transaction to propagate
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Try to verify if the file exists now
          try {
            const checkPath = path.join(os.tmpdir(), `0g_verify_${Date.now()}`);
            const checkErr = await idx.download(rootHash, checkPath, false);
            if (checkErr === null) {
              console.log(`✅ File verified in 0G storage after receipt error: ${rootHash}`);
              await zgFile.close();
              if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
              return { rootHash, transactionHash: 'verified-after-receipt-error' };
            }
            if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
          } catch {
            // Verification failed, continue with retry
          }
        }

        // Handle timeout errors with longer delay
        if (errorMessage.includes('etimedout') || errorMessage.includes('timeout')) {
          console.warn(`⚠️ Timeout error - network may be slow. Waiting before retry...`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
            continue;
          }
        }

        // Handle network detection errors
        if (errorMessage.includes('failed to detect network')) {
          console.warn(`⚠️ Network detection failed - RPC may be temporarily unavailable`);
          // Reset provider singleton on network errors
          provider = null;
          signer = null;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
            // Re-initialize SDK for next attempt
            await initializeSDK();
            continue;
          }
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    await zgFile.close();

    // Final check: even if all retries failed, verify if the file made it
    if (!uploadResult && lastError) {
      try {
        const finalCheckPath = path.join(os.tmpdir(), `0g_final_check_${Date.now()}`);
        const finalCheckErr = await idx.download(rootHash, finalCheckPath, false);
        if (finalCheckErr === null) {
          console.log(`✅ File found in final verification: ${rootHash}`);
          if (fs.existsSync(finalCheckPath)) fs.unlinkSync(finalCheckPath);
          return { rootHash, transactionHash: 'verified-after-retries' };
        }
        if (fs.existsSync(finalCheckPath)) fs.unlinkSync(finalCheckPath);
      } catch {
        // Final verification failed
      }
      throw lastError;
    }

    console.log(`✅ File uploaded successfully: ${uploadResult?.txHash}`);
    return { rootHash, transactionHash: uploadResult?.txHash || 'unknown' };
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

/**
 * Download data from 0G storage
 */
async function downloadFromZeroG(rootHash: string): Promise<string> {
  const { indexer: idx } = await initializeSDK();

  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `0g_download_${Date.now()}_${rootHash.substring(0, 8)}`);

  try {
    const err = await idx.download(rootHash, tempFilePath, true);

    if (err !== null) {
      throw new Error(`Download error: ${err}`);
    }

    const data = fs.readFileSync(tempFilePath, 'utf-8');
    return data;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

/**
 * POST: Store battle data on 0G testnet
 */
export const POST = composeMiddleware([
  withRateLimit({ prefix: '0g-store', ...RateLimitPresets.storageWrite }),
  async (req, ctx) => {
    // Parse request body
    let body: StoreRequest;
    try {
      body = await req.json();
    } catch {
      throw ErrorResponses.badRequest('Invalid JSON in request body');
    }

    const { battle } = body as { battle: BattleDataWithPrediction };

    // Validate input
    if (!battle || !battle.battleId) {
      throw ErrorResponses.badRequest('Battle data with battleId is required');
    }

    // Check if this is a prediction storage request (has _predictionData)
    const isPredictionData = !!battle._predictionData;

    // Validate battle structure (skip for prediction data)
    if (!isPredictionData) {
      if (!battle.warriors || battle.warriors.length !== 2) {
        throw ErrorResponses.badRequest('Battle must have exactly 2 warriors');
      }

      if (!battle.rounds || battle.rounds.length === 0) {
        throw ErrorResponses.badRequest('Battle must have at least 1 round');
      }

      if (!['warrior1', 'warrior2', 'draw'].includes(battle.outcome)) {
        throw ErrorResponses.badRequest('Invalid battle outcome');
      }
    }

    // Serialize battle data
    const jsonData = JSON.stringify(battle);
    const dataHash = hashData(jsonData);

    // Upload to 0G storage
    const { rootHash, transactionHash } = await uploadToZeroG(
      jsonData,
      `battle_${battle.battleId}.json`
    );

    // Index battle for RAG queries
    let indexed = false;
    if (rootHash) {
      indexed = await indexBattle(rootHash, battle);
    }

    const storeResponse: StoreResponse = {
      success: true,
      rootHash,
      transactionHash,
      dataHash,
      message: `Battle ${battle.battleId} stored on 0G testnet`,
      indexed,
      cached: false
    };

    return NextResponse.json(storeResponse);
  },
], { errorContext: 'API:0G:Store:POST' });

/**
 * GET: Retrieve battle data from 0G storage
 */
export const GET = composeMiddleware([
  withRateLimit({ prefix: '0g-store-get', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const rootHash = searchParams.get('rootHash');

    if (!rootHash) {
      throw ErrorResponses.badRequest('rootHash query parameter is required');
    }

    // Download from 0G storage
    const data = await downloadFromZeroG(rootHash);
    const battleData = JSON.parse(data);

    return NextResponse.json({
      success: true,
      rootHash,
      data: battleData,
      cached: false
    });
  },
], { errorContext: 'API:0G:Store:GET' });

/**
 * PUT: Check 0G storage status
 */
export const PUT = composeMiddleware([
  withRateLimit({ prefix: '0g-store-status', ...RateLimitPresets.moderateReads }),
  async (req, ctx) => {
    try {
      // Initialize SDK to verify configuration
      await initializeSDK();

      // Check network health
      const health = await checkNetworkHealth();

      return NextResponse.json({
        success: true,
        status: health.healthy ? 'healthy' : 'unhealthy',
        mode: '0g-network',
        timestamp: new Date().toISOString(),
        rpc: STORAGE_CONFIG.rpcUrl,
        indexer: STORAGE_CONFIG.indexerUrl,
        network: health
      });
    } catch (error) {
      // Return unhealthy status if SDK initialization or health check fails
      console.warn('[0G Store] Status check failed:', (error as Error).message);
      return NextResponse.json({
        success: false,
        status: 'unhealthy',
        mode: '0g-network',
        timestamp: new Date().toISOString(),
        rpc: STORAGE_CONFIG.rpcUrl,
        indexer: STORAGE_CONFIG.indexerUrl,
        network: {
          healthy: false,
          connectedPeers: 0,
          error: (error as Error).message,
        }
      });
    }
  },
], { errorContext: 'API:0G:Store:PUT' });
