import ScheduledBattle from "../contracts/ScheduledBattle.cdc"

/**
 * Query battles that are ready to execute
 *
 * Returns array of battles whose scheduled time has arrived
 */
access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
    return ScheduledBattle.getReadyTransactions()
}
