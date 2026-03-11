/**
 * Server-Side Cadence Client for ScheduledVault
 * @layer Cadence — Flow native layer (NOT Flow EVM)
 *
 * Provides server-side wrapper for querying and executing vault yield cycles
 * on the ScheduledVault Cadence contract. Used by cron jobs and automated routes.
 *
 * Pattern: lazy imports of serverAuth.ts, withTimeout wrappers, fcl.query for
 * scripts, fcl.mutate with serverAuthz for transactions.
 */

import * as fcl from '@onflow/fcl';

// ============================================
// TYPES
// ============================================

export interface CadenceVaultEntry {
  id: number;
  nftId: number;
  vaultAddress: string;
  ownerAddress: string;
  cycleInterval: number;    // seconds
  nextExecutionTime: number; // unix timestamp
  cyclesExecuted: number;
  active: boolean;
  createdAt: number;         // unix timestamp
}

// ============================================
// HELPERS
// ============================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  errorMessage: string = 'Vault scheduler operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Parse a Cadence ScheduledVaultEntry struct into our TS interface.
 * UFix64 → parseFloat, UInt64 → parseInt, Bool stays bool, String stays string.
 */
function parseCadenceVaultEntry(raw: any): CadenceVaultEntry {
  if (!raw || raw.id === undefined || raw.nftId === undefined || raw.vaultAddress === undefined) {
    throw new Error('Invalid Cadence vault entry: missing required fields (id, nftId, or vaultAddress)');
  }
  return {
    id: parseInt(raw.id, 10),
    nftId: parseInt(raw.nftId, 10),
    vaultAddress: raw.vaultAddress,
    ownerAddress: raw.ownerAddress,
    cycleInterval: parseFloat(raw.cycleInterval),
    nextExecutionTime: parseFloat(raw.nextExecutionTime),
    cyclesExecuted: parseInt(raw.cyclesExecuted, 10),
    active: raw.active,
    createdAt: parseFloat(raw.createdAt),
  };
}

// ============================================
// SERVER-SIDE FUNCTIONS
// ============================================

/**
 * Check if the ScheduledVault contract is deployed and accessible.
 * Returns false if contract address not configured or query fails.
 */
export async function isVaultSchedulerAvailable(): Promise<boolean> {
  try {
    const { isServerFlowConfigured } = await import('./serverAuth');
    if (!isServerFlowConfigured()) return false;

    const { configureServerFCL, getContractAddress, getServerAddress } = await import('./serverAuth');
    configureServerFCL();
    const contractAddress = getContractAddress();
    const serverAddress = getServerAddress();

    // Verify contract is deployed AND our server is an authorized executor
    const result = await withTimeout(
      fcl.query({
        cadence: `
          import ScheduledVault from ${contractAddress}

          access(all) fun main(executorAddr: Address): Bool {
            return ScheduledVault.isExecutor(address: executorAddr)
          }
        `,
        args: (arg: any, t: any) => [arg(serverAddress, t.Address)],
      }),
      10000,
      'Vault scheduler health check timed out'
    );

    return result === true;
  } catch {
    return false;
  }
}

/**
 * Get all vaults whose nextExecutionTime has passed (ready to execute).
 * Used by the cron job to find vaults that need their yield cycle run.
 */
export async function getReadyVaultsFromCadence(): Promise<CadenceVaultEntry[]> {
  try {
    const { configureServerFCL, getContractAddress } = await import('./serverAuth');
    configureServerFCL();
    const contractAddress = getContractAddress();

    const result = await withTimeout(
      fcl.query({
        cadence: `
          import ScheduledVault from ${contractAddress}

          access(all) fun main(): [ScheduledVault.ScheduledVaultEntry] {
            return ScheduledVault.getReadyVaults()
          }
        `,
      }),
      30000,
      'getReadyVaults query timed out'
    );

    if (!result || !Array.isArray(result)) return [];
    return result.map(parseCadenceVaultEntry);
  } catch (error) {
    console.error('[VaultScheduler] getReadyVaults failed:', error);
    return [];
  }
}

/**
 * Mark a vault cycle as executed on Cadence after successful EVM rebalance.
 * Increments cyclesExecuted and reschedules nextExecutionTime.
 *
 * Non-fatal — caller should wrap in try/catch. DB is already updated by the time
 * this is called, so Cadence is best-effort sync.
 */
export async function executeVaultCycleOnCadence(vaultId: number): Promise<string> {
  const { createServerAuthorization, configureServerFCL, getContractAddress, getServerAddress } =
    await import('./serverAuth');

  configureServerFCL();

  const serverAuthz = createServerAuthorization();
  const contractAddress = getContractAddress();
  const serverAddress = getServerAddress();

  const transactionCode = `
    import ScheduledVault from ${contractAddress}

    transaction(vaultId: UInt64, executorAddress: Address) {
      prepare(signer: &Account) {}

      execute {
        ScheduledVault.executeVaultCycle(
          vaultId: vaultId,
          executor: executorAddress
        )

        log("Executed vault cycle for vault ID: ".concat(vaultId.toString()))
      }
    }
  `;

  const transactionId = await withTimeout(
    fcl.mutate({
      cadence: transactionCode,
      args: (arg: any, t: any) => [
        arg(vaultId.toString(), t.UInt64),
        arg(serverAddress, t.Address),
      ],
      proposer: serverAuthz,
      payer: serverAuthz,
      authorizations: [serverAuthz],
      limit: 9999,
    }),
    30000,
    'executeVaultCycle transaction timed out'
  );

  // Wait for sealing (best-effort — DB is already updated by caller)
  try {
    await withTimeout(
      fcl.tx(transactionId).onceSealed(),
      30000,
      'executeVaultCycle seal timed out'
    );
  } catch (sealError) {
    console.warn(`[VaultScheduler] TX ${transactionId} submitted but seal timed out:`, sealError);
  }

  return transactionId;
}

/**
 * Query a single vault's schedule status by NFT ID.
 * Returns null if no vault is scheduled for this NFT.
 */
export async function queryVaultStatusFromCadence(nftId: number): Promise<CadenceVaultEntry | null> {
  try {
    const { configureServerFCL, getContractAddress } = await import('./serverAuth');
    configureServerFCL();
    const contractAddress = getContractAddress();

    const result = await withTimeout(
      fcl.query({
        cadence: `
          import ScheduledVault from ${contractAddress}

          access(all) fun main(nftId: UInt64): ScheduledVault.ScheduledVaultEntry? {
            return ScheduledVault.getVaultByNFTId(nftId: nftId)
          }
        `,
        args: (arg: any, t: any) => [arg(nftId.toString(), t.UInt64)],
      }),
      30000,
      'queryVaultStatus query timed out'
    );

    if (!result) return null;
    return parseCadenceVaultEntry(result);
  } catch (error) {
    console.error('[VaultScheduler] queryVaultStatus failed for NFT', nftId, error);
    return null;
  }
}

/**
 * Get all active vaults (for monitoring/admin dashboard).
 */
export async function getActiveVaultsFromCadence(): Promise<CadenceVaultEntry[]> {
  try {
    const { configureServerFCL, getContractAddress } = await import('./serverAuth');
    configureServerFCL();
    const contractAddress = getContractAddress();

    const result = await withTimeout(
      fcl.query({
        cadence: `
          import ScheduledVault from ${contractAddress}

          access(all) fun main(): [ScheduledVault.ScheduledVaultEntry] {
            return ScheduledVault.getActiveVaults()
          }
        `,
      }),
      30000,
      'getActiveVaults query timed out'
    );

    if (!result || !Array.isArray(result)) return [];
    return result.map(parseCadenceVaultEntry);
  } catch (error) {
    console.error('[VaultScheduler] getActiveVaults failed:', error);
    return [];
  }
}
