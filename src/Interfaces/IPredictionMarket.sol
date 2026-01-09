// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPredictionMarket
 * @notice Interface for the Prediction Market AMM system
 */
interface IPredictionMarket {
    // Enums
    enum MarketStatus {
        ACTIVE,      // Market is open for trading
        RESOLVED,    // Market has been resolved
        CANCELLED    // Market was cancelled and refunds issued
    }

    enum Outcome {
        UNDECIDED,   // Not yet resolved
        YES,         // YES outcome won
        NO,          // NO outcome won
        INVALID      // Market was invalid
    }

    // Structs
    struct Market {
        uint256 id;
        string question;
        uint256 endTime;
        uint256 resolutionTime;
        MarketStatus status;
        Outcome outcome;
        uint256 yesTokens;       // Total YES tokens in pool
        uint256 noTokens;        // Total NO tokens in pool
        uint256 liquidity;       // Total liquidity provided
        uint256 totalVolume;     // Total trading volume
        address creator;
        uint256 battleId;        // If linked to a battle (0 if custom)
        uint256 warrior1Id;      // Warrior 1 ID for battle markets
        uint256 warrior2Id;      // Warrior 2 ID for battle markets
        uint256 createdAt;
    }

    struct Position {
        uint256 yesTokens;
        uint256 noTokens;
        uint256 lpShares;        // LP shares for liquidity providers
        uint256 totalInvested;
    }

    // Events
    event MarketCreated(
        uint256 indexed marketId,
        string question,
        uint256 endTime,
        address indexed creator,
        uint256 battleId
    );

    event TokensPurchased(
        uint256 indexed marketId,
        address indexed buyer,
        bool isYes,
        uint256 collateralAmount,
        uint256 tokensReceived
    );

    event TokensSold(
        uint256 indexed marketId,
        address indexed seller,
        bool isYes,
        uint256 tokenAmount,
        uint256 collateralReceived
    );

    event LiquidityAdded(
        uint256 indexed marketId,
        address indexed provider,
        uint256 collateralAmount,
        uint256 lpTokensReceived
    );

    event LiquidityRemoved(
        uint256 indexed marketId,
        address indexed provider,
        uint256 lpTokensBurned,
        uint256 collateralReturned,
        uint256 yesTokens,
        uint256 noTokens
    );

    event MarketResolved(
        uint256 indexed marketId,
        Outcome outcome,
        address indexed resolver
    );

    event WinningsClaimed(
        uint256 indexed marketId,
        address indexed claimer,
        uint256 amount
    );

    // Core Functions
    function createMarket(
        string calldata question,
        uint256 endTime,
        uint256 initialLiquidity
    ) external returns (uint256 marketId);

    function createBattleMarket(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 endTime,
        uint256 initialLiquidity
    ) external returns (uint256 marketId);

    function buy(
        uint256 marketId,
        bool isYes,
        uint256 collateralAmount,
        uint256 minTokensOut
    ) external returns (uint256 tokensReceived);

    function sell(
        uint256 marketId,
        bool isYes,
        uint256 tokenAmount,
        uint256 minCollateralOut
    ) external returns (uint256 collateralReceived);

    function addLiquidity(
        uint256 marketId,
        uint256 collateralAmount
    ) external returns (uint256 lpTokens);

    function removeLiquidity(
        uint256 marketId,
        uint256 lpTokenAmount
    ) external returns (uint256 collateral, uint256 yesTokens, uint256 noTokens);

    function resolveMarket(
        uint256 marketId,
        Outcome outcome,
        bytes calldata oracleProof
    ) external;

    function claimWinnings(uint256 marketId) external returns (uint256 amount);

    // View Functions
    function getMarket(uint256 marketId) external view returns (Market memory);

    function getPrice(uint256 marketId) external view returns (uint256 yesPrice, uint256 noPrice);

    function getPosition(uint256 marketId, address user) external view returns (Position memory);

    function calculateBuyAmount(
        uint256 marketId,
        bool isYes,
        uint256 collateralAmount
    ) external view returns (uint256 tokensOut);

    function calculateSellAmount(
        uint256 marketId,
        bool isYes,
        uint256 tokenAmount
    ) external view returns (uint256 collateralOut);

    function getActiveMarkets() external view returns (uint256[] memory);

    function getUserMarkets(address user) external view returns (uint256[] memory);
}
