/**
 * Execute a scheduled EVM call via the EVMBridge
 *
 * Executes a previously scheduled EVM call when its time has arrived.
 * The signer must own the Bridge resource with the scheduled call.
 *
 * @param callId - UInt64 ID of the scheduled call to execute
 */

import "EVMBridge"

transaction(callId: UInt64) {
    prepare(signer: auth(BorrowValue) &Account) {
        let bridge = signer.storage.borrow<&EVMBridge.Bridge>(from: EVMBridge.BridgeStoragePath)
            ?? panic("Bridge resource not found")

        let success = bridge.executeEVMCall(callId: callId)

        if success {
            log("EVM call ".concat(callId.toString()).concat(" executed successfully"))
        } else {
            log("EVM call ".concat(callId.toString()).concat(" failed"))
        }
    }
}
