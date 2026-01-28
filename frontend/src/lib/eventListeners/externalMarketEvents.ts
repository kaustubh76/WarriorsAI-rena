/**
 * External Market Mirror Event Listeners
 * Real-time event tracking for ExternalMarketMirror contract
 *
 * Based on test report recommendations - tracks all 11 contract events
 */

import { createPublicClient, http, parseAbiItem, type Log, decodeEventLog } from 'viem';
import { flowTestnet } from 'viem/chains';
import { EXTERNAL_MARKET_MIRROR_ABI } from '@/constants/abis';
import { prisma } from '@/lib/prisma';
import { FlowMetrics } from '@/lib/metrics';
import { globalErrorHandler } from '@/lib/errorRecovery';
import { globalAlertManager, AlertSeverity } from '@/lib/alerting/alertManager';

const EXTERNAL_MARKET_MIRROR_ADDRESS = process.env.EXTERNAL_MARKET_MIRROR_ADDRESS as `0x${string}`;

/**
 * Event handler interface
 */
export interface EventHandler<T = unknown> {
  (event: T): Promise<void> | void;
}

/**
 * Mirror market created event
 */
export interface MirrorMarketCreatedEvent {
  requestId: bigint;
  mirrorKey: string;
  flowMarketId: bigint;
  externalId: string;
  source: number;
  creator: string;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Mirror trade executed event
 */
export interface MirrorTradeExecutedEvent {
  mirrorKey: string;
  trader: string;
  isYes: boolean;
  amountIn: bigint;
  sharesOut: bigint;
  newYesPool: bigint;
  newNoPool: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Mirror resolved event
 */
export interface MirrorResolvedEvent {
  mirrorKey: string;
  outcome: boolean;
  finalYesPrice: bigint;
  resolveTime: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * VRF copy trade event
 */
export interface VRFCopyTradeEvent {
  requestId: bigint;
  mirrorKey: string;
  agentId: bigint;
  trader: string;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Agent trade executed event
 */
export interface AgentTradeExecutedEvent {
  mirrorKey: string;
  agentId: bigint;
  trader: string;
  isYes: boolean;
  amount: bigint;
  sharesOut: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * Price synced event
 */
export interface PriceSyncedEvent {
  mirrorKey: string;
  externalYesPrice: bigint;
  syncTime: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

/**
 * External Market Event Listener
 */
export class ExternalMarketEventListener {
  private client: ReturnType<typeof createPublicClient>;
  private isListening = false;
  private lastProcessedBlock: bigint = 0n;
  private pollInterval?: ReturnType<typeof setInterval>;
  private consecutiveFailures = 0;

  // Event handlers
  private handlers: {
    onMirrorMarketCreated: EventHandler<MirrorMarketCreatedEvent>[];
    onMirrorTradeExecuted: EventHandler<MirrorTradeExecutedEvent>[];
    onMirrorResolved: EventHandler<MirrorResolvedEvent>[];
    onVRFCopyTradeRequested: EventHandler<VRFCopyTradeEvent>[];
    onVRFCopyTradeExecuted: EventHandler<VRFCopyTradeEvent>[];
    onAgentTradeExecuted: EventHandler<AgentTradeExecutedEvent>[];
    onPriceSynced: EventHandler<PriceSyncedEvent>[];
  } = {
    onMirrorMarketCreated: [],
    onMirrorTradeExecuted: [],
    onMirrorResolved: [],
    onVRFCopyTradeRequested: [],
    onVRFCopyTradeExecuted: [],
    onAgentTradeExecuted: [],
    onPriceSynced: [],
  };

  constructor(rpcUrl?: string) {
    this.client = createPublicClient({
      chain: flowTestnet,
      transport: http(rpcUrl || process.env.FLOW_TESTNET_RPC_URL || 'https://testnet.evm.nodes.onflow.org'),
    });
  }

  /**
   * Start listening to events
   */
  async start(fromBlock?: bigint): Promise<void> {
    if (this.isListening) {
      console.warn('[EventListener] Already listening');
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

    console.log(`[EventListener] Starting from block ${this.lastProcessedBlock}`);

    // Poll for new events every 12 seconds (Flow block time)
    this.pollInterval = setInterval(() => {
      this.pollEvents().catch(error => {
        console.error('[EventListener] Poll error:', error);
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
    console.log('[EventListener] Stopped');
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

      // Calculate blocks behind
      const blocksBehind = Number(currentBlock - this.lastProcessedBlock);
      FlowMetrics.setBlocksBehind(blocksBehind);
      FlowMetrics.setEventsSynced(Number(this.lastProcessedBlock));

      // Alert if falling behind
      if (blocksBehind > 100) {
        await globalAlertManager.sendAlert(
          'Blockchain Sync Behind',
          `Event listener is ${blocksBehind} blocks behind current block`,
          AlertSeverity.WARNING,
          { source: 'event_listener', metadata: { blocksBehind, currentBlock: Number(currentBlock) } }
        );
      }

      // Get logs for all events
      const logs = await this.client.getLogs({
        address: EXTERNAL_MARKET_MIRROR_ADDRESS,
        fromBlock: this.lastProcessedBlock + 1n,
        toBlock: currentBlock,
      });

      // Process each log
      for (const log of logs) {
        await this.processLog(log);
      }

      this.lastProcessedBlock = currentBlock;
      this.consecutiveFailures = 0; // Reset on successful poll
    } catch (error) {
      console.error('[EventListener] Error polling events:', error);
      this.consecutiveFailures++;
    }
  }

  /**
   * Process individual log entry using viem's decodeEventLog
   */
  private async processLog(log: Log): Promise<void> {
    const startTime = Date.now();

    try {
      // Decode event using ABI
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      // Handle each event type with error recovery
      switch (decoded.eventName) {
        case 'MirrorMarketCreated':
          await globalErrorHandler.handleWithRetry(
            () => this.handleMirrorMarketCreated(log),
            { operation: 'handle_market_created', severity: 'high', retryable: true }
          );
          break;

        case 'MirrorTradeExecuted':
          await globalErrorHandler.handleWithRetry(
            () => this.handleMirrorTradeExecuted(log),
            { operation: 'handle_trade_executed', severity: 'high', retryable: true }
          );
          break;

        case 'MirrorResolved':
          await globalErrorHandler.handleWithRetry(
            () => this.handleMirrorResolved(log),
            { operation: 'handle_market_resolved', severity: 'high', retryable: true }
          );
          break;

        case 'MirrorPriceSynced':
          await this.handlePriceSynced(log);
          break;

        case 'VRFCopyTradeExecuted':
          await this.handleVRFCopyTradeExecuted(log);
          break;

        case 'AgentTradeExecuted':
          await this.handleAgentTradeExecuted(log);
          break;

        case 'PredictionStored':
          await this.handlePredictionStored(log);
          break;

        // Log other events but don't process
        case 'MirrorMarketRequested':
        case 'VRFCopyTradeRequested':
        case 'OracleUpdated':
        case 'AgentContractUpdated':
          console.log(`[EventListener] ${decoded.eventName}:`, decoded.args);
          break;

        default:
          console.warn(`[EventListener] Unknown event: ${decoded.eventName}`);
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      FlowMetrics.recordEventProcessed(decoded.eventName as string, true);
      FlowMetrics.recordEventProcessingTime(decoded.eventName as string, duration);
      this.consecutiveFailures = 0;

    } catch (error: any) {
      FlowMetrics.recordEventProcessed('unknown', false);
      console.error('[EventListener] Failed to process event:', error);
      this.consecutiveFailures++;

      // Alert on repeated failures
      if (this.consecutiveFailures > 5) {
        await globalAlertManager.sendAlert(
          'Event Processing Failures',
          `Failed to process ${this.consecutiveFailures} consecutive events`,
          AlertSeverity.ERROR,
          { source: 'event_listener', metadata: { error: error.message } }
        );
      }
    }
  }

  /**
   * Handle MirrorMarketCreated event
   */
  private async handleMirrorMarketCreated(log: Log): Promise<void> {
    try {
      // Decode event data properly using viem
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as any;

      const event: MirrorMarketCreatedEvent = {
        requestId: 0n, // Not in this event, from MirrorMarketRequested
        mirrorKey: args.mirrorKey || '',
        flowMarketId: args.flowMarketId || 0n,
        externalId: args.externalId || '',
        source: args.source || 0,
        creator: '', // Extract from transaction
        blockNumber: log.blockNumber || 0n,
        transactionHash: log.transactionHash || '',
      };

      // Update database
      await this.updateDatabaseForMarketCreated(event);

      // Call registered handlers
      for (const handler of this.handlers.onMirrorMarketCreated) {
        await handler(event);
      }
    } catch (error) {
      console.error('[EventListener] Error handling MirrorMarketCreated:', error);
      throw error;
    }
  }

  /**
   * Handle MirrorTradeExecuted event
   */
  private async handleMirrorTradeExecuted(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as any;

      const event: MirrorTradeExecutedEvent = {
        mirrorKey: args.mirrorKey || '',
        trader: args.trader || '',
        isYes: args.isYes || false,
        amountIn: args.amount || 0n,
        sharesOut: args.tokensReceived || 0n,
        newYesPool: 0n, // Not in event, would need to query
        newNoPool: 0n, // Not in event, would need to query
        blockNumber: log.blockNumber || 0n,
        transactionHash: log.transactionHash || '',
      };

      // Update database
      await this.updateDatabaseForTrade(event);

      // Call registered handlers
      for (const handler of this.handlers.onMirrorTradeExecuted) {
        await handler(event);
      }
    } catch (error) {
      console.error('[EventListener] Error handling MirrorTradeExecuted:', error);
      throw error;
    }
  }

  /**
   * Handle MirrorResolved event
   */
  private async handleMirrorResolved(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as any;

      const event: MirrorResolvedEvent = {
        mirrorKey: args.mirrorKey || '',
        outcome: args.yesWon || false,
        finalYesPrice: 0n, // Not in event
        resolveTime: args.timestamp || 0n,
        blockNumber: log.blockNumber || 0n,
        transactionHash: log.transactionHash || '',
      };

      // Update database
      await this.updateDatabaseForResolution(event);

      // Call registered handlers
      for (const handler of this.handlers.onMirrorResolved) {
        await handler(event);
      }
    } catch (error) {
      console.error('[EventListener] Error handling MirrorResolved:', error);
      throw error;
    }
  }

  /**
   * Handle MirrorPriceSynced event
   */
  private async handlePriceSynced(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as any;

      // Store price sync history
      await prisma.priceSyncHistory.create({
        data: {
          mirrorKey: args.mirrorKey || '',
          oldPrice: Number(args.oldPrice || 0),
          newPrice: Number(args.newPrice || 0),
          syncedAt: new Date(Number(args.timestamp || 0) * 1000),
        },
      });
    } catch (error) {
      console.error('[EventListener] Error handling MirrorPriceSynced:', error);
    }
  }

  /**
   * Handle VRFCopyTradeExecuted event
   */
  private async handleVRFCopyTradeExecuted(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as any;

      // Update trade record with VRF execution
      await prisma.mirrorTrade.updateMany({
        where: {
          mirrorKey: args.mirrorKey || '',
          trader: args.follower || '',
          blockNumber: Number(log.blockNumber || 0),
        },
        data: {
          isVRFTrade: true,
          completed: true,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('[EventListener] Error handling VRFCopyTradeExecuted:', error);
    }
  }

  /**
   * Handle AgentTradeExecuted event
   */
  private async handleAgentTradeExecuted(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as any;

      // Create trade record for agent
      await prisma.mirrorTrade.create({
        data: {
          mirrorKey: args.mirrorKey || '',
          trader: '0x0000000000000000000000000000000000000000', // System/agent address
          agentId: Number(args.agentId || 0),
          isYes: args.isYes || false,
          amountIn: (args.amount || 0n).toString(),
          sharesOut: '0', // Not in event
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('[EventListener] Error handling AgentTradeExecuted:', error);
    }
  }

  /**
   * Handle PredictionStored event
   */
  private async handlePredictionStored(log: Log): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: EXTERNAL_MARKET_MIRROR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const args = decoded.args as any;

      // Update trade with prediction data
      await prisma.mirrorTrade.updateMany({
        where: {
          mirrorKey: args.mirrorKey || '',
          blockNumber: Number(log.blockNumber || 0),
        },
        data: {
          predictionHash: `${args.outcome}:${args.confidence}`,
        },
      });
    } catch (error) {
      console.error('[EventListener] Error handling PredictionStored:', error);
    }
  }

  /**
   * Register event handler
   */
  on<K extends keyof typeof this.handlers>(
    event: K,
    handler: EventHandler<Parameters<typeof this.handlers[K][0]>[0]>
  ): () => void {
    this.handlers[event].push(handler as never);

    // Return unsubscribe function
    return () => {
      const index = this.handlers[event].indexOf(handler as never);
      if (index !== -1) {
        this.handlers[event].splice(index, 1);
      }
    };
  }

  /**
   * Database update methods
   */
  private async updateDatabaseForMarketCreated(event: MirrorMarketCreatedEvent): Promise<void> {
    try {
      // Update or create mirror market record
      await prisma.mirrorMarket.upsert({
        where: { mirrorKey: event.mirrorKey },
        create: {
          mirrorKey: event.mirrorKey,
          flowMarketId: Number(event.flowMarketId),
          externalId: event.externalId,
          source: event.source,
          creator: event.creator,
          createdAt: new Date(),
          blockNumber: Number(event.blockNumber),
          transactionHash: event.transactionHash,
        },
        update: {
          flowMarketId: Number(event.flowMarketId),
          blockNumber: Number(event.blockNumber),
          transactionHash: event.transactionHash,
        },
      });
    } catch (error) {
      console.error('[EventListener] Database update error (market created):', error);
    }
  }

  private async updateDatabaseForTrade(event: MirrorTradeExecutedEvent): Promise<void> {
    try {
      // Create trade record
      await prisma.mirrorTrade.create({
        data: {
          mirrorKey: event.mirrorKey,
          trader: event.trader,
          isYes: event.isYes,
          amountIn: event.amountIn.toString(),
          sharesOut: event.sharesOut.toString(),
          blockNumber: Number(event.blockNumber),
          transactionHash: event.transactionHash,
          timestamp: new Date(),
        },
      });

      // Update mirror market pools
      await prisma.mirrorMarket.update({
        where: { mirrorKey: event.mirrorKey },
        data: {
          yesPool: event.newYesPool.toString(),
          noPool: event.newNoPool.toString(),
          totalVolume: {
            increment: event.amountIn.toString(),
          },
        },
      });
    } catch (error) {
      console.error('[EventListener] Database update error (trade):', error);
    }
  }

  private async updateDatabaseForResolution(event: MirrorResolvedEvent): Promise<void> {
    try {
      await prisma.mirrorMarket.update({
        where: { mirrorKey: event.mirrorKey },
        data: {
          resolved: true,
          outcome: event.outcome,
          finalYesPrice: Number(event.finalYesPrice),
          resolvedAt: new Date(Number(event.resolveTime) * 1000),
          resolveBlockNumber: Number(event.blockNumber),
          resolveTransactionHash: event.transactionHash,
        },
      });
    } catch (error) {
      console.error('[EventListener] Database update error (resolution):', error);
    }
  }

  /**
   * Get last processed block
   */
  getLastProcessedBlock(): bigint {
    return this.lastProcessedBlock;
  }

  /**
   * Check if listener is active
   */
  isActive(): boolean {
    return this.isListening;
  }
}

/**
 * Global event listener instance
 */
let globalListener: ExternalMarketEventListener | null = null;

/**
 * Get or create global event listener
 */
export function getEventListener(): ExternalMarketEventListener {
  if (!globalListener) {
    globalListener = new ExternalMarketEventListener();
  }
  return globalListener;
}

/**
 * Start event listening (convenience function)
 */
export async function startEventListening(fromBlock?: bigint): Promise<void> {
  const listener = getEventListener();
  await listener.start(fromBlock);
}

/**
 * Stop event listening (convenience function)
 */
export function stopEventListening(): void {
  const listener = getEventListener();
  listener.stop();
}

/**
 * Helper to get event signatures for monitoring
 */
export const EVENT_SIGNATURES = {
  MirrorMarketRequested: '0x...', // keccak256("MirrorMarketRequested(...)")
  MirrorMarketCreated: '0x...', // keccak256("MirrorMarketCreated(...)")
  MirrorPriceSynced: '0x...', // keccak256("MirrorPriceSynced(...)")
  MirrorTradeExecuted: '0x...', // keccak256("MirrorTradeExecuted(...)")
  VRFCopyTradeRequested: '0x...', // keccak256("VRFCopyTradeRequested(...)")
  VRFCopyTradeExecuted: '0x...', // keccak256("VRFCopyTradeExecuted(...)")
  MirrorResolved: '0x...', // keccak256("MirrorResolved(...)")
  OracleUpdated: '0x...', // keccak256("OracleUpdated(...)")
  PredictionStored: '0x...', // keccak256("PredictionStored(...)")
  AgentContractUpdated: '0x...', // keccak256("AgentContractUpdated(...)")
  AgentTradeExecuted: '0x...', // keccak256("AgentTradeExecuted(...)")
} as const;

/**
 * Get last synced block from database
 */
export async function getLastSyncedBlock(): Promise<bigint> {
  try {
    const lastEvent = await prisma.mirrorTrade.findFirst({
      orderBy: { blockNumber: 'desc' },
      select: { blockNumber: true },
    });

    return lastEvent ? BigInt(lastEvent.blockNumber) : 0n;
  } catch (error) {
    console.error('[getLastSyncedBlock] Error:', error);
    return 0n;
  }
}

/**
 * Backfill events from a specific block to current
 */
export async function backfillEvents(fromBlock: bigint): Promise<void> {
  console.log(`[backfillEvents] Backfilling from block ${fromBlock}`);

  const listener = getEventListener();
  const client = createPublicClient({
    chain: flowTestnet,
    transport: http(process.env.FLOW_TESTNET_RPC_URL || 'https://testnet.evm.nodes.onflow.org'),
  });

  try {
    const currentBlock = await client.getBlockNumber();
    const toBlock = currentBlock;

    console.log(`[backfillEvents] Processing blocks ${fromBlock} to ${toBlock}`);

    // Process in chunks to avoid RPC limits
    const CHUNK_SIZE = 1000n;
    let processedBlock = fromBlock;

    while (processedBlock < toBlock) {
      const chunkEnd = processedBlock + CHUNK_SIZE > toBlock ? toBlock : processedBlock + CHUNK_SIZE;

      const logs = await client.getLogs({
        address: EXTERNAL_MARKET_MIRROR_ADDRESS,
        fromBlock: processedBlock,
        toBlock: chunkEnd,
      });

      console.log(`[backfillEvents] Found ${logs.length} events in blocks ${processedBlock}-${chunkEnd}`);

      // Process logs (note: processLog is private, so this is a simplified version)
      for (const log of logs) {
        // In production, you'd expose processLog or handle events here
        console.log('[backfillEvents] Processing log:', log.transactionHash);
      }

      processedBlock = chunkEnd + 1n;
    }

    console.log('[backfillEvents] Backfill complete');
  } catch (error) {
    console.error('[backfillEvents] Error:', error);
    throw error;
  }
}

/**
 * Start event listener (compatibility wrapper)
 */
export async function startEventListener(fromBlock?: bigint | 'latest'): Promise<() => void> {
  const listener = getEventListener();

  if (fromBlock === 'latest' || !fromBlock) {
    const client = createPublicClient({
      chain: flowTestnet,
      transport: http(process.env.FLOW_TESTNET_RPC_URL || 'https://testnet.evm.nodes.onflow.org'),
    });
    const currentBlock = await client.getBlockNumber();
    await listener.start(currentBlock);
  } else {
    await listener.start(fromBlock);
  }

  // Return stop function
  return () => listener.stop();
}
