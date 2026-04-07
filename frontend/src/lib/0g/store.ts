/**
 * 0G-Native Data Store
 *
 * Replaces Prisma/PostgreSQL with decentralized 0G Storage.
 * Architecture:
 *   - In-memory index for fast queries (Map-based)
 *   - 0G Storage for persistence (content-addressed by rootHash)
 *   - Periodic flush to 0G for durability
 *   - Collection-based API similar to document stores
 *
 * Each "collection" (e.g., battles, rounds, bets) is stored as a
 * single 0G blob that gets re-uploaded when the collection changes.
 * An index manifest tracks all collection rootHashes.
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── SDK lazy loader ────────────────────────────────────

let Indexer: typeof import('@0gfoundation/0g-ts-sdk').Indexer;
let ZgFile: typeof import('@0gfoundation/0g-ts-sdk').ZgFile;

async function loadSDK() {
  if (!Indexer || !ZgFile) {
    const sdk = await import('@0gfoundation/0g-ts-sdk');
    Indexer = sdk.Indexer;
    ZgFile = sdk.ZgFile;
  }
}

const STORAGE_CONFIG = {
  rpcUrl: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  indexerUrl: process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai',
  privateKey: (process.env.PRIVATE_KEY || process.env.ZEROG_PRIVATE_KEY || '').trim(),
};

let indexerInstance: InstanceType<typeof Indexer> | null = null;
let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;

async function getSDK() {
  await loadSDK();
  if (!indexerInstance) indexerInstance = new Indexer(STORAGE_CONFIG.indexerUrl);
  if (!provider) provider = new ethers.JsonRpcProvider(STORAGE_CONFIG.rpcUrl);
  if (!signer && STORAGE_CONFIG.privateKey) signer = new ethers.Wallet(STORAGE_CONFIG.privateKey, provider);
  return { indexer: indexerInstance, provider, signer };
}

// ─── Types ──────────────────────────────────────────────

export interface Document {
  id: string;
  [key: string]: unknown;
}

export interface QueryFilter {
  [key: string]: unknown;
}

export interface QueryOptions {
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  take?: number;
  skip?: number;
  include?: string[];
}

type WhereClause = Record<string, unknown>;

// ─── Collection ─────────────────────────────────────────

/**
 * A Collection is an in-memory document store backed by 0G Storage.
 * It supports CRUD operations with filtering, sorting, and pagination.
 */
export class Collection<T extends Document = Document> {
  readonly name: string;
  private docs: Map<string, T> = new Map();
  private indexes: Map<string, Map<unknown, Set<string>>> = new Map();
  private indexedFields: string[];
  private dirty = false;
  private lastRootHash: string | null = null;

  constructor(name: string, indexedFields: string[] = []) {
    this.name = name;
    this.indexedFields = indexedFields;
    for (const field of indexedFields) {
      this.indexes.set(field, new Map());
    }
  }

  // ── Index management ──

  private addToIndex(doc: T) {
    for (const field of this.indexedFields) {
      const value = (doc as Record<string, unknown>)[field];
      if (value === undefined || value === null) continue;
      const idx = this.indexes.get(field)!;
      if (!idx.has(value)) idx.set(value, new Set());
      idx.get(value)!.add(doc.id);
    }
  }

  private removeFromIndex(doc: T) {
    for (const field of this.indexedFields) {
      const value = (doc as Record<string, unknown>)[field];
      if (value === undefined || value === null) continue;
      const idx = this.indexes.get(field);
      idx?.get(value)?.delete(doc.id);
    }
  }

  // ── Storage normalization ──

  private normalizeForStorage(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        result[key] = value.toISOString();
      } else if (typeof value === 'bigint') {
        result[key] = value.toString();
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // ── CRUD ──

  create(data: T): T {
    if (this.docs.has(data.id)) {
      throw new Error(`[${this.name}] Document with id ${data.id} already exists`);
    }
    const normalized = this.normalizeForStorage(data as unknown as Record<string, unknown>);
    const doc = { ...normalized, id: data.id } as T;
    this.docs.set(doc.id, { ...doc });
    this.addToIndex(doc);
    this.dirty = true;
    return { ...doc };
  }

  findUnique(id: string): T | null {
    const doc = this.docs.get(id);
    return doc ? { ...doc } : null;
  }

  findFirst(where: WhereClause): T | null {
    for (const doc of this.docs.values()) {
      if (this.matchesWhere(doc, where)) return { ...doc };
    }
    return null;
  }

  findMany(where?: WhereClause, options?: QueryOptions): T[] {
    let results: T[];

    // Fast path: if filtering on a single indexed field
    if (where && Object.keys(where).length === 1) {
      const [field, value] = Object.entries(where)[0];
      const idx = this.indexes.get(field);
      if (idx && typeof value !== 'object') {
        const ids = idx.get(value);
        results = ids
          ? Array.from(ids).map(id => this.docs.get(id)!).filter(Boolean).map(d => ({ ...d }))
          : [];
        // Still apply any remaining where if needed
      } else {
        results = this.scanWithFilter(where);
      }
    } else {
      results = this.scanWithFilter(where);
    }

    // Sort
    if (options?.orderBy) {
      const { field, direction } = options.orderBy;
      results.sort((a, b) => {
        const va = (a as Record<string, unknown>)[field];
        const vb = (b as Record<string, unknown>)[field];
        if (va == null && vb == null) return 0;
        if (va == null) return direction === 'asc' ? -1 : 1;
        if (vb == null) return direction === 'asc' ? 1 : -1;
        if (va < vb) return direction === 'asc' ? -1 : 1;
        if (va > vb) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Pagination
    const skip = options?.skip ?? 0;
    const take = options?.take;
    if (skip > 0 || take !== undefined) {
      results = results.slice(skip, take !== undefined ? skip + take : undefined);
    }

    return results;
  }

  count(where?: WhereClause): number {
    if (!where) return this.docs.size;
    let count = 0;
    for (const doc of this.docs.values()) {
      if (this.matchesWhere(doc, where)) count++;
    }
    return count;
  }

  update(id: string, data: Partial<T>): T | null {
    const existing = this.docs.get(id);
    if (!existing) return null;
    this.removeFromIndex(existing);
    // Filter undefined (Prisma skips undefined fields) + normalize Date/BigInt
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const normalizedData = this.normalizeForStorage(cleanData);
    const updated = { ...existing, ...normalizedData, id } as T;
    this.docs.set(id, updated);
    this.addToIndex(updated);
    this.dirty = true;
    return { ...updated };
  }

  updateMany(where: WhereClause, data: Partial<T>): number {
    // Filter undefined + normalize Date/BigInt
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const normalizedData = this.normalizeForStorage(cleanData);
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesWhere(doc, where)) {
        this.removeFromIndex(doc);
        const updated = { ...doc, ...normalizedData, id } as T;
        this.docs.set(id, updated);
        this.addToIndex(updated);
        count++;
      }
    }
    if (count > 0) this.dirty = true;
    return count;
  }

  upsert(id: string, create: T, update: Partial<T>): T {
    const existing = this.docs.get(id);
    if (existing) {
      return this.update(id, update)!;
    }
    return this.create({ ...create, id } as T);
  }

  delete(id: string): boolean {
    const doc = this.docs.get(id);
    if (!doc) return false;
    this.removeFromIndex(doc);
    this.docs.delete(id);
    this.dirty = true;
    return true;
  }

  deleteMany(where?: WhereClause): number {
    if (!where) {
      const count = this.docs.size;
      this.docs.clear();
      for (const idx of this.indexes.values()) idx.clear();
      this.dirty = true;
      return count;
    }
    const toDelete: string[] = [];
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesWhere(doc, where)) toDelete.push(id);
    }
    for (const id of toDelete) this.delete(id);
    return toDelete.length;
  }

  // ── Helpers ──

  private scanWithFilter(where?: WhereClause): T[] {
    if (!where) return Array.from(this.docs.values()).map(d => ({ ...d }));
    const results: T[] = [];
    for (const doc of this.docs.values()) {
      if (this.matchesWhere(doc, where)) results.push({ ...doc });
    }
    return results;
  }

  private matchesWhere(doc: T, where: WhereClause): boolean {
    for (const [key, condition] of Object.entries(where)) {
      // Handle OR clause
      if (key === 'OR' && Array.isArray(condition)) {
        const anyMatch = condition.some((sub: WhereClause) => this.matchesWhere(doc, sub));
        if (!anyMatch) return false;
        continue;
      }
      // Handle AND clause
      if (key === 'AND' && Array.isArray(condition)) {
        const allMatch = condition.every((sub: WhereClause) => this.matchesWhere(doc, sub));
        if (!allMatch) return false;
        continue;
      }
      // Handle NOT clause
      if (key === 'NOT' && typeof condition === 'object' && condition !== null) {
        if (this.matchesWhere(doc, condition as WhereClause)) return false;
        continue;
      }

      const value = (doc as Record<string, unknown>)[key];

      // Object conditions (operators)
      if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
        // Normalize Date values in operators to ISO strings (stored values are ISO strings)
        const ops: Record<string, unknown> = {};
        for (const [opKey, opVal] of Object.entries(condition as Record<string, unknown>)) {
          ops[opKey] = opVal instanceof Date ? opVal.toISOString() : opVal;
        }
        if ('equals' in ops && value !== ops.equals) return false;
        if ('not' in ops && value === ops.not) return false;
        if ('in' in ops && Array.isArray(ops.in) && !ops.in.includes(value)) return false;
        if ('notIn' in ops && Array.isArray(ops.notIn) && ops.notIn.includes(value)) return false;
        if ('gt' in ops && (value == null || (value as number) <= (ops.gt as number))) return false;
        if ('gte' in ops && (value == null || (value as number) < (ops.gte as number))) return false;
        if ('lt' in ops && (value == null || (value as number) >= (ops.lt as number))) return false;
        if ('lte' in ops && (value == null || (value as number) > (ops.lte as number))) return false;
        if ('contains' in ops && (typeof value !== 'string' || !value.includes(ops.contains as string))) return false;
        if ('startsWith' in ops && (typeof value !== 'string' || !value.startsWith(ops.startsWith as string))) return false;
        continue;
      }

      // Direct value comparison — also normalize Date to ISO string
      if (condition instanceof Date) {
        if (value !== condition.toISOString()) return false;
        continue;
      }

      // Direct value comparison
      if (value !== condition) return false;
    }
    return true;
  }

  // ── 0G Persistence ──

  isDirty(): boolean { return this.dirty; }
  size(): number { return this.docs.size; }

  serialize(): string {
    const arr = Array.from(this.docs.values());
    return JSON.stringify(arr, (_key, value) =>
      typeof value === 'bigint' ? value.toString() + 'n' : value
    );
  }

  hydrate(json: string) {
    const arr: T[] = JSON.parse(json, (_key, value) => {
      if (typeof value === 'string' && /^\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
      }
      return value;
    });
    this.docs.clear();
    for (const idx of this.indexes.values()) idx.clear();
    for (const doc of arr) {
      this.docs.set(doc.id, doc);
      this.addToIndex(doc);
    }
    this.dirty = false;
  }

  async persistTo0G(): Promise<string | null> {
    if (!this.dirty && this.lastRootHash) return this.lastRootHash;
    try {
      const data = this.serialize();
      const rootHash = await uploadBlob(data, `${this.name}_${Date.now()}.json`);
      this.lastRootHash = rootHash;
      this.dirty = false;
      console.log(`[0GStore] Persisted ${this.name} (${this.docs.size} docs) → ${rootHash}`);
      return rootHash;
    } catch (err) {
      console.error(`[0GStore] Failed to persist ${this.name}:`, err);
      return null;
    }
  }

  async loadFrom0G(rootHash: string): Promise<boolean> {
    try {
      const data = await downloadBlob(rootHash);
      if (!data) return false;
      this.hydrate(data);
      this.lastRootHash = rootHash;
      console.log(`[0GStore] Loaded ${this.name} (${this.docs.size} docs) from ${rootHash}`);
      return true;
    } catch (err) {
      console.error(`[0GStore] Failed to load ${this.name} from ${rootHash}:`, err);
      return false;
    }
  }
}

// ─── Low-level 0G blob helpers ──────────────────────────

async function uploadBlob(data: string, filename: string): Promise<string> {
  const { indexer: idx, signer: sgn } = await getSDK();
  if (!sgn) throw new Error('No signer configured for 0G uploads');

  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `0g_${Date.now()}_${filename}`);

  try {
    fs.writeFileSync(tempPath, data);
    const zgFile = await ZgFile.fromFilePath(tempPath);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);

    const rootHash = tree?.rootHash() ?? '';

    // Check if already exists
    try {
      const checkPath = path.join(tempDir, `0g_check_${Date.now()}`);
      const checkErr = await idx.download(rootHash, checkPath, false);
      if (checkErr === null) {
        if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
        await zgFile.close();
        return rootHash;
      }
      if (fs.existsSync(checkPath)) fs.unlinkSync(checkPath);
    } catch {
      // Not found, proceed with upload
    }

    // Upload with retries
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [_, uploadErr] = await idx.upload(zgFile, STORAGE_CONFIG.rpcUrl, sgn);
        if (uploadErr) {
          const errStr = String(uploadErr);
          if (errStr.includes('data already exists')) {
            await zgFile.close();
            return rootHash;
          }
          throw new Error(errStr);
        }
        await zgFile.close();
        return rootHash;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes('data already exists')) {
          await zgFile.close();
          return rootHash;
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    await zgFile.close();
    throw lastError || new Error('Upload failed after 3 retries');
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

async function downloadBlob(rootHash: string): Promise<string | null> {
  const { indexer: idx } = await getSDK();
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `0g_dl_${Date.now()}_${rootHash.slice(0, 10)}`);

  try {
    const dlErr = await idx.download(rootHash, tempPath, true);
    if (dlErr !== null) {
      console.warn(`[0GStore] Download failed for ${rootHash}:`, dlErr);
      return null;
    }
    const data = fs.readFileSync(tempPath, 'utf-8');
    return data;
  } catch (err) {
    console.warn(`[0GStore] Download error for ${rootHash}:`, err);
    return null;
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

// ─── ZeroGStore: Global Store Manager ───────────────────

/**
 * ZeroGStore is the top-level manager that holds all collections
 * and handles persistence to 0G Storage.
 *
 * Usage:
 *   const store = ZeroGStore.getInstance();
 *   const battles = store.collection<PredictionBattleDoc>('battles');
 *   battles.create({ id: 'abc', status: 'active', ... });
 *   await store.flush(); // Persist all dirty collections to 0G
 */
class ZeroGStore {
  private static instance: ZeroGStore | null = null;
  private collections: Map<string, Collection> = new Map();
  private manifestHash: string | null = null;
  private flushInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): ZeroGStore {
    if (!ZeroGStore.instance) {
      ZeroGStore.instance = new ZeroGStore();
    }
    return ZeroGStore.instance;
  }

  /**
   * Get or create a typed collection.
   */
  collection<T extends Document>(name: string, indexedFields?: string[]): Collection<T> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection<T>(name, indexedFields ?? []));
    }
    return this.collections.get(name)! as Collection<T>;
  }

  /**
   * Flush all dirty collections to 0G.
   * Returns a manifest mapping collection names to rootHashes.
   */
  async flush(): Promise<Record<string, string>> {
    const manifest: Record<string, string> = {};

    for (const [name, col] of this.collections.entries()) {
      if (col.isDirty() || !manifest[name]) {
        const hash = await col.persistTo0G();
        if (hash) manifest[name] = hash;
      }
    }

    // Upload manifest itself
    if (Object.keys(manifest).length > 0) {
      try {
        const manifestData = JSON.stringify(manifest);
        this.manifestHash = await uploadBlob(manifestData, 'manifest.json');
        console.log(`[0GStore] Manifest persisted → ${this.manifestHash}`);
      } catch (err) {
        console.error('[0GStore] Failed to persist manifest:', err);
      }
    }

    return manifest;
  }

  /**
   * Load all collections from a manifest rootHash.
   */
  async loadFromManifest(manifestRootHash: string): Promise<boolean> {
    try {
      const data = await downloadBlob(manifestRootHash);
      if (!data) return false;

      const manifest: Record<string, string> = JSON.parse(data);
      const results = await Promise.allSettled(
        Object.entries(manifest).map(async ([name, hash]) => {
          const col = this.collection(name);
          await col.loadFrom0G(hash);
        })
      );

      const loaded = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[0GStore] Loaded ${loaded}/${Object.keys(manifest).length} collections from manifest`);
      this.manifestHash = manifestRootHash;
      return true;
    } catch (err) {
      console.error('[0GStore] Failed to load from manifest:', err);
      return false;
    }
  }

  /**
   * Start auto-flushing every intervalMs (default: 60s).
   */
  startAutoFlush(intervalMs = 60_000) {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => {
      const hasDirty = Array.from(this.collections.values()).some(c => c.isDirty());
      if (hasDirty) {
        this.flush().catch(err => console.error('[0GStore] Auto-flush error:', err));
      }
    }, intervalMs);
    console.log(`[0GStore] Auto-flush started (every ${intervalMs / 1000}s)`);
  }

  stopAutoFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  getManifestHash(): string | null { return this.manifestHash; }

  /** Get stats across all collections. */
  stats(): Record<string, { size: number; dirty: boolean }> {
    const result: Record<string, { size: number; dirty: boolean }> = {};
    for (const [name, col] of this.collections.entries()) {
      result[name] = { size: col.size(), dirty: col.isDirty() };
    }
    return result;
  }
}

// ─── Convenience: generate IDs ──────────────────────────

let idCounter = 0;
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const counter = (idCounter++).toString(36);
  return `${timestamp}${random}${counter}`;
}

// ─── Exports ────────────────────────────────────────────

export const zeroGStore = ZeroGStore.getInstance();
export { uploadBlob, downloadBlob };
export default zeroGStore;
