// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICreatorRevenueShare
 * @notice Interface for Creator Revenue Share contract
 */
interface ICreatorRevenueShare {
    // Enums
    enum CreatorType {
        MARKET_CREATOR,
        WARRIOR_CREATOR,
        AGENT_OPERATOR,
        LIQUIDITY_PROVIDER
    }

    enum CreatorTier {
        BRONZE,
        SILVER,
        GOLD,
        PLATINUM,
        DIAMOND
    }

    // Structs
    struct Creator {
        address wallet;
        CreatorType creatorType;
        CreatorTier tier;
        uint256 totalVolumeGenerated;
        uint256 totalFeesEarned;
        uint256 pendingRewards;
        uint256 totalClaimed;
        uint256 marketsCreated;
        uint256 warriorsCreated;
        uint256 agentsOperated;
        uint256 liquidityProvided;
        uint256 registeredAt;
        uint256 lastClaimAt;
        bool isActive;
    }

    struct RevenueEntry {
        uint256 marketId;
        uint256 amount;
        uint256 timestamp;
        string source;
    }

    struct MarketFees {
        uint256 marketId;
        address marketCreator;
        uint256 totalFees;
        uint256 creatorFees;
        uint256 protocolFees;
        uint256 lpFees;
    }

    // Events
    event CreatorRegistered(address indexed creator, CreatorType creatorType, uint256 timestamp);
    event FeeRecorded(address indexed creator, uint256 indexed marketId, uint256 amount, string source);
    event FeeDistributed(address indexed creator, uint256 amount, CreatorType creatorType);
    event RewardsClaimed(address indexed creator, uint256 amount, uint256 timestamp);
    event TierUpgraded(address indexed creator, CreatorTier oldTier, CreatorTier newTier);
    event MarketCreatorSet(uint256 indexed marketId, address indexed creator);
    event WarriorCreatorSet(uint256 indexed warriorId, address indexed creator);

    // Functions
    function getCreator(address wallet) external view returns (Creator memory);
    function getPendingRewards(address wallet) external view returns (uint256);
    function getCreatorTier(address wallet) external view returns (CreatorTier);
    function getMarketFees(uint256 marketId) external view returns (MarketFees memory);

    function setMarketCreator(uint256 marketId, address creator) external;
    function setWarriorCreator(uint256 warriorId, address creator) external;
    function recordTradeFee(uint256 marketId, uint256 volume, uint256 totalFee) external;
    function recordBetFee(uint256 warriorId, uint256 betAmount) external;
    function recordCopyTradeFee(uint256 agentId, address operator, uint256 tradeVolume) external;
    function recordLPFee(uint256 marketId, address lpProvider, uint256 lpShare, uint256 totalLPFees) external;
    function depositFees(uint256 amount) external;
}
