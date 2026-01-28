import ScheduledBattle from "../contracts/ScheduledBattle.cdc"

/**
 * Schedule a battle for future execution
 *
 * @param warrior1Id - ID of the first warrior NFT
 * @param warrior2Id - ID of the second warrior NFT
 * @param betAmount - Amount to bet on the battle
 * @param scheduledTime - Unix timestamp when battle should execute
 */
transaction(
    warrior1Id: UInt64,
    warrior2Id: UInt64,
    betAmount: UFix64,
    scheduledTime: UFix64
) {
    let scheduler: &ScheduledBattle.Scheduler

    prepare(signer: AuthAccount) {
        // Check if scheduler exists, create if not
        if signer.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath) == nil {
            let newScheduler <- ScheduledBattle.createScheduler()
            signer.save(<-newScheduler, to: ScheduledBattle.SchedulerStoragePath)
        }

        // Borrow scheduler reference
        self.scheduler = signer.borrow<&ScheduledBattle.Scheduler>(from: ScheduledBattle.SchedulerStoragePath)
            ?? panic("Could not borrow scheduler reference")
    }

    execute {
        let txId = self.scheduler.scheduleBattle(
            warrior1Id: warrior1Id,
            warrior2Id: warrior2Id,
            betAmount: betAmount,
            scheduledTime: scheduledTime
        )

        log("Battle scheduled with ID: ".concat(txId.toString()))
    }
}
