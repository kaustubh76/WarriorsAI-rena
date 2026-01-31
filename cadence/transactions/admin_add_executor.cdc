import ScheduledBattle from "../contracts/ScheduledBattle.cdc"

/**
 * Register an address as an authorized battle executor.
 * Must be signed by the account that deployed ScheduledBattle (holds the Admin resource).
 *
 * Usage:
 *   flow transactions send cadence/transactions/admin_add_executor.cdc \
 *     --arg Address:0xSERVER_ACCOUNT_ADDRESS \
 *     --signer testnet-account \
 *     --network testnet
 *
 * @param executor - Flow address to authorize as a battle executor
 */
transaction(executor: Address) {
    let admin: &ScheduledBattle.Admin

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        self.admin = signer.storage.borrow<&ScheduledBattle.Admin>(
            from: ScheduledBattle.AdminStoragePath
        ) ?? panic("Admin resource not found. This transaction must be signed by the contract deployer.")
    }

    execute {
        self.admin.addExecutor(address: executor)
        log("Added executor: ".concat(executor.toString()))
    }
}
