import ScheduledBattle from "../contracts/ScheduledBattle.cdc"

/**
 * Execute a scheduled battle that is ready (Cadence 1.0)
 *
 * @param transactionId - ID of the scheduled battle to execute
 */
transaction(transactionId: UInt64) {
    let executorAddress: Address

    prepare(signer: auth(Storage) &Account) {
        // Capture signer address in prepare block (required in Cadence 1.0)
        self.executorAddress = signer.address

        // Verify signer is an authorized executor
        assert(
            ScheduledBattle.isExecutor(address: signer.address),
            message: "Signer is not an authorized executor"
        )
    }

    execute {
        let winner = ScheduledBattle.executeBattle(
            transactionId: transactionId,
            executor: self.executorAddress
        )

        log("Battle executed! Winner: Warrior #".concat(winner.toString()))
    }
}
