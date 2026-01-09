// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAIAgentRegistry
 * @notice Interface for AI Agent Registry contract
 */
interface IAIAgentRegistry {
    // Enums
    enum AgentStrategy {
        SUPERFORECASTER,
        WARRIOR_ANALYST,
        TREND_FOLLOWER,
        MEAN_REVERSION,
        MICRO_SPECIALIST,
        CUSTOM
    }

    enum RiskProfile {
        CONSERVATIVE,
        MODERATE,
        AGGRESSIVE,
        DEGENERATE
    }

    enum AgentTier {
        NOVICE,
        SKILLED,
        EXPERT,
        ORACLE
    }

    enum Specialization {
        BATTLE_OUTCOMES,
        ROUND_MARKETS,
        MOVE_PREDICTIONS,
        ALL
    }

    // Structs
    struct PersonaTraits {
        uint8 patience;
        uint8 conviction;
        uint8 contrarian;
        uint8 momentum;
    }

    struct AIAgent {
        uint256 id;
        address operator;
        string name;
        string description;
        AgentStrategy strategy;
        RiskProfile riskProfile;
        Specialization specialization;
        PersonaTraits traits;
        uint256 stakedAmount;
        AgentTier tier;
        bool isActive;
        bool copyTradingEnabled;
        uint256 createdAt;
        uint256 lastTradeAt;
    }

    struct AgentPerformance {
        uint256 totalTrades;
        uint256 winningTrades;
        int256 totalPnL;
        uint256 totalVolume;
        uint256 avgConfidence;
        uint256 currentStreak;
        uint256 bestStreak;
        uint256 accuracyBps;
    }

    struct CopyTradeConfig {
        uint256 agentId;
        uint256 maxAmountPerTrade;
        uint256 totalCopied;
        uint256 startedAt;
        bool isActive;
    }

    // Events
    event AgentRegistered(uint256 indexed agentId, address indexed operator, string name, AgentStrategy strategy, uint256 stakedAmount);
    event TradeRecorded(uint256 indexed agentId, uint256 indexed marketId, bool won, int256 pnl, uint256 confidence);
    event CopyTradeStarted(address indexed follower, uint256 indexed agentId, uint256 maxAmount);
    event CopyTradeExecuted(address indexed follower, uint256 indexed agentId, uint256 marketId, uint256 amount);

    // Functions
    function getAgent(uint256 agentId) external view returns (AIAgent memory);
    function getAgentPerformance(uint256 agentId) external view returns (AgentPerformance memory);
    function isAgentActive(uint256 agentId) external view returns (bool);
    function getAgentTier(uint256 agentId) external view returns (AgentTier);
    function getCopyTradeConfig(address user, uint256 agentId) external view returns (CopyTradeConfig memory);
    function getUserFollowing(address user) external view returns (uint256[] memory);
    function getAgentFollowers(uint256 agentId) external view returns (address[] memory);

    function recordTrade(uint256 agentId, uint256 marketId, bool won, int256 pnl, uint256 volume, uint256 confidence) external;
    function recordCopyTradeFee(uint256 agentId, uint256 fee) external;
}
