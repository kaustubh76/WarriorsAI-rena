/**
 * Request Queue Management System
 *
 * Robust queue implementation for handling high-load scenarios with:
 * - Priority-based queuing
 * - Backpressure handling
 * - Timeout management
 * - Concurrent processing control
 * - Queue metrics and monitoring
 */

import { FlowMetrics } from '../metrics';

// ============================================================================
// Types
// ============================================================================

export enum QueuePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface QueueItem<T = any> {
  id: string;
  priority: QueuePriority;
  payload: T;
  addedAt: number;
  timeout?: number;
  retries: number;
  maxRetries: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

export interface QueueConfig {
  maxSize: number;
  concurrency: number;
  defaultTimeout: number;
  processingDelay: number;
  maxRetries: number;
}

export interface QueueMetrics {
  size: number;
  processing: number;
  completed: number;
  failed: number;
  dropped: number;
  avgWaitTime: number;
  avgProcessingTime: number;
}

// ============================================================================
// Request Queue Implementation
// ============================================================================

export class RequestQueue<T = any> {
  private queue: QueueItem<T>[] = [];
  private processing = new Set<string>();
  private metrics = {
    completed: 0,
    failed: 0,
    dropped: 0,
    totalWaitTime: 0,
    totalProcessingTime: 0,
  };

  private readonly config: QueueConfig;
  private isProcessing = false;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      concurrency: config.concurrency || 10,
      defaultTimeout: config.defaultTimeout || 30000,
      processingDelay: config.processingDelay || 10,
      maxRetries: config.maxRetries || 3,
    };
  }

  /**
   * Add item to queue with priority
   */
  async enqueue<R>(
    payload: T,
    processor: (payload: T) => Promise<R>,
    options: {
      priority?: QueuePriority;
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<R> {
    // Check queue capacity
    if (this.queue.length >= this.config.maxSize) {
      this.metrics.dropped++;
      FlowMetrics.incrementCounter('queue_items_dropped_total');
      throw new Error('Queue is full - request dropped');
    }

    return new Promise<R>((resolve, reject) => {
      const item: QueueItem<T> = {
        id: this.generateId(),
        priority: options.priority ?? QueuePriority.NORMAL,
        payload,
        addedAt: Date.now(),
        timeout: options.timeout ?? this.config.defaultTimeout,
        retries: 0,
        maxRetries: options.maxRetries ?? this.config.maxRetries,
        resolve: async (result: any) => {
          await this.onItemComplete(item);
          resolve(result);
        },
        reject: async (error: Error) => {
          await this.onItemFailed(item, error);
          reject(error);
        },
      };

      // Insert at correct position based on priority
      this.insertByPriority(item);

      FlowMetrics.incrementCounter('queue_items_added_total', 1, {
        priority: QueuePriority[item.priority],
      });
      FlowMetrics.setGauge('queue_size', this.queue.length);

      // Start processing if not already running
      if (!this.isProcessing) {
        this.startProcessing(processor);
      }
    });
  }

  /**
   * Process queue items
   */
  private async startProcessing<R>(
    processor: (payload: T) => Promise<R>
  ): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 || this.processing.size > 0) {
      // Process up to concurrency limit
      while (
        this.queue.length > 0 &&
        this.processing.size < this.config.concurrency
      ) {
        const item = this.queue.shift()!;
        this.processing.add(item.id);

        FlowMetrics.setGauge('queue_size', this.queue.length);
        FlowMetrics.setGauge('queue_processing', this.processing.size);

        // Process item asynchronously
        this.processItem(item, processor).catch((error) => {
          console.error('[Queue] Unexpected error processing item:', error);
        });
      }

      // Small delay before checking again
      await this.sleep(this.config.processingDelay);
    }

    this.isProcessing = false;
  }

  /**
   * Process individual queue item
   */
  private async processItem<R>(
    item: QueueItem<T>,
    processor: (payload: T) => Promise<R>
  ): Promise<void> {
    const startTime = Date.now();
    const waitTime = startTime - item.addedAt;

    try {
      // Check timeout before processing
      if (item.timeout && waitTime > item.timeout) {
        throw new Error(
          `Queue item timed out after ${waitTime}ms (timeout: ${item.timeout}ms)`
        );
      }

      // Process with timeout
      const result = await Promise.race([
        processor(item.payload),
        this.timeoutPromise(item.timeout!),
      ]);

      const processingTime = Date.now() - startTime;
      this.metrics.totalWaitTime += waitTime;
      this.metrics.totalProcessingTime += processingTime;

      FlowMetrics.observeHistogram('queue_item_wait_time_ms', waitTime);
      FlowMetrics.observeHistogram(
        'queue_item_processing_time_ms',
        processingTime
      );

      item.resolve(result);
    } catch (error: any) {
      // Retry logic
      if (item.retries < item.maxRetries) {
        item.retries++;
        console.warn(
          `[Queue] Retrying item ${item.id} (attempt ${item.retries}/${item.maxRetries})`
        );

        // Re-add to queue
        this.processing.delete(item.id);
        this.insertByPriority(item);

        FlowMetrics.incrementCounter('queue_items_retried_total');
        return;
      }

      // Max retries exhausted
      item.reject(error);
    } finally {
      this.processing.delete(item.id);
      FlowMetrics.setGauge('queue_processing', this.processing.size);
    }
  }

  /**
   * Handle successful item completion
   */
  private async onItemComplete(item: QueueItem<T>): Promise<void> {
    this.metrics.completed++;
    FlowMetrics.incrementCounter('queue_items_completed_total', 1, {
      priority: QueuePriority[item.priority],
    });
  }

  /**
   * Handle item failure
   */
  private async onItemFailed(item: QueueItem<T>, error: Error): Promise<void> {
    this.metrics.failed++;
    FlowMetrics.incrementCounter('queue_items_failed_total', 1, {
      priority: QueuePriority[item.priority],
      error: error.message,
    });

    console.error(
      `[Queue] Item ${item.id} failed after ${item.retries} retries:`,
      error.message
    );
  }

  /**
   * Insert item at correct position based on priority
   */
  private insertByPriority(item: QueueItem<T>): void {
    // Find insertion point (higher priority = earlier in queue)
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (item.priority > this.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, item);
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): QueueMetrics {
    return {
      size: this.queue.length,
      processing: this.processing.size,
      completed: this.metrics.completed,
      failed: this.metrics.failed,
      dropped: this.metrics.dropped,
      avgWaitTime:
        this.metrics.completed > 0
          ? this.metrics.totalWaitTime / this.metrics.completed
          : 0,
      avgProcessingTime:
        this.metrics.completed > 0
          ? this.metrics.totalProcessingTime / this.metrics.completed
          : 0,
    };
  }

  /**
   * Clear queue (emergency use only)
   */
  clear(): void {
    const dropped = this.queue.length;
    this.queue = [];
    this.metrics.dropped += dropped;

    FlowMetrics.incrementCounter('queue_items_dropped_total', dropped);
    FlowMetrics.setGauge('queue_size', 0);

    console.warn(`[Queue] Cleared ${dropped} pending items from queue`);
  }

  /**
   * Check if queue is healthy
   */
  isHealthy(): boolean {
    const metrics = this.getMetrics();

    // Queue is unhealthy if:
    // 1. Queue is at capacity
    if (metrics.size >= this.config.maxSize * 0.9) {
      return false;
    }

    // 2. Average wait time is too high (> 10 seconds)
    if (metrics.avgWaitTime > 10000) {
      return false;
    }

    // 3. Too many failures
    const totalProcessed = metrics.completed + metrics.failed;
    if (totalProcessed > 100 && metrics.failed / totalProcessed > 0.2) {
      return false;
    }

    return true;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${ms}ms`));
      }, ms);
    });
  }
}

// ============================================================================
// Global Queue Instances
// ============================================================================

// RPC call queue - high concurrency for blockchain calls
export const rpcQueue = new RequestQueue({
  maxSize: 500,
  concurrency: 20,
  defaultTimeout: 30000,
  maxRetries: 3,
});

// Database operation queue - moderate concurrency
export const dbQueue = new RequestQueue({
  maxSize: 1000,
  concurrency: 10,
  defaultTimeout: 15000,
  maxRetries: 2,
});

// General API queue - balanced configuration
export const apiQueue = new RequestQueue({
  maxSize: 2000,
  concurrency: 15,
  defaultTimeout: 20000,
  maxRetries: 2,
});
