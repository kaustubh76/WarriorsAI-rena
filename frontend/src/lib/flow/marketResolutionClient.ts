/**
 * Flow Cadence Client for ScheduledMarketResolver
 * Provides TypeScript wrapper for scheduling and executing market resolutions
 */

import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';

// Contract addresses (will be loaded from flow.json)
const SCHEDULED_MARKET_RESOLVER_ADDRESS = process.env.NEXT_PUBLIC_SCHEDULED_MARKET_RESOLVER_ADDRESS || '0xf8d6e0586b0a20c7';

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

// ============================================
// TRANSACTIONS
// ============================================

/**
 * Schedule a market resolution
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
      prepare(signer: &Account) {}

      execute {
        ScheduledMarketResolver.resolveMarket(
          resolutionId: resolutionId,
          outcome: outcome,
          resolver: signer.address
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
