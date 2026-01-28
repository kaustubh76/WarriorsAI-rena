/**
 * EVMBridge Contract
 *
 * Bridges Cadence scheduled transactions to Flow EVM contracts.
 * Uses Cadence Owned Accounts (COA) to interact with EVM layer.
 */

import "EVM"
import "FlowToken"
import "FungibleToken"

access(all) contract EVMBridge {

    // Storage paths
    access(all) let AdminStoragePath: StoragePath
    access(all) let BridgeStoragePath: StoragePath

    // Events
    access(all) event EVMCallScheduled(
        id: UInt64,
        evmContractAddress: String,
        functionSignature: String,
        scheduledTime: UFix64
    )

    access(all) event EVMCallExecuted(
        id: UInt64,
        evmContractAddress: String,
        success: Bool,
        executionTime: UFix64
    )

    access(all) event COACreated(
        owner: Address,
        evmAddress: String
    )

    // Scheduled EVM call structure
    access(all) struct ScheduledEVMCall {
        access(all) let id: UInt64
        access(all) let evmContractAddress: String
        access(all) let functionSignature: String
        access(all) let callData: [UInt8]
        access(all) let value: UInt64
        access(all) let scheduledTime: UFix64
        access(all) let creator: Address
        access(all) var executed: Bool
        access(all) let createdAt: UFix64

        init(
            id: UInt64,
            evmContractAddress: String,
            functionSignature: String,
            callData: [UInt8],
            value: UInt64,
            scheduledTime: UFix64,
            creator: Address
        ) {
            self.id = id
            self.evmContractAddress = evmContractAddress
            self.functionSignature = functionSignature
            self.callData = callData
            self.value = value
            self.scheduledTime = scheduledTime
            self.creator = creator
            self.executed = false
            self.createdAt = getCurrentBlock().timestamp
        }

        access(all) fun markExecuted() {
            self.executed = true
        }
    }

    // Contract state
    access(all) var scheduledCalls: {UInt64: ScheduledEVMCall}
    access(all) var nextCallId: UInt64
    access(contract) var bridgeOperators: {Address: Bool}

    // Bridge resource for managing COA and EVM calls
    access(all) resource Bridge {
        // Cadence Owned Account for EVM interactions
        access(self) var coa: @EVM.CadenceOwnedAccount?

        init() {
            self.coa <- nil
        }

        /**
         * Create a Cadence Owned Account (COA) if not exists
         * COA allows this Cadence contract to interact with EVM
         */
        access(all) fun createCOA() {
            pre {
                self.coa == nil: "COA already exists"
            }

            self.coa <-! EVM.createCadenceOwnedAccount()

            let evmAddress = self.coa?.address()?.toString() ?? "unknown"

            emit COACreated(
                owner: self.owner!.address,
                evmAddress: evmAddress
            )
        }

        /**
         * Get the EVM address of this bridge's COA
         */
        access(all) fun getEVMAddress(): String {
            if let coa = &self.coa as &EVM.CadenceOwnedAccount? {
                return coa.address().toString()
            }
            return ""
        }

        /**
         * Schedule an EVM contract call
         */
        access(all) fun scheduleEVMCall(
            evmContractAddress: String,
            functionSignature: String,
            callData: [UInt8],
            value: UInt64,
            scheduledTime: UFix64
        ): UInt64 {
            pre {
                scheduledTime > getCurrentBlock().timestamp: "Scheduled time must be in the future"
                self.coa != nil: "COA not created - call createCOA() first"
            }

            let callId = EVMBridge.nextCallId
            let call = ScheduledEVMCall(
                id: callId,
                evmContractAddress: evmContractAddress,
                functionSignature: functionSignature,
                callData: callData,
                value: value,
                scheduledTime: scheduledTime,
                creator: self.owner!.address
            )

            EVMBridge.scheduledCalls[callId] = call
            EVMBridge.nextCallId = EVMBridge.nextCallId + 1

            emit EVMCallScheduled(
                id: callId,
                evmContractAddress: evmContractAddress,
                functionSignature: functionSignature,
                scheduledTime: scheduledTime
            )

            return callId
        }

        /**
         * Execute a scheduled EVM call when its time arrives
         */
        access(all) fun executeEVMCall(callId: UInt64): Bool {
            pre {
                EVMBridge.scheduledCalls[callId] != nil: "Scheduled call not found"
                self.coa != nil: "COA not created"
            }

            let call = EVMBridge.scheduledCalls[callId]!

            assert(
                getCurrentBlock().timestamp >= call.scheduledTime,
                message: "Too early to execute - scheduled time not reached"
            )

            assert(!call.executed, message: "Call already executed")

            // Convert hex address string to EVM address
            let evmAddress = EVM.addressFromString(call.evmContractAddress)

            // Execute the call through COA
            let coaRef = &self.coa as auth(EVM.Call) &EVM.CadenceOwnedAccount?
            let balance = EVM.Balance(attoflow: UInt(call.value))

            let result = coaRef?.call(
                to: evmAddress,
                data: call.callData,
                gasLimit: 300000, // Standard gas limit
                value: balance
            )

            // Mark as executed
            call.markExecuted()
            EVMBridge.scheduledCalls[callId] = call

            let success = result?.status == EVM.Status.successful

            emit EVMCallExecuted(
                id: callId,
                evmContractAddress: call.evmContractAddress,
                success: success,
                executionTime: getCurrentBlock().timestamp
            )

            return success
        }

        /**
         * Fund the COA with FLOW (converted to EVM balance)
         */
        access(all) fun fundCOA(from: @FlowToken.Vault) {
            pre {
                self.coa != nil: "COA not created"
            }

            // Borrow COA reference and deposit
            let coaRef = (&self.coa as &EVM.CadenceOwnedAccount?)!
            coaRef.deposit(from: <-from)
        }
    }

    // Admin resource
    access(all) resource Admin {
        access(all) fun addBridgeOperator(address: Address) {
            EVMBridge.bridgeOperators[address] = true
        }

        access(all) fun removeBridgeOperator(address: Address) {
            EVMBridge.bridgeOperators.remove(key: address)
        }
    }

    // Public functions

    /**
     * Get a scheduled call by ID
     */
    access(all) fun getScheduledCall(id: UInt64): ScheduledEVMCall? {
        return self.scheduledCalls[id]
    }

    /**
     * Get all pending (not executed) calls
     */
    access(all) fun getPendingCalls(): [ScheduledEVMCall] {
        let pending: [ScheduledEVMCall] = []

        for call in self.scheduledCalls.values {
            if !call.executed {
                pending.append(call)
            }
        }

        return pending
    }

    /**
     * Get calls ready to execute (time has arrived)
     */
    access(all) fun getReadyCalls(): [ScheduledEVMCall] {
        let ready: [ScheduledEVMCall] = []
        let currentTime = getCurrentBlock().timestamp

        for call in self.scheduledCalls.values {
            if !call.executed && call.scheduledTime <= currentTime {
                ready.append(call)
            }
        }

        return ready
    }

    /**
     * Check if an address is an authorized bridge operator
     */
    access(all) fun isBridgeOperator(address: Address): Bool {
        return self.bridgeOperators[address] ?? false
    }

    /**
     * Create a bridge resource for an account
     */
    access(all) fun createBridge(): @Bridge {
        return <- create Bridge()
    }

    init() {
        self.scheduledCalls = {}
        self.nextCallId = 0
        self.bridgeOperators = {}

        // Set storage paths
        self.AdminStoragePath = /storage/EVMBridgeAdmin
        self.BridgeStoragePath = /storage/EVMBridge

        // Create and save admin resource
        let admin <- create Admin()
        self.account.storage.save(<-admin, to: self.AdminStoragePath)

        // Make contract account an authorized operator
        self.bridgeOperators[self.account.address] = true
    }
}
