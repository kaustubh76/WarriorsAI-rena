/**
 * Scheduled Market Resolution Event Listeners
 * Tracks ScheduledMarketResolver contract events
 *
 * Hardened with consecutive failure tracking and env var validation
 * (matches robustness of externalMarketEvents.ts)
 */

import { decodeEventLog, type Log, type PublicClient } from 'viem';
import { createFlowPublicClient } from '@/lib/flowClient';
import { prisma } from '@/lib/prisma';

const SCHEDULED_MARKET_RESOLVER_ADDRESS = process.env.NEXT_PUBLIC_SCHEDULED_MARKET_RESOLVER_ADDRESS as `0x${string}`;

// Warn if contract address is missing (skip during build)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
if (!isBuildTime && !SCHEDULED_MARKET_RESOLVER_ADDRESS) {
  console.warn(
    '[ScheduledResolutionEventListener] NEXT_PUBLIC_SCHEDULED_MARKET_RESOLVER_ADDRESS not set. ' +
    'Event listener will not be able to poll for contract events.'
  );
}

// ABI for ScheduledMarketResolver events
const SCHEDULED_MARKET_RESOLVER_ABI = [
  {
    type: 'event',
    name: 'MarketResolutionScheduled',
    inputs: [
      { name: 'id', type: 'uint64', indexed: false },
      { name: 'marketId', type: 'uint64', indexed: false },
      { name: 'scheduledTime', type: 'uint256', indexed: false },
      { name: 'oracleSource', type: 'string', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'id', type: 'uint64', indexed: false },
      { name: 'marketId', type: 'uint64', indexed: false },
      { name: 'outcome', type: 'bool', indexed: false },
      { name: 'executionTime', type: 'uint256', indexed: false },
      { name: 'executor', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ResolutionCancelled',
    inputs: [
      { name: 'id', type: 'uint64', indexed: false },
      { name: 'cancelledBy', type: 'address', indexed: true },
    ],
  },
] as const;

/**
 * Event interfaces
 */
export interface MarketResolutionScheduledEvent {
  id: bigint;
  marketId: bigint;
  scheduledTime: bigint;
  oracleSource: string;
  creator: string;
  blockNumber: bigint;
  transactionHash: string;
}

export interface MarketResolvedEvent {
  id: bigint;
  marketId: bigint;
  outcome: boolean;
  executionTime: bigint;
  executor: string;
  blockNumber: bigint;
  transactionHash: string;
}

export interface ResolutionCancelledEvent {
  id: bigint;
  cancelledBy: string;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Scheduled Resolution Event Listener
 */
export class ScheduledResolutionEventListener {
  private client: PublicClient;
  private isListening = false;
  private lastProcessedBlock: bigint = 0n;
  private pollInterval?: ReturnType<typeof setInterval>;
  private consecutiveFailures = 0;
  private eventsProcessed = 0;

  constructor() {
    this.client = createFlowPublicClient();
  }

  /**
   * Start listening to events
   */
  async start(fromBlock?: bigint): Promise<void> {
    if (this.isListening) {
      console.warn('[ScheduledResolutionEventListener] Already listening');
      return;
    }

    if (!SCHEDULED_MARKET_RESOLVER_ADDRESS) {
      console.error('[ScheduledResolutionEventListener] Cannot start: contract address not configured');
      return;
    }

    this.isListening = true;

    // Get current block if not specified
    if (!fromBlock) {
      const currentBlock = await this.client.getBlockNumber();
      this.lastProcessedBlock = currentBlock - 100n; // Start 100 blocks back
    } else {
      this.lastProcessedBlock = fromBlock;
    }

    console.log(
      `[ScheduledResolutionEventListener] Starting from block ${this.lastProcessedBlock}`
    );

    // Poll for new events every 12 seconds (Flow block time)
    this.pollInterval = setInterval(() => {
      this.pollEvents().catch((error) => {
        console.error('[ScheduledResolutionEventListener] Poll error:', error);
      });
    }, 12000);

    // Initial poll
    await this.pollEvents();
  }

  /**
   * Stop listening to events
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    this.isListening = false;
    console.log('[ScheduledResolutionEventListener] Stopped');
  }

  /**
   * Poll for new events
   */
  private async pollEvents(): Promise<void> {
    try {
      const currentBlock = await this.client.getBlockNumber();

      if (currentBlock <= this.lastProcessedBlock) {
        return; // No new blocks
      }

      // Alert if falling behind
      const blocksBehind = Number(currentBlock - this.lastProcessedBlock);
      if (blocksBehind > 100) {
        console.warn(
          `[ScheduledResolutionEventListener] ${blocksBehind} blocks behind current block`
        );
      }

      // Get logs for all events
      const logs = await this.client.getLogs({
        address: SCHEDULED_MARKET_RESOLVER_ADDRESS,
        fromBlock: this.lastProcessedBlock + 1n,
        toBlock: currentBlock,
      });

      // Process each log
      for (const log of logs) {
        await this.processLog(log);
        this.eventsProcessed++;
      }

      this.lastProcessedBlock = currentBlock;
      this.consecutiveFailures = 0; // Reset on successful poll
    } catch (error) {
      this.consecutiveFailures++;
      console.error(
        `[ScheduledResolutionEventListener] Error polling events (failure ${this.consecutiveFailures}):`,
        error
      );

      if (this.consecutiveFailures > 5) {
        console.error(
          `[ScheduledResolutionEventListener] ${this.consecutiveFailures} consecutive poll failures — listener may be degraded`
        );
      }
    }
  }

  /**
   * Process individual log entry
   */
  private async processLog(log: Log): Promise<void> {
    try {
      // Decode event using ABI
      const decoded = decodeEventLog({
        abi: SCHEDULED_MARKET_RESOLVER_ABI,
        data: log.data,
        topics: log.topics,
      });

      // Handle each event type
      switch (decoded.eventName) {
        case 'MarketResolutionScheduled':
          await this.handleMarketResolutionScheduled(log);
          break;

        case 'MarketResolved':
          await this.handleMarketResolved(log);
          break;

        case 'ResolutionCancelled':
          await this.handleResolutionCancelled(log);
          break;

        default:
          console.warn(
            `[ScheduledResolutionEventListener] Unknown event: ${decoded.eventName}`
          );
      }
    } catch (error) {
      console.error('[ScheduledResolutionEventListener] Error processing log:', error);
    }
  }

  /**
   * Handle MarketResolutionScheduled event
   */
  private async handleMarketResolutionScheduled(log: Log): Promise<void> {
    const decoded = decodeEventLog({
      abi: SCHEDULED_MARKET_RESOLVER_ABI,
      data: log.data,
      topics: log.topics,
    });

    const { id, marketId, scheduledTime, oracleSource, creator } = decoded.args as any;

    console.log(
      `[ScheduledResolutionEventListener] MarketResolutionScheduled: ${id} for market ${marketId}`
    );

    // Update database - find by flow resolution ID and update
    try {
      const resolution = await prisma.scheduledResolution.findUnique({
        where: { flowResolutionId: BigInt(id) },
      });

      if (resolution) {
        console.log(`[ScheduledResolutionEventListener] Found existing resolution ${resolution.id}`);
      } else {
        console.log(`[ScheduledResolutionEventListener] No database entry found for flow ID ${id}`);
      }
    } catch (error) {
      console.error('[ScheduledResolutionEventListener] Database error:', error);
    }
  }

  /**
   * Handle MarketResolved event
   */
  private async handleMarketResolved(log: Log): Promise<void> {
    const decoded = decodeEventLog({
      abi: SCHEDULED_MARKET_RESOLVER_ABI,
      data: log.data,
      topics: log.topics,
    });

    const { id, marketId, outcome, executionTime, executor } = decoded.args as any;

    console.log(
      `[ScheduledResolutionEventListener] MarketResolved: ${id} with outcome ${outcome}`
    );

    // Update ScheduledResolution in database
    try {
      await prisma.scheduledResolution.updateMany({
        where: { flowResolutionId: BigInt(id) },
        data: {
          status: 'completed',
          outcome: outcome,
          executedAt: new Date(Number(executionTime) * 1000),
        },
      });

      console.log(`[ScheduledResolutionEventListener] Updated resolution ${id} in database`);
    } catch (error) {
      console.error('[ScheduledResolutionEventListener] Database update error:', error);
    }
  }

  /**
   * Handle ResolutionCancelled event
   */
  private async handleResolutionCancelled(log: Log): Promise<void> {
    const decoded = decodeEventLog({
      abi: SCHEDULED_MARKET_RESOLVER_ABI,
      data: log.data,
      topics: log.topics,
    });

    const { id, cancelledBy } = decoded.args as any;

    console.log(`[ScheduledResolutionEventListener] ResolutionCancelled: ${id}`);

    // Update ScheduledResolution in database
    try {
      await prisma.scheduledResolution.updateMany({
        where: { flowResolutionId: BigInt(id) },
        data: {
          status: 'cancelled',
        },
      });

      console.log(`[ScheduledResolutionEventListener] Cancelled resolution ${id} in database`);
    } catch (error) {
      console.error('[ScheduledResolutionEventListener] Database update error:', error);
    }
  }

  /**
   * Get listening status
   */
  getStatus(): {
    isListening: boolean;
    lastProcessedBlock: string;
    consecutiveFailures: number;
    eventsProcessed: number;
  } {
    return {
      isListening: this.isListening,
      lastProcessedBlock: this.lastProcessedBlock.toString(),
      consecutiveFailures: this.consecutiveFailures,
      eventsProcessed: this.eventsProcessed,
    };
  }
}

// Singleton instance
export const scheduledResolutionEventListener = new ScheduledResolutionEventListener();
