/**
 * Flow Cadence Client
 * @layer Cadence — Flow native layer (NOT Flow EVM)
 *
 * Client-side FCL wrapper for Cadence transactions and scripts.
 * Access node: rest-testnet.onflow.org (Cadence REST API).
 * Wallet: Flow Wallet via FCL discovery (NOT MetaMask/wagmi).
 */

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
// IMPORTANT: accessNode.api must be the Cadence REST access node, NOT the EVM RPC URL.
// NEXT_PUBLIC_FLOW_ACCESS_NODE = Cadence REST endpoint (rest-testnet.onflow.org)
// NEXT_PUBLIC_FLOW_RPC_URL = EVM endpoint (testnet.evm.nodes.onflow.org) — NOT for FCL
fcl.config({
  'flow.network': 'testnet',
  'accessNode.api': process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE || 'https://rest-testnet.onflow.org',
  'discovery.wallet': 'https://fcl-discovery.onflow.org/testnet/authn',
  'discovery.authn.endpoint': 'https://fcl-discovery.onflow.org/api/testnet/authn',
  'discovery.authn.exclude': ['0x55ad22f01ef568a1'], // Exclude defunct Blocto
  'app.detail.title': 'WarriorsAI Arena',
  'app.detail.icon': 'https://warriorsai-arena.vercel.app/logo.png',
  'app.detail.description': 'AI Prediction Arena on Flow',
});

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FLOW_CADENCE_ADDRESS || process.env.NEXT_PUBLIC_FLOW_TESTNET_ADDRESS;

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

export interface ScheduledVaultStatus {
  id: number;
  nftId: number;
  vaultAddress: string;
  ownerAddress: string;
  cycleInterval: number;
  nextExecutionTime: number;
  cyclesExecuted: number;
  active: boolean;
  createdAt: number;
}

export interface ScheduleVaultParams {
  nftId: number;
  vaultAddress: string;
  ownerAddress: string;
  cycleInterval: number; // seconds (86400 = daily)
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
      throw new Error('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            transaction(warrior1Id: UInt64, warrior2Id: UInt64, betAmount: UFix64, scheduledTime: UFix64) {
              let scheduler: &ScheduledBattle.Scheduler

              prepare(signer: auth(Storage, SaveValue, LoadValue, BorrowValue) &Account) {
                // Create Scheduler resource if it doesn't exist
                if signer.storage.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath) == nil {
                  let newScheduler <- ScheduledBattle.createScheduler()
                  signer.storage.save(<-newScheduler, to: ScheduledBattle.SchedulerStoragePath)
                }
                self.scheduler = signer.storage.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath)
                  ?? panic("Could not borrow Scheduler")
              }

              execute {
                let battleId = self.scheduler.scheduleBattle(
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
          proposer: fcl.authz as any,
          payer: fcl.authz as any,
          authorizations: [fcl.authz as any],
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
      console.warn('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured, returning empty array');
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
      console.warn('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured, returning empty array');
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
      throw new Error('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            transaction(battleId: UInt64) {
              let executorAddress: Address

              prepare(signer: auth(Storage) &Account) {
                self.executorAddress = signer.address
              }

              execute {
                let winner = ScheduledBattle.executeBattle(
                  transactionId: battleId,
                  executor: self.executorAddress
                )
                log("Battle executed, winner: ".concat(winner.toString()))
              }
            }
          `,
          args: (arg, t) => [arg(String(battleId), types.UInt64)],
          proposer: fcl.authz as any,
          payer: fcl.authz as any,
          authorizations: [fcl.authz as any],
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
      throw new Error('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledBattle from ${CONTRACT_ADDRESS}

            transaction(battleId: UInt64) {
              let scheduler: &ScheduledBattle.Scheduler

              prepare(signer: auth(Storage, BorrowValue) &Account) {
                self.scheduler = signer.storage.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath)
                  ?? panic("Scheduler not found - you must schedule a battle first")
              }

              execute {
                self.scheduler.cancelBattle(transactionId: battleId)
                log("Battle cancelled: ".concat(battleId.toString()))
              }
            }
          `,
          args: (arg, t) => [arg(String(battleId), types.UInt64)],
          proposer: fcl.authz as any,
          payer: fcl.authz as any,
          authorizations: [fcl.authz as any],
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
      console.warn('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured, event subscription disabled');
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

  // ============================================
  // VAULT SCHEDULING (ScheduledVault contract)
  // ============================================

  /**
   * Schedule a vault for recurring yield cycles on Cadence.
   * Creates a Scheduler resource if needed, then calls scheduleVault().
   * User's Flow Wallet signs the transaction (client-side via fcl.authz).
   */
  async scheduleVault(params: ScheduleVaultParams): Promise<string> {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledVault from ${CONTRACT_ADDRESS}

            transaction(nftId: UInt64, vaultAddress: String, ownerAddress: String, cycleInterval: UFix64) {
              let scheduler: &ScheduledVault.Scheduler

              prepare(signer: auth(Storage, SaveValue, LoadValue, BorrowValue) &Account) {
                // Create Scheduler resource if it doesn't exist
                if signer.storage.borrow<&ScheduledVault.Scheduler>(from: ScheduledVault.SchedulerStoragePath) == nil {
                  let newScheduler <- ScheduledVault.createScheduler()
                  signer.storage.save(<-newScheduler, to: ScheduledVault.SchedulerStoragePath)
                }
                self.scheduler = signer.storage.borrow<&ScheduledVault.Scheduler>(from: ScheduledVault.SchedulerStoragePath)
                  ?? panic("Could not borrow Scheduler")
              }

              execute {
                let vaultId = self.scheduler.scheduleVault(
                  nftId: nftId,
                  vaultAddress: vaultAddress,
                  ownerAddress: ownerAddress,
                  cycleInterval: cycleInterval
                )
                log("Vault scheduled with ID: ".concat(vaultId.toString()))
              }
            }
          `,
          args: (arg, t) => [
            arg(String(params.nftId), types.UInt64),
            arg(params.vaultAddress, types.String),
            arg(params.ownerAddress, types.String),
            arg(params.cycleInterval.toFixed(1), types.UFix64),
          ],
          proposer: fcl.authz as any,
          payer: fcl.authz as any,
          authorizations: [fcl.authz as any],
          limit: 1000,
        }),
        30000,
        'Schedule vault transaction timed out'
      );

      const txResult = await withTimeout(
        fcl.tx(transactionId).onceSealed(),
        60000,
        'Transaction sealing timed out'
      );
      console.log('[Cadence] Vault scheduled, TX:', transactionId, 'Status:', txResult.status);

      return transactionId;
    } catch (error) {
      console.error('[Cadence] Failed to schedule vault:', error);
      throw error;
    }
  },

  /**
   * Query a vault's schedule status by NFT ID.
   * Returns null if no vault is scheduled for this NFT.
   */
  async queryVaultStatus(nftId: number): Promise<ScheduledVaultStatus | null> {
    if (!CONTRACT_ADDRESS) {
      console.warn('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured');
      return null;
    }

    try {
      const result = await withTimeout(
        fcl.query({
          cadence: `
            import ScheduledVault from ${CONTRACT_ADDRESS}

            access(all) fun main(nftId: UInt64): ScheduledVault.ScheduledVaultEntry? {
              return ScheduledVault.getVaultByNFTId(nftId: nftId)
            }
          `,
          args: (arg, t) => [arg(String(nftId), types.UInt64)],
        }),
        30000,
        'Query vault status timed out'
      );

      if (!result) return null;

      return {
        id: parseInt(result.id, 10),
        nftId: parseInt(result.nftId, 10),
        vaultAddress: result.vaultAddress,
        ownerAddress: result.ownerAddress,
        cycleInterval: parseFloat(result.cycleInterval),
        nextExecutionTime: parseFloat(result.nextExecutionTime),
        cyclesExecuted: parseInt(result.cyclesExecuted, 10),
        active: result.active,
        createdAt: parseFloat(result.createdAt),
      };
    } catch (error) {
      console.error('[Cadence] Failed to query vault status:', error);
      return null;
    }
  },

  /**
   * Cancel a scheduled vault (user must be the creator).
   */
  async cancelVault(vaultId: number): Promise<string> {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NEXT_PUBLIC_FLOW_CADENCE_ADDRESS not configured');
    }

    try {
      const transactionId = await withTimeout(
        fcl.mutate({
          cadence: `
            import ScheduledVault from ${CONTRACT_ADDRESS}

            transaction(vaultId: UInt64) {
              let scheduler: &ScheduledVault.Scheduler

              prepare(signer: auth(Storage, BorrowValue) &Account) {
                self.scheduler = signer.storage.borrow<&ScheduledVault.Scheduler>(from: ScheduledVault.SchedulerStoragePath)
                  ?? panic("Scheduler not found - you must schedule a vault first")
              }

              execute {
                self.scheduler.cancelVault(vaultId: vaultId)
                log("Vault cancelled: ".concat(vaultId.toString()))
              }
            }
          `,
          args: (arg, t) => [arg(String(vaultId), types.UInt64)],
          proposer: fcl.authz as any,
          payer: fcl.authz as any,
          authorizations: [fcl.authz as any],
          limit: 1000,
        }),
        30000,
        'Cancel vault transaction timed out'
      );

      const txResult = await withTimeout(
        fcl.tx(transactionId).onceSealed(),
        60000,
        'Transaction sealing timed out'
      );
      console.log('[Cadence] Vault cancelled, TX:', transactionId, 'Status:', txResult.status);

      return transactionId;
    } catch (error) {
      console.error('[Cadence] Failed to cancel vault:', error);
      throw error;
    }
  },
};
