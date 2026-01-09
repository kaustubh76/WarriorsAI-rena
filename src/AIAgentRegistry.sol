// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/**
 * @title AIAgentRegistry
 * @author Warriors AI Arena
 * @notice Central registry for AI trader agents with on-chain personas, staking, and performance tracking
 * @dev Part of the AI-Native Gaming Prediction Market system
 *
 * Key Features:
 * - Agent registration with personas (name, strategy, risk profile)
 * - Staking mechanism for agent credibility
 * - Performance tracking (win rate, PnL, confidence scores)
 * - Tier system: NOVICE -> SKILLED -> EXPERT -> ORACLE
 * - Copy-trading permission management
 * - Revenue share for agent operators
 */
contract AIAgentRegistry is Ownable, ReentrancyGuard {
    // ============ Errors ============
    error AIAgentRegistry__InvalidStakeAmount();
    error AIAgentRegistry__AgentNotFound();
    error AIAgentRegistry__AgentNotActive();
    error AIAgentRegistry__NotAgentOperator();
    error AIAgentRegistry__InsufficientStake();
    error AIAgentRegistry__AgentAlreadyExists();
    error AIAgentRegistry__InvalidAddress();
    error AIAgentRegistry__CopyTradingDisabled();
    error AIAgentRegistry__AlreadyFollowing();
    error AIAgentRegistry__NotFollowing();
    error AIAgentRegistry__CannotFollowSelf();
    error AIAgentRegistry__InvalidStrategy();
    error AIAgentRegistry__CooldownActive();
    error AIAgentRegistry__NoRewardsToClaim();

    // ============ Enums ============

    /// @notice AI agent trading strategies
    enum AgentStrategy {
        SUPERFORECASTER,    // Conservative, high accuracy (The Oracle)
        WARRIOR_ANALYST,    // Deep trait analysis (Sensei)
        TREND_FOLLOWER,     // Momentum-based (Momentum Master)
        MEAN_REVERSION,     // Contrarian bets (The Contrarian)
        MICRO_SPECIALIST,   // Round/move markets (Round Robin)
        CUSTOM              // User-defined strategy
    }

    /// @notice Risk profile of an agent
    enum RiskProfile {
        CONSERVATIVE,   // Low risk, steady returns
        MODERATE,       // Balanced approach
        AGGRESSIVE,     // High risk, high reward
        DEGENERATE      // Maximum risk tolerance
    }

    /// @notice Agent tier based on performance
    enum AgentTier {
        NOVICE,     // Starting tier (100 CRwN min stake)
        SKILLED,    // 100+ trades, >55% win rate (500 CRwN)
        EXPERT,     // 500+ trades, >60% win rate (2000 CRwN)
        ORACLE      // 2000+ trades, >65% win rate (10000 CRwN)
    }

    /// @notice Specialization areas for agents
    enum Specialization {
        BATTLE_OUTCOMES,    // Overall battle predictions
        ROUND_MARKETS,      // Round-by-round betting
        MOVE_PREDICTIONS,   // Individual move betting
        ALL                 // General purpose
    }

    // ============ Structs ============

    /// @notice Agent persona traits that affect trading behavior
    struct PersonaTraits {
        uint8 patience;     // 0-100: How long to wait before trading
        uint8 conviction;   // 0-100: Position sizing confidence
        uint8 contrarian;   // 0-100: Tendency to bet against consensus
        uint8 momentum;     // 0-100: Follow trends vs mean reversion
    }

    /// @notice Full AI agent configuration
    struct AIAgent {
        uint256 id;
        address operator;           // Address that controls this agent
        string name;                // Display name (e.g., "The Oracle")
        string description;         // Agent description
        AgentStrategy strategy;
        RiskProfile riskProfile;
        Specialization specialization;
        PersonaTraits traits;
        uint256 stakedAmount;       // CRwN staked for credibility
        AgentTier tier;
        bool isActive;
        bool copyTradingEnabled;
        uint256 createdAt;
        uint256 lastTradeAt;
    }

    /// @notice Agent performance metrics
    struct AgentPerformance {
        uint256 totalTrades;
        uint256 winningTrades;
        int256 totalPnL;            // Can be negative
        uint256 totalVolume;
        uint256 avgConfidence;      // Average confidence on predictions (basis points)
        uint256 currentStreak;      // Current winning streak
        uint256 bestStreak;         // Best ever winning streak
        uint256 accuracyBps;        // Win rate in basis points (0-10000)
    }

    /// @notice Copy trading relationship
    struct CopyTradeConfig {
        uint256 agentId;
        uint256 maxAmountPerTrade;  // Max CRwN per copied trade
        uint256 totalCopied;        // Total volume copied
        uint256 startedAt;
        bool isActive;
    }

    // ============ Constants ============
    uint256 public constant MIN_STAKE_NOVICE = 100 ether;      // 100 CRwN
    uint256 public constant MIN_STAKE_SKILLED = 500 ether;     // 500 CRwN
    uint256 public constant MIN_STAKE_EXPERT = 2000 ether;     // 2000 CRwN
    uint256 public constant MIN_STAKE_ORACLE = 10000 ether;    // 10000 CRwN

    uint256 public constant SKILLED_MIN_TRADES = 100;
    uint256 public constant SKILLED_MIN_WINRATE = 5500;        // 55% in bps
    uint256 public constant EXPERT_MIN_TRADES = 500;
    uint256 public constant EXPERT_MIN_WINRATE = 6000;         // 60% in bps
    uint256 public constant ORACLE_MIN_TRADES = 2000;
    uint256 public constant ORACLE_MIN_WINRATE = 6500;         // 65% in bps

    uint256 public constant COPY_TRADE_FEE_BPS = 50;           // 0.5% to agent operator
    uint256 public constant SLASHING_PENALTY_BPS = 1000;       // 10% slashing for bad behavior
    uint256 public constant UNSTAKE_COOLDOWN = 7 days;

    uint256 public constant FEE_DENOMINATOR = 10000;

    // ============ State ============
    IERC20 public immutable crownToken;

    uint256 public nextAgentId = 1;
    uint256 public totalAgentsCreated;
    uint256 public totalStaked;

    // Agent mappings
    mapping(uint256 => AIAgent) public agents;
    mapping(uint256 => AgentPerformance) public agentPerformance;
    mapping(address => uint256[]) public operatorAgents;        // operator => agentIds
    mapping(string => bool) public agentNameTaken;              // Unique names

    // Copy trading mappings
    mapping(address => mapping(uint256 => CopyTradeConfig)) public copyTradeConfigs;  // user => agentId => config
    mapping(address => uint256[]) public userFollowing;         // user => agentIds they follow
    mapping(uint256 => address[]) public agentFollowers;        // agentId => followers
    mapping(uint256 => uint256) public agentFollowerCount;

    // Rewards & Fees
    mapping(uint256 => uint256) public agentPendingRewards;     // Accumulated copy-trade fees
    mapping(address => uint256) public unstakeRequestTime;      // For cooldown

    // Protocol agents (official)
    uint256[] public officialAgentIds;
    mapping(uint256 => bool) public isOfficialAgent;

    // ============ Events ============
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed operator,
        string name,
        AgentStrategy strategy,
        uint256 stakedAmount
    );

    event AgentUpdated(uint256 indexed agentId, string name, bool copyTradingEnabled);

    event AgentDeactivated(uint256 indexed agentId);

    event AgentReactivated(uint256 indexed agentId);

    event StakeAdded(uint256 indexed agentId, uint256 amount, uint256 newTotal);

    event StakeWithdrawn(uint256 indexed agentId, uint256 amount, uint256 newTotal);

    event TierUpgraded(uint256 indexed agentId, AgentTier oldTier, AgentTier newTier);

    event TradeRecorded(
        uint256 indexed agentId,
        uint256 indexed marketId,
        bool won,
        int256 pnl,
        uint256 confidence
    );

    event CopyTradeStarted(address indexed follower, uint256 indexed agentId, uint256 maxAmount);

    event CopyTradeStopped(address indexed follower, uint256 indexed agentId);

    event CopyTradeExecuted(
        address indexed follower,
        uint256 indexed agentId,
        uint256 marketId,
        uint256 amount
    );

    event AgentRewardsClaimed(uint256 indexed agentId, address indexed operator, uint256 amount);

    event AgentSlashed(uint256 indexed agentId, uint256 amount, string reason);

    event OfficialAgentAdded(uint256 indexed agentId);

    // ============ Constructor ============
    constructor(address _crownToken) Ownable(msg.sender) {
        if (_crownToken == address(0)) revert AIAgentRegistry__InvalidAddress();
        crownToken = IERC20(_crownToken);
    }

    // ============ Agent Registration ============

    /**
     * @notice Register a new AI agent
     * @param name Unique display name for the agent
     * @param description Agent description
     * @param strategy Trading strategy type
     * @param riskProfile Risk tolerance level
     * @param specialization Market specialization
     * @param traits Persona traits configuration
     * @param stakeAmount Initial stake amount (minimum based on tier)
     */
    function registerAgent(
        string calldata name,
        string calldata description,
        AgentStrategy strategy,
        RiskProfile riskProfile,
        Specialization specialization,
        PersonaTraits calldata traits,
        uint256 stakeAmount
    ) external nonReentrant returns (uint256 agentId) {
        if (stakeAmount < MIN_STAKE_NOVICE) revert AIAgentRegistry__InvalidStakeAmount();
        if (agentNameTaken[name]) revert AIAgentRegistry__AgentAlreadyExists();
        if (bytes(name).length == 0 || bytes(name).length > 32) revert AIAgentRegistry__InvalidStrategy();

        // Transfer stake
        crownToken.transferFrom(msg.sender, address(this), stakeAmount);

        agentId = nextAgentId++;

        agents[agentId] = AIAgent({
            id: agentId,
            operator: msg.sender,
            name: name,
            description: description,
            strategy: strategy,
            riskProfile: riskProfile,
            specialization: specialization,
            traits: traits,
            stakedAmount: stakeAmount,
            tier: _calculateTier(stakeAmount, 0, 0),
            isActive: true,
            copyTradingEnabled: true,
            createdAt: block.timestamp,
            lastTradeAt: 0
        });

        agentPerformance[agentId] = AgentPerformance({
            totalTrades: 0,
            winningTrades: 0,
            totalPnL: 0,
            totalVolume: 0,
            avgConfidence: 0,
            currentStreak: 0,
            bestStreak: 0,
            accuracyBps: 0
        });

        agentNameTaken[name] = true;
        operatorAgents[msg.sender].push(agentId);
        totalAgentsCreated++;
        totalStaked += stakeAmount;

        emit AgentRegistered(agentId, msg.sender, name, strategy, stakeAmount);
    }

    /**
     * @notice Update agent configuration
     */
    function updateAgent(
        uint256 agentId,
        string calldata description,
        bool copyTradingEnabled,
        PersonaTraits calldata traits
    ) external {
        AIAgent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert AIAgentRegistry__NotAgentOperator();
        if (!agent.isActive) revert AIAgentRegistry__AgentNotActive();

        agent.description = description;
        agent.copyTradingEnabled = copyTradingEnabled;
        agent.traits = traits;

        emit AgentUpdated(agentId, agent.name, copyTradingEnabled);
    }

    /**
     * @notice Deactivate an agent
     */
    function deactivateAgent(uint256 agentId) external {
        AIAgent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert AIAgentRegistry__NotAgentOperator();

        agent.isActive = false;

        emit AgentDeactivated(agentId);
    }

    /**
     * @notice Reactivate an agent
     */
    function reactivateAgent(uint256 agentId) external {
        AIAgent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert AIAgentRegistry__NotAgentOperator();
        if (agent.stakedAmount < MIN_STAKE_NOVICE) revert AIAgentRegistry__InsufficientStake();

        agent.isActive = true;

        emit AgentReactivated(agentId);
    }

    // ============ Staking ============

    /**
     * @notice Add stake to an agent
     */
    function addStake(uint256 agentId, uint256 amount) external nonReentrant {
        AIAgent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert AIAgentRegistry__NotAgentOperator();
        if (amount == 0) revert AIAgentRegistry__InvalidStakeAmount();

        crownToken.transferFrom(msg.sender, address(this), amount);

        agent.stakedAmount += amount;
        totalStaked += amount;

        // Check for tier upgrade
        AgentPerformance storage perf = agentPerformance[agentId];
        AgentTier newTier = _calculateTier(agent.stakedAmount, perf.totalTrades, perf.accuracyBps);

        if (newTier > agent.tier) {
            AgentTier oldTier = agent.tier;
            agent.tier = newTier;
            emit TierUpgraded(agentId, oldTier, newTier);
        }

        emit StakeAdded(agentId, amount, agent.stakedAmount);
    }

    /**
     * @notice Request stake withdrawal (starts cooldown)
     */
    function requestUnstake(uint256 agentId) external {
        AIAgent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert AIAgentRegistry__NotAgentOperator();

        unstakeRequestTime[msg.sender] = block.timestamp;
    }

    /**
     * @notice Withdraw stake after cooldown
     */
    function withdrawStake(uint256 agentId, uint256 amount) external nonReentrant {
        AIAgent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert AIAgentRegistry__NotAgentOperator();
        if (block.timestamp < unstakeRequestTime[msg.sender] + UNSTAKE_COOLDOWN) {
            revert AIAgentRegistry__CooldownActive();
        }
        if (amount > agent.stakedAmount) revert AIAgentRegistry__InsufficientStake();

        // Ensure minimum stake for active agents
        if (agent.isActive && agent.stakedAmount - amount < MIN_STAKE_NOVICE) {
            revert AIAgentRegistry__InsufficientStake();
        }

        agent.stakedAmount -= amount;
        totalStaked -= amount;

        crownToken.transfer(msg.sender, amount);

        // Check for tier downgrade
        AgentPerformance storage perf = agentPerformance[agentId];
        agent.tier = _calculateTier(agent.stakedAmount, perf.totalTrades, perf.accuracyBps);

        emit StakeWithdrawn(agentId, amount, agent.stakedAmount);
    }

    // ============ Copy Trading ============

    /**
     * @notice Start following an agent for copy trading
     */
    function followAgent(uint256 agentId, uint256 maxAmountPerTrade) external {
        AIAgent storage agent = agents[agentId];
        if (agent.id == 0) revert AIAgentRegistry__AgentNotFound();
        if (!agent.isActive) revert AIAgentRegistry__AgentNotActive();
        if (!agent.copyTradingEnabled) revert AIAgentRegistry__CopyTradingDisabled();
        if (agent.operator == msg.sender) revert AIAgentRegistry__CannotFollowSelf();

        CopyTradeConfig storage config = copyTradeConfigs[msg.sender][agentId];
        if (config.isActive) revert AIAgentRegistry__AlreadyFollowing();

        config.agentId = agentId;
        config.maxAmountPerTrade = maxAmountPerTrade;
        config.totalCopied = 0;
        config.startedAt = block.timestamp;
        config.isActive = true;

        userFollowing[msg.sender].push(agentId);
        agentFollowers[agentId].push(msg.sender);
        agentFollowerCount[agentId]++;

        emit CopyTradeStarted(msg.sender, agentId, maxAmountPerTrade);
    }

    /**
     * @notice Stop following an agent
     */
    function unfollowAgent(uint256 agentId) external {
        CopyTradeConfig storage config = copyTradeConfigs[msg.sender][agentId];
        if (!config.isActive) revert AIAgentRegistry__NotFollowing();

        config.isActive = false;
        agentFollowerCount[agentId]--;

        // Remove from userFollowing array
        uint256[] storage following = userFollowing[msg.sender];
        for (uint256 i = 0; i < following.length; i++) {
            if (following[i] == agentId) {
                following[i] = following[following.length - 1];
                following.pop();
                break;
            }
        }

        emit CopyTradeStopped(msg.sender, agentId);
    }

    /**
     * @notice Update copy trade configuration
     */
    function updateCopyTradeConfig(uint256 agentId, uint256 maxAmountPerTrade) external {
        CopyTradeConfig storage config = copyTradeConfigs[msg.sender][agentId];
        if (!config.isActive) revert AIAgentRegistry__NotFollowing();

        config.maxAmountPerTrade = maxAmountPerTrade;
    }

    // ============ Trade Recording (Called by PredictionMarket) ============

    /**
     * @notice Record a trade made by an agent
     * @dev Called by authorized contracts (PredictionMarket)
     */
    function recordTrade(
        uint256 agentId,
        uint256 marketId,
        bool won,
        int256 pnl,
        uint256 volume,
        uint256 confidence
    ) external {
        // In production, add access control for authorized callers
        AIAgent storage agent = agents[agentId];
        if (agent.id == 0) revert AIAgentRegistry__AgentNotFound();

        AgentPerformance storage perf = agentPerformance[agentId];

        perf.totalTrades++;
        perf.totalPnL += pnl;
        perf.totalVolume += volume;

        if (won) {
            perf.winningTrades++;
            perf.currentStreak++;
            if (perf.currentStreak > perf.bestStreak) {
                perf.bestStreak = perf.currentStreak;
            }
        } else {
            perf.currentStreak = 0;
        }

        // Update accuracy
        perf.accuracyBps = (perf.winningTrades * 10000) / perf.totalTrades;

        // Update average confidence
        perf.avgConfidence = ((perf.avgConfidence * (perf.totalTrades - 1)) + confidence) / perf.totalTrades;

        agent.lastTradeAt = block.timestamp;

        // Check for tier upgrade
        AgentTier newTier = _calculateTier(agent.stakedAmount, perf.totalTrades, perf.accuracyBps);
        if (newTier > agent.tier) {
            AgentTier oldTier = agent.tier;
            agent.tier = newTier;
            emit TierUpgraded(agentId, oldTier, newTier);
        }

        emit TradeRecorded(agentId, marketId, won, pnl, confidence);
    }

    /**
     * @notice Record copy trade fee for an agent
     */
    function recordCopyTradeFee(uint256 agentId, uint256 fee) external {
        // In production, add access control
        agentPendingRewards[agentId] += fee;
    }

    /**
     * @notice Claim accumulated copy trade fees
     */
    function claimAgentRewards(uint256 agentId) external nonReentrant {
        AIAgent storage agent = agents[agentId];
        if (agent.operator != msg.sender) revert AIAgentRegistry__NotAgentOperator();

        uint256 rewards = agentPendingRewards[agentId];
        if (rewards == 0) revert AIAgentRegistry__NoRewardsToClaim();

        agentPendingRewards[agentId] = 0;
        crownToken.transfer(msg.sender, rewards);

        emit AgentRewardsClaimed(agentId, msg.sender, rewards);
    }

    // ============ Admin Functions ============

    /**
     * @notice Add an official protocol-owned agent
     */
    function addOfficialAgent(uint256 agentId) external onlyOwner {
        if (agents[agentId].id == 0) revert AIAgentRegistry__AgentNotFound();

        isOfficialAgent[agentId] = true;
        officialAgentIds.push(agentId);

        emit OfficialAgentAdded(agentId);
    }

    /**
     * @notice Slash an agent's stake for bad behavior
     */
    function slashAgent(uint256 agentId, string calldata reason) external onlyOwner {
        AIAgent storage agent = agents[agentId];
        if (agent.id == 0) revert AIAgentRegistry__AgentNotFound();

        uint256 slashAmount = (agent.stakedAmount * SLASHING_PENALTY_BPS) / FEE_DENOMINATOR;
        agent.stakedAmount -= slashAmount;
        totalStaked -= slashAmount;

        // Slashed amount goes to treasury (owner)
        crownToken.transfer(owner(), slashAmount);

        emit AgentSlashed(agentId, slashAmount, reason);
    }

    // ============ View Functions ============

    function getAgent(uint256 agentId) external view returns (AIAgent memory) {
        return agents[agentId];
    }

    function getAgentPerformance(uint256 agentId) external view returns (AgentPerformance memory) {
        return agentPerformance[agentId];
    }

    function getOperatorAgents(address operator) external view returns (uint256[] memory) {
        return operatorAgents[operator];
    }

    function getUserFollowing(address user) external view returns (uint256[] memory) {
        return userFollowing[user];
    }

    function getAgentFollowers(uint256 agentId) external view returns (address[] memory) {
        return agentFollowers[agentId];
    }

    function getCopyTradeConfig(address user, uint256 agentId) external view returns (CopyTradeConfig memory) {
        return copyTradeConfigs[user][agentId];
    }

    function getOfficialAgents() external view returns (uint256[] memory) {
        return officialAgentIds;
    }

    function isAgentActive(uint256 agentId) external view returns (bool) {
        return agents[agentId].isActive;
    }

    function getAgentTier(uint256 agentId) external view returns (AgentTier) {
        return agents[agentId].tier;
    }

    // ============ Internal Functions ============

    function _calculateTier(
        uint256 stake,
        uint256 trades,
        uint256 winRateBps
    ) internal pure returns (AgentTier) {
        // Oracle tier: 10000 CRwN + 2000 trades + 65% win rate
        if (stake >= MIN_STAKE_ORACLE && trades >= ORACLE_MIN_TRADES && winRateBps >= ORACLE_MIN_WINRATE) {
            return AgentTier.ORACLE;
        }
        // Expert tier: 2000 CRwN + 500 trades + 60% win rate
        if (stake >= MIN_STAKE_EXPERT && trades >= EXPERT_MIN_TRADES && winRateBps >= EXPERT_MIN_WINRATE) {
            return AgentTier.EXPERT;
        }
        // Skilled tier: 500 CRwN + 100 trades + 55% win rate
        if (stake >= MIN_STAKE_SKILLED && trades >= SKILLED_MIN_TRADES && winRateBps >= SKILLED_MIN_WINRATE) {
            return AgentTier.SKILLED;
        }
        // Default: Novice
        return AgentTier.NOVICE;
    }
}
