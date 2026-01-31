import ScheduledBattle from "../contracts/ScheduledBattle.cdc"

/**
 * Query all pending scheduled battles
 *
 * Returns array of all battles that are scheduled but not yet executed or cancelled
 */
access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
    return ScheduledBattle.getPendingTransactions()
}
