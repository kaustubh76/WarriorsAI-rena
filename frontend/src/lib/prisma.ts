/**
 * Prisma Client Singleton
 * Prevents multiple instances in development due to hot reloading
 * Includes connection pooling configuration for production
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Create Prisma client with appropriate configuration
 * In production, connection pooling is managed via DATABASE_URL params
 * See: https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/connection-pool
 *
 * For serverless environments, add to DATABASE_URL:
 * - connection_limit: limit concurrent connections (e.g., ?connection_limit=5)
 * - pool_timeout: time to wait for connection (e.g., &pool_timeout=10)
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
    // Connection pool settings are controlled via DATABASE_URL params
    // This allows external configuration without code changes
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed
 */
async function handleShutdown(): Promise<void> {
  await prisma.$disconnect();
}

// Handle various shutdown signals
if (typeof process !== 'undefined') {
  process.on('beforeExit', handleShutdown);
}

export default prisma;
