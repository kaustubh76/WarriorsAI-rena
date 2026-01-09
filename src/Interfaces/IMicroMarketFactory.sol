// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMicroMarketFactory
 * @notice Interface for Micro Market Factory contract
 */
interface IMicroMarketFactory {
    // Enums
    enum MicroMarketType {
        ROUND_WINNER,
        MOVE_PREDICTION,
        DAMAGE_THRESHOLD,
        FIRST_BLOOD,
        COMEBACK,
        PERFECT_ROUND,
        CRITICAL_HIT,
        DOMINANT_WIN
    }

    enum PlayerMoves {
        STRIKE,
        TAUNT,
        DODGE,
        SPECIAL,
        RECOVER
    }

    enum MarketStatus {
        ACTIVE,
        PAUSED,
        RESOLVED,
        CANCELLED
    }

    enum Outcome {
        UNDECIDED,
        YES,
        NO,
        DRAW,
        INVALID
    }

    // Structs
    struct MicroMarket {
        uint256 id;
        uint256 battleId;
        uint256 parentMarketId;
        MicroMarketType marketType;
        uint8 roundNumber;
        uint256 warrior1Id;
        uint256 warrior2Id;
        PlayerMoves targetMove;
        uint256 threshold;
        string question;
        uint256 endTime;
        uint256 resolutionTime;
        MarketStatus status;
        Outcome outcome;
        uint256 yesPool;
        uint256 noPool;
        uint256 totalVolume;
        address creator;
        uint256 createdAt;
    }

    struct Position {
        uint256 yesTokens;
        uint256 noTokens;
        uint256 totalInvested;
        bool hasClaimed;
    }

    struct RoundData {
        uint8 roundNumber;
        uint256 warrior1Damage;
        uint256 warrior2Damage;
        PlayerMoves warrior1Move;
        PlayerMoves warrior2Move;
        bool warrior1Dodged;
        bool warrior2Dodged;
        uint256 timestamp;
        bool isResolved;
    }

    // Events
    event MicroMarketCreated(uint256 indexed marketId, uint256 indexed battleId, MicroMarketType marketType, uint8 roundNumber, string question);
    event RoundStarted(uint256 indexed battleId, uint8 indexed round, uint256 timestamp);
    event MoveExecuted(uint256 indexed battleId, uint256 indexed warriorId, PlayerMoves move, uint8 round);
    event DamageDealt(uint256 indexed battleId, uint256 indexed attackerId, uint256 damage, uint8 round);
    event RoundResolved(uint256 indexed battleId, uint8 indexed round, uint256 warrior1Damage, uint256 warrior2Damage);
    event MicroMarketResolved(uint256 indexed marketId, Outcome outcome);

    // Functions
    function createBattleMicroMarkets(uint256 battleId, uint256 warrior1Id, uint256 warrior2Id, uint256 battleEndTime) external returns (uint256[] memory marketIds);
    function getMarket(uint256 marketId) external view returns (MicroMarket memory);
    function getPosition(uint256 marketId, address user) external view returns (Position memory);
    function getBattleMicroMarkets(uint256 battleId) external view returns (uint256[] memory);
    function getRoundData(uint256 battleId, uint8 round) external view returns (RoundData memory);
    function getPrice(uint256 marketId) external view returns (uint256 yesPrice, uint256 noPrice);

    // Round event callbacks
    function onRoundStart(uint256 battleId, uint8 round) external;
    function onMoveExecuted(uint256 battleId, uint256 warriorId, PlayerMoves move, uint8 round) external;
    function resolveRound(uint256 battleId, uint8 round, uint256 warrior1Damage, uint256 warrior2Damage, PlayerMoves warrior1Move, PlayerMoves warrior2Move, bool warrior1Dodged, bool warrior2Dodged) external;
}
