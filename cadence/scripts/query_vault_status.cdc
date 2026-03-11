import ScheduledVault from "../contracts/ScheduledVault.cdc"

/// Query vault scheduling status by NFT ID.
/// Returns nil if no vault is scheduled for this NFT.
access(all) fun main(nftId: UInt64): ScheduledVault.ScheduledVaultEntry? {
    return ScheduledVault.getVaultByNFTId(nftId: nftId)
}
