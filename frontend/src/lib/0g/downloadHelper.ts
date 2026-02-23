/**
 * Shared 0G Storage download helper for server-side use.
 * Lazy-loads the 0G SDK, manages a singleton Indexer instance,
 * downloads to temp files, and cleans up automatically.
 *
 * Only needs the indexer URL (no private key required for downloads).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Dynamic import for 0G SDK (works better with Next.js)
let Indexer: typeof import('@0gfoundation/0g-ts-sdk').Indexer;

async function loadSDK() {
  if (!Indexer) {
    const sdk = await import('@0gfoundation/0g-ts-sdk');
    Indexer = sdk.Indexer;
  }
}

const INDEXER_URL =
  process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER ||
  'https://indexer-storage-testnet-turbo.0g.ai';

// Singleton indexer instance (lazily initialized)
let indexerInstance: InstanceType<typeof Indexer> | null = null;

async function getIndexer() {
  await loadSDK();
  if (!indexerInstance) {
    indexerInstance = new Indexer(INDEXER_URL);
  }
  return indexerInstance;
}

/**
 * Download a file from 0G Storage by root hash.
 * Returns the file contents as a Buffer, or null on failure.
 */
export async function downloadFrom0G(
  rootHash: string
): Promise<Buffer | null> {
  const idx = await getIndexer();
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(
    tempDir,
    `0g_dl_${Date.now()}_${rootHash.substring(0, 10)}`
  );

  try {
    const err = await idx.download(rootHash, tempFilePath, true);
    if (err !== null) {
      console.error(`[0G Download] Error for ${rootHash}:`, err);
      return null;
    }
    return fs.readFileSync(tempFilePath);
  } catch (error) {
    console.error(
      `[0G Download] Exception for ${rootHash}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

/**
 * Detect the content type of a buffer by inspecting its contents.
 * Checks for JSON first, then common image magic bytes.
 */
export function detectContentType(data: Buffer): string {
  // Try JSON detection — check first non-whitespace byte
  if (data.length > 0) {
    const firstByte = data[0];
    // '{' = 0x7B, '[' = 0x5B
    if (firstByte === 0x7b || firstByte === 0x5b) {
      try {
        JSON.parse(data.toString('utf-8'));
        return 'application/json';
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  // Check image magic bytes
  if (data.length >= 4) {
    // PNG: 89 50 4E 47
    if (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return 'image/jpeg';
    }
    // GIF: 47 49 46 38
    if (
      data[0] === 0x47 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x38
    ) {
      return 'image/gif';
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46 &&
      data.length >= 12 &&
      data[8] === 0x57 &&
      data[9] === 0x45 &&
      data[10] === 0x42 &&
      data[11] === 0x50
    ) {
      return 'image/webp';
    }
  }

  return 'application/octet-stream';
}
