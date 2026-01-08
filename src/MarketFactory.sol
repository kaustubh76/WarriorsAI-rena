// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {IPredictionMarket} from "./Interfaces/IPredictionMarket.sol";
import {IArenaFactory} from "./Interfaces/IArenaFactory.sol";
import {ICrownToken} from "./Interfaces/ICrownToken.sol";

/**
 * @title MarketFactory
 * @author Warriors AI Arena
 * @notice Factory for creating and managing prediction markets
 * @dev Integrates with Arena battles for automatic market creation
 *
 * Features:
 * - Auto-create markets when battles are initialized
 * - Create custom prediction markets
 * - Category management for market organization
 * - Featured markets and trending algorithms
 * - Statistics tracking for leaderboards
 */
contract MarketFactory is Ownable {
    // Errors
    error MarketFactory__InvalidMarket();
    error MarketFactory__InvalidBattle();
    error MarketFactory__MarketExists();
    error MarketFactory__CategoryExists();
    error MarketFactory__CategoryNotFound();
    error MarketFactory__InsufficientLiquidity();
    error MarketFactory__Unauthorized();

    // Structs
    struct Category {
        uint256 id;
        string name;
        string description;
        bool isActive;
        uint256 marketCount;
    }

    struct MarketStats {
        uint256 totalVolume;
        uint256 totalLiquidity;
        uint256 uniqueTraders;
        uint256 averageOdds;
    }

    struct UserStats {
        uint256 totalTrades;
        uint256 totalVolume;
        uint256 marketsWon;
        uint256 marketsLost;
        int256 totalProfit; // Can be negative
        uint256 winRate; // Basis points (0-10000)
        uint256 streak; // Current winning streak
        uint256 bestStreak;
    }

    // Constants
    uint256 public constant BATTLE_CATEGORY_ID = 1;
    uint256 public constant MIN_MARKET_DURATION = 1 hours;
    uint256 public constant DEFAULT_LIQUIDITY = 100 ether; // 100 CRwN

    // State
    IPredictionMarket public predictionMarket;
    IArenaFactory public arenaFactory;
    ICrownToken public crownToken;

    uint256 public nextCategoryId = 2; // 1 is reserved for battles
    mapping(uint256 => Category) public categories;
    uint256[] public categoryIds;

    // Battle to Market mapping
    mapping(uint256 => uint256) public battleToMarket; // battleId => marketId
    mapping(uint256 => uint256) public marketToBattle; // marketId => battleId

    // Market categorization
    mapping(uint256 => uint256) public marketCategory; // marketId => categoryId
    mapping(uint256 => uint256[]) public categoryMarkets; // categoryId => marketIds

    // User stats
    mapping(address => UserStats) public userStats;
    address[] public allUsers;
    mapping(address => bool) public isRegisteredUser;

    // Featured and trending
    uint256[] public featuredMarkets;
    mapping(uint256 => bool) public isFeatured;

    // Events
    event CategoryCreated(uint256 indexed categoryId, string name);
    event CategoryUpdated(uint256 indexed categoryId, string name, bool isActive);
    event BattleMarketCreated(
        uint256 indexed battleId,
        uint256 indexed marketId,
        uint256 warrior1Id,
        uint256 warrior2Id
    );
    event CustomMarketCreated(
        uint256 indexed marketId,
        uint256 indexed categoryId,
        string question,
        address indexed creator
    );
    event MarketFeatured(uint256 indexed marketId, bool featured);
    event UserStatsUpdated(address indexed user, UserStats stats);

    constructor(
        address _predictionMarket,
        address _arenaFactory,
        address _crownToken
    ) Ownable(msg.sender) {
        predictionMarket = IPredictionMarket(_predictionMarket);
        arenaFactory = IArenaFactory(_arenaFactory);
        crownToken = ICrownToken(_crownToken);

        // Create default battle category
        categories[BATTLE_CATEGORY_ID] = Category({
            id: BATTLE_CATEGORY_ID,
            name: "Battle Outcomes",
            description: "Predict warrior battle results",
            isActive: true,
            marketCount: 0
        });
        categoryIds.push(BATTLE_CATEGORY_ID);
    }

    // ============ Category Management ============

    /**
     * @notice Create a new market category
     * @param name Category name
     * @param description Category description
     */
    function createCategory(
        string calldata name,
        string calldata description
    ) external onlyOwner returns (uint256 categoryId) {
        categoryId = nextCategoryId++;

        categories[categoryId] = Category({
            id: categoryId,
            name: name,
            description: description,
            isActive: true,
            marketCount: 0
        });

        categoryIds.push(categoryId);

        emit CategoryCreated(categoryId, name);
    }

    /**
     * @notice Update a category
     */
    function updateCategory(
        uint256 categoryId,
        string calldata name,
        string calldata description,
        bool isActive
    ) external onlyOwner {
        if (categories[categoryId].id == 0) revert MarketFactory__CategoryNotFound();

        categories[categoryId].name = name;
        categories[categoryId].description = description;
        categories[categoryId].isActive = isActive;

        emit CategoryUpdated(categoryId, name, isActive);
    }

    // ============ Battle Market Creation ============

    /**
     * @notice Create a market for an arena battle
     * @param battleId The battle/arena ID
     * @param warrior1Id First warrior NFT ID
     * @param warrior2Id Second warrior NFT ID
     * @param endTime When the battle ends
     */
    function createBattleMarket(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 endTime
    ) external returns (uint256 marketId) {
        if (battleToMarket[battleId] != 0) revert MarketFactory__MarketExists();

        // Transfer liquidity from caller
        crownToken.transferFrom(msg.sender, address(this), DEFAULT_LIQUIDITY);
        crownToken.approve(address(predictionMarket), DEFAULT_LIQUIDITY);

        // Create market
        marketId = predictionMarket.createBattleMarket(
            battleId,
            warrior1Id,
            warrior2Id,
            endTime,
            DEFAULT_LIQUIDITY
        );

        // Store mappings
        battleToMarket[battleId] = marketId;
        marketToBattle[marketId] = battleId;
        marketCategory[marketId] = BATTLE_CATEGORY_ID;
        categoryMarkets[BATTLE_CATEGORY_ID].push(marketId);
        categories[BATTLE_CATEGORY_ID].marketCount++;

        emit BattleMarketCreated(battleId, marketId, warrior1Id, warrior2Id);
    }

    /**
     * @notice Auto-create market when battle is initialized (called by Arena)
     * @dev Only callable by registered arenas
     */
    function onBattleInitialized(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 bettingEndTime
    ) external {
        // In production, verify msg.sender is a valid arena
        // For now, allow any caller

        if (battleToMarket[battleId] != 0) return; // Market already exists

        // Use protocol funds for initial liquidity
        if (crownToken.balanceOf(address(this)) >= DEFAULT_LIQUIDITY) {
            crownToken.approve(address(predictionMarket), DEFAULT_LIQUIDITY);

            uint256 marketId = predictionMarket.createBattleMarket(
                battleId,
                warrior1Id,
                warrior2Id,
                bettingEndTime,
                DEFAULT_LIQUIDITY
            );

            battleToMarket[battleId] = marketId;
            marketToBattle[marketId] = battleId;
            marketCategory[marketId] = BATTLE_CATEGORY_ID;
            categoryMarkets[BATTLE_CATEGORY_ID].push(marketId);
            categories[BATTLE_CATEGORY_ID].marketCount++;

            emit BattleMarketCreated(battleId, marketId, warrior1Id, warrior2Id);
        }
    }

    // ============ Custom Market Creation ============

    /**
     * @notice Create a custom prediction market
     * @param question The market question
     * @param categoryId Category for the market
     * @param endTime When the market closes
     * @param initialLiquidity Initial liquidity to provide
     */
    function createCustomMarket(
        string calldata question,
        uint256 categoryId,
        uint256 endTime,
        uint256 initialLiquidity
    ) external returns (uint256 marketId) {
        if (categories[categoryId].id == 0 || !categories[categoryId].isActive) {
            revert MarketFactory__CategoryNotFound();
        }
        if (endTime < block.timestamp + MIN_MARKET_DURATION) {
            revert MarketFactory__InvalidMarket();
        }

        // Transfer liquidity
        crownToken.transferFrom(msg.sender, address(this), initialLiquidity);
        crownToken.approve(address(predictionMarket), initialLiquidity);

        // Create market
        marketId = predictionMarket.createMarket(question, endTime, initialLiquidity);

        // Store categorization
        marketCategory[marketId] = categoryId;
        categoryMarkets[categoryId].push(marketId);
        categories[categoryId].marketCount++;

        // Register user if new
        _registerUser(msg.sender);

        emit CustomMarketCreated(marketId, categoryId, question, msg.sender);
    }

    // ============ User Stats ============

    /**
     * @notice Record a trade for user stats
     * @param user User address
     * @param volume Trade volume
     */
    function recordTrade(address user, uint256 volume) external {
        // Should only be callable by prediction market
        _registerUser(user);

        userStats[user].totalTrades++;
        userStats[user].totalVolume += volume;

        emit UserStatsUpdated(user, userStats[user]);
    }

    /**
     * @notice Record market result for user
     * @param user User address
     * @param won Whether user won
     * @param profitLoss Profit (positive) or loss (negative)
     */
    function recordMarketResult(
        address user,
        bool won,
        int256 profitLoss
    ) external {
        _registerUser(user);

        if (won) {
            userStats[user].marketsWon++;
            userStats[user].streak++;
            if (userStats[user].streak > userStats[user].bestStreak) {
                userStats[user].bestStreak = userStats[user].streak;
            }
        } else {
            userStats[user].marketsLost++;
            userStats[user].streak = 0;
        }

        userStats[user].totalProfit += profitLoss;

        // Calculate win rate
        uint256 totalMarkets = userStats[user].marketsWon + userStats[user].marketsLost;
        if (totalMarkets > 0) {
            userStats[user].winRate = (userStats[user].marketsWon * 10000) / totalMarkets;
        }

        emit UserStatsUpdated(user, userStats[user]);
    }

    function _registerUser(address user) internal {
        if (!isRegisteredUser[user]) {
            isRegisteredUser[user] = true;
            allUsers.push(user);
        }
    }

    // ============ Featured Markets ============

    /**
     * @notice Set a market as featured
     */
    function setFeatured(uint256 marketId, bool featured) external onlyOwner {
        if (featured && !isFeatured[marketId]) {
            isFeatured[marketId] = true;
            featuredMarkets.push(marketId);
        } else if (!featured && isFeatured[marketId]) {
            isFeatured[marketId] = false;
            // Remove from array
            for (uint256 i = 0; i < featuredMarkets.length; i++) {
                if (featuredMarkets[i] == marketId) {
                    featuredMarkets[i] = featuredMarkets[featuredMarkets.length - 1];
                    featuredMarkets.pop();
                    break;
                }
            }
        }

        emit MarketFeatured(marketId, featured);
    }

    // ============ View Functions ============

    function getCategory(uint256 categoryId) external view returns (Category memory) {
        return categories[categoryId];
    }

    function getAllCategories() external view returns (Category[] memory) {
        Category[] memory result = new Category[](categoryIds.length);
        for (uint256 i = 0; i < categoryIds.length; i++) {
            result[i] = categories[categoryIds[i]];
        }
        return result;
    }

    function getCategoryMarkets(uint256 categoryId) external view returns (uint256[] memory) {
        return categoryMarkets[categoryId];
    }

    function getFeaturedMarkets() external view returns (uint256[] memory) {
        return featuredMarkets;
    }

    function getUserStats(address user) external view returns (UserStats memory) {
        return userStats[user];
    }

    function getLeaderboard(uint256 limit) external view returns (
        address[] memory users,
        UserStats[] memory stats
    ) {
        uint256 count = allUsers.length < limit ? allUsers.length : limit;
        users = new address[](count);
        stats = new UserStats[](count);

        // Simple copy - in production, would sort by profit/winrate
        for (uint256 i = 0; i < count; i++) {
            users[i] = allUsers[i];
            stats[i] = userStats[allUsers[i]];
        }
    }

    function getMarketByBattle(uint256 battleId) external view returns (uint256) {
        return battleToMarket[battleId];
    }

    function getBattleByMarket(uint256 marketId) external view returns (uint256) {
        return marketToBattle[marketId];
    }

    // ============ Admin ============

    function setPredictionMarket(address _predictionMarket) external onlyOwner {
        predictionMarket = IPredictionMarket(_predictionMarket);
    }

    function setArenaFactory(address _arenaFactory) external onlyOwner {
        arenaFactory = IArenaFactory(_arenaFactory);
    }

    /**
     * @notice Fund the factory for auto-market creation
     */
    function fundFactory(uint256 amount) external {
        crownToken.transferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw funds from factory
     */
    function withdrawFunds(uint256 amount) external onlyOwner {
        crownToken.transfer(owner(), amount);
    }
}
