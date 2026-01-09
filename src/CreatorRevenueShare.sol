// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/**
 * @title CreatorRevenueShare
 * @author Warriors AI Arena
 * @notice Revenue distribution system for market and warrior creators
 * @dev Part of the AI-Native Gaming Prediction Market creator economy
 *
 * Fee Structure:
 * - Market Creator: 2% of trading volume
 * - Warrior Creator: 1% of bets on their warrior
 * - AI Agent Operators: 0.5% of copy-trade volume
 * - Liquidity Providers: 1% of all trades
 * - Protocol Treasury: 0.5% of all fees
 *
 * Features:
 * - Real-time fee tracking and distribution
 * - Volume milestone bonuses
 * - Creator tier system with bonus rates
 * - Claim rewards UI support
 */
contract CreatorRevenueShare is Ownable, ReentrancyGuard {
    // ============ Errors ============
    error CreatorRevenue__InvalidAddress();
    error CreatorRevenue__InvalidAmount();
    error CreatorRevenue__NoRewardsToClaim();
    error CreatorRevenue__NotCreator();
    error CreatorRevenue__CreatorExists();
    error CreatorRevenue__InsufficientBalance();
    error CreatorRevenue__InvalidPercentage();
    error CreatorRevenue__Unauthorized();

    // ============ Enums ============

    /// @notice Types of creators in the ecosystem
    enum CreatorType {
        MARKET_CREATOR,     // Creates prediction markets
        WARRIOR_CREATOR,    // Creates warrior NFTs
        AGENT_OPERATOR,     // Operates AI agents
        LIQUIDITY_PROVIDER  // Provides market liquidity
    }

    /// @notice Creator tier based on volume generated
    enum CreatorTier {
        BRONZE,     // Starting tier
        SILVER,     // 100 CRwN volume
        GOLD,       // 1,000 CRwN volume
        PLATINUM,   // 10,000 CRwN volume
        DIAMOND     // 100,000 CRwN volume
    }

    // ============ Structs ============

    /// @notice Creator profile and statistics
    struct Creator {
        address wallet;
        CreatorType creatorType;
        CreatorTier tier;
        uint256 totalVolumeGenerated;
        uint256 totalFeesEarned;
        uint256 pendingRewards;
        uint256 totalClaimed;
        uint256 marketsCreated;      // For market creators
        uint256 warriorsCreated;      // For warrior creators
        uint256 agentsOperated;       // For agent operators
        uint256 liquidityProvided;    // For LPs
        uint256 registeredAt;
        uint256 lastClaimAt;
        bool isActive;
    }

    /// @notice Revenue entry for tracking
    struct RevenueEntry {
        uint256 marketId;
        uint256 amount;
        uint256 timestamp;
        string source;  // "trade", "bet", "copy_trade", "lp_fee"
    }

    /// @notice Fee distribution for a specific market
    struct MarketFees {
        uint256 marketId;
        address marketCreator;
        uint256 totalFees;
        uint256 creatorFees;
        uint256 protocolFees;
        uint256 lpFees;
    }

    // ============ Constants ============
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Base fee percentages (in basis points)
    uint256 public constant MARKET_CREATOR_FEE = 200;      // 2%
    uint256 public constant WARRIOR_CREATOR_FEE = 100;     // 1%
    uint256 public constant AGENT_OPERATOR_FEE = 50;       // 0.5%
    uint256 public constant LP_FEE = 100;                  // 1%
    uint256 public constant PROTOCOL_FEE = 50;             // 0.5%

    // Tier bonus percentages (added to base)
    uint256 public constant BRONZE_BONUS = 0;
    uint256 public constant SILVER_BONUS = 25;             // +0.25%
    uint256 public constant GOLD_BONUS = 50;               // +0.5%
    uint256 public constant PLATINUM_BONUS = 100;          // +1%
    uint256 public constant DIAMOND_BONUS = 150;           // +1.5%

    // Volume thresholds for tier upgrades
    uint256 public constant SILVER_THRESHOLD = 100 ether;
    uint256 public constant GOLD_THRESHOLD = 1000 ether;
    uint256 public constant PLATINUM_THRESHOLD = 10000 ether;
    uint256 public constant DIAMOND_THRESHOLD = 100000 ether;

    // ============ State ============
    IERC20 public immutable crownToken;

    // Creator mappings
    mapping(address => Creator) public creators;
    mapping(address => bool) public isRegisteredCreator;
    mapping(address => RevenueEntry[]) public creatorRevenueHistory;

    // Market creator tracking
    mapping(uint256 => address) public marketCreators;
    mapping(uint256 => MarketFees) public marketFeeData;

    // Warrior creator tracking
    mapping(uint256 => address) public warriorCreators;

    // Agent operator tracking
    mapping(uint256 => address) public agentOperators;

    // Totals
    uint256 public totalCreators;
    uint256 public totalFeesDistributed;
    uint256 public totalProtocolFees;
    uint256 public protocolPendingFees;

    // Authorized contracts that can record fees
    mapping(address => bool) public authorizedContracts;

    // ============ Events ============
    event CreatorRegistered(
        address indexed creator,
        CreatorType creatorType,
        uint256 timestamp
    );

    event FeeRecorded(
        address indexed creator,
        uint256 indexed marketId,
        uint256 amount,
        string source
    );

    event FeeDistributed(
        address indexed creator,
        uint256 amount,
        CreatorType creatorType
    );

    event RewardsClaimed(
        address indexed creator,
        uint256 amount,
        uint256 timestamp
    );

    event TierUpgraded(
        address indexed creator,
        CreatorTier oldTier,
        CreatorTier newTier
    );

    event MarketCreatorSet(
        uint256 indexed marketId,
        address indexed creator
    );

    event WarriorCreatorSet(
        uint256 indexed warriorId,
        address indexed creator
    );

    event ContractAuthorized(address indexed contractAddress, bool authorized);

    event ProtocolFeesWithdrawn(address indexed to, uint256 amount);

    // ============ Constructor ============
    constructor(address _crownToken) Ownable(msg.sender) {
        if (_crownToken == address(0)) revert CreatorRevenue__InvalidAddress();
        crownToken = IERC20(_crownToken);
    }

    // ============ Creator Registration ============

    /**
     * @notice Register as a creator
     */
    function registerCreator(CreatorType creatorType) external {
        if (isRegisteredCreator[msg.sender]) revert CreatorRevenue__CreatorExists();

        creators[msg.sender] = Creator({
            wallet: msg.sender,
            creatorType: creatorType,
            tier: CreatorTier.BRONZE,
            totalVolumeGenerated: 0,
            totalFeesEarned: 0,
            pendingRewards: 0,
            totalClaimed: 0,
            marketsCreated: 0,
            warriorsCreated: 0,
            agentsOperated: 0,
            liquidityProvided: 0,
            registeredAt: block.timestamp,
            lastClaimAt: 0,
            isActive: true
        });

        isRegisteredCreator[msg.sender] = true;
        totalCreators++;

        emit CreatorRegistered(msg.sender, creatorType, block.timestamp);
    }

    /**
     * @notice Set market creator (called when market is created)
     */
    function setMarketCreator(uint256 marketId, address creator) external {
        if (!authorizedContracts[msg.sender] && msg.sender != owner()) {
            revert CreatorRevenue__Unauthorized();
        }
        if (creator == address(0)) revert CreatorRevenue__InvalidAddress();

        marketCreators[marketId] = creator;

        // Auto-register if not already
        if (!isRegisteredCreator[creator]) {
            _autoRegister(creator, CreatorType.MARKET_CREATOR);
        }

        creators[creator].marketsCreated++;

        emit MarketCreatorSet(marketId, creator);
    }

    /**
     * @notice Set warrior creator (called when warrior is minted)
     */
    function setWarriorCreator(uint256 warriorId, address creator) external {
        if (!authorizedContracts[msg.sender] && msg.sender != owner()) {
            revert CreatorRevenue__Unauthorized();
        }
        if (creator == address(0)) revert CreatorRevenue__InvalidAddress();

        warriorCreators[warriorId] = creator;

        if (!isRegisteredCreator[creator]) {
            _autoRegister(creator, CreatorType.WARRIOR_CREATOR);
        }

        creators[creator].warriorsCreated++;

        emit WarriorCreatorSet(warriorId, creator);
    }

    // ============ Fee Recording ============

    /**
     * @notice Record trading fee for a market
     * @dev Called by PredictionMarket contract on each trade
     */
    function recordTradeFee(
        uint256 marketId,
        uint256 volume,
        uint256 totalFee
    ) external nonReentrant {
        if (!authorizedContracts[msg.sender] && msg.sender != owner()) {
            revert CreatorRevenue__Unauthorized();
        }

        address creator = marketCreators[marketId];
        if (creator == address(0)) return;

        // Calculate creator's share based on tier
        uint256 baseCreatorFee = (volume * MARKET_CREATOR_FEE) / FEE_DENOMINATOR;
        uint256 tierBonus = _getTierBonus(creators[creator].tier);
        uint256 bonusAmount = (volume * tierBonus) / FEE_DENOMINATOR;
        uint256 creatorFee = baseCreatorFee + bonusAmount;

        // Calculate protocol fee
        uint256 protocolFee = (volume * PROTOCOL_FEE) / FEE_DENOMINATOR;

        // Update creator stats
        Creator storage c = creators[creator];
        c.pendingRewards += creatorFee;
        c.totalFeesEarned += creatorFee;
        c.totalVolumeGenerated += volume;

        // Update market fee tracking
        MarketFees storage mf = marketFeeData[marketId];
        mf.marketId = marketId;
        mf.marketCreator = creator;
        mf.totalFees += totalFee;
        mf.creatorFees += creatorFee;
        mf.protocolFees += protocolFee;

        // Update protocol fees
        protocolPendingFees += protocolFee;
        totalProtocolFees += protocolFee;
        totalFeesDistributed += creatorFee;

        // Record history
        creatorRevenueHistory[creator].push(RevenueEntry({
            marketId: marketId,
            amount: creatorFee,
            timestamp: block.timestamp,
            source: "trade"
        }));

        // Check for tier upgrade
        _checkTierUpgrade(creator);

        emit FeeRecorded(creator, marketId, creatorFee, "trade");
    }

    /**
     * @notice Record betting fee for warrior creator
     * @dev Called by Arena contract on each bet
     */
    function recordBetFee(
        uint256 warriorId,
        uint256 betAmount
    ) external nonReentrant {
        if (!authorizedContracts[msg.sender] && msg.sender != owner()) {
            revert CreatorRevenue__Unauthorized();
        }

        address creator = warriorCreators[warriorId];
        if (creator == address(0)) return;

        uint256 baseFee = (betAmount * WARRIOR_CREATOR_FEE) / FEE_DENOMINATOR;
        uint256 tierBonus = _getTierBonus(creators[creator].tier);
        uint256 bonusAmount = (betAmount * tierBonus) / FEE_DENOMINATOR;
        uint256 creatorFee = baseFee + bonusAmount;

        Creator storage c = creators[creator];
        c.pendingRewards += creatorFee;
        c.totalFeesEarned += creatorFee;
        c.totalVolumeGenerated += betAmount;

        totalFeesDistributed += creatorFee;

        creatorRevenueHistory[creator].push(RevenueEntry({
            marketId: warriorId,
            amount: creatorFee,
            timestamp: block.timestamp,
            source: "bet"
        }));

        _checkTierUpgrade(creator);

        emit FeeRecorded(creator, warriorId, creatorFee, "bet");
    }

    /**
     * @notice Record copy trade fee for agent operator
     */
    function recordCopyTradeFee(
        uint256 agentId,
        address operator,
        uint256 tradeVolume
    ) external nonReentrant {
        if (!authorizedContracts[msg.sender] && msg.sender != owner()) {
            revert CreatorRevenue__Unauthorized();
        }

        if (!isRegisteredCreator[operator]) {
            _autoRegister(operator, CreatorType.AGENT_OPERATOR);
        }

        agentOperators[agentId] = operator;

        uint256 baseFee = (tradeVolume * AGENT_OPERATOR_FEE) / FEE_DENOMINATOR;
        uint256 tierBonus = _getTierBonus(creators[operator].tier);
        uint256 bonusAmount = (tradeVolume * tierBonus) / FEE_DENOMINATOR;
        uint256 operatorFee = baseFee + bonusAmount;

        Creator storage c = creators[operator];
        c.pendingRewards += operatorFee;
        c.totalFeesEarned += operatorFee;
        c.totalVolumeGenerated += tradeVolume;

        totalFeesDistributed += operatorFee;

        creatorRevenueHistory[operator].push(RevenueEntry({
            marketId: agentId,
            amount: operatorFee,
            timestamp: block.timestamp,
            source: "copy_trade"
        }));

        _checkTierUpgrade(operator);

        emit FeeRecorded(operator, agentId, operatorFee, "copy_trade");
    }

    /**
     * @notice Record LP fee
     */
    function recordLPFee(
        uint256 marketId,
        address lpProvider,
        uint256 lpShare,
        uint256 totalLPFees
    ) external nonReentrant {
        if (!authorizedContracts[msg.sender] && msg.sender != owner()) {
            revert CreatorRevenue__Unauthorized();
        }

        if (!isRegisteredCreator[lpProvider]) {
            _autoRegister(lpProvider, CreatorType.LIQUIDITY_PROVIDER);
        }

        uint256 lpFee = (totalLPFees * lpShare) / FEE_DENOMINATOR;

        Creator storage c = creators[lpProvider];
        c.pendingRewards += lpFee;
        c.totalFeesEarned += lpFee;
        c.liquidityProvided += lpShare;

        totalFeesDistributed += lpFee;

        creatorRevenueHistory[lpProvider].push(RevenueEntry({
            marketId: marketId,
            amount: lpFee,
            timestamp: block.timestamp,
            source: "lp_fee"
        }));

        emit FeeRecorded(lpProvider, marketId, lpFee, "lp_fee");
    }

    // ============ Claiming ============

    /**
     * @notice Claim pending rewards
     */
    function claimRewards() external nonReentrant {
        Creator storage c = creators[msg.sender];
        if (c.pendingRewards == 0) revert CreatorRevenue__NoRewardsToClaim();

        uint256 amount = c.pendingRewards;
        c.pendingRewards = 0;
        c.totalClaimed += amount;
        c.lastClaimAt = block.timestamp;

        crownToken.transfer(msg.sender, amount);

        emit RewardsClaimed(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Deposit funds for fee distribution
     * @dev Called by prediction market when collecting fees
     */
    function depositFees(uint256 amount) external {
        if (!authorizedContracts[msg.sender] && msg.sender != owner()) {
            revert CreatorRevenue__Unauthorized();
        }

        crownToken.transferFrom(msg.sender, address(this), amount);
    }

    // ============ View Functions ============

    function getCreator(address wallet) external view returns (Creator memory) {
        return creators[wallet];
    }

    function getCreatorRevenueHistory(address wallet) external view returns (RevenueEntry[] memory) {
        return creatorRevenueHistory[wallet];
    }

    function getMarketFees(uint256 marketId) external view returns (MarketFees memory) {
        return marketFeeData[marketId];
    }

    function getPendingRewards(address wallet) external view returns (uint256) {
        return creators[wallet].pendingRewards;
    }

    function getCreatorTier(address wallet) external view returns (CreatorTier) {
        return creators[wallet].tier;
    }

    function getTierBonusRate(CreatorTier tier) external pure returns (uint256) {
        return _getTierBonus(tier);
    }

    function getEffectiveFeeRate(address creator, CreatorType creatorType) external view returns (uint256) {
        uint256 baseFee;
        if (creatorType == CreatorType.MARKET_CREATOR) {
            baseFee = MARKET_CREATOR_FEE;
        } else if (creatorType == CreatorType.WARRIOR_CREATOR) {
            baseFee = WARRIOR_CREATOR_FEE;
        } else if (creatorType == CreatorType.AGENT_OPERATOR) {
            baseFee = AGENT_OPERATOR_FEE;
        } else {
            baseFee = LP_FEE;
        }

        return baseFee + _getTierBonus(creators[creator].tier);
    }

    // ============ Admin Functions ============

    function authorizeContract(address contractAddress, bool authorized) external onlyOwner {
        authorizedContracts[contractAddress] = authorized;
        emit ContractAuthorized(contractAddress, authorized);
    }

    function withdrawProtocolFees(address to) external onlyOwner {
        if (protocolPendingFees == 0) revert CreatorRevenue__NoRewardsToClaim();

        uint256 amount = protocolPendingFees;
        protocolPendingFees = 0;

        crownToken.transfer(to, amount);

        emit ProtocolFeesWithdrawn(to, amount);
    }

    // ============ Internal Functions ============

    function _autoRegister(address wallet, CreatorType creatorType) internal {
        creators[wallet] = Creator({
            wallet: wallet,
            creatorType: creatorType,
            tier: CreatorTier.BRONZE,
            totalVolumeGenerated: 0,
            totalFeesEarned: 0,
            pendingRewards: 0,
            totalClaimed: 0,
            marketsCreated: 0,
            warriorsCreated: 0,
            agentsOperated: 0,
            liquidityProvided: 0,
            registeredAt: block.timestamp,
            lastClaimAt: 0,
            isActive: true
        });

        isRegisteredCreator[wallet] = true;
        totalCreators++;

        emit CreatorRegistered(wallet, creatorType, block.timestamp);
    }

    function _getTierBonus(CreatorTier tier) internal pure returns (uint256) {
        if (tier == CreatorTier.DIAMOND) return DIAMOND_BONUS;
        if (tier == CreatorTier.PLATINUM) return PLATINUM_BONUS;
        if (tier == CreatorTier.GOLD) return GOLD_BONUS;
        if (tier == CreatorTier.SILVER) return SILVER_BONUS;
        return BRONZE_BONUS;
    }

    function _checkTierUpgrade(address wallet) internal {
        Creator storage c = creators[wallet];
        CreatorTier oldTier = c.tier;
        CreatorTier newTier = _calculateTier(c.totalVolumeGenerated);

        if (newTier > oldTier) {
            c.tier = newTier;
            emit TierUpgraded(wallet, oldTier, newTier);
        }
    }

    function _calculateTier(uint256 volume) internal pure returns (CreatorTier) {
        if (volume >= DIAMOND_THRESHOLD) return CreatorTier.DIAMOND;
        if (volume >= PLATINUM_THRESHOLD) return CreatorTier.PLATINUM;
        if (volume >= GOLD_THRESHOLD) return CreatorTier.GOLD;
        if (volume >= SILVER_THRESHOLD) return CreatorTier.SILVER;
        return CreatorTier.BRONZE;
    }
}
