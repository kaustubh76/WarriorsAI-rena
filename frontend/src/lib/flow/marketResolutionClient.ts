/**
 * Flow Cadence Client for ScheduledMarketResolver
 * Provides TypeScript wrapper for scheduling and executing market resolutions
 */

import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';

// Contract addresses — all 3 contracts deployed to same account on testnet
const SCHEDULED_MARKET_RESOLVER_ADDRESS = process.env.NEXT_PUBLIC_SCHEDULED_MARKET_RESOLVER_ADDRESS || '0xb4f445e1abc955a8';

// Flow native FlowTransactionScheduler (Forte upgrade)
// Testnet: 0x8c5303eaa26202d6
const FLOW_TX_SCHEDULER_ADDRESS = process.env.NEXT_PUBLIC_FLOW_TX_SCHEDULER_ADDRESS || '0x8c5303eaa26202d6';

// ============================================
// TYPES
// ============================================

export enum OracleSource {
  KALSHI = 'kalshi',
  POLYMARKET = 'polymarket',
  INTERNAL = 'internal',
}

export interface ScheduledResolution {
  id: string;
  marketId: string;
  scheduledTime: number;
  oracleSource: OracleSource;
  creator: string;
  resolved: boolean;
  cancelled: boolean;
  outcome?: boolean;
  createdAt: number;
}

export enum SchedulePriority {
  HIGH = 'high',     // 10x fees, guaranteed first block
  MEDIUM = 'medium', // 5x fees, best-effort
  LOW = 'low',       // 2x fees, opportunistic
}

// ============================================
// NATIVE FLOW SCHEDULED TRANSACTIONS (Forte)
// ============================================

/**
 * Schedule a market resolution using Flow's native FlowTransactionScheduler.
 * The network will automatically execute the handler at the scheduled time.
 * User's Flow Wallet signs the transaction (client-side).
 */
export async function scheduleNativeResolution(params: {
  marketId: number;
  scheduledTime: number; // Unix timestamp
  oracleSource: OracleSource;
  priority?: SchedulePriority;
  executionEffort?: number;
}): Promise<string> {
  const {
    marketId,
    scheduledTime,
    oracleSource,
    priority = SchedulePriority.MEDIUM,
    executionEffort = 10000,
  } = params;

  const oracleSourceEnum = getOracleSourceEnum(oracleSource);
  const priorityEnum = getPriorityEnum(priority);

  const transactionCode = `
    import FlowTransactionScheduler from ${FLOW_TX_SCHEDULER_ADDRESS}
    import FlowTransactionSchedulerUtils from ${FLOW_TX_SCHEDULER_ADDRESS}
    import FlowToken from 0x7e60df042a9c0868
    import FungibleToken from 0x9a0766d93b6608b7
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    transaction(
      marketId: UInt64,
      scheduledTime: UFix64,
      oracleSource: UInt8,
      priority: UInt8,
      executionEffort: UInt64
    ) {
      prepare(signer: auth(Storage, Capabilities, BorrowValue, SaveValue) &Account) {
        // Ensure ScheduledMarketResolver handler exists
        if signer.storage.borrow<&ScheduledMarketResolver.Resolver>(
          from: ScheduledMarketResolver.ResolverStoragePath
        ) == nil {
          let resolver <- ScheduledMarketResolver.createResolver()
          signer.storage.save(<-resolver, to: ScheduledMarketResolver.ResolverStoragePath)
        }

        // Issue handler capability
        let handlerCap = signer.capabilities.storage
          .issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
            ScheduledMarketResolver.ResolverStoragePath
          )

        // Ensure Manager exists
        if signer.storage.borrow<&FlowTransactionSchedulerUtils.Manager>(
          from: FlowTransactionSchedulerUtils.managerStoragePath
        ) == nil {
          let manager <- FlowTransactionSchedulerUtils.createManager()
          signer.storage.save(<-manager, to: FlowTransactionSchedulerUtils.managerStoragePath)

          let managerCap = signer.capabilities.storage
            .issue<&FlowTransactionSchedulerUtils.Manager>(
              FlowTransactionSchedulerUtils.managerStoragePath
            )
          signer.capabilities.publish(managerCap, at: FlowTransactionSchedulerUtils.managerPublicPath)
        }

        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &FlowTransactionSchedulerUtils.Manager>(
          from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Manager not found")

        // Convert priority
        let pr = priority == 0
          ? FlowTransactionScheduler.Priority.High
          : priority == 1
          ? FlowTransactionScheduler.Priority.Medium
          : FlowTransactionScheduler.Priority.Low

        // Build schedule data with market info
        let data: {String: AnyStruct} = {
          "marketId": marketId,
          "oracleSource": oracleSource,
          "scheduledTime": scheduledTime
        }

        // Estimate fees
        let est = FlowTransactionScheduler.estimate(
          data: data,
          timestamp: scheduledTime,
          priority: pr,
          executionEffort: executionEffort
        )

        // Withdraw fees from FLOW vault
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
          from: /storage/flowTokenVault
        ) ?? panic("Missing FlowToken vault")

        let fees <- vaultRef.withdraw(amount: est.flowFee ?? 0.0) as! @FlowToken.Vault

        // Schedule the transaction
        manager.schedule(
          handlerCap: handlerCap,
          data: data,
          timestamp: scheduledTime,
          priority: pr,
          executionEffort: executionEffort,
          fees: <-fees
        )

        log("Scheduled native resolution for market ".concat(marketId.toString()))
      }
    }
  `;

  const transactionId = await fcl.mutate({
    cadence: transactionCode,
    args: (arg: any, t: any) => [
      arg(marketId.toString(), t.UInt64),
      arg(scheduledTime.toFixed(1), t.UFix64),
      arg(oracleSourceEnum.toString(), t.UInt8),
      arg(priorityEnum.toString(), t.UInt8),
      arg(executionEffort.toString(), t.UInt64),
    ],
    limit: 9999,
  });

  return transactionId;
}

/**
 * Estimate fees for a scheduled resolution
 */
export async function estimateScheduleFee(params: {
  scheduledTime: number;
  priority?: SchedulePriority;
  executionEffort?: number;
}): Promise<{ flowFee: number; timestamp: number | null }> {
  const {
    scheduledTime,
    priority = SchedulePriority.MEDIUM,
    executionEffort = 10000,
  } = params;

  const priorityEnum = getPriorityEnum(priority);

  const scriptCode = `
    import FlowTransactionScheduler from ${FLOW_TX_SCHEDULER_ADDRESS}

    access(all) fun main(timestamp: UFix64, priority: UInt8, executionEffort: UInt64): {String: AnyStruct} {
      let pr = priority == 0
        ? FlowTransactionScheduler.Priority.High
        : priority == 1
        ? FlowTransactionScheduler.Priority.Medium
        : FlowTransactionScheduler.Priority.Low

      let est = FlowTransactionScheduler.estimate(
        data: nil,
        timestamp: timestamp,
        priority: pr,
        executionEffort: executionEffort
      )

      return {
        "flowFee": est.flowFee,
        "timestamp": est.timestamp,
        "error": est.error
      }
    }
  `;

  const result = await fcl.query({
    cadence: scriptCode,
    args: (arg: any, t: any) => [
      arg(scheduledTime.toFixed(1), t.UFix64),
      arg(priorityEnum.toString(), t.UInt8),
      arg(executionEffort.toString(), t.UInt64),
    ],
  });

  return {
    flowFee: result?.flowFee ? parseFloat(result.flowFee) : 0,
    timestamp: result?.timestamp ? parseFloat(result.timestamp) : null,
  };
}

// ============================================
// TRANSACTIONS (Custom ScheduledMarketResolver)
// ============================================

/**
 * Schedule a market resolution using the custom contract (legacy)
 */
export async function scheduleMarketResolution(params: {
  marketId: number;
  scheduledTime: number; // Unix timestamp
  oracleSource: OracleSource;
}): Promise<string> {
  const { marketId, scheduledTime, oracleSource } = params;

  // Convert oracle source to enum value
  const oracleSourceEnum = getOracleSourceEnum(oracleSource);

  const transactionCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    transaction(marketId: UInt64, scheduledTime: UFix64, oracleSource: UInt8) {
      let resolverRef: &ScheduledMarketResolver.Resolver

      prepare(signer: auth(BorrowValue, SaveValue) &Account) {
        // Check if resolver exists, if not create one
        if signer.storage.borrow<&ScheduledMarketResolver.Resolver>(
          from: ScheduledMarketResolver.ResolverStoragePath
        ) == nil {
          let resolver <- ScheduledMarketResolver.createResolver()
          signer.storage.save(<-resolver, to: ScheduledMarketResolver.ResolverStoragePath)
        }

        // Borrow resolver reference
        self.resolverRef = signer.storage.borrow<&ScheduledMarketResolver.Resolver>(
          from: ScheduledMarketResolver.ResolverStoragePath
        ) ?? panic("Failed to borrow resolver")
      }

      execute {
        let oracleSourceValue = oracleSource == 0 ? ScheduledMarketResolver.OracleSource.Kalshi :
                               oracleSource == 1 ? ScheduledMarketResolver.OracleSource.Polymarket :
                               ScheduledMarketResolver.OracleSource.Internal

        let resolutionId = self.resolverRef.scheduleResolution(
          marketId: marketId,
          scheduledTime: scheduledTime,
          oracleSource: oracleSourceValue
        )

        log("Scheduled resolution with ID: ".concat(resolutionId.toString()))
      }
    }
  `;

  const transactionId = await fcl.mutate({
    cadence: transactionCode,
    args: (arg: any, t: any) => [
      arg(marketId.toString(), t.UInt64),
      arg(scheduledTime.toFixed(1), t.UFix64),
      arg(oracleSourceEnum.toString(), t.UInt8),
    ],
    limit: 9999,
  });

  return transactionId;
}

/**
 * Resolve a scheduled market
 */
export async function resolveMarket(
  resolutionId: number,
  outcome: boolean
): Promise<string> {
  const transactionCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    transaction(resolutionId: UInt64, outcome: Bool) {
      let resolverAddress: Address

      prepare(signer: &Account) {
        self.resolverAddress = signer.address
      }

      execute {
        ScheduledMarketResolver.resolveMarket(
          resolutionId: resolutionId,
          outcome: outcome,
          resolver: self.resolverAddress
        )

        log("Resolved market with ID: ".concat(resolutionId.toString()))
      }
    }
  `;

  const transactionId = await fcl.mutate({
    cadence: transactionCode,
    args: (arg: any, t: any) => [
      arg(resolutionId.toString(), t.UInt64),
      arg(outcome, t.Bool),
    ],
    limit: 9999,
  });

  return transactionId;
}

/**
 * Cancel a scheduled resolution
 */
export async function cancelResolution(resolutionId: number): Promise<string> {
  const transactionCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    transaction(resolutionId: UInt64) {
      let resolverRef: &ScheduledMarketResolver.Resolver

      prepare(signer: auth(BorrowValue) &Account) {
        self.resolverRef = signer.storage.borrow<&ScheduledMarketResolver.Resolver>(
          from: ScheduledMarketResolver.ResolverStoragePath
        ) ?? panic("Resolver not found")
      }

      execute {
        self.resolverRef.cancelResolution(resolutionId: resolutionId)
        log("Cancelled resolution: ".concat(resolutionId.toString()))
      }
    }
  `;

  const transactionId = await fcl.mutate({
    cadence: transactionCode,
    args: (arg: any, t: any) => [
      arg(resolutionId.toString(), t.UInt64),
    ],
    limit: 9999,
  });

  return transactionId;
}

// ============================================
// SCRIPTS (READ-ONLY)
// ============================================

/**
 * Get all pending resolutions
 */
export async function getPendingResolutions(): Promise<ScheduledResolution[]> {
  const scriptCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    access(all) fun main(): [ScheduledMarketResolver.ScheduledResolution] {
      return ScheduledMarketResolver.getPendingResolutions()
    }
  `;

  const result = await fcl.query({
    cadence: scriptCode,
    args: (arg: any, t: any) => [],
  });

  return parseResolutions(result);
}

/**
 * Get resolutions ready to execute
 */
export async function getReadyResolutions(): Promise<ScheduledResolution[]> {
  const scriptCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    access(all) fun main(): [ScheduledMarketResolver.ScheduledResolution] {
      return ScheduledMarketResolver.getReadyResolutions()
    }
  `;

  const result = await fcl.query({
    cadence: scriptCode,
    args: (arg: any, t: any) => [],
  });

  return parseResolutions(result);
}

/**
 * Get a specific scheduled resolution
 */
export async function getScheduledResolution(resolutionId: number): Promise<ScheduledResolution | null> {
  const scriptCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    access(all) fun main(id: UInt64): ScheduledMarketResolver.ScheduledResolution? {
      return ScheduledMarketResolver.getScheduledResolution(id: id)
    }
  `;

  const result = await fcl.query({
    cadence: scriptCode,
    args: (arg: any, t: any) => [
      arg(resolutionId.toString(), t.UInt64),
    ],
  });

  if (!result) return null;
  return parseResolution(result);
}

/**
 * Get resolutions for a specific market
 */
export async function getMarketResolutions(marketId: number): Promise<ScheduledResolution[]> {
  const scriptCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    access(all) fun main(marketId: UInt64): [ScheduledMarketResolver.ScheduledResolution] {
      return ScheduledMarketResolver.getMarketResolutions(marketId: marketId)
    }
  `;

  const result = await fcl.query({
    cadence: scriptCode,
    args: (arg: any, t: any) => [
      arg(marketId.toString(), t.UInt64),
    ],
  });

  return parseResolutions(result);
}

/**
 * Check if an address is an authorized resolver
 */
export async function isResolver(address: string): Promise<boolean> {
  const scriptCode = `
    import ScheduledMarketResolver from ${SCHEDULED_MARKET_RESOLVER_ADDRESS}

    access(all) fun main(address: Address): Bool {
      return ScheduledMarketResolver.isResolver(address: address)
    }
  `;

  const result = await fcl.query({
    cadence: scriptCode,
    args: (arg: any, t: any) => [
      arg(address, t.Address),
    ],
  });

  return result;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getPriorityEnum(priority: SchedulePriority): number {
  switch (priority) {
    case SchedulePriority.HIGH:
      return 0;
    case SchedulePriority.MEDIUM:
      return 1;
    case SchedulePriority.LOW:
      return 2;
    default:
      return 1;
  }
}

function getOracleSourceEnum(source: OracleSource): number {
  switch (source) {
    case OracleSource.KALSHI:
      return 0;
    case OracleSource.POLYMARKET:
      return 1;
    case OracleSource.INTERNAL:
      return 2;
    default:
      return 2;
  }
}

function parseOracleSource(value: any): OracleSource {
  if (value === 0 || value.rawValue === '0') return OracleSource.KALSHI;
  if (value === 1 || value.rawValue === '1') return OracleSource.POLYMARKET;
  return OracleSource.INTERNAL;
}

function parseResolution(data: any): ScheduledResolution {
  return {
    id: data.id,
    marketId: data.marketId,
    scheduledTime: parseFloat(data.scheduledTime),
    oracleSource: parseOracleSource(data.oracleSource),
    creator: data.creator,
    resolved: data.resolved,
    cancelled: data.cancelled,
    outcome: data.outcome !== null ? data.outcome : undefined,
    createdAt: parseFloat(data.createdAt),
  };
}

function parseResolutions(data: any[]): ScheduledResolution[] {
  if (!Array.isArray(data)) return [];
  return data.map(parseResolution);
}

/**
 * Wait for transaction to be sealed
 */
export async function waitForSealed(transactionId: string): Promise<any> {
  return fcl.tx(transactionId).onceSealed();
}
