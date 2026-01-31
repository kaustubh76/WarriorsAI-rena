import ScheduledMarketResolver from "../contracts/ScheduledMarketResolver.cdc"

/**
 * Register an address as an authorized market resolver.
 * Must be signed by the account that deployed ScheduledMarketResolver (holds the Admin resource).
 *
 * Usage:
 *   flow transactions send cadence/transactions/admin_add_resolver.cdc \
 *     --arg Address:0xSERVER_ACCOUNT_ADDRESS \
 *     --signer testnet-account \
 *     --network testnet
 *
 * @param resolver - Flow address to authorize as a market resolver
 */
transaction(resolver: Address) {
    let admin: &ScheduledMarketResolver.Admin

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        self.admin = signer.storage.borrow<&ScheduledMarketResolver.Admin>(
            from: ScheduledMarketResolver.AdminStoragePath
        ) ?? panic("Admin resource not found. This transaction must be signed by the contract deployer.")
    }

    execute {
        self.admin.addResolver(address: resolver)
        log("Added resolver: ".concat(resolver.toString()))
    }
}
