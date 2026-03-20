// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {ICrownToken} from "./Interfaces/ICrownToken.sol";
import {IWarriorsNFT} from "./Interfaces/IWarriorsNFT.sol";
import {ICRwNStaking} from "./Interfaces/ICRwNStaking.sol";
import {stCRwN} from "./stCRwN.sol";

/**
 * @title CRwNStaking
 * @author Warriors AI Arena
 * @notice Stake CRwN to earn protocol fees. Receive stCRwN receipt token.
 *
 * Mechanics:
 *   - Deposit CRwN → receive stCRwN at current exchange rate
 *   - Protocol fees distributed via distributeFees() → increases exchange rate
 *   - Request unstake → 7-day cooldown → complete unstake at current rate
 *   - Stake Warrior NFT → yield boost multiplier based on rank
 *
 * Exchange rate: totalCRwN / totalStCRwN (starts at 1:1, increases as fees accrue)
 */
contract CRwNStaking is ICRwNStaking, Ownable, ReentrancyGuard {
    // ============ Constants ============
    uint256 public constant COOLDOWN_PERIOD = 7 days;
    uint256 public constant RATE_PRECISION = 1e18;

    // Warrior rank boost multipliers (basis points, 10000 = 1x)
    uint256 public constant BOOST_UNRANKED = 10000;
    uint256 public constant BOOST_BRONZE = 12500;
    uint256 public constant BOOST_SILVER = 15000;
    uint256 public constant BOOST_GOLD = 20000;
    uint256 public constant BOOST_PLATINUM = 30000;

    // ============ State ============
    ICrownToken public immutable crownToken;
    IWarriorsNFT public immutable warriorsNFT;
    stCRwN public receiptToken; // set once via setReceiptToken()

    uint256 public totalCRwNStaked; // Total CRwN in pool (deposits + fees)

    // Unstake queue
    struct UnstakeRequest {
        uint256 crwnAmount;
        uint256 unlockTime;
    }
    mapping(address => UnstakeRequest) public unstakeRequests;

    // Warrior NFT boost
    struct WarriorBoost {
        uint256 nftId;
        uint256 boostBps; // 10000 = 1x, 12500 = 1.25x, etc.
    }
    mapping(address => WarriorBoost) public warriorBoosts;

    // Authorized fee sources
    mapping(address => bool) public authorizedFeeSources;

    // ============ Constructor ============
    constructor(
        address _crownToken,
        address _warriorsNFT
    ) Ownable(msg.sender) {
        crownToken = ICrownToken(_crownToken);
        warriorsNFT = IWarriorsNFT(_warriorsNFT);
    }

    /// @notice Set the stCRwN receipt token. Can only be called once.
    function setReceiptToken(address _receiptToken) external onlyOwner {
        require(address(receiptToken) == address(0), "Already set");
        receiptToken = stCRwN(_receiptToken);
    }

    // ============ Staking ============

    /**
     * @notice Stake CRwN and receive stCRwN at current exchange rate.
     */
    function stake(uint256 amount) external override nonReentrant {
        if (amount == 0) revert Staking__InvalidAmount();

        bool success = crownToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert Staking__TransferFailed();

        // Calculate stCRwN to mint
        uint256 shares;
        uint256 totalShares = receiptToken.totalSupply();
        if (totalShares == 0 || totalCRwNStaked == 0) {
            shares = amount; // 1:1 initial rate
        } else {
            shares = (amount * totalShares) / totalCRwNStaked;
        }

        totalCRwNStaked += amount;
        receiptToken.mint(msg.sender, shares);

        emit Staked(msg.sender, amount, shares);
    }

    /**
     * @notice Request unstake with 7-day cooldown.
     * @param stCrwnAmount Amount of stCRwN to burn.
     */
    function requestUnstake(uint256 stCrwnAmount) external override nonReentrant {
        if (stCrwnAmount == 0) revert Staking__InvalidAmount();

        // Calculate CRwN value of shares
        uint256 totalShares = receiptToken.totalSupply();
        uint256 crwnAmount = (stCrwnAmount * totalCRwNStaked) / totalShares;

        // Burn stCRwN immediately
        receiptToken.burn(msg.sender, stCrwnAmount);
        totalCRwNStaked -= crwnAmount;

        // Queue withdrawal
        unstakeRequests[msg.sender] = UnstakeRequest({
            crwnAmount: crwnAmount,
            unlockTime: block.timestamp + COOLDOWN_PERIOD
        });

        emit UnstakeRequested(msg.sender, stCrwnAmount, crwnAmount, block.timestamp + COOLDOWN_PERIOD);
    }

    /**
     * @notice Complete unstake after cooldown period.
     */
    function completeUnstake() external override nonReentrant {
        UnstakeRequest storage req = unstakeRequests[msg.sender];
        if (req.crwnAmount == 0) revert Staking__NoUnstakeRequest();
        if (block.timestamp < req.unlockTime) revert Staking__CooldownNotMet();

        uint256 amount = req.crwnAmount;
        delete unstakeRequests[msg.sender];

        bool success = crownToken.transfer(msg.sender, amount);
        if (!success) revert Staking__TransferFailed();

        emit UnstakeCompleted(msg.sender, amount);
    }

    // ============ Fee Distribution ============

    /**
     * @notice Distribute protocol fees to the staking pool.
     * @dev Only callable by authorized fee sources (AMM, MicroMarket, BattleManager).
     *      Increases totalCRwNStaked without minting stCRwN → exchange rate increases.
     */
    function distributeFees(uint256 amount) external override nonReentrant {
        if (!authorizedFeeSources[msg.sender] && msg.sender != owner()) revert Staking__Unauthorized();
        if (amount == 0) revert Staking__InvalidAmount();

        bool success = crownToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert Staking__TransferFailed();

        totalCRwNStaked += amount;

        emit FeesDistributed(msg.sender, amount);
    }

    // ============ Warrior NFT Boost ============

    /**
     * @notice Stake a Warrior NFT to boost your staking yield.
     * @dev Transfers NFT to this contract. Boost based on rank.
     */
    function stakeWarrior(uint256 nftId) external override nonReentrant {
        if (warriorsNFT.ownerOf(nftId) != msg.sender) revert Staking__NotWarriorOwner();
        if (warriorBoosts[msg.sender].boostBps > 0) revert Staking__WarriorAlreadyStaked();

        // Transfer NFT to this contract
        warriorsNFT.transferFrom(msg.sender, address(this), nftId);

        // Determine boost based on rank
        IWarriorsNFT.Ranking rank = warriorsNFT.getRanking(nftId);
        uint256 boost;
        if (rank == IWarriorsNFT.Ranking.PLATINUM) boost = BOOST_PLATINUM;
        else if (rank == IWarriorsNFT.Ranking.GOLD) boost = BOOST_GOLD;
        else if (rank == IWarriorsNFT.Ranking.SILVER) boost = BOOST_SILVER;
        else if (rank == IWarriorsNFT.Ranking.BRONZE) boost = BOOST_BRONZE;
        else boost = BOOST_UNRANKED;

        warriorBoosts[msg.sender] = WarriorBoost({ nftId: nftId, boostBps: boost });

        emit WarriorStaked(msg.sender, nftId, boost);
    }

    /**
     * @notice Unstake Warrior NFT and remove yield boost.
     */
    function unstakeWarrior() external override nonReentrant {
        WarriorBoost storage boost = warriorBoosts[msg.sender];
        if (boost.boostBps == 0) revert Staking__NoWarriorStaked();

        uint256 nftId = boost.nftId;
        delete warriorBoosts[msg.sender];

        warriorsNFT.transferFrom(address(this), msg.sender, nftId);

        emit WarriorUnstaked(msg.sender, nftId);
    }

    // ============ Views ============

    /**
     * @notice Exchange rate: CRwN per stCRwN (scaled by 1e18).
     */
    function getExchangeRate() external view override returns (uint256) {
        uint256 totalShares = receiptToken.totalSupply();
        if (totalShares == 0) return RATE_PRECISION; // 1:1
        return (totalCRwNStaked * RATE_PRECISION) / totalShares;
    }

    function getTotalStaked() external view override returns (uint256) {
        return totalCRwNStaked;
    }

    /**
     * @notice Returns CRwN value of a user's stCRwN balance (including boost).
     */
    function getStakedBalance(address user) external view override returns (uint256) {
        uint256 shares = receiptToken.balanceOf(user);
        if (shares == 0) return 0;
        uint256 totalShares = receiptToken.totalSupply();
        uint256 baseValue = (shares * totalCRwNStaked) / totalShares;

        // Apply warrior boost if staked
        uint256 boost = warriorBoosts[user].boostBps;
        if (boost > 0) {
            return (baseValue * boost) / 10000;
        }
        return baseValue;
    }

    /// @notice Get a user's warrior boost info
    function getWarriorBoost(address user) external view returns (uint256 nftId, uint256 boostBps) {
        WarriorBoost storage boost = warriorBoosts[user];
        return (boost.nftId, boost.boostBps);
    }

    // ============ Admin ============

    function addFeeSource(address source) external onlyOwner {
        authorizedFeeSources[source] = true;
    }

    function removeFeeSource(address source) external onlyOwner {
        authorizedFeeSources[source] = false;
    }
}
