import ScheduledVault from "../contracts/ScheduledVault.cdc"

/**
 * Register an address as an authorized vault cycle executor.
 * Must be signed by the account that deployed ScheduledVault (holds the Admin resource).
 *
 * Usage:
 *   flow transactions send cadence/transactions/admin_add_vault_executor.cdc \
 *     --arg Address:0xSERVER_ACCOUNT_ADDRESS \
 *     --signer testnet-account \
 *     --network testnet
 *
 * @param executor - Flow address to authorize as a vault executor
 */
transaction(executor: Address) {
    let admin: &ScheduledVault.Admin

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        self.admin = signer.storage.borrow<&ScheduledVault.Admin>(
            from: ScheduledVault.AdminStoragePath
        ) ?? panic("Admin resource not found. This transaction must be signed by the contract deployer.")
    }

    execute {
        self.admin.addExecutor(address: executor)
        log("Added vault executor: ".concat(executor.toString()))
    }
}
