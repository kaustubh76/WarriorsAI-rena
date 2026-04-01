// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IStrategyBattleManager
 * @notice Interface for the on-chain strategy battle lifecycle:
 *         creation (stake escrow), betting (bet escrow), cycle scoring,
 *         settlement (prize + bet payout distribution), and ELO ratings.
 */
interface IStrategyBattleManager {
    // ============ Errors ============
    error BattleManager__InvalidWarrior();
    error BattleManager__SameWarrior();
    error BattleManager__VaultNotActive();
    error BattleManager__NotWarriorOwner();
    error BattleManager__InvalidStakes();
    error BattleManager__BattleNotFound();
    error BattleManager__BattleNotActive();
    error BattleManager__BattleAlreadySettled();
    error BattleManager__BettingClosed();
    error BattleManager__BettingStillOpen();
    error BattleManager__InvalidBetAmount();
    error BattleManager__AlreadyClaimed();
    error BattleManager__NoBetFound();
    error BattleManager__NotSettled();
    error BattleManager__NotEnoughRounds();
    error BattleManager__Unauthorized();
    error BattleManager__TransferFailed();
    error BattleManager__Warrior2NotApproved();

    // ============ Enums ============

    enum BattleStatus {
        ACTIVE,
        SETTLED,
        CANCELLED
    }

    enum BattleResult {
        UNDECIDED,    // 0
        WARRIOR1_WIN, // 1
        WARRIOR2_WIN, // 2
        DRAW          // 3
    }

    // ============ Structs ============

    struct Battle {
        uint256 warrior1Id;
        uint256 warrior2Id;
        address warrior1Owner;
        address warrior2Owner;
        uint256 stakes;           // CRwN escrowed per side
        BattleStatus status;
        BattleResult result;
        uint256 currentRound;
        uint256 warrior1Score;
        uint256 warrior2Score;
        uint256 totalW1Bets;
        uint256 totalW2Bets;
        bool bettingOpen;
        uint256 createdAt;
    }

    struct BetInfo {
        address bettor;
        uint256 amount;
        bool betOnWarrior1;
        bool claimed;
    }

    struct WarriorRating {
        uint256 rating;        // Elo rating (starts at 1000)
        uint256 totalBattles;
        uint256 wins;
        uint256 losses;
        uint256 draws;
        uint256 currentStreak;
        uint256 peakRating;
    }

    // ============ Events ============

    event BattleCreated(
        uint256 indexed battleId,
        uint256 indexed warrior1Id,
        uint256 indexed warrior2Id,
        uint256 stakes,
        address warrior1Owner,
        address warrior2Owner
    );

    event CycleScored(
        uint256 indexed battleId,
        uint256 round,
        uint256 w1RoundScore,
        uint256 w2RoundScore,
        uint256 w1TotalScore,
        uint256 w2TotalScore
    );

    event BattleSettled(
        uint256 indexed battleId,
        BattleResult result,
        uint256 winnerId,
        uint256 w1NewRating,
        uint256 w2NewRating
    );

    event BetPlaced(
        uint256 indexed battleId,
        address indexed bettor,
        bool betOnWarrior1,
        uint256 amount
    );

    event BettingClosed(uint256 indexed battleId);

    event BetClaimed(
        uint256 indexed battleId,
        address indexed bettor,
        uint256 payout,
        bool won
    );

    event RatingUpdated(
        uint256 indexed warriorId,
        uint256 oldRating,
        uint256 newRating
    );

    // ============ Battle Lifecycle ============

    /**
     * @notice Create a strategy battle with CRwN stakes escrowed on-chain.
     * @dev Caller funds both sides (stakes × 2 pulled from msg.sender).
     *      Settlement distributes to NFT owners recorded at creation time.
     * @param warrior1Id NFT ID of warrior 1 (caller must own)
     * @param warrior2Id NFT ID of warrior 2
     * @param stakes CRwN amount per side (total escrow = stakes × 2)
     * @return battleId The on-chain battle ID
     */
    function createBattle(
        uint256 warrior1Id,
        uint256 warrior2Id,
        uint256 stakes
    ) external returns (uint256 battleId);

    /**
     * @notice Record cycle scores for a battle round. Only callable by resolver.
     * @param battleId The battle to score
     * @param w1RoundScore Warrior 1's score for this round
     * @param w2RoundScore Warrior 2's score for this round
     */
    function recordCycleScore(
        uint256 battleId,
        uint256 w1RoundScore,
        uint256 w2RoundScore
    ) external;

    /**
     * @notice Settle a completed battle. Distributes stakes, updates ELO.
     * @param battleId The battle to settle
     */
    function settleBattle(uint256 battleId) external;

    // ============ Betting ============

    /**
     * @notice Place a bet on a battle outcome. CRwN transferred to contract.
     * @param battleId The battle to bet on
     * @param betOnWarrior1 True to bet on warrior 1, false for warrior 2
     * @param amount CRwN amount to bet
     */
    function placeBet(
        uint256 battleId,
        bool betOnWarrior1,
        uint256 amount
    ) external;

    /**
     * @notice Close betting for a battle. Only callable by resolver.
     * @param battleId The battle to close betting for
     */
    function closeBetting(uint256 battleId) external;

    /**
     * @notice Claim winnings from a settled battle. Pull-based.
     * @param battleId The battle to claim from
     */
    function claimBet(uint256 battleId) external;

    // ============ Views ============

    function getBattle(uint256 battleId) external view returns (Battle memory);
    function getBettingOdds(uint256 battleId) external view returns (uint256 w1Odds, uint256 w2Odds, uint256 totalPool);
    function getUserBet(uint256 battleId, address bettor) external view returns (BetInfo memory);
    function getWarriorRating(uint256 warriorId) external view returns (WarriorRating memory);
    function getBattleCount() external view returns (uint256);

    // ============ Admin ============

    function setResolver(address _resolver) external;
    function setStakingContract(address _staking) external;
    function setStakingFeePercent(uint256 _percent) external;
    function withdrawFees(address to) external;
    function withdrawInsurance(address to) external;
    function cancelBattle(uint256 battleId) external;
}
