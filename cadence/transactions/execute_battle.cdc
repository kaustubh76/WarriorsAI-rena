import ScheduledBattle from "../contracts/ScheduledBattle.cdc"

/**
 * Execute a scheduled battle that is ready
 *
 * @param transactionId - ID of the scheduled battle to execute
 */
transaction(transactionId: UInt64) {
    prepare(signer: AuthAccount) {
        // Verify signer is an authorized executor
        assert(
            ScheduledBattle.isExecutor(address: signer.address),
            message: "Signer is not an authorized executor"
        )
    }

    execute {
        let winner = ScheduledBattle.executeBattle(
            transactionId: transactionId,
            executor: self.account.address
        )

        log("Battle executed! Winner: Warrior #".concat(winner.toString()))
    }
}
