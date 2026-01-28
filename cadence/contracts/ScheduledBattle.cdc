/**
 * ScheduledBattle Contract
 *
 * Enables scheduling of future battle executions on Flow blockchain.
 * Battles can be scheduled for specific timestamps and executed when ready.
 */

access(all) contract ScheduledBattle {

    // Storage paths
    access(all) let AdminStoragePath: StoragePath
    access(all) let SchedulerStoragePath: StoragePath

    // Events
    access(all) event BattleScheduled(
        id: UInt64,
        warrior1Id: UInt64,
        warrior2Id: UInt64,
        betAmount: UFix64,
        scheduledTime: UFix64,
        creator: Address
    )

    access(all) event BattleExecuted(
        id: UInt64,
        executionTime: UFix64,
        winner: UInt64,
        executor: Address
    )

    access(all) event BattleCancelled(
        id: UInt64,
        cancelledBy: Address
    )

    // Scheduled transaction data structure
    access(all) struct ScheduledTransaction {
        access(all) let id: UInt64
        access(all) let warrior1Id: UInt64
        access(all) let warrior2Id: UInt64
        access(all) let betAmount: UFix64
        access(all) let scheduledTime: UFix64
        access(all) let creator: Address
        access(all) var executed: Bool
        access(all) var cancelled: Bool
        access(all) let createdAt: UFix64

        init(
            id: UInt64,
            warrior1Id: UInt64,
            warrior2Id: UInt64,
            betAmount: UFix64,
            scheduledTime: UFix64,
            creator: Address
        ) {
            self.id = id
            self.warrior1Id = warrior1Id
            self.warrior2Id = warrior2Id
            self.betAmount = betAmount
            self.scheduledTime = scheduledTime
            self.creator = creator
            self.executed = false
            self.cancelled = false
            self.createdAt = getCurrentBlock().timestamp
        }

        access(all) fun markExecuted() {
            self.executed = true
        }

        access(all) fun markCancelled() {
            self.cancelled = true
        }
    }

    // Contract state
    access(all) var scheduledTransactions: {UInt64: ScheduledTransaction}
    access(all) var nextTransactionId: UInt64
    access(contract) var executors: {Address: Bool}

    // Scheduler resource for managing scheduled battles
    access(all) resource Scheduler {
        access(all) fun scheduleBattle(
            warrior1Id: UInt64,
            warrior2Id: UInt64,
            betAmount: UFix64,
            scheduledTime: UFix64
        ): UInt64 {
            pre {
                scheduledTime > getCurrentBlock().timestamp: "Scheduled time must be in the future"
                betAmount > 0.0: "Bet amount must be positive"
                warrior1Id != warrior2Id: "Warriors must be different"
            }

            let txId = ScheduledBattle.nextTransactionId
            let tx = ScheduledTransaction(
                id: txId,
                warrior1Id: warrior1Id,
                warrior2Id: warrior2Id,
                betAmount: betAmount,
                scheduledTime: scheduledTime,
                creator: self.owner!.address
            )

            ScheduledBattle.scheduledTransactions[txId] = tx
            ScheduledBattle.nextTransactionId = ScheduledBattle.nextTransactionId + 1

            emit BattleScheduled(
                id: txId,
                warrior1Id: warrior1Id,
                warrior2Id: warrior2Id,
                betAmount: betAmount,
                scheduledTime: scheduledTime,
                creator: self.owner!.address
            )

            return txId
        }

        access(all) fun cancelBattle(transactionId: UInt64) {
            pre {
                ScheduledBattle.scheduledTransactions[transactionId] != nil: "Transaction not found"
            }

            let tx = ScheduledBattle.scheduledTransactions[transactionId]!
            assert(tx.creator == self.owner!.address, message: "Only creator can cancel")
            assert(!tx.executed, message: "Cannot cancel executed battle")
            assert(!tx.cancelled, message: "Already cancelled")

            tx.markCancelled()
            ScheduledBattle.scheduledTransactions[transactionId] = tx

            emit BattleCancelled(
                id: transactionId,
                cancelledBy: self.owner!.address
            )
        }
    }

    // Admin resource for managing executors
    access(all) resource Admin {
        access(all) fun addExecutor(address: Address) {
            ScheduledBattle.executors[address] = true
        }

        access(all) fun removeExecutor(address: Address) {
            ScheduledBattle.executors.remove(key: address)
        }
    }

    // Public functions

    /**
     * Execute a scheduled battle when its time has arrived
     * Can be called by any authorized executor
     */
    access(all) fun executeBattle(transactionId: UInt64, executor: Address): UInt64 {
        pre {
            self.scheduledTransactions[transactionId] != nil: "Transaction not found"
            self.executors[executor] == true: "Unauthorized executor"
        }

        let tx = self.scheduledTransactions[transactionId]!

        assert(
            getCurrentBlock().timestamp >= tx.scheduledTime,
            message: "Too early to execute - scheduled time not reached"
        )

        assert(!tx.executed, message: "Battle already executed")
        assert(!tx.cancelled, message: "Battle was cancelled")

        // Mark as executed
        tx.markExecuted()
        self.scheduledTransactions[transactionId] = tx

        // Simulate battle outcome (random winner)
        // In production, this would integrate with VRF or battle logic
        let blockHeight = getCurrentBlock().height
        let winner = (blockHeight % 2 == 0) ? tx.warrior1Id : tx.warrior2Id

        emit BattleExecuted(
            id: transactionId,
            executionTime: getCurrentBlock().timestamp,
            winner: winner,
            executor: executor
        )

        return winner
    }

    /**
     * Get a scheduled transaction by ID
     */
    access(all) fun getScheduledTransaction(id: UInt64): ScheduledTransaction? {
        return self.scheduledTransactions[id]
    }

    /**
     * Get all pending (not executed, not cancelled) transactions
     */
    access(all) fun getPendingTransactions(): [ScheduledTransaction] {
        let pending: [ScheduledTransaction] = []

        for tx in self.scheduledTransactions.values {
            if !tx.executed && !tx.cancelled {
                pending.append(tx)
            }
        }

        return pending
    }

    /**
     * Get transactions ready to execute (time has arrived)
     */
    access(all) fun getReadyTransactions(): [ScheduledTransaction] {
        let ready: [ScheduledTransaction] = []
        let currentTime = getCurrentBlock().timestamp

        for tx in self.scheduledTransactions.values {
            if !tx.executed && !tx.cancelled && tx.scheduledTime <= currentTime {
                ready.append(tx)
            }
        }

        return ready
    }

    /**
     * Check if an address is an authorized executor
     */
    access(all) fun isExecutor(address: Address): Bool {
        return self.executors[address] ?? false
    }

    /**
     * Create a scheduler resource for an account
     */
    access(all) fun createScheduler(): @Scheduler {
        return <- create Scheduler()
    }

    init() {
        self.scheduledTransactions = {}
        self.nextTransactionId = 0
        self.executors = {}

        // Set storage paths
        self.AdminStoragePath = /storage/ScheduledBattleAdmin
        self.SchedulerStoragePath = /storage/ScheduledBattleScheduler

        // Create and save admin resource
        let admin <- create Admin()
        self.account.storage.save(<-admin, to: self.AdminStoragePath)

        // Make contract account an authorized executor
        self.executors[self.account.address] = true
    }
}
