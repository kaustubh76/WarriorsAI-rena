import ScheduledMarketResolver from "../contracts/ScheduledMarketResolver.cdc"

/**
 * Query all pending scheduled market resolutions
 *
 * Returns array of all market resolutions that are scheduled but not yet executed or cancelled
 */
access(all) fun main(): [ScheduledMarketResolver.ScheduledResolution] {
    return ScheduledMarketResolver.getPendingResolutions()
}
