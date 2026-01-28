/**
 * ScheduledMarketResolver Contract
 *
 * Enables scheduling of automatic prediction market resolutions.
 * Integrates with external oracles (Kalshi, Polymarket) for market outcomes.
 */

access(all) contract ScheduledMarketResolver {

    // Storage paths
    access(all) let AdminStoragePath: StoragePath
    access(all) let ResolverStoragePath: StoragePath

    // Events
    access(all) event MarketResolutionScheduled(
        id: UInt64,
        marketId: UInt64,
        scheduledTime: UFix64,
        oracleSource: String,
        creator: Address
    )

    access(all) event MarketResolved(
        id: UInt64,
        marketId: UInt64,
        outcome: Bool,
        executionTime: UFix64,
        executor: Address
    )

    access(all) event ResolutionCancelled(
        id: UInt64,
        cancelledBy: Address
    )

    // Oracle sources
    access(all) enum OracleSource: UInt8 {
        access(all) case Kalshi
        access(all) case Polymarket
        access(all) case Internal
    }

    // Scheduled resolution data structure
    access(all) struct ScheduledResolution {
        access(all) let id: UInt64
        access(all) let marketId: UInt64
        access(all) let scheduledTime: UFix64
        access(all) let oracleSource: OracleSource
        access(all) let creator: Address
        access(all) var resolved: Bool
        access(all) var cancelled: Bool
        access(all) var outcome: Bool?
        access(all) let createdAt: UFix64

        init(
            id: UInt64,
            marketId: UInt64,
            scheduledTime: UFix64,
            oracleSource: OracleSource,
            creator: Address
        ) {
            self.id = id
            self.marketId = marketId
            self.scheduledTime = scheduledTime
            self.oracleSource = oracleSource
            self.creator = creator
            self.resolved = false
            self.cancelled = false
            self.outcome = nil
            self.createdAt = getCurrentBlock().timestamp
        }

        access(all) fun markResolved(outcome: Bool) {
            self.resolved = true
            self.outcome = outcome
        }

        access(all) fun markCancelled() {
            self.cancelled = true
        }
    }

    // Contract state
    access(all) var scheduledResolutions: {UInt64: ScheduledResolution}
    access(all) var nextResolutionId: UInt64
    access(contract) var resolvers: {Address: Bool}
    access(contract) var oracleEndpoints: {OracleSource: String}

    // Resolver resource for scheduling market resolutions
    access(all) resource Resolver {
        access(all) fun scheduleResolution(
            marketId: UInt64,
            scheduledTime: UFix64,
            oracleSource: OracleSource
        ): UInt64 {
            pre {
                scheduledTime > getCurrentBlock().timestamp: "Scheduled time must be in the future"
            }

            let resolutionId = ScheduledMarketResolver.nextResolutionId
            let resolution = ScheduledResolution(
                id: resolutionId,
                marketId: marketId,
                scheduledTime: scheduledTime,
                oracleSource: oracleSource,
                creator: self.owner!.address
            )

            ScheduledMarketResolver.scheduledResolutions[resolutionId] = resolution
            ScheduledMarketResolver.nextResolutionId = ScheduledMarketResolver.nextResolutionId + 1

            let sourceName = oracleSource == OracleSource.Kalshi ? "Kalshi" :
                            oracleSource == OracleSource.Polymarket ? "Polymarket" : "Internal"

            emit MarketResolutionScheduled(
                id: resolutionId,
                marketId: marketId,
                scheduledTime: scheduledTime,
                oracleSource: sourceName,
                creator: self.owner!.address
            )

            return resolutionId
        }

        access(all) fun cancelResolution(resolutionId: UInt64) {
            pre {
                ScheduledMarketResolver.scheduledResolutions[resolutionId] != nil: "Resolution not found"
            }

            let resolution = ScheduledMarketResolver.scheduledResolutions[resolutionId]!
            assert(resolution.creator == self.owner!.address, message: "Only creator can cancel")
            assert(!resolution.resolved, message: "Cannot cancel resolved market")
            assert(!resolution.cancelled, message: "Already cancelled")

            resolution.markCancelled()
            ScheduledMarketResolver.scheduledResolutions[resolutionId] = resolution

            emit ResolutionCancelled(
                id: resolutionId,
                cancelledBy: self.owner!.address
            )
        }
    }

    // Admin resource
    access(all) resource Admin {
        access(all) fun addResolver(address: Address) {
            ScheduledMarketResolver.resolvers[address] = true
        }

        access(all) fun removeResolver(address: Address) {
            ScheduledMarketResolver.resolvers.remove(key: address)
        }

        access(all) fun setOracleEndpoint(source: OracleSource, endpoint: String) {
            ScheduledMarketResolver.oracleEndpoints[source] = endpoint
        }
    }

    // Public functions

    /**
     * Resolve a scheduled market when its time has arrived
     * Outcome is passed from external oracle integration
     */
    access(all) fun resolveMarket(
        resolutionId: UInt64,
        outcome: Bool,
        resolver: Address
    ) {
        pre {
            self.scheduledResolutions[resolutionId] != nil: "Resolution not found"
            self.resolvers[resolver] == true: "Unauthorized resolver"
        }

        let resolution = self.scheduledResolutions[resolutionId]!

        assert(
            getCurrentBlock().timestamp >= resolution.scheduledTime,
            message: "Too early to resolve - scheduled time not reached"
        )

        assert(!resolution.resolved, message: "Market already resolved")
        assert(!resolution.cancelled, message: "Resolution was cancelled")

        // Mark as resolved with outcome
        resolution.markResolved(outcome: outcome)
        self.scheduledResolutions[resolutionId] = resolution

        emit MarketResolved(
            id: resolutionId,
            marketId: resolution.marketId,
            outcome: outcome,
            executionTime: getCurrentBlock().timestamp,
            executor: resolver
        )
    }

    /**
     * Get a scheduled resolution by ID
     */
    access(all) fun getScheduledResolution(id: UInt64): ScheduledResolution? {
        return self.scheduledResolutions[id]
    }

    /**
     * Get all pending (not resolved, not cancelled) resolutions
     */
    access(all) fun getPendingResolutions(): [ScheduledResolution] {
        let pending: [ScheduledResolution] = []

        for resolution in self.scheduledResolutions.values {
            if !resolution.resolved && !resolution.cancelled {
                pending.append(resolution)
            }
        }

        return pending
    }

    /**
     * Get resolutions ready to execute (time has arrived)
     */
    access(all) fun getReadyResolutions(): [ScheduledResolution] {
        let ready: [ScheduledResolution] = []
        let currentTime = getCurrentBlock().timestamp

        for resolution in self.scheduledResolutions.values {
            if !resolution.resolved && !resolution.cancelled && resolution.scheduledTime <= currentTime {
                ready.append(resolution)
            }
        }

        return ready
    }

    /**
     * Get resolutions for a specific market
     */
    access(all) fun getMarketResolutions(marketId: UInt64): [ScheduledResolution] {
        let resolutions: [ScheduledResolution] = []

        for resolution in self.scheduledResolutions.values {
            if resolution.marketId == marketId {
                resolutions.append(resolution)
            }
        }

        return resolutions
    }

    /**
     * Get oracle endpoint for a source
     */
    access(all) fun getOracleEndpoint(source: OracleSource): String? {
        return self.oracleEndpoints[source]
    }

    /**
     * Check if an address is an authorized resolver
     */
    access(all) fun isResolver(address: Address): Bool {
        return self.resolvers[address] ?? false
    }

    /**
     * Create a resolver resource for an account
     */
    access(all) fun createResolver(): @Resolver {
        return <- create Resolver()
    }

    init() {
        self.scheduledResolutions = {}
        self.nextResolutionId = 0
        self.resolvers = {}
        self.oracleEndpoints = {}

        // Set storage paths
        self.AdminStoragePath = /storage/ScheduledMarketResolverAdmin
        self.ResolverStoragePath = /storage/ScheduledMarketResolverResolver

        // Create and save admin resource
        let admin <- create Admin()
        self.account.storage.save(<-admin, to: self.AdminStoragePath)

        // Make contract account an authorized resolver
        self.resolvers[self.account.address] = true
    }
}
