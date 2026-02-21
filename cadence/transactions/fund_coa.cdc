/**
 * Fund the EVMBridge COA with FLOW tokens
 *
 * Deposits FLOW from the signer's vault into the COA's EVM balance.
 * The COA must already be created via create_coa.cdc.
 *
 * @param amount - UFix64 amount of FLOW to deposit
 */

import "EVMBridge"
import "FlowToken"
import "FungibleToken"

transaction(amount: UFix64) {
    prepare(signer: auth(BorrowValue) &Account) {
        // Borrow the bridge resource
        let bridge = signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath)
            ?? panic("Bridge resource not found — run create_coa first")

        // Borrow the FLOW vault
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW vault")

        // Withdraw the requested amount
        let flowVault <- vaultRef.withdraw(amount: amount) as! @FlowToken.Vault

        // Fund the COA
        bridge.fundCOA(from: <-flowVault)

        log("Funded COA with ".concat(amount.toString()).concat(" FLOW"))
    }
}
