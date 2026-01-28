#!/usr/bin/env ts-node
/**
 * Database Health Check Script
 *
 * Comprehensive health checks for Flow event tracking database
 *
 * Usage:
 *   ts-node scripts/check-database-health.ts
 *
 * Checks:
 * - Database connection
 * - Table existence and structure
 * - Data integrity
 * - Index performance
 * - Sync status
 * - Data consistency
 */

import { prisma } from '../src/lib/prisma';
import { createFlowPublicClient } from '../src/lib/flowClient';

// ============================================================================
// Types
// ============================================================================

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

// ============================================================================
// Health Check Functions
// ============================================================================

async function checkDatabaseConnection(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      name: 'Database Connection',
      status: 'pass',
      message: 'Successfully connected to database',
    };
  } catch (error: any) {
    return {
      name: 'Database Connection',
      status: 'fail',
      message: 'Failed to connect to database',
      details: error.message,
    };
  }
}

async function checkTablesExist(): Promise<HealthCheck> {
  try {
    const requiredTables = [
      'MirrorMarket',
      'MirrorTrade',
      'VerifiedPrediction',
      'PriceSyncHistory',
      'SystemAudit',
    ];

    const missingTables: string[] = [];

    for (const table of requiredTables) {
      try {
        // Try to query each table
        await (prisma as any)[table.charAt(0).toLowerCase() + table.slice(1)].count();
      } catch (error) {
        missingTables.push(table);
      }
    }

    if (missingTables.length === 0) {
      return {
        name: 'Required Tables',
        status: 'pass',
        message: `All ${requiredTables.length} required tables exist`,
        details: requiredTables,
      };
    } else {
      return {
        name: 'Required Tables',
        status: 'fail',
        message: `Missing ${missingTables.length} required tables`,
        details: { missing: missingTables },
      };
    }
  } catch (error: any) {
    return {
      name: 'Required Tables',
      status: 'fail',
      message: 'Failed to check tables',
      details: error.message,
    };
  }
}

async function checkDataCounts(): Promise<HealthCheck> {
  try {
    const [marketCount, tradeCount, predictionCount, syncHistoryCount, auditCount] = await Promise.all([
      prisma.mirrorMarket.count(),
      prisma.mirrorTrade.count(),
      prisma.verifiedPrediction.count(),
      prisma.priceSyncHistory.count(),
      prisma.systemAudit.count(),
    ]);

    const details = {
      mirrorMarkets: marketCount,
      mirrorTrades: tradeCount,
      verifiedPredictions: predictionCount,
      priceSyncHistory: syncHistoryCount,
      systemAudits: auditCount,
      total: marketCount + tradeCount + predictionCount + syncHistoryCount + auditCount,
    };

    if (details.total === 0) {
      return {
        name: 'Data Counts',
        status: 'warn',
        message: 'No data in database - this is expected for new deployments',
        details,
      };
    }

    return {
      name: 'Data Counts',
      status: 'pass',
      message: `Database contains ${details.total} total records`,
      details,
    };
  } catch (error: any) {
    return {
      name: 'Data Counts',
      status: 'fail',
      message: 'Failed to count records',
      details: error.message,
    };
  }
}

async function checkSyncStatus(): Promise<HealthCheck> {
  try {
    const client = createFlowPublicClient();
    const currentBlock = await client.getBlockNumber();

    const lastTrade = await prisma.mirrorTrade.findFirst({
      orderBy: { blockNumber: 'desc' },
      select: { blockNumber: true },
    });

    const lastSyncedBlock = lastTrade ? BigInt(lastTrade.blockNumber) : 0n;
    const blocksBehind = Number(currentBlock - lastSyncedBlock);

    let status: 'pass' | 'warn' | 'fail';
    let message: string;

    if (blocksBehind <= 10) {
      status = 'pass';
      message = 'Database is fully synced with blockchain';
    } else if (blocksBehind <= 100) {
      status = 'warn';
      message = `Database is ${blocksBehind} blocks behind`;
    } else {
      status = 'fail';
      message = `Database is significantly behind (${blocksBehind} blocks)`;
    }

    return {
      name: 'Sync Status',
      status,
      message,
      details: {
        currentBlock: currentBlock.toString(),
        lastSyncedBlock: lastSyncedBlock.toString(),
        blocksBehind,
        syncPercentage: lastSyncedBlock > 0n
          ? ((Number(lastSyncedBlock) / Number(currentBlock)) * 100).toFixed(2) + '%'
          : '0%',
      },
    };
  } catch (error: any) {
    return {
      name: 'Sync Status',
      status: 'fail',
      message: 'Failed to check sync status',
      details: error.message,
    };
  }
}

async function checkDataIntegrity(): Promise<HealthCheck> {
  try {
    const issues: string[] = [];

    // Check for trades without markets
    const orphanedTrades = await prisma.mirrorTrade.count({
      where: {
        mirrorMarket: null,
      },
    });

    if (orphanedTrades > 0) {
      issues.push(`${orphanedTrades} trades without associated markets`);
    }

    // Check for duplicate transaction hashes
    const duplicateTxHashes = await prisma.$queryRaw<Array<{ txHash: string; count: number }>>`
      SELECT "txHash", COUNT(*) as count
      FROM "MirrorTrade"
      GROUP BY "txHash"
      HAVING COUNT(*) > 1
    `;

    if (duplicateTxHashes.length > 0) {
      issues.push(`${duplicateTxHashes.length} duplicate transaction hashes found`);
    }

    // Check for markets with no trades
    const marketsWithoutTrades = await prisma.mirrorMarket.count({
      where: {
        trades: {
          none: {},
        },
      },
    });

    // This is a warning, not an error
    if (marketsWithoutTrades > 0) {
      issues.push(`${marketsWithoutTrades} markets have no trades (may be normal)`);
    }

    if (issues.length === 0) {
      return {
        name: 'Data Integrity',
        status: 'pass',
        message: 'No data integrity issues detected',
      };
    } else if (duplicateTxHashes.length === 0 && orphanedTrades === 0) {
      return {
        name: 'Data Integrity',
        status: 'warn',
        message: 'Minor integrity issues detected',
        details: issues,
      };
    } else {
      return {
        name: 'Data Integrity',
        status: 'fail',
        message: 'Data integrity issues detected',
        details: issues,
      };
    }
  } catch (error: any) {
    return {
      name: 'Data Integrity',
      status: 'fail',
      message: 'Failed to check data integrity',
      details: error.message,
    };
  }
}

async function checkIndexPerformance(): Promise<HealthCheck> {
  try {
    // Test query performance with and without index
    const start = Date.now();

    await prisma.mirrorTrade.findMany({
      where: { blockNumber: { gte: 90000000 } },
      take: 100,
    });

    const queryTime = Date.now() - start;

    let status: 'pass' | 'warn' | 'fail';
    let message: string;

    if (queryTime < 100) {
      status = 'pass';
      message = 'Index performance is excellent';
    } else if (queryTime < 500) {
      status = 'pass';
      message = 'Index performance is good';
    } else if (queryTime < 1000) {
      status = 'warn';
      message = 'Index performance is acceptable but could be improved';
    } else {
      status = 'fail';
      message = 'Index performance is poor - consider running ANALYZE/VACUUM';
    }

    return {
      name: 'Index Performance',
      status,
      message,
      details: {
        queryTime: `${queryTime}ms`,
        recommendation: queryTime > 500
          ? 'Run ANALYZE to update statistics, or VACUUM to reclaim space'
          : 'Performance is good',
      },
    };
  } catch (error: any) {
    return {
      name: 'Index Performance',
      status: 'fail',
      message: 'Failed to check index performance',
      details: error.message,
    };
  }
}

async function checkRecentActivity(): Promise<HealthCheck> {
  try {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);

    const recentTrades = await prisma.mirrorTrade.count({
      where: {
        timestamp: {
          gte: oneHourAgo,
        },
      },
    });

    const recentSyncs = await prisma.priceSyncHistory.count({
      where: {
        syncedAt: {
          gte: oneHourAgo,
        },
      },
    });

    let status: 'pass' | 'warn' | 'fail';
    let message: string;

    if (recentTrades > 0 || recentSyncs > 0) {
      status = 'pass';
      message = 'Recent activity detected - event tracking is working';
    } else {
      status = 'warn';
      message: 'No recent activity - this may be normal if market is quiet';
    }

    return {
      name: 'Recent Activity',
      status,
      message,
      details: {
        tradesLastHour: recentTrades,
        syncsLastHour: recentSyncs,
        timePeriod: '1 hour',
      },
    };
  } catch (error: any) {
    return {
      name: 'Recent Activity',
      status: 'fail',
      message: 'Failed to check recent activity',
      details: error.message,
    };
  }
}

// ============================================================================
// Main Function
// ============================================================================

async function runHealthChecks() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏥 Database Health Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const checks: HealthCheck[] = [];

  // Run all checks
  console.log('Running health checks...\n');

  checks.push(await checkDatabaseConnection());
  checks.push(await checkTablesExist());
  checks.push(await checkDataCounts());
  checks.push(await checkSyncStatus());
  checks.push(await checkDataIntegrity());
  checks.push(await checkIndexPerformance());
  checks.push(await checkRecentActivity());

  // Display results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  checks.forEach(check => {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️ ' : '❌';
    const statusColor = check.status === 'pass' ? '\x1b[32m' : check.status === 'warn' ? '\x1b[33m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`${icon} ${statusColor}[${check.status.toUpperCase()}]${reset} ${check.name}`);
    console.log(`   ${check.message}`);

    if (check.details) {
      console.log(`   Details:`, JSON.stringify(check.details, null, 2).replace(/\n/g, '\n   '));
    }

    console.log();
  });

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  Total Checks: ${checks.length}`);
  console.log(`  ✅ Passed:    ${passed}`);
  console.log(`  ⚠️  Warnings:  ${warned}`);
  console.log(`  ❌ Failed:    ${failed}\n`);

  // Overall status
  let overallStatus: string;
  let exitCode: number;

  if (failed === 0 && warned === 0) {
    overallStatus = '✅ Database health is EXCELLENT';
    exitCode = 0;
  } else if (failed === 0) {
    overallStatus = '⚠️  Database health is GOOD with minor warnings';
    exitCode = 0;
  } else if (failed <= 2) {
    overallStatus = '⚠️  Database health is DEGRADED';
    exitCode = 1;
  } else {
    overallStatus = '❌ Database health is POOR - immediate attention required';
    exitCode = 2;
  }

  console.log(`  Overall Status: ${overallStatus}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Recommendations
  if (failed > 0 || warned > 0) {
    console.log('Recommendations:\n');

    if (checks.find(c => c.name === 'Database Connection' && c.status === 'fail')) {
      console.log('  • Fix database connection issues before proceeding');
    }

    if (checks.find(c => c.name === 'Required Tables' && c.status === 'fail')) {
      console.log('  • Run database migrations: npx prisma migrate deploy');
    }

    if (checks.find(c => c.name === 'Sync Status' && c.status !== 'pass')) {
      console.log('  • Start event listeners to sync with blockchain');
      console.log('    curl -X POST http://localhost:3000/api/events/start -d \'{"backfill":true}\'');
    }

    if (checks.find(c => c.name === 'Data Integrity' && c.status === 'fail')) {
      console.log('  • Investigate data integrity issues in details above');
      console.log('  • Consider running data cleanup scripts');
    }

    if (checks.find(c => c.name === 'Index Performance' && c.status !== 'pass')) {
      console.log('  • Run ANALYZE to update query planner statistics');
      console.log('  • Consider running VACUUM to reclaim space');
    }

    console.log();
  }

  // Cleanup
  await prisma.$disconnect();

  process.exit(exitCode);
}

// Run if called directly
if (require.main === module) {
  runHealthChecks().catch((error) => {
    console.error('Fatal error running health checks:', error);
    process.exit(3);
  });
}

export { runHealthChecks };
