// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/**
 * @title MicroMarketFactory
 * @author Warriors AI Arena
 * @notice Factory for creating and managing micro-markets for battle events
 * @dev Enables granular betting on rounds, moves, damage thresholds, and special events
 *
 * Market Types:
 * - ROUND_WINNER: Who wins round N?
 * - MOVE_PREDICTION: Will warrior use specific move?
 * - DAMAGE_THRESHOLD: Total damage over/under X?
 * - FIRST_BLOOD: Who deals damage first?
 * - COMEBACK: Will trailing warrior win?
 * - PERFECT_ROUND: Zero damage taken?
 */
contract MicroMarketFactory is Ownable, ReentrancyGuard {
    // ============ Errors ============
    error MicroMarket__InvalidBattle();
    error MicroMarket__InvalidRound();
    error MicroMarket__InvalidMarketType();
    error MicroMarket__MarketNotActive();
    error MicroMarket__MarketNotResolved();
    error MicroMarket__MarketAlreadyResolved();
    error MicroMarket__InvalidAmount();
    error MicroMarket__InvalidEndTime();
    error MicroMarket__SlippageExceeded();
    error MicroMarket__InsufficientLiquidity();
    error MicroMarket__NoWinnings();
    error MicroMarket__AlreadyClaimed();
    error MicroMarket__Unauthorized();
    error MicroMarket__InvalidMove();
    error MicroMarket__InvalidThreshold();
    error MicroMarket__BattleNotStarted();
    error MicroMarket__RoundAlreadyResolved();

    // ============ Enums ============

    /// @notice Types of micro-markets
    enum MicroMarketType {
        ROUND_WINNER,       // Who wins round N? (YES = Warrior1, NO = Warrior2)
        MOVE_PREDICTION,    // Will warrior use specific move?
        DAMAGE_THRESHOLD,   // Total damage > threshold?
        FIRST_BLOOD,        // Who deals damage first? (YES = Warrior1)
        COMEBACK,           // Will trailing warrior win?
        PERFECT_ROUND,      // Zero damage taken in round?
        CRITICAL_HIT,       // Will there be a critical hit?
        DOMINANT_WIN        // Winner with >50% health remaining?
    }

    /// @notice Warrior moves (matching Arena.sol)
    enum PlayerMoves {
        STRIKE,     // Strength-based attack
        TAUNT,      // Charisma + Wit
        DODGE,      // Defence-based
        SPECIAL,    // All traits combined
        RECOVER     // Defence + Charisma
    }

    /// @notice Market status
    enum MarketStatus {
        ACTIVE,
        PAUSED,
        RESOLVED,
        CANCELLED
    }

    /// @notice Market outcome
    enum Outcome {
        UNDECIDED,
        YES,
        NO,
        DRAW,
        INVALID
    }

    // ============ Structs ============

    /// @notice Micro-market configuration
    struct MicroMarket {
        uint256 id;
        uint256 battleId;
        uint256 parentMarketId;     // Link to main battle market
        MicroMarketType marketType;
        uint8 roundNumber;          // 1-5 for round markets
        uint256 warrior1Id;
        uint256 warrior2Id;
        PlayerMoves targetMove;     // For MOVE_PREDICTION
        uint256 threshold;          // For DAMAGE_THRESHOLD
        string question;
        uint256 endTime;
        uint256 resolutionTime;
        MarketStatus status;
        Outcome outcome;
        uint256 yesPool;            // YES token pool
        uint256 noPool;             // NO token pool
        uint256 totalVolume;
        address creator;
        uint256 createdAt;
    }

    /// @notice User position in a micro-market
    struct Position {
        uint256 yesTokens;
        uint256 noTokens;
        uint256 totalInvested;
        bool hasClaimed;
    }

    /// @notice Battle round data for resolution
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

    // ============ Constants ============
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant PLATFORM_FEE = 150;         // 1.5%
    uint256 public constant CREATOR_FEE = 50;           // 0.5%
    uint256 public constant MIN_LIQUIDITY = 0.1 ether;  // Lower for micro-markets
    uint256 public constant MAX_ROUNDS = 5;

    // ============ State ============
    IERC20 public immutable crownToken;
    address public arenaContract;
    address public mainPredictionMarket;

    uint256 public nextMarketId = 1;
    uint256 public totalFeeCollected;
    uint256 public totalCreatorFeeCollected;

    // Market mappings
    mapping(uint256 => MicroMarket) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;

    // Battle => Round => RoundData
    mapping(uint256 => mapping(uint8 => RoundData)) public battleRoundData;
    mapping(uint256 => bool) public battleStarted;

    // Battle => Round => MarketType => MarketId
    mapping(uint256 => mapping(uint8 => mapping(MicroMarketType => uint256))) public battleRoundMarkets;

    // Battle => all micro-market IDs
    mapping(uint256 => uint256[]) public battleMicroMarkets;

    // Active markets
    uint256[] public activeMarketIds;

    // ============ Events ============
    event MicroMarketCreated(
        uint256 indexed marketId,
        uint256 indexed battleId,
        MicroMarketType marketType,
        uint8 roundNumber,
        string question
    );

    event RoundStarted(
        uint256 indexed battleId,
        uint8 indexed round,
        uint256 timestamp
    );

    event MoveExecuted(
        uint256 indexed battleId,
        uint256 indexed warriorId,
        PlayerMoves move,
        uint8 round
    );

    event DamageDealt(
        uint256 indexed battleId,
        uint256 indexed attackerId,
        uint256 damage,
        uint8 round
    );

    event RoundResolved(
        uint256 indexed battleId,
        uint8 indexed round,
        uint256 warrior1Damage,
        uint256 warrior2Damage
    );

    event MicroMarketResolved(
        uint256 indexed marketId,
        Outcome outcome
    );

    event TokensPurchased(
        uint256 indexed marketId,
        address indexed buyer,
        bool isYes,
        uint256 amount,
        uint256 tokens
    );

    event TokensSold(
        uint256 indexed marketId,
        address indexed seller,
        bool isYes,
        uint256 tokens,
        uint256 amount
    );

    event WinningsClaimed(
        uint256 indexed marketId,
        address indexed user,
        uint256 amount
    );

    // ============ Constructor ============
    constructor(
        address _crownToken,
        address _arenaContract
    ) Ownable(msg.sender) {
        crownToken = IERC20(_crownToken);
        arenaContract = _arenaContract;
    }

    // ============ Market Creation ============

    /**
     * @notice Create all micro-markets for a battle
     * @param battleId The battle ID
     * @param warrior1Id Warrior 1 NFT ID
     * @param warrior2Id Warrior 2 NFT ID
     * @param battleEndTime When the battle ends
     */
    function createBattleMicroMarkets(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 battleEndTime
    ) external nonReentrant returns (uint256[] memory marketIds) {
        if (battleId == 0) revert MicroMarket__InvalidBattle();

        // Create round winner markets for all 5 rounds
        marketIds = new uint256[](5);

        for (uint8 round = 1; round <= MAX_ROUNDS; round++) {
            uint256 marketId = _createRoundWinnerMarket(
                battleId,
                warrior1Id,
                warrior2Id,
                round,
                battleEndTime
            );
            marketIds[round - 1] = marketId;
        }

        battleStarted[battleId] = true;
    }

    /**
     * @notice Create a round winner market
     */
    function createRoundWinnerMarket(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint8 round,
        uint256 endTime
    ) external nonReentrant returns (uint256 marketId) {
        return _createRoundWinnerMarket(battleId, warrior1Id, warrior2Id, round, endTime);
    }

    /**
     * @notice Create a move prediction market
     */
    function createMovePredictionMarket(
        uint256 battleId,
        uint256 warriorId,
        PlayerMoves targetMove,
        uint8 round,
        uint256 endTime
    ) external nonReentrant returns (uint256 marketId) {
        if (round == 0 || round > MAX_ROUNDS) revert MicroMarket__InvalidRound();

        marketId = nextMarketId++;

        string memory question = string(
            abi.encodePacked(
                "Will Warrior #",
                _toString(warriorId),
                " use ",
                _moveToString(targetMove),
                " in Round ",
                _toString(round),
                "?"
            )
        );

        markets[marketId] = MicroMarket({
            id: marketId,
            battleId: battleId,
            parentMarketId: 0,
            marketType: MicroMarketType.MOVE_PREDICTION,
            roundNumber: round,
            warrior1Id: warriorId,
            warrior2Id: 0,
            targetMove: targetMove,
            threshold: 0,
            question: question,
            endTime: endTime,
            resolutionTime: 0,
            status: MarketStatus.ACTIVE,
            outcome: Outcome.UNDECIDED,
            yesPool: MIN_LIQUIDITY,
            noPool: MIN_LIQUIDITY,
            totalVolume: 0,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        battleRoundMarkets[battleId][round][MicroMarketType.MOVE_PREDICTION] = marketId;
        battleMicroMarkets[battleId].push(marketId);
        activeMarketIds.push(marketId);

        emit MicroMarketCreated(marketId, battleId, MicroMarketType.MOVE_PREDICTION, round, question);
    }

    /**
     * @notice Create a damage threshold market
     */
    function createDamageThresholdMarket(
        uint256 battleId,
        uint256 threshold,
        uint8 round,
        uint256 endTime
    ) external nonReentrant returns (uint256 marketId) {
        if (round == 0 || round > MAX_ROUNDS) revert MicroMarket__InvalidRound();
        if (threshold == 0) revert MicroMarket__InvalidThreshold();

        marketId = nextMarketId++;

        string memory question = string(
            abi.encodePacked(
                "Will total damage in Round ",
                _toString(round),
                " exceed ",
                _toString(threshold),
                "?"
            )
        );

        markets[marketId] = MicroMarket({
            id: marketId,
            battleId: battleId,
            parentMarketId: 0,
            marketType: MicroMarketType.DAMAGE_THRESHOLD,
            roundNumber: round,
            warrior1Id: 0,
            warrior2Id: 0,
            targetMove: PlayerMoves.STRIKE,
            threshold: threshold,
            question: question,
            endTime: endTime,
            resolutionTime: 0,
            status: MarketStatus.ACTIVE,
            outcome: Outcome.UNDECIDED,
            yesPool: MIN_LIQUIDITY,
            noPool: MIN_LIQUIDITY,
            totalVolume: 0,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        battleRoundMarkets[battleId][round][MicroMarketType.DAMAGE_THRESHOLD] = marketId;
        battleMicroMarkets[battleId].push(marketId);
        activeMarketIds.push(marketId);

        emit MicroMarketCreated(marketId, battleId, MicroMarketType.DAMAGE_THRESHOLD, round, question);
    }

    /**
     * @notice Create a first blood market
     */
    function createFirstBloodMarket(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 endTime
    ) external nonReentrant returns (uint256 marketId) {
        marketId = nextMarketId++;

        string memory question = string(
            abi.encodePacked(
                "Will Warrior #",
                _toString(warrior1Id),
                " deal damage before Warrior #",
                _toString(warrior2Id),
                "?"
            )
        );

        markets[marketId] = MicroMarket({
            id: marketId,
            battleId: battleId,
            parentMarketId: 0,
            marketType: MicroMarketType.FIRST_BLOOD,
            roundNumber: 1,
            warrior1Id: warrior1Id,
            warrior2Id: warrior2Id,
            targetMove: PlayerMoves.STRIKE,
            threshold: 0,
            question: question,
            endTime: endTime,
            resolutionTime: 0,
            status: MarketStatus.ACTIVE,
            outcome: Outcome.UNDECIDED,
            yesPool: MIN_LIQUIDITY,
            noPool: MIN_LIQUIDITY,
            totalVolume: 0,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        battleRoundMarkets[battleId][1][MicroMarketType.FIRST_BLOOD] = marketId;
        battleMicroMarkets[battleId].push(marketId);
        activeMarketIds.push(marketId);

        emit MicroMarketCreated(marketId, battleId, MicroMarketType.FIRST_BLOOD, 1, question);
    }

    // ============ Trading ============

    /**
     * @notice Buy outcome tokens in a micro-market
     */
    function buy(
        uint256 marketId,
        bool isYes,
        uint256 collateralAmount,
        uint256 minTokensOut
    ) external nonReentrant returns (uint256 tokensReceived) {
        MicroMarket storage market = markets[marketId];
        if (market.status != MarketStatus.ACTIVE) revert MicroMarket__MarketNotActive();
        if (block.timestamp >= market.endTime) revert MicroMarket__MarketNotActive();
        if (collateralAmount == 0) revert MicroMarket__InvalidAmount();

        // Calculate fees
        uint256 platformFee = (collateralAmount * PLATFORM_FEE) / FEE_DENOMINATOR;
        uint256 creatorFee = (collateralAmount * CREATOR_FEE) / FEE_DENOMINATOR;
        uint256 amountAfterFee = collateralAmount - platformFee - creatorFee;

        totalFeeCollected += platformFee;
        totalCreatorFeeCollected += creatorFee;

        // Calculate tokens using constant product
        tokensReceived = _calculateBuyTokens(market, isYes, amountAfterFee);
        if (tokensReceived < minTokensOut) revert MicroMarket__SlippageExceeded();

        // Transfer collateral
        crownToken.transferFrom(msg.sender, address(this), collateralAmount);

        // Update pool state
        if (isYes) {
            market.yesPool -= tokensReceived;
            market.noPool += amountAfterFee;
        } else {
            market.noPool -= tokensReceived;
            market.yesPool += amountAfterFee;
        }

        market.totalVolume += collateralAmount;

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
    ) external nonReentrant returns (uint256 collateralReceived) {
        MicroMarket storage market = markets[marketId];
        if (market.status != MarketStatus.ACTIVE) revert MicroMarket__MarketNotActive();
        if (block.timestamp >= market.endTime) revert MicroMarket__MarketNotActive();
        if (tokenAmount == 0) revert MicroMarket__InvalidAmount();

        Position storage pos = positions[marketId][msg.sender];
        if (isYes && pos.yesTokens < tokenAmount) revert MicroMarket__InsufficientLiquidity();
        if (!isYes && pos.noTokens < tokenAmount) revert MicroMarket__InsufficientLiquidity();

        // Calculate collateral out
        uint256 grossCollateral = _calculateSellCollateral(market, isYes, tokenAmount);

        uint256 platformFee = (grossCollateral * PLATFORM_FEE) / FEE_DENOMINATOR;
        collateralReceived = grossCollateral - platformFee;
        totalFeeCollected += platformFee;

        if (collateralReceived < minCollateralOut) revert MicroMarket__SlippageExceeded();

        // Update pool state
        if (isYes) {
            market.yesPool += tokenAmount;
            market.noPool -= grossCollateral;
            pos.yesTokens -= tokenAmount;
        } else {
            market.noPool += tokenAmount;
            market.yesPool -= grossCollateral;
            pos.noTokens -= tokenAmount;
        }

        // Transfer collateral
        crownToken.transfer(msg.sender, collateralReceived);

        emit TokensSold(marketId, msg.sender, isYes, tokenAmount, collateralReceived);
    }

    // ============ Round Event Recording ============

    /**
     * @notice Record when a round starts
     * @dev Called by Arena contract or authorized source
     */
    function onRoundStart(uint256 battleId, uint8 round) external {
        // In production, add access control
        if (!battleStarted[battleId]) revert MicroMarket__BattleNotStarted();

        battleRoundData[battleId][round].roundNumber = round;
        battleRoundData[battleId][round].timestamp = block.timestamp;

        emit RoundStarted(battleId, round, block.timestamp);
    }

    /**
     * @notice Record a move executed by a warrior
     */
    function onMoveExecuted(
        uint256 battleId,
        uint256 warriorId,
        PlayerMoves move,
        uint8 round
    ) external {
        // In production, add access control
        RoundData storage rd = battleRoundData[battleId][round];

        // Determine which warrior
        MicroMarket storage roundMarket = markets[battleRoundMarkets[battleId][round][MicroMarketType.ROUND_WINNER]];

        if (warriorId == roundMarket.warrior1Id) {
            rd.warrior1Move = move;
        } else {
            rd.warrior2Move = move;
        }

        emit MoveExecuted(battleId, warriorId, move, round);
    }

    /**
     * @notice Record round resolution data
     */
    function resolveRound(
        uint256 battleId,
        uint8 round,
        uint256 warrior1Damage,
        uint256 warrior2Damage,
        PlayerMoves warrior1Move,
        PlayerMoves warrior2Move,
        bool warrior1Dodged,
        bool warrior2Dodged
    ) external {
        // In production, add access control
        RoundData storage rd = battleRoundData[battleId][round];
        if (rd.isResolved) revert MicroMarket__RoundAlreadyResolved();

        rd.warrior1Damage = warrior1Damage;
        rd.warrior2Damage = warrior2Damage;
        rd.warrior1Move = warrior1Move;
        rd.warrior2Move = warrior2Move;
        rd.warrior1Dodged = warrior1Dodged;
        rd.warrior2Dodged = warrior2Dodged;
        rd.isResolved = true;

        emit RoundResolved(battleId, round, warrior1Damage, warrior2Damage);

        // Auto-resolve round winner market
        _resolveRoundWinnerMarket(battleId, round, warrior1Damage, warrior2Damage);
    }

    // ============ Market Resolution ============

    /**
     * @notice Resolve a micro-market
     */
    function resolveMarket(uint256 marketId, Outcome outcome) external {
        // In production, add oracle/access control
        MicroMarket storage market = markets[marketId];
        if (market.status == MarketStatus.RESOLVED) revert MicroMarket__MarketAlreadyResolved();

        market.status = MarketStatus.RESOLVED;
        market.outcome = outcome;
        market.resolutionTime = block.timestamp;

        _removeFromActiveMarkets(marketId);

        emit MicroMarketResolved(marketId, outcome);
    }

    /**
     * @notice Claim winnings from a resolved market
     */
    function claimWinnings(uint256 marketId) external nonReentrant returns (uint256 amount) {
        MicroMarket storage market = markets[marketId];
        if (market.status != MarketStatus.RESOLVED) revert MicroMarket__MarketNotResolved();

        Position storage pos = positions[marketId][msg.sender];
        if (pos.hasClaimed) revert MicroMarket__AlreadyClaimed();

        if (market.outcome == Outcome.YES) {
            amount = pos.yesTokens;
        } else if (market.outcome == Outcome.NO) {
            amount = pos.noTokens;
        } else if (market.outcome == Outcome.DRAW || market.outcome == Outcome.INVALID) {
            // Refund based on position
            uint256 minTokens = pos.yesTokens < pos.noTokens ? pos.yesTokens : pos.noTokens;
            amount = minTokens;
        }

        if (amount == 0) revert MicroMarket__NoWinnings();

        pos.hasClaimed = true;
        crownToken.transfer(msg.sender, amount);

        emit WinningsClaimed(marketId, msg.sender, amount);
    }

    // ============ View Functions ============

    function getMarket(uint256 marketId) external view returns (MicroMarket memory) {
        return markets[marketId];
    }

    function getPosition(uint256 marketId, address user) external view returns (Position memory) {
        return positions[marketId][user];
    }

    function getBattleMicroMarkets(uint256 battleId) external view returns (uint256[] memory) {
        return battleMicroMarkets[battleId];
    }

    function getRoundData(uint256 battleId, uint8 round) external view returns (RoundData memory) {
        return battleRoundData[battleId][round];
    }

    function getPrice(uint256 marketId) external view returns (uint256 yesPrice, uint256 noPrice) {
        MicroMarket storage market = markets[marketId];
        uint256 total = market.yesPool + market.noPool;
        if (total == 0) return (5000, 5000);

        yesPrice = (market.noPool * 10000) / total;
        noPrice = (market.yesPool * 10000) / total;
    }

    function getActiveMarkets() external view returns (uint256[] memory) {
        return activeMarketIds;
    }

    // ============ Admin Functions ============

    function setArenaContract(address _arena) external onlyOwner {
        arenaContract = _arena;
    }

    function setMainPredictionMarket(address _market) external onlyOwner {
        mainPredictionMarket = _market;
    }

    function collectFees(address to) external onlyOwner {
        uint256 amount = totalFeeCollected;
        totalFeeCollected = 0;
        crownToken.transfer(to, amount);
    }

    // ============ Internal Functions ============

    function _createRoundWinnerMarket(
        uint256 battleId,
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint8 round,
        uint256 endTime
    ) internal returns (uint256 marketId) {
        if (round == 0 || round > MAX_ROUNDS) revert MicroMarket__InvalidRound();

        marketId = nextMarketId++;

        string memory question = string(
            abi.encodePacked(
                "Will Warrior #",
                _toString(warrior1Id),
                " win Round ",
                _toString(round),
                " against Warrior #",
                _toString(warrior2Id),
                "?"
            )
        );

        markets[marketId] = MicroMarket({
            id: marketId,
            battleId: battleId,
            parentMarketId: 0,
            marketType: MicroMarketType.ROUND_WINNER,
            roundNumber: round,
            warrior1Id: warrior1Id,
            warrior2Id: warrior2Id,
            targetMove: PlayerMoves.STRIKE,
            threshold: 0,
            question: question,
            endTime: endTime,
            resolutionTime: 0,
            status: MarketStatus.ACTIVE,
            outcome: Outcome.UNDECIDED,
            yesPool: MIN_LIQUIDITY,
            noPool: MIN_LIQUIDITY,
            totalVolume: 0,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        battleRoundMarkets[battleId][round][MicroMarketType.ROUND_WINNER] = marketId;
        battleMicroMarkets[battleId].push(marketId);
        activeMarketIds.push(marketId);

        emit MicroMarketCreated(marketId, battleId, MicroMarketType.ROUND_WINNER, round, question);
    }

    function _resolveRoundWinnerMarket(
        uint256 battleId,
        uint8 round,
        uint256 warrior1Damage,
        uint256 warrior2Damage
    ) internal {
        uint256 marketId = battleRoundMarkets[battleId][round][MicroMarketType.ROUND_WINNER];
        if (marketId == 0) return;

        MicroMarket storage market = markets[marketId];
        if (market.status == MarketStatus.RESOLVED) return;

        Outcome outcome;
        // Warrior with less damage wins the round
        if (warrior1Damage < warrior2Damage) {
            outcome = Outcome.YES; // Warrior 1 won
        } else if (warrior2Damage < warrior1Damage) {
            outcome = Outcome.NO;  // Warrior 2 won
        } else {
            outcome = Outcome.DRAW;
        }

        market.status = MarketStatus.RESOLVED;
        market.outcome = outcome;
        market.resolutionTime = block.timestamp;

        _removeFromActiveMarkets(marketId);

        emit MicroMarketResolved(marketId, outcome);
    }

    function _calculateBuyTokens(
        MicroMarket storage market,
        bool isYes,
        uint256 collateralIn
    ) internal view returns (uint256) {
        uint256 tokenReserve = isYes ? market.yesPool : market.noPool;
        uint256 collateralReserve = isYes ? market.noPool : market.yesPool;

        uint256 k = tokenReserve * collateralReserve;
        uint256 newCollateralReserve = collateralReserve + collateralIn;
        uint256 newTokenReserve = k / newCollateralReserve;

        return tokenReserve - newTokenReserve;
    }

    function _calculateSellCollateral(
        MicroMarket storage market,
        bool isYes,
        uint256 tokensIn
    ) internal view returns (uint256) {
        uint256 tokenReserve = isYes ? market.yesPool : market.noPool;
        uint256 collateralReserve = isYes ? market.noPool : market.yesPool;

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

    function _moveToString(PlayerMoves move) internal pure returns (string memory) {
        if (move == PlayerMoves.STRIKE) return "STRIKE";
        if (move == PlayerMoves.TAUNT) return "TAUNT";
        if (move == PlayerMoves.DODGE) return "DODGE";
        if (move == PlayerMoves.SPECIAL) return "SPECIAL";
        if (move == PlayerMoves.RECOVER) return "RECOVER";
        return "UNKNOWN";
    }
}
