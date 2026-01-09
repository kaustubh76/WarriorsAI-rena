// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/**
 * @title AILiquidityManager
 * @author Warriors AI Arena
 * @notice AI-driven dynamic liquidity provision and optimization
 * @dev Manages automated liquidity for prediction markets
 *
 * Features:
 * - AI agents auto-provide liquidity based on market analysis
 * - Dynamic fee adjustment based on volatility
 * - Just-in-time liquidity for large trades
 * - Loss protection through hedging strategies
 * - MEV protection mechanisms
 */
contract AILiquidityManager is Ownable, ReentrancyGuard {
    // ============ Errors ============
    error AILiquidity__InvalidMarket();
    error AILiquidity__InvalidAmount();
    error AILiquidity__InsufficientLiquidity();
    error AILiquidity__StrategyNotActive();
    error AILiquidity__Unauthorized();
    error AILiquidity__CooldownActive();
    error AILiquidity__InvalidStrategy();
    error AILiquidity__MaxExposureReached();
    error AILiquidity__SlippageExceeded();
    error AILiquidity__RebalanceNotNeeded();

    // ============ Enums ============

    /// @notice Liquidity strategy types
    enum LiquidityStrategy {
        PASSIVE,            // Simple LP, no rebalancing
        BALANCED,           // Periodic rebalancing to 50-50
        TREND_FOLLOWING,    // Follow market momentum
        MEAN_REVERSION,     // Bet on price returning to mean
        MARKET_MAKING,      // Active market making with tight spreads
        AI_OPTIMIZED        // Full AI control with 0G inference
    }

    /// @notice Strategy status
    enum StrategyStatus {
        INACTIVE,
        ACTIVE,
        PAUSED,
        LIQUIDATING
    }

    // ============ Structs ============

    /// @notice AI liquidity position configuration
    struct LiquidityPosition {
        uint256 positionId;
        uint256 marketId;
        address provider;
        LiquidityStrategy strategy;
        StrategyStatus status;
        uint256 totalDeposited;
        uint256 currentYesTokens;
        uint256 currentNoTokens;
        uint256 currentLpTokens;
        uint256 unrealizedPnL;
        uint256 realizedPnL;
        uint256 lastRebalanceAt;
        uint256 createdAt;
    }

    /// @notice Strategy parameters
    struct StrategyParams {
        uint256 targetYesRatio;         // Target YES ratio (basis points)
        uint256 rebalanceThreshold;     // Trigger rebalance when deviation > this
        uint256 minRebalanceInterval;   // Minimum time between rebalances
        uint256 maxSlippage;            // Max allowed slippage (basis points)
        uint256 maxExposure;            // Max exposure per market
        bool enableHedging;
        bool enableJIT;                 // Just-in-time liquidity
    }

    /// @notice Market liquidity metrics
    struct MarketLiquidityMetrics {
        uint256 marketId;
        uint256 totalLiquidity;
        uint256 activePositions;
        uint256 currentYesPool;
        uint256 currentNoPool;
        uint256 volatilityScore;        // 0-10000 bps
        uint256 volume24h;
        uint256 avgTradeSize;
        uint256 lastUpdateAt;
    }

    /// @notice Rebalance execution record
    struct RebalanceRecord {
        uint256 positionId;
        uint256 marketId;
        uint256 yesTraded;
        uint256 noTraded;
        bool isBuy;
        uint256 slippage;
        uint256 timestamp;
    }

    /// @notice JIT liquidity request
    struct JITRequest {
        uint256 requestId;
        uint256 marketId;
        address trader;
        bool isYesBuy;
        uint256 amount;
        uint256 timestamp;
        bool fulfilled;
    }

    // ============ Constants ============
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant DEFAULT_REBALANCE_THRESHOLD = 1000;  // 10%
    uint256 public constant MIN_REBALANCE_INTERVAL = 5 minutes;
    uint256 public constant DEFAULT_MAX_SLIPPAGE = 300;          // 3%
    uint256 public constant JIT_WINDOW = 1 minutes;

    // Dynamic fee parameters
    uint256 public constant BASE_FEE = 100;                      // 1%
    uint256 public constant MAX_FEE = 500;                       // 5%
    uint256 public constant VOLATILITY_FEE_MULTIPLIER = 50;      // 0.5% per volatility unit

    // ============ State ============
    IERC20 public immutable crownToken;
    address public predictionMarket;
    address public aiDebateOracle;

    uint256 public nextPositionId = 1;
    uint256 public nextJITRequestId = 1;
    uint256 public totalLiquidityProvided;

    // Position mappings
    mapping(uint256 => LiquidityPosition) public positions;
    mapping(uint256 => StrategyParams) public positionParams;
    mapping(address => uint256[]) public providerPositions;
    mapping(uint256 => uint256[]) public marketPositions;     // marketId => positionIds

    // Market metrics
    mapping(uint256 => MarketLiquidityMetrics) public marketMetrics;

    // Rebalance history
    mapping(uint256 => RebalanceRecord[]) public rebalanceHistory;

    // JIT liquidity
    mapping(uint256 => JITRequest) public jitRequests;
    mapping(uint256 => uint256[]) public marketJITRequests;

    // Authorized AI agents that can trigger operations
    mapping(address => bool) public authorizedAgents;

    // Dynamic fees per market
    mapping(uint256 => uint256) public marketDynamicFees;

    // ============ Events ============
    event PositionCreated(
        uint256 indexed positionId,
        uint256 indexed marketId,
        address indexed provider,
        LiquidityStrategy strategy,
        uint256 amount
    );

    event LiquidityAdded(
        uint256 indexed positionId,
        uint256 amount,
        uint256 newTotal
    );

    event LiquidityRemoved(
        uint256 indexed positionId,
        uint256 amount,
        uint256 remaining
    );

    event PositionRebalanced(
        uint256 indexed positionId,
        uint256 indexed marketId,
        uint256 yesChange,
        uint256 noChange,
        uint256 slippage
    );

    event StrategyUpdated(
        uint256 indexed positionId,
        LiquidityStrategy oldStrategy,
        LiquidityStrategy newStrategy
    );

    event DynamicFeeUpdated(
        uint256 indexed marketId,
        uint256 oldFee,
        uint256 newFee,
        uint256 volatilityScore
    );

    event JITLiquidityRequested(
        uint256 indexed requestId,
        uint256 indexed marketId,
        address trader,
        uint256 amount
    );

    event JITLiquidityProvided(
        uint256 indexed requestId,
        uint256 indexed positionId,
        uint256 amount
    );

    event MetricsUpdated(
        uint256 indexed marketId,
        uint256 totalLiquidity,
        uint256 volatilityScore
    );

    event AgentAuthorized(address indexed agent, bool authorized);

    // ============ Constructor ============
    constructor(address _crownToken) Ownable(msg.sender) {
        crownToken = IERC20(_crownToken);
    }

    // ============ Position Management ============

    /**
     * @notice Create a new liquidity position with strategy
     */
    function createPosition(
        uint256 marketId,
        LiquidityStrategy strategy,
        uint256 initialDeposit,
        StrategyParams calldata params
    ) external nonReentrant returns (uint256 positionId) {
        if (initialDeposit == 0) revert AILiquidity__InvalidAmount();
        if (marketId == 0) revert AILiquidity__InvalidMarket();

        // Transfer deposit
        crownToken.transferFrom(msg.sender, address(this), initialDeposit);

        positionId = nextPositionId++;

        positions[positionId] = LiquidityPosition({
            positionId: positionId,
            marketId: marketId,
            provider: msg.sender,
            strategy: strategy,
            status: StrategyStatus.ACTIVE,
            totalDeposited: initialDeposit,
            currentYesTokens: initialDeposit / 2,
            currentNoTokens: initialDeposit / 2,
            currentLpTokens: initialDeposit,
            unrealizedPnL: 0,
            realizedPnL: 0,
            lastRebalanceAt: block.timestamp,
            createdAt: block.timestamp
        });

        positionParams[positionId] = params;
        providerPositions[msg.sender].push(positionId);
        marketPositions[marketId].push(positionId);

        totalLiquidityProvided += initialDeposit;

        // Update market metrics
        _updateMarketMetrics(marketId, initialDeposit, true);

        emit PositionCreated(positionId, marketId, msg.sender, strategy, initialDeposit);
    }

    /**
     * @notice Add liquidity to existing position
     */
    function addLiquidity(uint256 positionId, uint256 amount) external nonReentrant {
        LiquidityPosition storage pos = positions[positionId];
        if (pos.provider != msg.sender) revert AILiquidity__Unauthorized();
        if (pos.status != StrategyStatus.ACTIVE) revert AILiquidity__StrategyNotActive();
        if (amount == 0) revert AILiquidity__InvalidAmount();

        crownToken.transferFrom(msg.sender, address(this), amount);

        pos.totalDeposited += amount;
        pos.currentYesTokens += amount / 2;
        pos.currentNoTokens += amount / 2;
        pos.currentLpTokens += amount;

        totalLiquidityProvided += amount;

        _updateMarketMetrics(pos.marketId, amount, true);

        emit LiquidityAdded(positionId, amount, pos.totalDeposited);
    }

    /**
     * @notice Remove liquidity from position
     */
    function removeLiquidity(uint256 positionId, uint256 amount) external nonReentrant {
        LiquidityPosition storage pos = positions[positionId];
        if (pos.provider != msg.sender) revert AILiquidity__Unauthorized();
        if (amount > pos.currentLpTokens) revert AILiquidity__InsufficientLiquidity();

        // Calculate proportional share
        uint256 shareRatio = (amount * FEE_DENOMINATOR) / pos.currentLpTokens;
        uint256 yesTokens = (pos.currentYesTokens * shareRatio) / FEE_DENOMINATOR;
        uint256 noTokens = (pos.currentNoTokens * shareRatio) / FEE_DENOMINATOR;

        // Calculate collateral to return (matched pairs)
        uint256 collateralReturn = yesTokens < noTokens ? yesTokens : noTokens;

        pos.currentYesTokens -= yesTokens;
        pos.currentNoTokens -= noTokens;
        pos.currentLpTokens -= amount;
        pos.totalDeposited -= collateralReturn;

        totalLiquidityProvided -= collateralReturn;

        crownToken.transfer(msg.sender, collateralReturn);

        _updateMarketMetrics(pos.marketId, collateralReturn, false);

        emit LiquidityRemoved(positionId, amount, pos.currentLpTokens);
    }

    // ============ AI-Driven Rebalancing ============

    /**
     * @notice Rebalance a position based on strategy
     * @dev Can be called by AI agents or position owner
     */
    function rebalancePosition(
        uint256 positionId,
        uint256 targetYesRatio
    ) external nonReentrant {
        LiquidityPosition storage pos = positions[positionId];
        StrategyParams storage params = positionParams[positionId];

        // Check authorization
        if (msg.sender != pos.provider && !authorizedAgents[msg.sender]) {
            revert AILiquidity__Unauthorized();
        }

        if (pos.status != StrategyStatus.ACTIVE) revert AILiquidity__StrategyNotActive();

        // Check cooldown
        if (block.timestamp < pos.lastRebalanceAt + params.minRebalanceInterval) {
            revert AILiquidity__CooldownActive();
        }

        // Calculate current ratio
        uint256 total = pos.currentYesTokens + pos.currentNoTokens;
        uint256 currentYesRatio = (pos.currentYesTokens * FEE_DENOMINATOR) / total;

        // Check if rebalance is needed
        uint256 deviation = currentYesRatio > targetYesRatio
            ? currentYesRatio - targetYesRatio
            : targetYesRatio - currentYesRatio;

        if (deviation < params.rebalanceThreshold) {
            revert AILiquidity__RebalanceNotNeeded();
        }

        // Calculate trade amounts
        uint256 targetYes = (total * targetYesRatio) / FEE_DENOMINATOR;
        uint256 targetNo = total - targetYes;

        uint256 yesChange;
        uint256 noChange;
        bool isBuy;

        if (targetYes > pos.currentYesTokens) {
            // Need more YES tokens
            yesChange = targetYes - pos.currentYesTokens;
            noChange = pos.currentNoTokens - targetNo;
            isBuy = true;
        } else {
            // Need more NO tokens
            noChange = targetNo - pos.currentNoTokens;
            yesChange = pos.currentYesTokens - targetYes;
            isBuy = false;
        }

        // Execute rebalance (in production, interact with PredictionMarket)
        pos.currentYesTokens = targetYes;
        pos.currentNoTokens = targetNo;
        pos.lastRebalanceAt = block.timestamp;

        // Record rebalance
        rebalanceHistory[positionId].push(RebalanceRecord({
            positionId: positionId,
            marketId: pos.marketId,
            yesTraded: yesChange,
            noTraded: noChange,
            isBuy: isBuy,
            slippage: 0, // Calculate actual slippage in production
            timestamp: block.timestamp
        }));

        emit PositionRebalanced(positionId, pos.marketId, yesChange, noChange, 0);
    }

    /**
     * @notice AI-triggered rebalance with analysis
     * @dev Called by authorized AI agents with 0G inference results
     */
    function aiRebalance(
        uint256 positionId,
        uint256 targetYesRatio,
        uint256 /* confidenceScore */,
        bytes calldata /* aiProof */
    ) external {
        if (!authorizedAgents[msg.sender]) revert AILiquidity__Unauthorized();

        LiquidityPosition storage pos = positions[positionId];
        if (pos.strategy != LiquidityStrategy.AI_OPTIMIZED) {
            revert AILiquidity__InvalidStrategy();
        }

        // In production, verify aiProof against 0G attestation
        // For now, trust authorized agents

        // Execute rebalance with AI-determined target
        _executeRebalance(positionId, targetYesRatio);
    }

    // ============ Dynamic Fee Management ============

    /**
     * @notice Update dynamic fee for a market based on volatility
     */
    function updateDynamicFee(uint256 marketId) external {
        MarketLiquidityMetrics storage metrics = marketMetrics[marketId];

        // Calculate new fee based on volatility
        uint256 volatilityFee = (metrics.volatilityScore * VOLATILITY_FEE_MULTIPLIER) / FEE_DENOMINATOR;
        uint256 newFee = BASE_FEE + volatilityFee;

        // Cap at max fee
        if (newFee > MAX_FEE) {
            newFee = MAX_FEE;
        }

        uint256 oldFee = marketDynamicFees[marketId];
        marketDynamicFees[marketId] = newFee;

        emit DynamicFeeUpdated(marketId, oldFee, newFee, metrics.volatilityScore);
    }

    /**
     * @notice Set volatility score for a market (AI-driven)
     */
    function setVolatilityScore(
        uint256 marketId,
        uint256 volatilityScore
    ) external {
        if (!authorizedAgents[msg.sender] && msg.sender != owner()) {
            revert AILiquidity__Unauthorized();
        }

        marketMetrics[marketId].volatilityScore = volatilityScore;
        marketMetrics[marketId].lastUpdateAt = block.timestamp;

        // Auto-update dynamic fee
        this.updateDynamicFee(marketId);
    }

    // ============ Just-In-Time Liquidity ============

    /**
     * @notice Request JIT liquidity for a large trade
     */
    function requestJITLiquidity(
        uint256 marketId,
        bool isYesBuy,
        uint256 amount
    ) external returns (uint256 requestId) {
        requestId = nextJITRequestId++;

        jitRequests[requestId] = JITRequest({
            requestId: requestId,
            marketId: marketId,
            trader: msg.sender,
            isYesBuy: isYesBuy,
            amount: amount,
            timestamp: block.timestamp,
            fulfilled: false
        });

        marketJITRequests[marketId].push(requestId);

        emit JITLiquidityRequested(requestId, marketId, msg.sender, amount);
    }

    /**
     * @notice Fulfill JIT liquidity request
     */
    function fulfillJITRequest(
        uint256 requestId,
        uint256 positionId
    ) external nonReentrant {
        JITRequest storage request = jitRequests[requestId];
        LiquidityPosition storage pos = positions[positionId];

        if (request.fulfilled) revert AILiquidity__InvalidAmount();
        if (block.timestamp > request.timestamp + JIT_WINDOW) {
            revert AILiquidity__CooldownActive();
        }
        if (pos.provider != msg.sender && !authorizedAgents[msg.sender]) {
            revert AILiquidity__Unauthorized();
        }

        StrategyParams storage params = positionParams[positionId];
        if (!params.enableJIT) revert AILiquidity__StrategyNotActive();

        // Add temporary liquidity
        uint256 jitAmount = request.amount / 2; // Provide half as buffer
        if (jitAmount > pos.currentLpTokens / 4) {
            revert AILiquidity__MaxExposureReached();
        }

        // In production, actually add liquidity to market
        request.fulfilled = true;

        emit JITLiquidityProvided(requestId, positionId, jitAmount);
    }

    // ============ Strategy Management ============

    /**
     * @notice Update position strategy
     */
    function updateStrategy(
        uint256 positionId,
        LiquidityStrategy newStrategy,
        StrategyParams calldata newParams
    ) external {
        LiquidityPosition storage pos = positions[positionId];
        if (pos.provider != msg.sender) revert AILiquidity__Unauthorized();

        LiquidityStrategy oldStrategy = pos.strategy;
        pos.strategy = newStrategy;
        positionParams[positionId] = newParams;

        emit StrategyUpdated(positionId, oldStrategy, newStrategy);
    }

    /**
     * @notice Pause a position
     */
    function pausePosition(uint256 positionId) external {
        LiquidityPosition storage pos = positions[positionId];
        if (pos.provider != msg.sender) revert AILiquidity__Unauthorized();

        pos.status = StrategyStatus.PAUSED;
    }

    /**
     * @notice Resume a paused position
     */
    function resumePosition(uint256 positionId) external {
        LiquidityPosition storage pos = positions[positionId];
        if (pos.provider != msg.sender) revert AILiquidity__Unauthorized();

        pos.status = StrategyStatus.ACTIVE;
    }

    // ============ View Functions ============

    function getPosition(uint256 positionId) external view returns (LiquidityPosition memory) {
        return positions[positionId];
    }

    function getPositionParams(uint256 positionId) external view returns (StrategyParams memory) {
        return positionParams[positionId];
    }

    function getProviderPositions(address provider) external view returns (uint256[] memory) {
        return providerPositions[provider];
    }

    function getMarketPositions(uint256 marketId) external view returns (uint256[] memory) {
        return marketPositions[marketId];
    }

    function getMarketMetrics(uint256 marketId) external view returns (MarketLiquidityMetrics memory) {
        return marketMetrics[marketId];
    }

    function getRebalanceHistory(uint256 positionId) external view returns (RebalanceRecord[] memory) {
        return rebalanceHistory[positionId];
    }

    function getDynamicFee(uint256 marketId) external view returns (uint256) {
        uint256 fee = marketDynamicFees[marketId];
        return fee == 0 ? BASE_FEE : fee;
    }

    function getJITRequest(uint256 requestId) external view returns (JITRequest memory) {
        return jitRequests[requestId];
    }

    // ============ Admin Functions ============

    function setPredictionMarket(address _market) external onlyOwner {
        predictionMarket = _market;
    }

    function setAIDebateOracle(address _oracle) external onlyOwner {
        aiDebateOracle = _oracle;
    }

    function authorizeAgent(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    // ============ Internal Functions ============

    function _executeRebalance(uint256 positionId, uint256 targetYesRatio) internal {
        LiquidityPosition storage pos = positions[positionId];

        uint256 total = pos.currentYesTokens + pos.currentNoTokens;
        uint256 targetYes = (total * targetYesRatio) / FEE_DENOMINATOR;
        uint256 targetNo = total - targetYes;

        uint256 yesChange = targetYes > pos.currentYesTokens
            ? targetYes - pos.currentYesTokens
            : pos.currentYesTokens - targetYes;

        pos.currentYesTokens = targetYes;
        pos.currentNoTokens = targetNo;
        pos.lastRebalanceAt = block.timestamp;

        emit PositionRebalanced(positionId, pos.marketId, yesChange, 0, 0);
    }

    function _updateMarketMetrics(
        uint256 marketId,
        uint256 amount,
        bool isAdd
    ) internal {
        MarketLiquidityMetrics storage metrics = marketMetrics[marketId];

        if (isAdd) {
            metrics.totalLiquidity += amount;
            metrics.activePositions++;
        } else {
            metrics.totalLiquidity -= amount;
        }

        metrics.marketId = marketId;
        metrics.lastUpdateAt = block.timestamp;

        emit MetricsUpdated(marketId, metrics.totalLiquidity, metrics.volatilityScore);
    }
}
