// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IPredictionMarket} from "./Interfaces/IPredictionMarket.sol";
import {IZeroGOracle} from "./Interfaces/IZeroGOracle.sol";
import {OutcomeToken} from "./OutcomeToken.sol";

/**
 * @title PredictionMarketAMM
 * @author Warriors AI Arena
 * @notice AMM-based prediction market for battle outcomes and custom markets
 * @dev Uses constant product formula (x * y = k) for price discovery
 *
 * Key Features:
 * - Create markets on battle outcomes or custom questions
 * - AMM pricing with liquidity provision
 * - 0G AI Oracle integration for trustless resolution
 * - CRwN token as collateral
 */
contract PredictionMarketAMM is IPredictionMarket, Ownable, ReentrancyGuard {
    // Errors
    error PredictionMarket__InvalidMarket();
    error PredictionMarket__MarketNotActive();
    error PredictionMarket__MarketNotResolved();
    error PredictionMarket__MarketAlreadyResolved();
    error PredictionMarket__InvalidAmount();
    error PredictionMarket__InvalidEndTime();
    error PredictionMarket__SlippageExceeded();
    error PredictionMarket__InsufficientLiquidity();
    error PredictionMarket__NoWinnings();
    error PredictionMarket__AlreadyClaimed();
    error PredictionMarket__InvalidOracle();
    error PredictionMarket__Unauthorized();

    // Constants
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant PLATFORM_FEE = 200; // 2%
    uint256 public constant MIN_LIQUIDITY = 1e18; // Minimum 1 CRwN
    uint256 public constant INITIAL_ODDS = 5000; // 50-50 starting odds

    // State
    IERC20 public immutable crownToken;
    OutcomeToken public immutable outcomeToken;
    IZeroGOracle public oracle;

    uint256 public nextMarketId = 1;
    uint256 public totalFeeCollected;

    // Mappings
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => uint256) public lpTotalSupply; // marketId => total LP tokens
    mapping(uint256 => mapping(address => uint256)) public lpBalances; // marketId => user => LP balance

    uint256[] private activeMarketIds;
    mapping(address => uint256[]) private userMarketIds;

    // Events (additional to interface)
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event FeesCollected(uint256 amount, address indexed collector);

    constructor(
        address _crownToken,
        address _outcomeToken,
        address _oracle
    ) Ownable(msg.sender) {
        crownToken = IERC20(_crownToken);
        outcomeToken = OutcomeToken(_outcomeToken);
        oracle = IZeroGOracle(_oracle);
    }

    // ============ Market Creation ============

    /**
     * @notice Create a custom prediction market
     */
    function createMarket(
        string calldata question,
        uint256 endTime,
        uint256 initialLiquidity
    ) external override nonReentrant returns (uint256 marketId) {
        if (endTime <= block.timestamp) revert PredictionMarket__InvalidEndTime();
        if (initialLiquidity < MIN_LIQUIDITY) revert PredictionMarket__InsufficientLiquidity();

        marketId = nextMarketId++;

        // Transfer collateral
        crownToken.transferFrom(msg.sender, address(this), initialLiquidity);

        // Initialize market with 50-50 odds
        uint256 initialTokens = initialLiquidity / 2;

        markets[marketId] = Market({
            id: marketId,
            question: question,
            endTime: endTime,
            resolutionTime: 0,
            status: MarketStatus.ACTIVE,
            outcome: Outcome.UNDECIDED,
            yesTokens: initialTokens,
            noTokens: initialTokens,
            liquidity: initialLiquidity,
            totalVolume: 0,
            creator: msg.sender,
            battleId: 0,
            createdAt: block.timestamp
        });

        // Mint LP tokens to creator
        lpTotalSupply[marketId] = initialLiquidity;
        lpBalances[marketId][msg.sender] = initialLiquidity;

        // Mint outcome tokens to pool
        outcomeToken.mintCompleteSet(marketId, initialTokens, address(this));

        activeMarketIds.push(marketId);
        userMarketIds[msg.sender].push(marketId);

        emit MarketCreated(marketId, question, endTime, msg.sender, 0);
        emit LiquidityAdded(marketId, msg.sender, initialLiquidity, initialLiquidity);
    }

    /**
     * @notice Create a market for a battle outcome
     */
    function createBattleMarket(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 endTime,
        uint256 initialLiquidity
    ) external override nonReentrant returns (uint256 marketId) {
        if (endTime <= block.timestamp) revert PredictionMarket__InvalidEndTime();
        if (initialLiquidity < MIN_LIQUIDITY) revert PredictionMarket__InsufficientLiquidity();

        marketId = nextMarketId++;

        // Transfer collateral
        crownToken.transferFrom(msg.sender, address(this), initialLiquidity);

        // Create question
        string memory question = string(
            abi.encodePacked(
                "Will Warrior #",
                _toString(warrior1Id),
                " defeat Warrior #",
                _toString(warrior2Id),
                " in Battle #",
                _toString(battleId),
                "?"
            )
        );

        uint256 initialTokens = initialLiquidity / 2;

        markets[marketId] = Market({
            id: marketId,
            question: question,
            endTime: endTime,
            resolutionTime: 0,
            status: MarketStatus.ACTIVE,
            outcome: Outcome.UNDECIDED,
            yesTokens: initialTokens,
            noTokens: initialTokens,
            liquidity: initialLiquidity,
            totalVolume: 0,
            creator: msg.sender,
            battleId: battleId,
            createdAt: block.timestamp
        });

        // Mint LP tokens
        lpTotalSupply[marketId] = initialLiquidity;
        lpBalances[marketId][msg.sender] = initialLiquidity;

        // Mint outcome tokens
        outcomeToken.mintCompleteSet(marketId, initialTokens, address(this));

        activeMarketIds.push(marketId);
        userMarketIds[msg.sender].push(marketId);

        emit MarketCreated(marketId, question, endTime, msg.sender, battleId);
        emit LiquidityAdded(marketId, msg.sender, initialLiquidity, initialLiquidity);
    }

    // ============ Trading ============

    /**
     * @notice Buy outcome tokens
     * @dev Uses constant product formula: x * y = k
     */
    function buy(
        uint256 marketId,
        bool isYes,
        uint256 collateralAmount,
        uint256 minTokensOut
    ) external override nonReentrant returns (uint256 tokensReceived) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.ACTIVE) revert PredictionMarket__MarketNotActive();
        if (block.timestamp >= market.endTime) revert PredictionMarket__MarketNotActive();
        if (collateralAmount == 0) revert PredictionMarket__InvalidAmount();

        // Calculate fee
        uint256 fee = (collateralAmount * PLATFORM_FEE) / FEE_DENOMINATOR;
        uint256 amountAfterFee = collateralAmount - fee;
        totalFeeCollected += fee;

        // Calculate tokens out using constant product
        tokensReceived = _calculateBuyTokens(market, isYes, amountAfterFee);

        if (tokensReceived < minTokensOut) revert PredictionMarket__SlippageExceeded();

        // Transfer collateral
        crownToken.transferFrom(msg.sender, address(this), collateralAmount);

        // Update pool state
        if (isYes) {
            market.yesTokens -= tokensReceived;
            market.noTokens += amountAfterFee;
        } else {
            market.noTokens -= tokensReceived;
            market.yesTokens += amountAfterFee;
        }

        market.totalVolume += collateralAmount;

        // Mint tokens to buyer
        outcomeToken.mint(marketId, isYes, tokensReceived, msg.sender);

        // Update position
        Position storage pos = positions[marketId][msg.sender];
        if (isYes) {
            pos.yesTokens += tokensReceived;
        } else {
            pos.noTokens += tokensReceived;
        }
        pos.totalInvested += collateralAmount;

        emit TokensPurchased(marketId, msg.sender, isYes, collateralAmount, tokensReceived);
    }

    /**
     * @notice Sell outcome tokens back to the pool
     */
    function sell(
        uint256 marketId,
        bool isYes,
        uint256 tokenAmount,
        uint256 minCollateralOut
    ) external override nonReentrant returns (uint256 collateralReceived) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.ACTIVE) revert PredictionMarket__MarketNotActive();
        if (block.timestamp >= market.endTime) revert PredictionMarket__MarketNotActive();
        if (tokenAmount == 0) revert PredictionMarket__InvalidAmount();

        // Calculate collateral out
        uint256 grossCollateral = _calculateSellCollateral(market, isYes, tokenAmount);

        // Apply fee
        uint256 fee = (grossCollateral * PLATFORM_FEE) / FEE_DENOMINATOR;
        collateralReceived = grossCollateral - fee;
        totalFeeCollected += fee;

        if (collateralReceived < minCollateralOut) revert PredictionMarket__SlippageExceeded();

        // Burn tokens from seller
        outcomeToken.burn(marketId, isYes, tokenAmount, msg.sender);

        // Update pool state
        if (isYes) {
            market.yesTokens += tokenAmount;
            market.noTokens -= grossCollateral;
        } else {
            market.noTokens += tokenAmount;
            market.yesTokens -= grossCollateral;
        }

        // Transfer collateral to seller
        crownToken.transfer(msg.sender, collateralReceived);

        // Update position
        Position storage pos = positions[marketId][msg.sender];
        if (isYes) {
            pos.yesTokens -= tokenAmount;
        } else {
            pos.noTokens -= tokenAmount;
        }

        emit TokensSold(marketId, msg.sender, isYes, tokenAmount, collateralReceived);
    }

    // ============ Liquidity ============

    /**
     * @notice Add liquidity to a market
     */
    function addLiquidity(
        uint256 marketId,
        uint256 collateralAmount
    ) external override nonReentrant returns (uint256 lpTokens) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.ACTIVE) revert PredictionMarket__MarketNotActive();
        if (collateralAmount < MIN_LIQUIDITY) revert PredictionMarket__InsufficientLiquidity();

        // Calculate LP tokens to mint (proportional to current pool)
        uint256 totalLp = lpTotalSupply[marketId];
        if (totalLp == 0) {
            lpTokens = collateralAmount;
        } else {
            lpTokens = (collateralAmount * totalLp) / market.liquidity;
        }

        // Transfer collateral
        crownToken.transferFrom(msg.sender, address(this), collateralAmount);

        // Update market state
        uint256 additionalTokens = collateralAmount / 2;
        market.yesTokens += additionalTokens;
        market.noTokens += additionalTokens;
        market.liquidity += collateralAmount;

        // Mint LP tokens
        lpTotalSupply[marketId] += lpTokens;
        lpBalances[marketId][msg.sender] += lpTokens;

        // Mint outcome tokens
        outcomeToken.mintCompleteSet(marketId, additionalTokens, address(this));

        // Update position
        positions[marketId][msg.sender].lpTokens += lpTokens;

        emit LiquidityAdded(marketId, msg.sender, collateralAmount, lpTokens);
    }

    /**
     * @notice Remove liquidity from a market
     */
    function removeLiquidity(
        uint256 marketId,
        uint256 lpTokenAmount
    ) external override nonReentrant returns (uint256 collateral, uint256 yesTokens, uint256 noTokens) {
        Market storage market = markets[marketId];
        if (lpBalances[marketId][msg.sender] < lpTokenAmount) revert PredictionMarket__InsufficientLiquidity();

        uint256 totalLp = lpTotalSupply[marketId];
        uint256 share = (lpTokenAmount * 1e18) / totalLp;

        // Calculate proportional share of pool
        yesTokens = (market.yesTokens * share) / 1e18;
        noTokens = (market.noTokens * share) / 1e18;

        // Calculate redeemable collateral (min of yes/no represents matched pairs)
        uint256 matchedPairs = yesTokens < noTokens ? yesTokens : noTokens;
        collateral = matchedPairs; // 1 CRwN per matched pair

        // Burn LP tokens
        lpTotalSupply[marketId] -= lpTokenAmount;
        lpBalances[marketId][msg.sender] -= lpTokenAmount;

        // Update market state
        market.yesTokens -= yesTokens;
        market.noTokens -= noTokens;
        market.liquidity -= collateral;

        // Transfer assets
        if (collateral > 0) {
            crownToken.transfer(msg.sender, collateral);
        }

        // Transfer excess tokens
        uint256 excessYes = yesTokens - matchedPairs;
        uint256 excessNo = noTokens - matchedPairs;

        if (excessYes > 0) {
            outcomeToken.mint(marketId, true, excessYes, msg.sender);
        }
        if (excessNo > 0) {
            outcomeToken.mint(marketId, false, excessNo, msg.sender);
        }

        // Burn matched pairs from pool
        if (matchedPairs > 0) {
            outcomeToken.burnCompleteSet(marketId, matchedPairs, address(this));
        }

        // Update position
        positions[marketId][msg.sender].lpTokens -= lpTokenAmount;

        emit LiquidityRemoved(marketId, msg.sender, lpTokenAmount, collateral, excessYes, excessNo);
    }

    // ============ Resolution ============

    /**
     * @notice Resolve a market with oracle proof
     */
    function resolveMarket(
        uint256 marketId,
        Outcome outcome,
        bytes calldata oracleProof
    ) external override {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.ACTIVE) revert PredictionMarket__MarketAlreadyResolved();
        if (block.timestamp < market.endTime) revert PredictionMarket__MarketNotActive();

        // Verify oracle proof (in production, verify 0G AI signatures)
        // For now, allow owner or verified oracle to resolve
        if (msg.sender != owner() && msg.sender != address(oracle)) {
            revert PredictionMarket__InvalidOracle();
        }

        market.status = MarketStatus.RESOLVED;
        market.outcome = outcome;
        market.resolutionTime = block.timestamp;

        // Remove from active markets
        _removeFromActiveMarkets(marketId);

        emit MarketResolved(marketId, outcome, msg.sender);
    }

    /**
     * @notice Claim winnings from a resolved market
     */
    function claimWinnings(uint256 marketId) external override nonReentrant returns (uint256 amount) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.RESOLVED) revert PredictionMarket__MarketNotResolved();
        if (hasClaimed[marketId][msg.sender]) revert PredictionMarket__AlreadyClaimed();

        uint256 yesBalance = outcomeToken.balanceOf(msg.sender, outcomeToken.getTokenId(marketId, true));
        uint256 noBalance = outcomeToken.balanceOf(msg.sender, outcomeToken.getTokenId(marketId, false));

        if (market.outcome == Outcome.YES) {
            amount = yesBalance; // 1 CRwN per winning YES token
        } else if (market.outcome == Outcome.NO) {
            amount = noBalance; // 1 CRwN per winning NO token
        } else if (market.outcome == Outcome.INVALID) {
            // Refund based on complete sets
            uint256 completeSets = yesBalance < noBalance ? yesBalance : noBalance;
            amount = completeSets;
        }

        if (amount == 0) revert PredictionMarket__NoWinnings();

        hasClaimed[marketId][msg.sender] = true;

        // Burn winning tokens
        if (market.outcome == Outcome.YES && yesBalance > 0) {
            outcomeToken.burn(marketId, true, yesBalance, msg.sender);
        } else if (market.outcome == Outcome.NO && noBalance > 0) {
            outcomeToken.burn(marketId, false, noBalance, msg.sender);
        }

        // Transfer winnings
        crownToken.transfer(msg.sender, amount);

        emit WinningsClaimed(marketId, msg.sender, amount);
    }

    // ============ View Functions ============

    function getMarket(uint256 marketId) external view override returns (Market memory) {
        return markets[marketId];
    }

    function getPrice(uint256 marketId) external view override returns (uint256 yesPrice, uint256 noPrice) {
        Market storage market = markets[marketId];
        uint256 total = market.yesTokens + market.noTokens;
        if (total == 0) {
            return (5000, 5000); // 50-50
        }
        // Price in basis points (0-10000)
        yesPrice = (market.noTokens * 10000) / total;
        noPrice = (market.yesTokens * 10000) / total;
    }

    function getPosition(uint256 marketId, address user) external view override returns (Position memory) {
        return positions[marketId][user];
    }

    function calculateBuyAmount(
        uint256 marketId,
        bool isYes,
        uint256 collateralAmount
    ) external view override returns (uint256) {
        Market storage market = markets[marketId];
        uint256 amountAfterFee = collateralAmount - (collateralAmount * PLATFORM_FEE) / FEE_DENOMINATOR;
        return _calculateBuyTokens(market, isYes, amountAfterFee);
    }

    function calculateSellAmount(
        uint256 marketId,
        bool isYes,
        uint256 tokenAmount
    ) external view override returns (uint256) {
        Market storage market = markets[marketId];
        uint256 gross = _calculateSellCollateral(market, isYes, tokenAmount);
        return gross - (gross * PLATFORM_FEE) / FEE_DENOMINATOR;
    }

    function getActiveMarkets() external view override returns (uint256[] memory) {
        return activeMarketIds;
    }

    function getUserMarkets(address user) external view override returns (uint256[] memory) {
        return userMarketIds[user];
    }

    function getLpBalance(uint256 marketId, address user) external view returns (uint256) {
        return lpBalances[marketId][user];
    }

    // ============ Admin ============

    function setOracle(address _oracle) external onlyOwner {
        address oldOracle = address(oracle);
        oracle = IZeroGOracle(_oracle);
        emit OracleUpdated(oldOracle, _oracle);
    }

    function collectFees(address to) external onlyOwner {
        uint256 amount = totalFeeCollected;
        totalFeeCollected = 0;
        crownToken.transfer(to, amount);
        emit FeesCollected(amount, to);
    }

    // ============ Internal ============

    function _calculateBuyTokens(
        Market storage market,
        bool isYes,
        uint256 collateralIn
    ) internal view returns (uint256) {
        // Constant product: x * y = k
        // User adds collateral (increases one side), gets tokens (decreases other side)
        uint256 tokenReserve = isYes ? market.yesTokens : market.noTokens;
        uint256 collateralReserve = isYes ? market.noTokens : market.yesTokens;

        // tokens_out = reserve_tokens - (k / (reserve_collateral + collateral_in))
        uint256 k = tokenReserve * collateralReserve;
        uint256 newCollateralReserve = collateralReserve + collateralIn;
        uint256 newTokenReserve = k / newCollateralReserve;

        return tokenReserve - newTokenReserve;
    }

    function _calculateSellCollateral(
        Market storage market,
        bool isYes,
        uint256 tokensIn
    ) internal view returns (uint256) {
        uint256 tokenReserve = isYes ? market.yesTokens : market.noTokens;
        uint256 collateralReserve = isYes ? market.noTokens : market.yesTokens;

        uint256 k = tokenReserve * collateralReserve;
        uint256 newTokenReserve = tokenReserve + tokensIn;
        uint256 newCollateralReserve = k / newTokenReserve;

        return collateralReserve - newCollateralReserve;
    }

    function _removeFromActiveMarkets(uint256 marketId) internal {
        for (uint256 i = 0; i < activeMarketIds.length; i++) {
            if (activeMarketIds[i] == marketId) {
                activeMarketIds[i] = activeMarketIds[activeMarketIds.length - 1];
                activeMarketIds.pop();
                break;
            }
        }
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
