/**
 * Event Listener System
 *
 * Centralized event tracking for all Flow blockchain contracts.
 *
 * Usage:
 * ```typescript
 * import { startAllEventListeners, stopAllEventListeners } from '@/lib/eventListeners';
 *
 * // Start all listeners
 * const unwatchFunctions = await startAllEventListeners();
 *
 * // Stop all listeners
 * stopAllEventListeners(unwatchFunctions);
 * ```
 */

import {
  startEventListener as startExternalMarketEvents,
  backfillEvents as backfillExternalMarketEvents,
  getLastSyncedBlock,
} from './externalMarketEvents';

export type UnwatchFunction = () => void;

/**
 * Start all event listeners
 *
 * @param options - Configuration options
 * @param options.backfill - Whether to backfill missed events on startup
 * @param options.fromBlock - Block to start listening from (default: last synced block)
 * @returns Object with unwatch functions for each listener
 */
export async function startAllEventListeners(options?: {
  backfill?: boolean;
  fromBlock?: bigint | 'latest';
}) {
  const { backfill = true, fromBlock } = options || {};

  console.log('[EventSystem] Starting all event listeners...');

  // Determine starting block
  let startBlock: bigint | 'latest' = fromBlock || 'latest';

  if (backfill && !fromBlock) {
    // Get last synced block and backfill from there
    const lastBlock = await getLastSyncedBlock();
    if (lastBlock > 0n) {
      console.log('[EventSystem] Backfilling from block:', lastBlock.toString());
      await backfillExternalMarketEvents(lastBlock);
      startBlock = lastBlock;
    }
  }

  // Start listeners
  const unwatchExternalMarket = await startExternalMarketEvents(startBlock);

  console.log('[EventSystem] ✅ All event listeners started');

  return {
    externalMarket: unwatchExternalMarket,
  };
}

/**
 * Stop all event listeners
 *
 * @param unwatchFunctions - Object returned from startAllEventListeners
 */
export function stopAllEventListeners(unwatchFunctions: {
  externalMarket: UnwatchFunction;
}) {
  console.log('[EventSystem] Stopping all event listeners...');

  unwatchFunctions.externalMarket();

  console.log('[EventSystem] ✅ All event listeners stopped');
}

// Re-export individual listener functions
export {
  startEventListener as startExternalMarketEvents,
  backfillEvents as backfillExternalMarketEvents,
  getLastSyncedBlock,
} from './externalMarketEvents';
