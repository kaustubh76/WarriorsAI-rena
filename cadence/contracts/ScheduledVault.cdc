/**
 * ScheduledVault Contract
 *
 * Enables scheduling of recurring vault yield cycles on Flow blockchain.
 * Each vault cycle triggers AI evaluation → rebalance → P&L recording.
 * Refactored from ScheduledBattle.cdc for DeFi strategy vaults.
 */

access(all) contract ScheduledVault {

    // Storage paths
    access(all) let AdminStoragePath: StoragePath
    access(all) let SchedulerStoragePath: StoragePath

    // Events
    access(all) event VaultScheduled(
        id: UInt64,
        nftId: UInt64,
        vaultAddress: String,
        cycleInterval: UFix64,
        scheduledTime: UFix64,
        creator: Address
    )

    access(all) event VaultCycleExecuted(
        id: UInt64,
        nftId: UInt64,
        cycleNumber: UInt64,
        executionTime: UFix64,
        executor: Address
    )

    access(all) event VaultCancelled(
        id: UInt64,
        cancelledBy: Address
    )

    access(all) event VaultRescheduled(
        id: UInt64,
        nextExecutionTime: UFix64
    )

    // Scheduled vault data structure
    access(all) struct ScheduledVaultEntry {
        access(all) let id: UInt64
        access(all) let nftId: UInt64
        access(all) let vaultAddress: String       // EVM hex address of StrategyVault
        access(all) let ownerAddress: String        // EVM hex address of vault owner
        access(all) let cycleInterval: UFix64       // seconds between cycles (86400.0 = daily)
        access(all) var nextExecutionTime: UFix64
        access(all) let creator: Address
        access(all) var cyclesExecuted: UInt64
        access(all) var active: Bool
        access(all) let createdAt: UFix64

        init(
            id: UInt64,
            nftId: UInt64,
            vaultAddress: String,
            ownerAddress: String,
            cycleInterval: UFix64,
            scheduledTime: UFix64,
            creator: Address
        ) {
            self.id = id
            self.nftId = nftId
            self.vaultAddress = vaultAddress
            self.ownerAddress = ownerAddress
            self.cycleInterval = cycleInterval
            self.nextExecutionTime = scheduledTime
            self.creator = creator
            self.cyclesExecuted = 0
            self.active = true
            self.createdAt = getCurrentBlock().timestamp
        }

        access(all) fun markCycleExecuted() {
            self.cyclesExecuted = self.cyclesExecuted + 1
            self.nextExecutionTime = self.nextExecutionTime + self.cycleInterval
        }

        access(all) fun markCancelled() {
            self.active = false
        }
    }

    // Contract state
    access(all) var scheduledVaults: {UInt64: ScheduledVaultEntry}
    access(all) var nextVaultId: UInt64
    access(contract) var executors: {Address: Bool}
    // Track vault by NFT ID for quick lookup
    access(all) var nftToVaultId: {UInt64: UInt64}

    // Scheduler resource for managing vault schedules
    access(all) resource Scheduler {
        access(all) fun scheduleVault(
            nftId: UInt64,
            vaultAddress: String,
            ownerAddress: String,
            cycleInterval: UFix64
        ): UInt64 {
            pre {
                cycleInterval > 0.0: "Cycle interval must be positive"
                ScheduledVault.nftToVaultId[nftId] == nil: "Vault already scheduled for this NFT"
            }

            let vaultId = ScheduledVault.nextVaultId
            let firstExecution = getCurrentBlock().timestamp + cycleInterval

            let entry = ScheduledVaultEntry(
                id: vaultId,
                nftId: nftId,
                vaultAddress: vaultAddress,
                ownerAddress: ownerAddress,
                cycleInterval: cycleInterval,
                scheduledTime: firstExecution,
                creator: self.owner!.address
            )

            ScheduledVault.scheduledVaults[vaultId] = entry
            ScheduledVault.nftToVaultId[nftId] = vaultId
            ScheduledVault.nextVaultId = ScheduledVault.nextVaultId + 1

            emit VaultScheduled(
                id: vaultId,
                nftId: nftId,
                vaultAddress: vaultAddress,
                cycleInterval: cycleInterval,
                scheduledTime: firstExecution,
                creator: self.owner!.address
            )

            return vaultId
        }

        access(all) fun cancelVault(vaultId: UInt64) {
            pre {
                ScheduledVault.scheduledVaults[vaultId] != nil: "Vault not found"
            }

            let entry = ScheduledVault.scheduledVaults[vaultId]!
            assert(entry.creator == self.owner!.address, message: "Only creator can cancel")
            assert(entry.active, message: "Vault already cancelled")

            entry.markCancelled()
            ScheduledVault.scheduledVaults[vaultId] = entry
            ScheduledVault.nftToVaultId.remove(key: entry.nftId)

            emit VaultCancelled(
                id: vaultId,
                cancelledBy: self.owner!.address
            )
        }
    }

    // Admin resource for managing executors
    access(all) resource Admin {
        access(all) fun addExecutor(address: Address) {
            ScheduledVault.executors[address] = true
        }

        access(all) fun removeExecutor(address: Address) {
            ScheduledVault.executors.remove(key: address)
        }
    }

    // Public functions

    /// Execute a vault yield cycle when its time has arrived
    access(all) fun executeVaultCycle(vaultId: UInt64, executor: Address): UInt64 {
        pre {
            self.scheduledVaults[vaultId] != nil: "Vault not found"
            self.executors[executor] == true: "Unauthorized executor"
        }

        let entry = self.scheduledVaults[vaultId]!

        assert(
            getCurrentBlock().timestamp >= entry.nextExecutionTime,
            message: "Too early to execute - scheduled time not reached"
        )
        assert(entry.active, message: "Vault is not active")

        // Mark cycle executed and schedule next
        entry.markCycleExecuted()
        self.scheduledVaults[vaultId] = entry

        emit VaultCycleExecuted(
            id: vaultId,
            nftId: entry.nftId,
            cycleNumber: entry.cyclesExecuted,
            executionTime: getCurrentBlock().timestamp,
            executor: executor
        )

        emit VaultRescheduled(
            id: vaultId,
            nextExecutionTime: entry.nextExecutionTime
        )

        return entry.cyclesExecuted
    }

    /// Get a scheduled vault entry by ID
    access(all) fun getScheduledVault(id: UInt64): ScheduledVaultEntry? {
        return self.scheduledVaults[id]
    }

    /// Get vault entry by NFT ID
    access(all) fun getVaultByNFTId(nftId: UInt64): ScheduledVaultEntry? {
        if let vaultId = self.nftToVaultId[nftId] {
            return self.scheduledVaults[vaultId]
        }
        return nil
    }

    /// Get all active vaults
    access(all) fun getActiveVaults(): [ScheduledVaultEntry] {
        let active: [ScheduledVaultEntry] = []
        for entry in self.scheduledVaults.values {
            if entry.active {
                active.append(entry)
            }
        }
        return active
    }

    /// Get vaults ready to execute (time has arrived)
    access(all) fun getReadyVaults(): [ScheduledVaultEntry] {
        let ready: [ScheduledVaultEntry] = []
        let currentTime = getCurrentBlock().timestamp
        for entry in self.scheduledVaults.values {
            if entry.active && entry.nextExecutionTime <= currentTime {
                ready.append(entry)
            }
        }
        return ready
    }

    /// Check if an address is an authorized executor
    access(all) fun isExecutor(address: Address): Bool {
        return self.executors[address] ?? false
    }

    /// Create a scheduler resource for an account
    access(all) fun createScheduler(): @Scheduler {
        return <- create Scheduler()
    }

    init() {
        self.scheduledVaults = {}
        self.nextVaultId = 0
        self.executors = {}
        self.nftToVaultId = {}

        self.AdminStoragePath = /storage/ScheduledVaultAdmin
        self.SchedulerStoragePath = /storage/ScheduledVaultScheduler

        let admin <- create Admin()
        self.account.storage.save(<-admin, to: self.AdminStoragePath)

        self.executors[self.account.address] = true
    }
}
