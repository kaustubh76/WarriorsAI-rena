import ScheduledVault from "../contracts/ScheduledVault.cdc"

/// Schedule a vault for recurring yield cycles.
/// The signer must have a Scheduler resource saved.
transaction(
    nftId: UInt64,
    vaultAddress: String,
    ownerAddress: String,
    cycleInterval: UFix64
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Create scheduler if it doesn't exist
        if signer.storage.borrow<&ScheduledVault.Scheduler>(from: ScheduledVault.SchedulerStoragePath) == nil {
            let scheduler <- ScheduledVault.createScheduler()
            signer.storage.save(<-scheduler, to: ScheduledVault.SchedulerStoragePath)
        }

        let scheduler = signer.storage.borrow<&ScheduledVault.Scheduler>(from: ScheduledVault.SchedulerStoragePath)
            ?? panic("Could not borrow Scheduler resource")

        let vaultId = scheduler.scheduleVault(
            nftId: nftId,
            vaultAddress: vaultAddress,
            ownerAddress: ownerAddress,
            cycleInterval: cycleInterval
        )

        log("Vault scheduled with ID: ".concat(vaultId.toString()))
    }
}
