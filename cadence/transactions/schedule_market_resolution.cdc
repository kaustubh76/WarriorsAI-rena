import ScheduledMarketResolver from "../contracts/ScheduledMarketResolver.cdc"

/**
 * Schedule a market resolution for future execution (Cadence 1.0)
 *
 * @param marketId - ID of the prediction market
 * @param scheduledTime - Unix timestamp when market should be resolved
 * @param oracleSource - Oracle source (0=Kalshi, 1=Polymarket, 2=Internal)
 */
transaction(
    marketId: UInt64,
    scheduledTime: UFix64,
    oracleSource: UInt8
) {
    let resolver: &ScheduledMarketResolver.Resolver

    prepare(signer: auth(Storage, SaveValue, BorrowValue) &Account) {
        // Check if resolver exists, create if not
        if signer.storage.borrow<&ScheduledMarketResolver.Resolver>(from: ScheduledMarketResolver.ResolverStoragePath) == nil {
            let newResolver <- ScheduledMarketResolver.createResolver()
            signer.storage.save(<-newResolver, to: ScheduledMarketResolver.ResolverStoragePath)
        }

        // Borrow resolver reference
        self.resolver = signer.storage.borrow<&ScheduledMarketResolver.Resolver>(from: ScheduledMarketResolver.ResolverStoragePath)
            ?? panic("Could not borrow resolver reference")
    }

    execute {
        // Convert UInt8 to OracleSource enum
        let source: ScheduledMarketResolver.OracleSource
        if oracleSource == 0 {
            source = ScheduledMarketResolver.OracleSource.Kalshi
        } else if oracleSource == 1 {
            source = ScheduledMarketResolver.OracleSource.Polymarket
        } else {
            source = ScheduledMarketResolver.OracleSource.Internal
        }

        let resolutionId = self.resolver.scheduleResolution(
            marketId: marketId,
            scheduledTime: scheduledTime,
            oracleSource: source
        )

        log("Market resolution scheduled with ID: ".concat(resolutionId.toString()))
    }
}
