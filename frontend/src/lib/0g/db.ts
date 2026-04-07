/**
 * 0G Database Compatibility Layer
 *
 * Drop-in replacement for `import { prisma } from '@/lib/prisma'`.
 * Provides a Prisma-like API backed by 0G Storage collections.
 *
 * Each model accessor (db.predictionBattle, db.predictionRound, etc.)
 * provides findUnique, findFirst, findMany, create, update, updateMany,
 * upsert, delete, deleteMany, and count — matching Prisma's interface.
 */

import {
  battles,
  rounds,
  warriorStats,
  battleBets,
  bettingPools,
  vaults,
  vaultCycles,
  settlements,
  auditLogs,
  externalMarkets,
  matchedPairs,
  arbitrageTrades,
  zeroGStore,
  generateId,
} from './collections';
import type { Collection, Document } from './store';

// ─── Date Field Conversion ─────────────────────────────

/** Fields that Prisma returns as Date objects. We store ISO strings internally. */
const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'completedAt', 'scheduledStartAt',
  'lastCycleAt', 'startedAt', 'endedAt', 'placedAt', 'claimedAt',
  'executedAt', 'settledAt', 'lastSyncAt', 'endTime', 'timestamp',
  'followedAt', 'lastAttemptAt', 'scheduledTime', 'scheduledAt',
  'detectedAt', 'expiresAt', 'resolvedAt', 'lastActiveAt',
  'market1FilledAt', 'market2FilledAt', 'lastChecked', 'lastUpdated',
  'predictedAt', 'syncedAt',
]);

/** Convert ISO string date fields to Date objects (matches Prisma read behavior). */
function convertDateFields<T>(doc: T): T {
  if (!doc || typeof doc !== 'object') return doc;
  const result = { ...doc } as Record<string, unknown>;
  for (const field of DATE_FIELDS) {
    const val = result[field];
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) result[field] = d;
    }
  }
  return result as T;
}

// ─── Include / Relations Support ────────────────────────

interface RelationConfig {
  collection: Collection<Document>;
  foreignKey: string; // field on the related collection referencing the parent id
}

/** Resolve Prisma `include` by joining related collections. */
function resolveIncludes<T extends Document>(
  doc: T,
  include: Record<string, unknown> | undefined,
  relations: Record<string, RelationConfig> | undefined,
): T {
  if (!include || !relations) return doc;
  const result = { ...doc } as T & Record<string, unknown>;

  for (const [relationName, includeConfig] of Object.entries(include)) {
    const rel = relations[relationName];
    if (!rel) continue;

    // Parse orderBy from include config
    let orderBy: { field: string; direction: 'asc' | 'desc' } | undefined;
    if (typeof includeConfig === 'object' && includeConfig !== null) {
      const config = includeConfig as Record<string, unknown>;
      if (config.orderBy && typeof config.orderBy === 'object') {
        const [field, dir] = Object.entries(config.orderBy as Record<string, string>)[0];
        orderBy = { field, direction: dir as 'asc' | 'desc' };
      }
    }

    // Query related collection
    const related = rel.collection.findMany(
      { [rel.foreignKey]: doc.id },
      { orderBy }
    );

    // Convert date fields on related docs too
    result[relationName] = related.map(r => convertDateFields(r));
  }

  return result as T;
}

// ─── Model Adapter ──────────────────────────────────────

interface ModelAdapterOpts {
  uniqueFields?: string[];
  relations?: Record<string, RelationConfig>;
}

/**
 * Wraps a Collection with Prisma-compatible method signatures.
 * Handles: where, data, include (relations), orderBy, take, skip,
 * increment/decrement, composite keys, Date conversion.
 */
function createModelAdapter<T extends Document>(
  collection: Collection<T>,
  opts?: ModelAdapterOpts,
) {
  const uniqueFields = opts?.uniqueFields ?? [];
  const relations = opts?.relations;

  /** Post-process a single result: convert dates + resolve includes. */
  function postProcess(doc: T | null, include?: Record<string, unknown>): T | null {
    if (!doc) return null;
    let result = convertDateFields(doc);
    result = resolveIncludes(result, include, relations);
    return result;
  }

  /** Post-process an array of results. */
  function postProcessMany(docs: T[], include?: Record<string, unknown>): T[] {
    return docs.map(d => postProcess(d, include)!);
  }

  return {
    findUnique(args: { where: Record<string, unknown>; include?: Record<string, unknown> }): T | null {
      let doc: T | null = null;
      // If where has 'id', use direct lookup
      if (args.where.id) {
        doc = collection.findUnique(args.where.id as string);
      } else {
        // Check unique fields
        for (const field of uniqueFields) {
          if (args.where[field] !== undefined) {
            doc = collection.findFirst({ [field]: args.where[field] });
            break;
          }
        }
        // Composite unique (e.g., { battleId_roundNumber: { battleId, roundNumber } })
        if (!doc) {
          for (const [key, value] of Object.entries(args.where)) {
            if (key.includes('_') && typeof value === 'object' && value !== null) {
              doc = collection.findFirst(value as Record<string, unknown>);
              break;
            }
          }
        }
        if (!doc) doc = collection.findFirst(args.where);
      }
      return postProcess(doc, args.include);
    },

    findUniqueOrThrow(args: { where: Record<string, unknown>; include?: Record<string, unknown> }): T {
      const result = this.findUnique(args);
      if (!result) throw new Error(`Record not found in ${collection.name}`);
      return result;
    },

    findFirst(args?: { where?: Record<string, unknown>; orderBy?: Record<string, string>; include?: Record<string, unknown> }): T | null {
      let doc: T | null = null;
      if (!args?.where) {
        const all = collection.findMany(undefined, { take: 1 });
        doc = all[0] ?? null;
      } else if (args.orderBy) {
        const [field, dir] = Object.entries(args.orderBy)[0];
        const results = collection.findMany(args.where, {
          orderBy: { field, direction: dir as 'asc' | 'desc' },
          take: 1,
        });
        doc = results[0] ?? null;
      } else {
        doc = collection.findFirst(args.where);
      }
      return postProcess(doc, args?.include);
    },

    findMany(args?: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, string> | Record<string, string>[];
      take?: number;
      skip?: number;
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): T[] {
      const orderBy = args?.orderBy
        ? Array.isArray(args.orderBy)
          ? (() => {
              const [field, dir] = Object.entries(args.orderBy[0])[0];
              return { field, direction: dir as 'asc' | 'desc' };
            })()
          : (() => {
              const [field, dir] = Object.entries(args.orderBy)[0];
              return { field, direction: dir as 'asc' | 'desc' };
            })()
        : undefined;

      const results = collection.findMany(args?.where, {
        orderBy,
        take: args?.take,
        skip: args?.skip,
      });
      return postProcessMany(results, args?.include);
    },

    count(args?: { where?: Record<string, unknown> }): number {
      return collection.count(args?.where);
    },

    create(args: { data: Record<string, unknown> & { id?: string } }): T {
      const doc = {
        ...args.data,
        id: args.data.id || generateId(),
      } as T;
      const created = collection.create(doc);
      return convertDateFields(created);
    },

    update(args: { where: { id?: string } & Record<string, unknown>; data: Record<string, unknown>; include?: Record<string, unknown> }): T | null {
      const id = args.where.id as string | undefined;
      let result: T | null = null;
      if (id) {
        const resolvedData = resolveIncrements(collection.findUnique(id), args.data);
        result = collection.update(id, resolvedData as Partial<T>);
      } else {
        const doc = this.findUnique({ where: args.where });
        if (!doc) return null;
        const resolvedData = resolveIncrements(doc, args.data);
        result = collection.update(doc.id, resolvedData as Partial<T>);
      }
      return postProcess(result, args.include);
    },

    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): { count: number } {
      // Resolve increments for each matched doc individually
      const where = args.where;
      const docs = collection.findMany(where);
      let count = 0;
      for (const doc of docs) {
        const resolvedData = resolveIncrements(doc, args.data);
        collection.update(doc.id, resolvedData as Partial<T>);
        count++;
      }
      return { count };
    },

    upsert(args: {
      where: Record<string, unknown>;
      create: Record<string, unknown> & { id?: string };
      update: Record<string, unknown>;
    }): T {
      const existing = this.findUnique({ where: args.where });
      if (existing) {
        const resolvedData = resolveIncrements(existing, args.update);
        const updated = collection.update(existing.id, resolvedData as Partial<T>)!;
        return convertDateFields(updated);
      }
      const doc = {
        ...args.create,
        id: args.create.id || generateId(),
      } as T;
      const created = collection.create(doc);
      return convertDateFields(created);
    },

    delete(args: { where: { id: string } & Record<string, unknown> }): boolean {
      if (args.where.id) return collection.delete(args.where.id);
      const doc = this.findUnique({ where: args.where });
      if (!doc) return false;
      return collection.delete(doc.id);
    },

    deleteMany(args?: { where?: Record<string, unknown> }): { count: number } {
      const count = collection.deleteMany(args?.where);
      return { count };
    },

    groupBy(_args: Record<string, unknown>): unknown[] {
      console.warn(`[0GDB] groupBy not fully implemented for ${collection.name}`);
      return [];
    },
  };
}

// ─── Resolve Prisma increment/decrement/set syntax ──────

function resolveIncrements<T>(existing: T | null, data: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip undefined values — Prisma ignores them
    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      if ('increment' in ops && existing) {
        const current = (existing as Record<string, unknown>)[key] as number ?? 0;
        resolved[key] = current + (ops.increment as number);
        continue;
      }
      if ('decrement' in ops && existing) {
        const current = (existing as Record<string, unknown>)[key] as number ?? 0;
        resolved[key] = current - (ops.decrement as number);
        continue;
      }
      if ('set' in ops) {
        resolved[key] = ops.set;
        continue;
      }
    }
    resolved[key] = value;
  }
  return resolved;
}

// ─── Transaction Support ────────────────────────────────

async function $transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T>;
async function $transaction<T>(operations: Promise<T>[]): Promise<T[]>;
async function $transaction<T>(fnOrOps: ((tx: typeof db) => Promise<T>) | Promise<T>[]): Promise<T | T[]> {
  if (Array.isArray(fnOrOps)) {
    return Promise.all(fnOrOps);
  }
  return fnOrOps(db);
}

// ─── Database Interface ─────────────────────────────────

export const db = {
  predictionBattle: createModelAdapter(battles, {
    uniqueFields: [],
    relations: {
      rounds: { collection: rounds as unknown as Collection<Document>, foreignKey: 'battleId' },
    },
  }),
  predictionRound: createModelAdapter(rounds, { uniqueFields: [] }),
  warriorArenaStats: createModelAdapter(warriorStats, { uniqueFields: ['warriorId'] }),
  battleBet: createModelAdapter(battleBets, { uniqueFields: [] }),
  battleBettingPool: createModelAdapter(bettingPools, { uniqueFields: ['battleId'] }),
  vault: createModelAdapter(vaults, { uniqueFields: ['nftId'] }),
  vaultCycle: createModelAdapter(vaultCycles, { uniqueFields: [] }),
  settlementTransaction: createModelAdapter(settlements, { uniqueFields: [] }),
  tradeAuditLog: createModelAdapter(auditLogs, { uniqueFields: [] }),
  externalMarket: createModelAdapter(externalMarkets, { uniqueFields: ['externalId'] }),
  matchedMarketPair: createModelAdapter(matchedPairs, { uniqueFields: [] }),
  arbitrageTrade: createModelAdapter(arbitrageTrades, { uniqueFields: [] }),
  arbitrageOpportunity: createModelAdapter(arbitrageTrades, { uniqueFields: [] }),

  $transaction,

  async $flush(): Promise<void> {
    await zeroGStore.flush();
  },

  async $disconnect(): Promise<void> {
    zeroGStore.stopAutoFlush();
  },

  $startAutoFlush(intervalMs?: number): void {
    zeroGStore.startAutoFlush(intervalMs);
  },

  $stats(): Record<string, { size: number; dirty: boolean }> {
    return zeroGStore.stats();
  },
};

export type PrismaClient = typeof db;
export default db;
