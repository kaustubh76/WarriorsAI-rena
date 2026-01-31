import EVMBridge from "../contracts/EVMBridge.cdc"

/**
 * Register an address as an authorized bridge operator.
 * Must be signed by the account that deployed EVMBridge (holds the Admin resource).
 *
 * Usage:
 *   flow transactions send cadence/transactions/admin_add_bridge_operator.cdc \
 *     --arg Address:0xSERVER_ACCOUNT_ADDRESS \
 *     --signer testnet-account \
 *     --network testnet
 *
 * @param operator - Flow address to authorize as a bridge operator
 */
transaction(operator: Address) {
    let admin: &EVMBridge.Admin

    prepare(signer: auth(Storage, BorrowValue) &Account) {
        self.admin = signer.storage.borrow<&EVMBridge.Admin>(
            from: EVMBridge.AdminStoragePath
        ) ?? panic("Admin resource not found. This transaction must be signed by the contract deployer.")
    }

    execute {
        self.admin.addBridgeOperator(address: operator)
        log("Added bridge operator: ".concat(operator.toString()))
    }
}
