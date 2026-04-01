// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {ICrownToken} from "./Interfaces/ICrownToken.sol";
import {IWarriorsNFT} from "./Interfaces/IWarriorsNFT.sol";
import {IStrategyVault} from "./Interfaces/IStrategyVault.sol";
import {IStrategyBattleManager} from "./Interfaces/IStrategyBattleManager.sol";

/**
 * @title StrategyBattleManager
 * @author Warriors AI Arena
 * @notice On-chain strategy battle lifecycle: creation (stake escrow), betting
 *         (bet escrow), cycle scoring, settlement (prize + bet payout), and ELO.
 *
 * Architecture:
 *   - Battle creation escrows CRwN stakes from both warriors
 *   - Spectators place CRwN bets that are escrowed in this contract
 *   - Resolver (cron/oracle) records cycle scores and settles battles
 *   - Settlement distributes stakes to winner and opens bet claims
 *   - ELO ratings updated on-chain with dynamic K-factor
 *   - Pull-based bet claims: bettors call claimBet() to receive winnings
 */
contract StrategyBattleManager is IStrategyBattleManager, Ownable, ReentrancyGuard {
    // ============ Constants ============

    uint256 public constant MAX_ROUNDS = 5;
    uint256 public constant FEE_BPS = 500;          // 5% fee on bet winnings
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant INSURANCE_BPS = 100;     // 1% of fee to insurance
    uint256 public constant MIN_STAKES = 5 ether;    // 5 CRwN minimum
    uint256 public constant DEFAULT_RATING = 1000;

    // Elo constants (scaled by 1000 for integer math)
    uint256 private constant ELO_SCALE = 1000;
    uint256 private constant ELO_BASE = 400;

    // ============ State ============

    ICrownToken public immutable crownToken;
    IWarriorsNFT public immutable warriorsNFT;
    IStrategyVault public immutable strategyVault;

    address public resolver;           // authorized cron/oracle address
    uint256 public nextBattleId = 1;
    uint256 public insuranceReserve;   // accumulated insurance fund
    uint256 public totalFeesCollected;

    // Staking fee forwarding (Phase 3 DeFi hardening)
    address public stakingContract;
    uint256 public stakingFeePercent = 5000; // 50% of non-insurance fees to stakers

    // Core mappings
    mapping(uint256 => Battle) private battles;
    mapping(uint256 => mapping(address => BetInfo)) private bets;
    mapping(uint256 => WarriorRating) private ratings;

    // Track all bettors per battle (for admin operations)
    mapping(uint256 => address[]) private battleBettors;

    // ============ Constructor ============

    constructor(
        address _crownToken,
        address _warriorsNFT,
        address _strategyVault
    ) Ownable(msg.sender) {
        crownToken = ICrownToken(_crownToken);
        warriorsNFT = IWarriorsNFT(_warriorsNFT);
        strategyVault = IStrategyVault(_strategyVault);
        resolver = msg.sender; // deployer is initial resolver
    }

    // ============ Modifiers ============

    modifier onlyResolver() {
        if (msg.sender != resolver && msg.sender != owner()) revert BattleManager__Unauthorized();
        _;
    }

    // ═══════════════════════════════════════════════════════
    // BATTLE LIFECYCLE
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Create a strategy battle. Caller funds both sides' stakes.
     * @dev Caller must own warrior1 (or be resolver/owner). Caller pays
     *      stakes × 2 (escrowing for both sides). Settlement pays out to
     *      the NFT owners recorded at creation time.
     *      Both warriors must have active vaults in StrategyVault.
     */
    function createBattle(
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 stakes
    ) external override nonReentrant returns (uint256 battleId) {
        if (warrior1Id == warrior2Id) revert BattleManager__SameWarrior();
        if (stakes < MIN_STAKES) revert BattleManager__InvalidStakes();

        // Validate ownership — warrior1 owner OR resolver/owner can create on behalf
        address w1Owner = warriorsNFT.ownerOf(warrior1Id);
        address w2Owner = warriorsNFT.ownerOf(warrior2Id);
        if (w1Owner != msg.sender && msg.sender != resolver && msg.sender != owner())
            revert BattleManager__NotWarriorOwner();

        // Validate both have active vaults
        if (!strategyVault.isVaultActive(warrior1Id)) revert BattleManager__VaultNotActive();
        if (!strategyVault.isVaultActive(warrior2Id)) revert BattleManager__VaultNotActive();

        // Escrow stakes from the caller (msg.sender funds both sides)
        uint256 totalEscrow = stakes * 2;
        bool success = crownToken.transferFrom(msg.sender, address(this), totalEscrow);
        if (!success) revert BattleManager__TransferFailed();

        // Initialize ratings if first battle
        _initRatingIfNeeded(warrior1Id);
        _initRatingIfNeeded(warrior2Id);

        battleId = nextBattleId++;

        battles[battleId] = Battle({
            warrior1Id: warrior1Id,
            warrior2Id: warrior2Id,
            warrior1Owner: w1Owner,
            warrior2Owner: w2Owner,
            stakes: stakes,
            status: BattleStatus.ACTIVE,
            result: BattleResult.UNDECIDED,
            currentRound: 0,
            warrior1Score: 0,
            warrior2Score: 0,
            totalW1Bets: 0,
            totalW2Bets: 0,
            bettingOpen: true,
            createdAt: block.timestamp
        });

        emit BattleCreated(battleId, warrior1Id, warrior2Id, stakes, w1Owner, w2Owner);
    }

    /**
     * @notice Record cycle scores for a battle round.
     * @dev Only callable by resolver. Auto-closes betting after round 1.
     */
    function recordCycleScore(
        uint256 battleId,
        uint256 w1RoundScore,
        uint256 w2RoundScore
    ) external override onlyResolver {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.ACTIVE) revert BattleManager__BattleNotActive();
        if (battle.currentRound >= MAX_ROUNDS) revert BattleManager__BattleAlreadySettled();

        battle.currentRound += 1;
        battle.warrior1Score += w1RoundScore;
        battle.warrior2Score += w2RoundScore;

        // Auto-close betting after first round is scored
        if (battle.currentRound == 1 && battle.bettingOpen) {
            battle.bettingOpen = false;
            emit BettingClosed(battleId);
        }

        emit CycleScored(
            battleId,
            battle.currentRound,
            w1RoundScore,
            w2RoundScore,
            battle.warrior1Score,
            battle.warrior2Score
        );
    }

    /**
     * @notice Settle a completed battle. Distributes stakes, updates ELO.
     * @dev Requires all 5 rounds scored. Stakes go to winner (or refund on draw).
     */
    function settleBattle(uint256 battleId) external override onlyResolver nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.ACTIVE) revert BattleManager__BattleNotActive();
        if (battle.currentRound < MAX_ROUNDS) revert BattleManager__NotEnoughRounds();

        // Close betting if still open
        if (battle.bettingOpen) {
            battle.bettingOpen = false;
            emit BettingClosed(battleId);
        }

        // Determine result
        uint256 totalStakes = battle.stakes * 2;
        BattleResult result;
        uint256 winnerId;

        if (battle.warrior1Score > battle.warrior2Score) {
            result = BattleResult.WARRIOR1_WIN;
            winnerId = battle.warrior1Id;

            // Transfer all stakes to warrior1 owner
            bool success = crownToken.transfer(battle.warrior1Owner, totalStakes);
            if (!success) revert BattleManager__TransferFailed();
        } else if (battle.warrior2Score > battle.warrior1Score) {
            result = BattleResult.WARRIOR2_WIN;
            winnerId = battle.warrior2Id;

            // Transfer all stakes to warrior2 owner
            bool success = crownToken.transfer(battle.warrior2Owner, totalStakes);
            if (!success) revert BattleManager__TransferFailed();
        } else {
            result = BattleResult.DRAW;
            winnerId = 0;

            // Refund stakes to each owner
            bool s1 = crownToken.transfer(battle.warrior1Owner, battle.stakes);
            if (!s1) revert BattleManager__TransferFailed();
            bool s2 = crownToken.transfer(battle.warrior2Owner, battle.stakes);
            if (!s2) revert BattleManager__TransferFailed();
        }

        battle.status = BattleStatus.SETTLED;
        battle.result = result;

        // Update on-chain ELO ratings
        bool isDraw = result == BattleResult.DRAW;
        uint256 w1OldRating = ratings[battle.warrior1Id].rating;
        uint256 w2OldRating = ratings[battle.warrior2Id].rating;

        if (isDraw) {
            _updateEloDraw(battle.warrior1Id, battle.warrior2Id);
        } else if (result == BattleResult.WARRIOR1_WIN) {
            _updateEloWin(battle.warrior1Id, battle.warrior2Id);
        } else {
            _updateEloWin(battle.warrior2Id, battle.warrior1Id);
        }

        emit BattleSettled(
            battleId,
            result,
            winnerId,
            ratings[battle.warrior1Id].rating,
            ratings[battle.warrior2Id].rating
        );
        emit RatingUpdated(battle.warrior1Id, w1OldRating, ratings[battle.warrior1Id].rating);
        emit RatingUpdated(battle.warrior2Id, w2OldRating, ratings[battle.warrior2Id].rating);
    }

    // ═══════════════════════════════════════════════════════
    // BETTING
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Place a bet on a battle outcome. CRwN is transferred to this contract.
     */
    function placeBet(
        uint256 battleId,
        bool betOnWarrior1,
        uint256 amount
    ) external override nonReentrant {
        if (amount == 0) revert BattleManager__InvalidBetAmount();

        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.ACTIVE) revert BattleManager__BattleNotActive();
        if (!battle.bettingOpen) revert BattleManager__BettingClosed();

        // Transfer CRwN from bettor to contract
        bool success = crownToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert BattleManager__TransferFailed();

        BetInfo storage existing = bets[battleId][msg.sender];

        if (existing.amount > 0) {
            // Add to existing bet (must be same side)
            if (existing.betOnWarrior1 != betOnWarrior1) revert BattleManager__InvalidBetAmount();
            existing.amount += amount;
        } else {
            // New bet
            bets[battleId][msg.sender] = BetInfo({
                bettor: msg.sender,
                amount: amount,
                betOnWarrior1: betOnWarrior1,
                claimed: false
            });
            battleBettors[battleId].push(msg.sender);
        }

        // Update pool totals
        if (betOnWarrior1) {
            battle.totalW1Bets += amount;
        } else {
            battle.totalW2Bets += amount;
        }

        emit BetPlaced(battleId, msg.sender, betOnWarrior1, amount);
    }

    /**
     * @notice Close betting for a battle. Only callable by resolver.
     */
    function closeBetting(uint256 battleId) external override onlyResolver {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.ACTIVE) revert BattleManager__BattleNotActive();
        battle.bettingOpen = false;
        emit BettingClosed(battleId);
    }

    /**
     * @notice Claim winnings from a settled battle (pull-based).
     * @dev Winner: betAmount + (losingPool * betAmount / winningPool) - 5% fee
     *      Draw:   betAmount - 5% fee
     *      Loser:  0
     */
    function claimBet(uint256 battleId) external override nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.SETTLED) revert BattleManager__NotSettled();

        BetInfo storage bet = bets[battleId][msg.sender];
        if (bet.amount == 0) revert BattleManager__NoBetFound();
        if (bet.claimed) revert BattleManager__AlreadyClaimed();

        bet.claimed = true;

        uint256 payout = 0;
        bool won = false;

        if (battle.result == BattleResult.DRAW) {
            // Refund minus fee
            uint256 fee = (bet.amount * FEE_BPS) / FEE_DENOMINATOR;
            uint256 insuranceFee = (fee * INSURANCE_BPS) / FEE_DENOMINATOR;
            insuranceReserve += insuranceFee;
            _collectFeeWithStakingForward(fee - insuranceFee);
            payout = bet.amount - fee;
        } else {
            bool warrior1Won = battle.result == BattleResult.WARRIOR1_WIN;
            bool bettorWon = (warrior1Won && bet.betOnWarrior1) || (!warrior1Won && !bet.betOnWarrior1);

            if (bettorWon) {
                won = true;
                uint256 winningPool = bet.betOnWarrior1 ? battle.totalW1Bets : battle.totalW2Bets;
                uint256 losingPool = bet.betOnWarrior1 ? battle.totalW2Bets : battle.totalW1Bets;

                // Share of the losing pool proportional to bet size
                uint256 winnings = 0;
                if (winningPool > 0) {
                    winnings = (losingPool * bet.amount) / winningPool;
                }

                uint256 fee = (winnings * FEE_BPS) / FEE_DENOMINATOR;
                uint256 insuranceFee = (fee * INSURANCE_BPS) / FEE_DENOMINATOR;
                insuranceReserve += insuranceFee;
                _collectFeeWithStakingForward(fee - insuranceFee);

                payout = bet.amount + winnings - fee;
            }
            // Loser: payout stays 0
        }

        if (payout > 0) {
            bool success = crownToken.transfer(msg.sender, payout);
            if (!success) revert BattleManager__TransferFailed();
        }

        emit BetClaimed(battleId, msg.sender, payout, won);
    }

    // ═══════════════════════════════════════════════════════
    // ELO RATING SYSTEM (ON-CHAIN)
    // ═══════════════════════════════════════════════════════

    /**
     * @dev Initialize rating to DEFAULT_RATING (1000) if warrior has no battles.
     */
    function _initRatingIfNeeded(uint256 warriorId) internal {
        if (ratings[warriorId].rating == 0) {
            ratings[warriorId].rating = DEFAULT_RATING;
            ratings[warriorId].peakRating = DEFAULT_RATING;
        }
    }

    /**
     * @dev Dynamic K-factor based on experience.
     *      <20 battles: K=48 (high volatility for new warriors)
     *      20-49 battles: K=32 (standard)
     *      50+ battles: K=24 (veteran, stable rating)
     */
    function _getKFactor(uint256 warriorId) internal view returns (uint256) {
        uint256 battles_ = ratings[warriorId].totalBattles;
        if (battles_ < 20) return 48;
        if (battles_ < 50) return 32;
        return 24;
    }

    /**
     * @dev Calculate expected score (scaled by ELO_SCALE=1000).
     *      E = 1000 / (1 + 10^((opponentRating - myRating) / 400))
     *      Approximated via lookup for integer Solidity math.
     */
    function _expectedScore(uint256 myRating, uint256 opponentRating) internal pure returns (uint256) {
        // Clamp rating diff to [-400, +400] for reasonable approximation
        int256 diff = int256(opponentRating) - int256(myRating);
        if (diff > 400) diff = 400;
        if (diff < -400) diff = -400;

        // Linear approximation: E ≈ 500 - (diff * 500 / 400) = 500 - diff * 1.25
        // This is a reasonable approximation of the logistic curve within [-400, 400]
        int256 expected = 500 - (diff * 500) / int256(ELO_BASE);
        if (expected < 50) expected = 50;   // floor at 5%
        if (expected > 950) expected = 950; // cap at 95%

        return uint256(expected);
    }

    /**
     * @dev Update ELO for a win/loss outcome.
     */
    function _updateEloWin(uint256 winnerId, uint256 loserId) internal {
        WarriorRating storage winner = ratings[winnerId];
        WarriorRating storage loser = ratings[loserId];

        uint256 winnerK = _getKFactor(winnerId);
        uint256 loserK = _getKFactor(loserId);

        uint256 winnerExpected = _expectedScore(winner.rating, loser.rating);
        uint256 loserExpected = ELO_SCALE - winnerExpected;

        // Winner: newRating = oldRating + K * (1 - expected) / 1000
        // actual = 1000 (win), so delta = K * (1000 - expected) / 1000
        uint256 winnerDelta = (winnerK * (ELO_SCALE - winnerExpected)) / ELO_SCALE;
        uint256 loserDelta = (loserK * loserExpected) / ELO_SCALE;

        winner.rating += winnerDelta;
        if (loser.rating > loserDelta) {
            loser.rating -= loserDelta;
        } else {
            loser.rating = 100; // floor rating
        }

        // Update stats
        winner.totalBattles += 1;
        winner.wins += 1;
        winner.currentStreak += 1;
        if (winner.rating > winner.peakRating) {
            winner.peakRating = winner.rating;
        }

        loser.totalBattles += 1;
        loser.losses += 1;
        loser.currentStreak = 0;
    }

    /**
     * @dev Update ELO for a draw outcome.
     */
    function _updateEloDraw(uint256 warrior1Id, uint256 warrior2Id) internal {
        WarriorRating storage w1 = ratings[warrior1Id];
        WarriorRating storage w2 = ratings[warrior2Id];

        uint256 w1K = _getKFactor(warrior1Id);
        uint256 w2K = _getKFactor(warrior2Id);

        uint256 w1Expected = _expectedScore(w1.rating, w2.rating);
        uint256 w2Expected = ELO_SCALE - w1Expected;

        // Draw: actual = 500 (half)
        // delta = K * (500 - expected) / 1000
        int256 w1Delta = int256((w1K * 500)) / int256(ELO_SCALE) - int256((w1K * w1Expected)) / int256(ELO_SCALE);
        int256 w2Delta = int256((w2K * 500)) / int256(ELO_SCALE) - int256((w2K * w2Expected)) / int256(ELO_SCALE);

        if (w1Delta > 0) {
            w1.rating += uint256(w1Delta);
        } else if (w1Delta < 0) {
            uint256 absDelta = uint256(-w1Delta);
            w1.rating = w1.rating > absDelta ? w1.rating - absDelta : 100;
        }

        if (w2Delta > 0) {
            w2.rating += uint256(w2Delta);
        } else if (w2Delta < 0) {
            uint256 absDelta = uint256(-w2Delta);
            w2.rating = w2.rating > absDelta ? w2.rating - absDelta : 100;
        }

        w1.totalBattles += 1;
        w1.draws += 1;
        w1.currentStreak = 0;
        if (w1.rating > w1.peakRating) w1.peakRating = w1.rating;

        w2.totalBattles += 1;
        w2.draws += 1;
        w2.currentStreak = 0;
        if (w2.rating > w2.peakRating) w2.peakRating = w2.rating;
    }

    // ═══════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════

    function getBattle(uint256 battleId) external view override returns (Battle memory) {
        return battles[battleId];
    }

    function getBettingOdds(uint256 battleId) external view override returns (
        uint256 w1Odds,
        uint256 w2Odds,
        uint256 totalPool
    ) {
        Battle storage battle = battles[battleId];
        totalPool = battle.totalW1Bets + battle.totalW2Bets;

        if (totalPool == 0) {
            w1Odds = 5000; // 50-50
            w2Odds = 5000;
        } else {
            w1Odds = (battle.totalW1Bets * FEE_DENOMINATOR) / totalPool;
            w2Odds = FEE_DENOMINATOR - w1Odds;
        }
    }

    function getUserBet(uint256 battleId, address bettor) external view override returns (BetInfo memory) {
        return bets[battleId][bettor];
    }

    function getWarriorRating(uint256 warriorId) external view override returns (WarriorRating memory) {
        WarriorRating memory rating = ratings[warriorId];
        // Return default rating for uninitialized warriors
        if (rating.rating == 0) {
            rating.rating = DEFAULT_RATING;
            rating.peakRating = DEFAULT_RATING;
        }
        return rating;
    }

    function getBattleCount() external view override returns (uint256) {
        return nextBattleId - 1;
    }

    // ═══════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Set the resolver address (cron/oracle authorized to score/settle).
     */
    function setResolver(address _resolver) external onlyOwner {
        require(_resolver != address(0), "Zero address");
        resolver = _resolver;
    }

    /**
     * @notice Withdraw accumulated fees (excluding insurance).
     */
    function withdrawFees(address to) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 amount = totalFeesCollected;
        totalFeesCollected = 0;
        bool success = crownToken.transfer(to, amount);
        if (!success) revert BattleManager__TransferFailed();
    }

    /**
     * @notice Withdraw insurance reserve (governance/emergency use).
     */
    function withdrawInsurance(address to) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 amount = insuranceReserve;
        insuranceReserve = 0;
        bool success = crownToken.transfer(to, amount);
        if (!success) revert BattleManager__TransferFailed();
    }

    function setStakingContract(address _staking) external onlyOwner {
        stakingContract = _staking;
    }

    function setStakingFeePercent(uint256 _percent) external onlyOwner {
        require(_percent <= FEE_DENOMINATOR, "Exceeds 100%");
        stakingFeePercent = _percent;
    }

    /**
     * @notice Cancel a battle and refund stakes. Emergency use only.
     */
    function cancelBattle(uint256 battleId) external onlyOwner nonReentrant {
        Battle storage battle = battles[battleId];
        if (battle.status != BattleStatus.ACTIVE) revert BattleManager__BattleNotActive();

        battle.status = BattleStatus.CANCELLED;
        battle.bettingOpen = false;

        // Refund stakes
        bool s1 = crownToken.transfer(battle.warrior1Owner, battle.stakes);
        if (!s1) revert BattleManager__TransferFailed();
        bool s2 = crownToken.transfer(battle.warrior2Owner, battle.stakes);
        if (!s2) revert BattleManager__TransferFailed();

        // Refund all bets
        address[] storage bettorList = battleBettors[battleId];
        for (uint256 i = 0; i < bettorList.length; i++) {
            BetInfo storage bet = bets[battleId][bettorList[i]];
            if (bet.amount > 0 && !bet.claimed) {
                bet.claimed = true;
                bool bs = crownToken.transfer(bet.bettor, bet.amount);
                if (!bs) revert BattleManager__TransferFailed();
            }
        }
    }

    // ============ Internal ============

    /**
     * @dev Collect fee with optional forwarding to staking contract.
     *      If staking contract is set, forwards stakingFeePercent of the fee.
     */
    function _collectFeeWithStakingForward(uint256 fee) internal {
        if (stakingContract != address(0) && stakingFeePercent > 0) {
            uint256 stakerShare = (fee * stakingFeePercent) / FEE_DENOMINATOR;
            uint256 protocolShare = fee - stakerShare;
            totalFeesCollected += protocolShare;
            crownToken.approve(stakingContract, stakerShare);
            (bool success,) = stakingContract.call(
                abi.encodeWithSignature("distributeFees(uint256)", stakerShare)
            );
            if (!success) {
                totalFeesCollected += stakerShare;
            }
        } else {
            totalFeesCollected += fee;
        }
    }
}
