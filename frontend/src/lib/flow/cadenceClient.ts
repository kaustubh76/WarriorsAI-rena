import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';

/**
 * Wraps a promise with a timeout to prevent hanging requests
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds (default: 30000ms / 30s)
 * @param errorMessage Custom error message for timeout
 * @returns The promise result or throws timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

// Configure FCL for Flow testnet with Flow Wallet (Blocto shut down Dec 2025)
fcl.config({
  'flow.network': 'testnet',
  'accessNode.api': process.env.NEXT_PUBLIC_FLOW_RPC_URL || 'https://rest-testnet.onflow.org',
  'discovery.wallet': 'https://fcl-discovery.onflow.org/testnet/authn',
  'discovery.authn.endpoint': 'https://fcl-discovery.onflow.org/api/testnet/authn',
  'discovery.authn.exclude': ['0x55ad22f01ef568a1'], // Exclude defunct Blocto
  'app.detail.title': 'WarriorsAI Arena',
  'app.detail.icon': 'https://warriorsai-arena.vercel.app/logo.png',
  'app.detail.description': 'AI Prediction Arena on Flow',
});

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FLOW_TESTNET_ADDRESS;

// TypeScript interfaces
export interface ScheduledBattle {
  id: number;
  warrior1Id: number;
  warrior2Id: number;
  betAmount: number;
  scheduledTime: Date;
  creator: string;
  executed: boolean;
  cancelled: boolean;
  transactionId?: string;
}

export interface ScheduleBattleParams {
  warrior1Id: number;
  warrior2Id: number;
  betAmount: number;
  scheduledTime: number; // Unix timestamp in seconds
}

export interface FlowEvent {
  type: string;
  data: any;
  transactionId: string;
  blockHeight: number;
}

// Helper function to format battle data from Cadence
function formatBattle(cadenceBattle: any): ScheduledBattle {
  return {
    id: parseInt(cadenceBattle.id),
    warrior1Id: parseInt(cadenceBattle.warrior1Id),
    warrior2Id: parseInt(cadenceBattle.warrior2Id),
    betAmount: parseFloat(cadenceBattle.betAmount),
    scheduledTime: new Date(parseFloat(cadenceBattle.scheduledTime) * 1000),
    creator: cadenceBattle.creator,
    executed: cadenceBattle.executed,
    cancelled: cadenceBattle.cancelled || false,
  };
}

export const cadenceClient = {
  /**
   * Schedule a battle for future execution
   */
  async scheduleBattle(params: ScheduleBattleParams): Promise<string> {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NEXT_PUBLIC_FLOW_TESTNET_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            transaction(warrior1Id: UInt64, warrior2Id: UInt64, betAmount: UFix64, scheduledTime: UFix64) {
              prepare(signer: auth(Storage) &Account) {}

              execute {
                let battleId = ScheduledBattle.scheduleBattle(
                  warrior1Id: warrior1Id,
                  warrior2Id: warrior2Id,
                  betAmount: betAmount,
                  scheduledTime: scheduledTime
                )
                log("Battle scheduled with ID: ".concat(battleId.toString()))
              }
            }
          `,
          args: (arg, t) => [
            arg(String(params.warrior1Id), types.UInt64),
            arg(String(params.warrior2Id), types.UInt64),
            arg(params.betAmount.toFixed(1), types.UFix64),
            arg(params.scheduledTime.toFixed(1), types.UFix64),
          ],
          proposer: fcl.authz,
          payer: fcl.authz,
          authorizations: [fcl.authz],
          limit: 1000,
        }),
        30000,
        'Schedule battle transaction timed out'
      );

      // Wait for transaction to be sealed (longer timeout for sealing)
      const txResult = await withTimeout(
        fcl.tx(transactionId).onceSealed(),
        60000,
        'Transaction sealing timed out'
      );
      console.log('[Cadence] Battle scheduled, TX:', transactionId, 'Status:', txResult.status);

      return transactionId;
    } catch (error) {
      console.error('[Cadence] Failed to schedule battle:', error);
      throw error;
    }
  },

  /**
   * Query all pending scheduled battles
   */
  async getPendingBattles(): Promise<ScheduledBattle[]> {
    if (!CONTRACT_ADDRESS) {
      console.warn('NEXT_PUBLIC_FLOW_TESTNET_ADDRESS not configured, returning empty array');
      return [];
    }

    try {
      const result = await withTimeout(
        fcl.query({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
              return ScheduledBattle.getPendingTransactions()
            }
          `,
        }),
        30000,
        'Query pending battles timed out'
      );

      return result.map(formatBattle);
    } catch (error) {
      console.error('[Cadence] Failed to fetch pending battles:', error);
      return [];
    }
  },

  /**
   * Query battles that are ready to execute
   */
  async getReadyBattles(): Promise<ScheduledBattle[]> {
    if (!CONTRACT_ADDRESS) {
      console.warn('NEXT_PUBLIC_FLOW_TESTNET_ADDRESS not configured, returning empty array');
      return [];
    }

    try {
      const result = await withTimeout(
        fcl.query({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
              return ScheduledBattle.getReadyTransactions()
            }
          `,
        }),
        30000,
        'Query ready battles timed out'
      );

      return result.map(formatBattle);
    } catch (error) {
      console.error('[Cadence] Failed to fetch ready battles:', error);
      return [];
    }
  },

  /**
   * Execute a scheduled battle
   */
  async executeBattle(battleId: number): Promise<string> {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NEXT_PUBLIC_FLOW_TESTNET_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

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
        }),
        30000,
        'Execute battle transaction timed out'
      );

      const txResult = await withTimeout(
        fcl.tx(transactionId).onceSealed(),
        60000,
        'Transaction sealing timed out'
      );
      console.log('[Cadence] Battle executed, TX:', transactionId, 'Status:', txResult.status);

      return transactionId;
    } catch (error) {
      console.error('[Cadence] Failed to execute battle:', error);
      throw error;
    }
  },

  /**
   * Cancel a scheduled battle (if not yet executed)
   */
  async cancelBattle(battleId: number): Promise<string> {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NEXT_PUBLIC_FLOW_TESTNET_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            transaction(battleId: UInt64) {
              prepare(signer: auth(Storage) &Account) {}

              execute {
                ScheduledBattle.cancelBattle(transactionId: battleId)
                log("Battle cancelled: ".concat(battleId.toString()))
              }
            }
          `,
          args: (arg, t) => [arg(String(battleId), types.UInt64)],
          proposer: fcl.authz,
          payer: fcl.authz,
          authorizations: [fcl.authz],
          limit: 1000,
        }),
        30000,
        'Cancel battle transaction timed out'
      );

      const txResult = await withTimeout(
        fcl.tx(transactionId).onceSealed(),
        60000,
        'Transaction sealing timed out'
      );
      console.log('[Cadence] Battle cancelled, TX:', transactionId, 'Status:', txResult.status);

      return transactionId;
    } catch (error) {
      console.error('[Cadence] Failed to cancel battle:', error);
      throw error;
    }
  },

  /**
   * Subscribe to battle events
   */
  subscribeToEvents(callback: (event: FlowEvent) => void): () => void {
    if (!CONTRACT_ADDRESS) {
      console.warn('NEXT_PUBLIC_FLOW_TESTNET_ADDRESS not configured, event subscription disabled');
      return () => {};
    }

    try {
      const unsubscribe = fcl
        .events(`A.${CONTRACT_ADDRESS.replace('0x', '')}.ScheduledBattle`)
        .subscribe((event: any) => {
          callback({
            type: event.type,
            data: event.data,
            transactionId: event.transactionId,
            blockHeight: event.blockHeight,
          });
        });

      return unsubscribe;
    } catch (error) {
      console.error('[Cadence] Failed to subscribe to events:', error);
      return () => {};
    }
  },

  /**
   * Get current user's Flow address
   */
  async getCurrentUser(): Promise<string | null> {
    try {
      const currentUser = await fcl.currentUser.snapshot();
      return currentUser?.addr || null;
    } catch (error) {
      console.error('[Cadence] Failed to get current user:', error);
      return null;
    }
  },

  /**
   * Authenticate user with Flow wallet
   */
  async authenticate(): Promise<void> {
    try {
      await fcl.authenticate();
    } catch (error) {
      console.error('[Cadence] Authentication failed:', error);
      throw error;
    }
  },

  /**
   * Unauthenticate user
   */
  async unauthenticate(): Promise<void> {
    try {
      await fcl.unauthenticate();
    } catch (error) {
      console.error('[Cadence] Unauthentication failed:', error);
      throw error;
    }
  },
};
