/**
 * Create a Cadence Owned Account (COA) via the EVMBridge
 *
 * This transaction creates the Bridge resource (if not present)
 * and initializes the COA that allows Cadence to interact with Flow EVM.
 *
 * Must be signed by the contract deployer account.
 */

import "EVMBridge"

transaction {
    prepare(signer: auth(BorrowValue, SaveValue) &Account) {
        // Create Bridge resource if it doesn't exist
        if signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath) == nil {
            let bridge <- EVMBridge.createBridge()
            signer.storage.save(<-bridge, to: EVMBridge.BridgeStoragePath)
            log("Bridge resource created")
        }

        // Borrow the bridge and create COA
        let bridge = signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath)
            ?? panic("Could not borrow Bridge resource")

        bridge.createCOA()

        let evmAddress = bridge.getEVMAddress()
        log("COA created with EVM address: ".concat(evmAddress))
    }
}
