#!/usr/bin/env ts-node
/**
 * Flow Event Listener Background Service
 *
 * Standalone service for monitoring Flow blockchain events
 * and synchronizing them to the database.
 *
 * Usage:
 *   ts-node services/eventListener.ts
 *
 * Production:
 *   node dist/services/eventListener.js
 *
 * Features:
 * - Automatic startup with backfilling
 * - Graceful shutdown handling
 * - Health monitoring
 * - Automatic restart on errors
 * - Detailed logging
 */

import { startAllEventListeners, stopAllEventListeners } from '../src/lib/eventListeners';
import { createFlowPublicClient } from '../src/lib/flowClient';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  SERVICE_NAME: 'Flow Event Listener',
  VERSION: '1.0.0',
  BACKFILL_ON_START: true,
  RESTART_ON_ERROR: true,
  MAX_RESTART_ATTEMPTS: 5,
  RESTART_DELAY_MS: 5000,
  HEALTH_CHECK_INTERVAL_MS: 60000, // 1 minute
};

// ============================================================================
// State
// ============================================================================

let unwatchFunctions: any = null;
let isRunning = false;
let restartAttempts = 0;
let healthCheckInterval: NodeJS.Timeout | null = null;

// ============================================================================
// Main Service Logic
// ============================================================================

async function startService() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 ${CONFIG.SERVICE_NAME} v${CONFIG.VERSION}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`🔄 Backfill: ${CONFIG.BACKFILL_ON_START ? 'Enabled' : 'Disabled'}`);
    console.log(`🔁 Auto-restart: ${CONFIG.RESTART_ON_ERROR ? 'Enabled' : 'Disabled'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verify RPC connection
    console.log('[Service] Verifying RPC connection...');
    const client = createFlowPublicClient();
    const chainId = await client.getChainId();
    const currentBlock = await client.getBlockNumber();

    console.log(`[Service] ✅ Connected to Flow ${chainId === 545 ? 'Testnet' : 'Network'} (Chain ID: ${chainId})`);
    console.log(`[Service] 📦 Current block: ${currentBlock.toString()}\n`);

    // Start event listeners
    console.log('[Service] Starting event listeners...');
    unwatchFunctions = await startAllEventListeners({
      backfill: CONFIG.BACKFILL_ON_START,
    });

    isRunning = true;
    restartAttempts = 0; // Reset on successful start

    console.log('[Service] ✅ Event listeners started successfully\n');

    // Start health monitoring
    startHealthMonitoring();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Service is running. Press Ctrl+C to stop.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('[Service] ❌ Failed to start service:', error);

    if (CONFIG.RESTART_ON_ERROR && restartAttempts < CONFIG.MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      console.log(`[Service] 🔄 Attempting restart ${restartAttempts}/${CONFIG.MAX_RESTART_ATTEMPTS} in ${CONFIG.RESTART_DELAY_MS / 1000}s...`);

      setTimeout(() => {
        startService();
      }, CONFIG.RESTART_DELAY_MS);
    } else {
      console.error('[Service] ❌ Max restart attempts reached. Exiting.');
      process.exit(1);
    }
  }
}

// ============================================================================
// Health Monitoring
// ============================================================================

function startHealthMonitoring() {
  healthCheckInterval = setInterval(async () => {
    try {
      const client = createFlowPublicClient();
      const currentBlock = await client.getBlockNumber();

      console.log(`[Health] ✅ Service healthy | Block: ${currentBlock.toString()} | Uptime: ${Math.floor(process.uptime())}s`);
    } catch (error) {
      console.error('[Health] ⚠️ Health check failed:', error);

      if (CONFIG.RESTART_ON_ERROR && restartAttempts < CONFIG.MAX_RESTART_ATTEMPTS) {
        console.log('[Health] 🔄 Triggering service restart...');
        await stopService();
        setTimeout(() => startService(), CONFIG.RESTART_DELAY_MS);
      }
    }
  }, CONFIG.HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function stopService() {
  if (!isRunning) {
    console.log('[Service] Service is not running');
    return;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🛑 Shutting down service...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Stop health monitoring
    stopHealthMonitoring();

    // Stop event listeners
    if (unwatchFunctions) {
      console.log('[Service] Stopping event listeners...');
      stopAllEventListeners(unwatchFunctions);
      unwatchFunctions = null;
    }

    isRunning = false;

    console.log('[Service] ✅ Service stopped successfully');
    console.log(`[Service] Total uptime: ${Math.floor(process.uptime())} seconds\n`);

  } catch (error) {
    console.error('[Service] ❌ Error during shutdown:', error);
  }
}

// ============================================================================
// Signal Handlers
// ============================================================================

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('\n[Service] Received SIGINT signal');
  await stopService();
  process.exit(0);
});

// Handle SIGTERM (systemd stop)
process.on('SIGTERM', async () => {
  console.log('\n[Service] Received SIGTERM signal');
  await stopService();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Service] ❌ Uncaught Exception:', error);

  if (CONFIG.RESTART_ON_ERROR && restartAttempts < CONFIG.MAX_RESTART_ATTEMPTS) {
    console.log('[Service] 🔄 Attempting to recover...');
    stopService().then(() => {
      setTimeout(() => startService(), CONFIG.RESTART_DELAY_MS);
    });
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Service] ❌ Unhandled Rejection at:', promise, 'reason:', reason);

  if (CONFIG.RESTART_ON_ERROR && restartAttempts < CONFIG.MAX_RESTART_ATTEMPTS) {
    console.log('[Service] 🔄 Attempting to recover...');
    stopService().then(() => {
      setTimeout(() => startService(), CONFIG.RESTART_DELAY_MS);
    });
  }
});

// ============================================================================
// Start Service
// ============================================================================

if (require.main === module) {
  // Validate environment
  const requiredEnvVars = [
    'DATABASE_URL',
    'EXTERNAL_MARKET_MIRROR_ADDRESS',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('\nPlease set these variables and try again.');
    process.exit(1);
  }

  // Start the service
  startService().catch((error) => {
    console.error('[Service] ❌ Fatal error:', error);
    process.exit(1);
  });
}

// Export for testing
export { startService, stopService };
