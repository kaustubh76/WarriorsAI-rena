/**
 * Database Layer — 0G Decentralized Storage
 *
 * Drop-in replacement for the Prisma singleton.
 * All data is stored in-memory with periodic persistence to 0G Storage Network.
 *
 * All existing imports (`import { prisma } from '@/lib/prisma'`) continue to work
 * with the same API — no changes needed in consuming files.
 *
 * To restore PostgreSQL: rename prisma.ts.bak → prisma.ts
 */

import { db } from '@/lib/0g/db';

// Re-export as 'prisma' for backwards compatibility with all 88+ consuming files
export const prisma = db;

// Start auto-flushing to 0G every 60 seconds
if (typeof process !== 'undefined') {
  db.$startAutoFlush(60_000);
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(): Promise<void> {
  console.log('[0GStore] Flushing data before shutdown...');
  try {
    await db.$flush();
  } catch (err) {
    console.error('[0GStore] Flush on shutdown failed:', err);
  }
  await db.$disconnect();
}

if (typeof process !== 'undefined') {
  process.on('beforeExit', handleShutdown);
}

export default prisma;
