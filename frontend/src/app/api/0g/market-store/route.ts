/**
 * API Route: 0G Market Store
 * Dedicated market snapshot storage for RAG queries and audit trails
 *
 * Features:
 * - Store market snapshots for historical analysis
 * - Store whale trades with permanent audit trail
 * - Store prediction records for accuracy tracking
 * - Index data for fast local queries
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleAPIError, applyRateLimit, ErrorResponses } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

interface ExternalMarketSnapshot {
  marketId: string;
  source: 'polymarket' | 'kalshi' | 'native';
  question: string;
  timestamp: number;

  // Price data
  yesPrice: number;       // 0-10000 (bps)
  noPrice: number;
  volume: string;
  liquidity: string;

  // Predictions made
  predictions?: {
    agentId: string;
    outcome: 'yes' | 'no';
    confidence: number;
    isVerified: boolean;
    proof?: string;
  }[];

  // Whale activity
  whaleTradesInWindow?: WhaleTrade[];

  // Resolution (if resolved)
  resolved?: boolean;
  actualOutcome?: 'yes' | 'no';
}

interface WhaleTrade {
  id: string;
  source: string;
  marketId: string;
  marketQuestion: string;
  traderAddress?: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  amountUsd: string;
  shares: string;
  price: number;
  timestamp: number;
  txHash?: string;
}

interface PredictionRecord {
  marketId: string;
  source: string;
  agentId: string;
  outcome: 'yes' | 'no';
  confidence: number;
  reasoning: string;
  isVerified: boolean;
  proof: {
    inputHash: string;
    outputHash: string;
    providerAddress: string;
    modelHash: string;
  };
  timestamp: number;
}

interface StoreRequest {
  type: 'market_snapshot' | 'whale_trade' | 'prediction' | 'trade_execution';
  data: ExternalMarketSnapshot | WhaleTrade | PredictionRecord | Record<string, unknown>;
  snapshot?: ExternalMarketSnapshot; // Legacy support
}

interface StoreResponse {
  success: boolean;
  rootHash?: string;
  transactionHash?: string;
  dataHash?: string;
  indexed?: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// 0G Storage Configuration
// ============================================================================

const STORAGE_CONFIG = {
  rpcUrl: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  indexerUrl: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai',
  privateKey: process.env.PRIVATE_KEY || process.env.ZEROG_PRIVATE_KEY || '',
};

// Dynamic SDK imports
let Indexer: typeof import('@0glabs/0g-ts-sdk').Indexer;
let ZgFile: typeof import('@0glabs/0g-ts-sdk').ZgFile;

async function loadSDK() {
  if (!Indexer || !ZgFile) {
    const sdk = await import('@0glabs/0g-ts-sdk');
    Indexer = sdk.Indexer;
    ZgFile = sdk.ZgFile;
  }
}

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

  return { indexer: indexerInstance, provider, signer };
}

// ============================================================================
// Helper Functions
// ============================================================================

function hashData(data: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(data));
}

function generateFilename(type: string, data: Record<string, unknown>): string {
  const timestamp = Date.now();
  const id = (data.marketId || data.id || 'unknown') as string;
  return `${type}_${id}_${timestamp}.json`;
}

async function uploadToZeroG(data: string, filename: string): Promise<{
  rootHash: string;
  transactionHash: string;
}> {
  const { indexer: idx, signer: sgn } = await initializeSDK();

  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `0g_market_${Date.now()}_${filename}`);

  try {
    // Write data to temp file
    fs.writeFileSync(tempFilePath, data);

    // Create ZgFile
    const zgFile = await ZgFile.fromFilePath(tempFilePath);
    const [tree, treeErr] = await zgFile.merkleTree();

    if (treeErr !== null) {
      throw new Error(`Merkle tree error: ${treeErr}`);
    }

    const rootHash = tree?.rootHash() ?? '';

    // Check if already exists
    try {
      const checkPath = path.join(tempDir, `0g_check_${Date.now()}`);
      const checkErr = await idx.download(rootHash, checkPath, false);
      if (checkErr === null) {
        await zgFile.close();
        if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
        return { rootHash, transactionHash: 'existing' };
      }
      if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
    } catch {
      // File doesn't exist, proceed with upload
    }

    // Upload with retries
    let uploadResult: { txHash: string; rootHash: string } | null = null;
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [result, uploadErr] = await idx.upload(zgFile, STORAGE_CONFIG.rpcUrl, sgn as any);

        if (uploadErr !== null) {
          throw new Error(`Upload error: ${uploadErr}`);
        }

        uploadResult = result ?? null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();

        // Handle "data already exists"
        if (errorMessage.includes('data already exists')) {
          await zgFile.close();
          return { rootHash, transactionHash: 'existing' };
        }

        // Handle receipt errors
        if (errorMessage.includes('no matching receipts found')) {
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verify upload succeeded
          try {
            const verifyPath = path.join(tempDir, `0g_verify_${Date.now()}`);
            const verifyErr = await idx.download(rootHash, verifyPath, false);
            if (verifyErr === null) {
              await zgFile.close();
              if (fs.existsSync(verifyPath)) fs.unlinkSync(verifyPath);
              return { rootHash, transactionHash: 'verified-after-receipt-error' };
            }
            if (fs.existsSync(verifyPath)) fs.unlinkSync(verifyPath);
          } catch {
            // Continue with retry
          }
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    await zgFile.close();

    if (!uploadResult && lastError) {
      throw lastError;
    }

    return { rootHash, transactionHash: uploadResult?.txHash || 'unknown' };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

async function indexMarketData(
  rootHash: string,
  type: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    // Store index locally via Prisma
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    if (type === 'market_snapshot') {
      const snapshot = data as ExternalMarketSnapshot;
      await prisma.marketSnapshot.upsert({
        where: { rootHash },
        create: {
          rootHash,
          marketId: snapshot.marketId,
          source: snapshot.source,
          question: snapshot.question,
          timestamp: new Date(snapshot.timestamp),
          yesPrice: snapshot.yesPrice,
          noPrice: snapshot.noPrice,
          volume: snapshot.volume,
        },
        update: {
          timestamp: new Date(snapshot.timestamp),
          yesPrice: snapshot.yesPrice,
          noPrice: snapshot.noPrice,
          volume: snapshot.volume,
        },
      });
    } else if (type === 'prediction') {
      const prediction = data as PredictionRecord;
      await prisma.verifiedPrediction.upsert({
        where: { id: `${prediction.marketId}_${prediction.agentId}_${prediction.timestamp}` },
        create: {
          id: `${prediction.marketId}_${prediction.agentId}_${prediction.timestamp}`,
          marketId: prediction.marketId,
          source: prediction.source,
          agentId: prediction.agentId,
          outcome: prediction.outcome,
          confidence: prediction.confidence,
          reasoning: prediction.reasoning,
          isVerified: prediction.isVerified,
          inputHash: prediction.proof?.inputHash || '',
          outputHash: prediction.proof?.outputHash || '',
          providerAddress: prediction.proof?.providerAddress || '',
          modelHash: prediction.proof?.modelHash || '',
          storageRootHash: rootHash,
          timestamp: new Date(prediction.timestamp),
        },
        update: {
          storageRootHash: rootHash,
        },
      });
    }

    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.warn('Failed to index market data:', error);
    return false;
  }
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * POST: Store market data to 0G
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: '0g-market-store-post',
      maxRequests: 20,
      windowMs: 60000,
    });

    const body: StoreRequest = await request.json();
    const { type, data, snapshot } = body;

    // Support legacy format
    const storeData = snapshot || data;
    const dataType = type || 'market_snapshot';

    if (!storeData) {
      throw ErrorResponses.badRequest('No data provided');
    }

    // Prepare storage payload
    const payload = {
      type: dataType,
      data: storeData,
      storedAt: Date.now(),
      version: '1.0',
    };

    const jsonData = JSON.stringify(payload, null, 2);
    const dataHash = hashData(jsonData);

    // Generate filename
    const filename = generateFilename(dataType, storeData as Record<string, unknown>);

    // Upload to 0G
    const { rootHash, transactionHash } = await uploadToZeroG(jsonData, filename);

    // Index for fast queries
    const indexed = await indexMarketData(rootHash, dataType, storeData as Record<string, unknown>);

    const response: StoreResponse = {
      success: true,
      rootHash,
      transactionHash,
      dataHash,
      indexed,
      message: `${dataType} stored successfully on 0G`,
    };

    return NextResponse.json(response);

  } catch (error) {
    return handleAPIError(error, 'API:0G:MarketStore:POST');
  }
}

/**
 * GET: Retrieve market data from 0G
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: '0g-market-store-get',
      maxRequests: 60,
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

      const data = fs.readFileSync(tempFilePath, 'utf-8');
      const parsed = JSON.parse(data);

      return NextResponse.json({
        success: true,
        rootHash,
        data: parsed,
      });
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }

  } catch (error) {
    return handleAPIError(error, 'API:0G:MarketStore:GET');
  }
}

/**
 * PUT: Query indexed market data
 */
export async function PUT(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: '0g-market-store-put',
      maxRequests: 60,
      windowMs: 60000,
    });

    const body = await request.json();
    const { query, type, source, category, limit = 10 } = body;

    // Query Prisma for indexed data
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    let results: unknown[] = [];

    if (type === 'market_similarity' || type === 'market_snapshot') {
      // Search for similar markets
      const where: Record<string, unknown> = {};
      if (source) where.source = source;

      const snapshots = await prisma.marketSnapshot.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      // Simple text similarity (in production, use embeddings)
      const queryWords = new Set(query.toLowerCase().split(/\s+/));
      results = snapshots
        .map((s: { question: string }) => {
          const questionWords = new Set(s.question.toLowerCase().split(/\s+/));
          const intersection = [...queryWords].filter(w => questionWords.has(w));
          const similarity = intersection.length / Math.max(queryWords.size, questionWords.size);
          return { ...s, similarity };
        })
        .filter((s: { similarity: number }) => s.similarity > 0.2)
        .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
        .slice(0, limit);

    } else if (type === 'whale_trades') {
      const where: Record<string, unknown> = {};
      if (source) where.source = source;

      results = await prisma.whaleTrade.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

    } else if (type === 'predictions') {
      const where: Record<string, unknown> = {};
      if (source) where.source = source;

      results = await prisma.verifiedPrediction.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
    }

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    });

  } catch (error) {
    return handleAPIError(error, 'API:0G:MarketStore:PUT');
  }
}
