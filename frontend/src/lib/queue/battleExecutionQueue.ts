import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';

interface QueuedBattle {
  id: number;
  warrior1Id: number;
  warrior2Id: number;
  betAmount: number;
  scheduledTime: Date;
  attempts: number;
  lastAttempt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transactionId?: string;
  error?: string;
}

/**
 * Battle Execution Queue
 * Handles reliable execution of scheduled battles with retry logic
 */
export class BattleExecutionQueue {
  private queue: Map<number, QueuedBattle> = new Map();
  private processing: Set<number> = new Set();
  private maxRetries: number;
  private retryDelay: number;
  private contractAddress: string;

  constructor(
    contractAddress: string,
    maxRetries: number = 3,
    retryDelay: number = 5000
  ) {
    this.contractAddress = contractAddress;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * Add battle to execution queue
   */
  addBattle(battle: Omit<QueuedBattle, 'attempts' | 'status'>): void {
    const queuedBattle: QueuedBattle = {
      ...battle,
      attempts: 0,
      status: 'pending',
    };

    this.queue.set(battle.id, queuedBattle);
    console.log(`[Battle Queue] Added battle ${battle.id} to queue`);
  }

  /**
   * Remove battle from queue
   */
  removeBattle(battleId: number): void {
    this.queue.delete(battleId);
    this.processing.delete(battleId);
    console.log(`[Battle Queue] Removed battle ${battleId} from queue`);
  }

  /**
   * Get battle status
   */
  getBattleStatus(battleId: number): QueuedBattle | undefined {
    return this.queue.get(battleId);
  }

  /**
   * Get all pending battles
   */
  getPendingBattles(): QueuedBattle[] {
    return Array.from(this.queue.values()).filter((b) => b.status === 'pending');
  }

  /**
   * Get all completed battles
   */
  getCompletedBattles(): QueuedBattle[] {
    return Array.from(this.queue.values()).filter((b) => b.status === 'completed');
  }

  /**
   * Get all failed battles
   */
  getFailedBattles(): QueuedBattle[] {
    return Array.from(this.queue.values()).filter((b) => b.status === 'failed');
  }

  /**
   * Process queue - execute ready battles
   */
  async processQueue(): Promise<{
    executed: number;
    failed: number;
    pending: number;
  }> {
    const now = new Date();
    let executed = 0;
    let failed = 0;
    let pending = 0;

    for (const [battleId, battle] of this.queue.entries()) {
      // Skip if already processing
      if (this.processing.has(battleId)) {
        continue;
      }

      // Skip if not yet ready
      if (battle.scheduledTime > now) {
        pending++;
        continue;
      }

      // Skip if already completed or max retries exceeded
      if (battle.status === 'completed') {
        continue;
      }

      if (battle.status === 'failed' && battle.attempts >= this.maxRetries) {
        failed++;
        continue;
      }

      // Execute battle
      await this.executeBattle(battleId);

      if (battle.status === 'completed') {
        executed++;
      } else if (battle.status === 'failed') {
        failed++;
      }
    }

    return { executed, failed, pending };
  }

  /**
   * Execute a single battle with retry logic
   */
  private async executeBattle(battleId: number): Promise<void> {
    const battle = this.queue.get(battleId);
    if (!battle) {
      return;
    }

    this.processing.add(battleId);
    battle.status = 'processing';
    battle.attempts++;
    battle.lastAttempt = new Date();

    console.log(
      `[Battle Queue] Executing battle ${battleId} (attempt ${battle.attempts}/${this.maxRetries})`
    );

    try {
      // Execute battle on-chain
      const transactionId = await fcl.mutate({
        cadence: `
          import ScheduledBattle from ${this.contractAddress}

          transaction(battleId: UInt64) {
            prepare(signer: auth(Storage) &Account) {}

            execute {
              let winner = ScheduledBattle.executeBattle(
                transactionId: battleId,
                executor: signer.address
              )
              log("Battle executed, winner: ".concat(winner.toString()))
            }
          }
        `,
        args: (arg, t) => [arg(String(battleId), types.UInt64)],
        proposer: fcl.authz,
        payer: fcl.authz,
        authorizations: [fcl.authz],
        limit: 1000,
      });

      // Wait for transaction to seal with timeout
      const txResult = await Promise.race([
        fcl.tx(transactionId).onceSealed(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Transaction timeout after 30s')), 30000)
        ),
      ]);

      // Success!
      battle.status = 'completed';
      battle.transactionId = transactionId;
      battle.error = undefined;

      console.log(`[Battle Queue] ✅ Battle ${battleId} executed successfully`, {
        transactionId,
        attempts: battle.attempts,
      });
    } catch (error: any) {
      console.error(`[Battle Queue] ❌ Battle ${battleId} execution failed:`, error);

      battle.error = error.message;

      // Retry logic
      if (battle.attempts < this.maxRetries) {
        // Schedule retry with exponential backoff
        const backoffDelay = this.retryDelay * Math.pow(2, battle.attempts - 1);

        console.log(
          `[Battle Queue] Scheduling retry for battle ${battleId} in ${backoffDelay}ms`
        );

        setTimeout(() => {
          battle.status = 'pending';
          this.processing.delete(battleId);
        }, backoffDelay);
      } else {
        // Max retries exceeded
        battle.status = 'failed';
        console.error(
          `[Battle Queue] ❌ Battle ${battleId} failed after ${this.maxRetries} attempts`
        );
      }
    } finally {
      this.processing.delete(battleId);
    }
  }

  /**
   * Start automatic queue processing
   */
  startAutoProcessing(intervalMs: number = 60000): NodeJS.Timeout {
    console.log(`[Battle Queue] Starting auto-processing (interval: ${intervalMs}ms)`);

    const interval = setInterval(async () => {
      try {
        const result = await this.processQueue();
        console.log('[Battle Queue] Auto-process complete:', result);
      } catch (error) {
        console.error('[Battle Queue] Auto-process error:', error);
      }
    }, intervalMs);

    return interval;
  }

  /**
   * Stop automatic queue processing
   */
  stopAutoProcessing(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    console.log('[Battle Queue] Stopped auto-processing');
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const battles = Array.from(this.queue.values());

    return {
      total: battles.length,
      pending: battles.filter((b) => b.status === 'pending').length,
      processing: battles.filter((b) => b.status === 'processing').length,
      completed: battles.filter((b) => b.status === 'completed').length,
      failed: battles.filter((b) => b.status === 'failed').length,
    };
  }

  /**
   * Clear completed battles from queue
   */
  clearCompleted(): number {
    let cleared = 0;

    for (const [battleId, battle] of this.queue.entries()) {
      if (battle.status === 'completed') {
        this.queue.delete(battleId);
        cleared++;
      }
    }

    console.log(`[Battle Queue] Cleared ${cleared} completed battles`);
    return cleared;
  }

  /**
   * Retry all failed battles
   */
  retryFailed(): void {
    let retried = 0;

    for (const battle of this.queue.values()) {
      if (battle.status === 'failed') {
        battle.status = 'pending';
        battle.attempts = 0;
        battle.error = undefined;
        retried++;
      }
    }

    console.log(`[Battle Queue] Reset ${retried} failed battles for retry`);
  }

  /**
   * Export queue state for persistence
   */
  exportState(): QueuedBattle[] {
    return Array.from(this.queue.values());
  }

  /**
   * Import queue state from persistence
   */
  importState(battles: QueuedBattle[]): void {
    this.queue.clear();
    for (const battle of battles) {
      this.queue.set(battle.id, battle);
    }
    console.log(`[Battle Queue] Imported ${battles.length} battles`);
  }
}

// Singleton instance
let queueInstance: BattleExecutionQueue | null = null;

export function getBattleQueue(contractAddress?: string): BattleExecutionQueue {
  if (!queueInstance && contractAddress) {
    queueInstance = new BattleExecutionQueue(contractAddress);
  }

  if (!queueInstance) {
    throw new Error('Battle queue not initialized. Provide contractAddress on first call.');
  }

  return queueInstance;
}
