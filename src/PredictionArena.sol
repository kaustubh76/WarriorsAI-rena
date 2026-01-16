// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {ICrownToken} from "./Interfaces/ICrownToken.sol";
import {IWarriorsNFT} from "./Interfaces/IWarriorsNFT.sol";

/**
 * @title PredictionArena
 * @author Warriors AI Team
 * @notice Arena where Warriors debate on prediction market topics from Polymarket/Kalshi
 * @dev Warriors use their traits (strength, wit, charisma, defence, luck) to compete in 5-round debates
 *
 * Flow:
 * 1. User creates challenge on a market topic (YES or NO side)
 * 2. Another user accepts with their warrior (opposite side)
 * 3. AI generates arguments for 5 rounds based on warrior traits
 * 4. Winner determined by total score across rounds
 * 5. Stakes distributed to winner
 */
contract PredictionArena is ReentrancyGuard {
    // ============ Errors ============
    error PredictionArena__InvalidWarrior();
    error PredictionArena__InvalidStakes();
    error PredictionArena__ChallengeExpired();
    error PredictionArena__ChallengeNotOpen();
    error PredictionArena__BattleNotActive();
    error PredictionArena__BattleAlreadyCompleted();
    error PredictionArena__InvalidRound();
    error PredictionArena__InvalidSignature();
    error PredictionArena__Unauthorized();
    error PredictionArena__CannotChallengeself();
    error PredictionArena__InvalidMarketKey();
    error PredictionArena__BettingClosed();
    error PredictionArena__InvalidBetAmount();
    error PredictionArena__AlreadyClaimed();
    error PredictionArena__NothingToClaim();

    // ============ Enums ============
    enum BattleStatus {
        PENDING,      // Challenge created, waiting for acceptance
        ACTIVE,       // Battle in progress
        COMPLETED,    // Battle finished
        CANCELLED     // Challenge cancelled/expired
    }

    enum DebateMove {
        STRIKE,   // Direct factual attack (strength)
        TAUNT,    // Challenge credibility (charisma + wit)
        DODGE,    // Reframe/deflect (defence)
        SPECIAL,  // Novel insight (strength + charisma + wit)
        RECOVER   // Acknowledge weakness, pivot (defence + charisma)
    }

    // ============ Structs ============
    struct Challenge {
        uint256 challengeId;
        uint256 warriorId;          // Challenger's warrior NFT ID
        address challengerOwner;
        bool challengerSideYes;     // true = YES side, false = NO side
        bytes32 externalMarketKey;  // keccak256(source, marketId)
        uint256 stakes;             // CRwN staked
        uint256 expiresAt;
        bool isAccepted;
        bool isCancelled;
    }

    struct Battle {
        uint256 battleId;
        bytes32 externalMarketKey;

        // Warrior 1 = YES side, Warrior 2 = NO side
        uint256 warrior1Id;
        address warrior1Owner;
        uint256 warrior2Id;
        address warrior2Owner;

        uint256 stakes;             // Staked by each side
        uint256 warrior1Score;      // Cumulative score
        uint256 warrior2Score;

        uint8 currentRound;         // 1-5
        BattleStatus status;

        uint256 createdAt;
        uint256 completedAt;

        // 0G Storage reference for battle data
        bytes32 battleDataHash;
    }

    struct Round {
        uint8 roundNumber;
        bytes32 warrior1ArgumentHash;  // Hash of argument stored in 0G
        bytes32 warrior2ArgumentHash;
        DebateMove warrior1Move;
        DebateMove warrior2Move;
        uint16 warrior1Score;          // 0-1000 scale
        uint16 warrior2Score;
        bool isComplete;
    }

    struct Bet {
        address bettor;
        uint256 amount;
        bool betOnWarrior1;  // true = bet on YES side (warrior1)
        bool claimed;
    }

    struct BattleBettingPool {
        uint256 totalWarrior1Bets;  // Total bet on YES side
        uint256 totalWarrior2Bets;  // Total bet on NO side
        uint256 totalBettors;
        bool bettingOpen;
    }

    // ============ Constants ============
    uint256 public constant MIN_STAKES = 1 ether;           // 1 CRwN minimum
    uint256 public constant MIN_BET = 0.1 ether;            // 0.1 CRwN minimum bet
    uint256 public constant PLATFORM_FEE_BPS = 200;         // 2%
    uint256 public constant BETTING_FEE_BPS = 500;          // 5% on betting winnings
    uint256 public constant MAX_ROUNDS = 5;
    uint256 public constant BETTING_CLOSE_ROUND = 2;        // Betting closes after round 2
    uint256 public constant DEFAULT_CHALLENGE_DURATION = 24 hours;

    // ============ State ============
    ICrownToken public immutable crownToken;
    IWarriorsNFT public immutable warriorsNFT;
    address public immutable aiPublicKey;

    uint256 public nextChallengeId = 1;
    uint256 public nextBattleId = 1;
    uint256 public totalFeesCollected;

    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => Battle) public battles;
    mapping(uint256 => mapping(uint8 => Round)) public battleRounds;  // battleId => roundNumber => Round

    // Index: market key => challenge IDs
    mapping(bytes32 => uint256[]) public marketChallenges;

    // Index: warrior ID => battle IDs
    mapping(uint256 => uint256[]) public warriorBattles;

    // Betting state
    mapping(uint256 => BattleBettingPool) public battleBettingPools;
    mapping(uint256 => mapping(address => Bet)) public battleBets;  // battleId => bettor => Bet
    mapping(uint256 => address[]) public battleBettors;  // battleId => list of bettors

    // ============ Events ============
    event ChallengeCreated(
        uint256 indexed challengeId,
        uint256 indexed warriorId,
        address indexed owner,
        bytes32 externalMarketKey,
        bool sideYes,
        uint256 stakes,
        uint256 expiresAt
    );

    event ChallengeCancelled(uint256 indexed challengeId);

    event BattleStarted(
        uint256 indexed battleId,
        uint256 indexed warrior1Id,
        uint256 indexed warrior2Id,
        bytes32 externalMarketKey,
        uint256 stakes
    );

    event RoundCompleted(
        uint256 indexed battleId,
        uint8 roundNumber,
        uint16 warrior1Score,
        uint16 warrior2Score,
        DebateMove warrior1Move,
        DebateMove warrior2Move
    );

    event BattleCompleted(
        uint256 indexed battleId,
        uint256 indexed winnerId,
        address indexed winnerOwner,
        uint256 warrior1FinalScore,
        uint256 warrior2FinalScore,
        uint256 payout
    );

    event BattleDataStored(uint256 indexed battleId, bytes32 dataHash);

    event BetPlaced(
        uint256 indexed battleId,
        address indexed bettor,
        bool betOnWarrior1,
        uint256 amount
    );

    event BettingClosed(uint256 indexed battleId, uint256 totalPool);

    event BetClaimed(
        uint256 indexed battleId,
        address indexed bettor,
        uint256 payout,
        bool won
    );

    // ============ Constructor ============
    constructor(
        address _crownToken,
        address _warriorsNFT,
        address _aiPublicKey
    ) {
        crownToken = ICrownToken(_crownToken);
        warriorsNFT = IWarriorsNFT(_warriorsNFT);
        aiPublicKey = _aiPublicKey;
    }

    // ============ Challenge Functions ============

    /**
     * @notice Create a challenge for a prediction market debate
     * @param _warriorId Your warrior NFT ID
     * @param _externalMarketKey Hash identifying the external market (keccak256(source, marketId))
     * @param _sideYes true if you're taking YES side, false for NO
     * @param _stakes Amount of CRwN to stake
     * @param _duration How long the challenge stays open (default 24h if 0)
     */
    function createChallenge(
        uint256 _warriorId,
        bytes32 _externalMarketKey,
        bool _sideYes,
        uint256 _stakes,
        uint256 _duration
    ) external nonReentrant returns (uint256 challengeId) {
        if (_stakes < MIN_STAKES) revert PredictionArena__InvalidStakes();
        if (_externalMarketKey == bytes32(0)) revert PredictionArena__InvalidMarketKey();

        // Verify warrior ownership
        if (warriorsNFT.ownerOf(_warriorId) != msg.sender) {
            revert PredictionArena__InvalidWarrior();
        }

        // Transfer stakes
        crownToken.transferFrom(msg.sender, address(this), _stakes);

        uint256 duration = _duration == 0 ? DEFAULT_CHALLENGE_DURATION : _duration;
        challengeId = nextChallengeId++;

        challenges[challengeId] = Challenge({
            challengeId: challengeId,
            warriorId: _warriorId,
            challengerOwner: msg.sender,
            challengerSideYes: _sideYes,
            externalMarketKey: _externalMarketKey,
            stakes: _stakes,
            expiresAt: block.timestamp + duration,
            isAccepted: false,
            isCancelled: false
        });

        marketChallenges[_externalMarketKey].push(challengeId);

        emit ChallengeCreated(
            challengeId,
            _warriorId,
            msg.sender,
            _externalMarketKey,
            _sideYes,
            _stakes,
            block.timestamp + duration
        );
    }

    /**
     * @notice Cancel an open challenge and get stakes back
     * @param _challengeId The challenge to cancel
     */
    function cancelChallenge(uint256 _challengeId) external nonReentrant {
        Challenge storage challenge = challenges[_challengeId];

        if (challenge.challengerOwner != msg.sender) revert PredictionArena__Unauthorized();
        if (challenge.isAccepted) revert PredictionArena__ChallengeNotOpen();
        if (challenge.isCancelled) revert PredictionArena__ChallengeNotOpen();

        challenge.isCancelled = true;

        // Refund stakes
        crownToken.transfer(msg.sender, challenge.stakes);

        emit ChallengeCancelled(_challengeId);
    }

    /**
     * @notice Accept a challenge and start the battle
     * @param _challengeId The challenge to accept
     * @param _warriorId Your warrior NFT ID (will take opposite side)
     */
    function acceptChallenge(
        uint256 _challengeId,
        uint256 _warriorId
    ) external nonReentrant returns (uint256 battleId) {
        Challenge storage challenge = challenges[_challengeId];

        if (challenge.isAccepted || challenge.isCancelled) {
            revert PredictionArena__ChallengeNotOpen();
        }
        if (block.timestamp > challenge.expiresAt) {
            revert PredictionArena__ChallengeExpired();
        }
        if (challenge.challengerOwner == msg.sender) {
            revert PredictionArena__CannotChallengeself();
        }

        // Verify warrior ownership
        if (warriorsNFT.ownerOf(_warriorId) != msg.sender) {
            revert PredictionArena__InvalidWarrior();
        }

        // Transfer stakes from acceptor
        crownToken.transferFrom(msg.sender, address(this), challenge.stakes);

        challenge.isAccepted = true;

        // Create battle
        battleId = nextBattleId++;

        // Warrior 1 = YES side, Warrior 2 = NO side
        uint256 warrior1Id;
        address warrior1Owner;
        uint256 warrior2Id;
        address warrior2Owner;

        if (challenge.challengerSideYes) {
            warrior1Id = challenge.warriorId;
            warrior1Owner = challenge.challengerOwner;
            warrior2Id = _warriorId;
            warrior2Owner = msg.sender;
        } else {
            warrior1Id = _warriorId;
            warrior1Owner = msg.sender;
            warrior2Id = challenge.warriorId;
            warrior2Owner = challenge.challengerOwner;
        }

        battles[battleId] = Battle({
            battleId: battleId,
            externalMarketKey: challenge.externalMarketKey,
            warrior1Id: warrior1Id,
            warrior1Owner: warrior1Owner,
            warrior2Id: warrior2Id,
            warrior2Owner: warrior2Owner,
            stakes: challenge.stakes,
            warrior1Score: 0,
            warrior2Score: 0,
            currentRound: 1,
            status: BattleStatus.ACTIVE,
            createdAt: block.timestamp,
            completedAt: 0,
            battleDataHash: bytes32(0)
        });

        // Index battles by warrior
        warriorBattles[warrior1Id].push(battleId);
        warriorBattles[warrior2Id].push(battleId);

        emit BattleStarted(
            battleId,
            warrior1Id,
            warrior2Id,
            challenge.externalMarketKey,
            challenge.stakes
        );
    }

    // ============ Battle Functions ============

    /**
     * @notice Submit round results (called by backend with AI signature)
     * @param _battleId Battle ID
     * @param _roundNumber Round number (1-5)
     * @param _w1ArgumentHash Hash of warrior 1's argument (stored in 0G)
     * @param _w2ArgumentHash Hash of warrior 2's argument
     * @param _w1Move Warrior 1's debate move
     * @param _w2Move Warrior 2's debate move
     * @param _w1Score Warrior 1's round score (0-1000)
     * @param _w2Score Warrior 2's round score (0-1000)
     * @param _signature AI signature proving authenticity
     */
    function submitRound(
        uint256 _battleId,
        uint8 _roundNumber,
        bytes32 _w1ArgumentHash,
        bytes32 _w2ArgumentHash,
        DebateMove _w1Move,
        DebateMove _w2Move,
        uint16 _w1Score,
        uint16 _w2Score,
        bytes calldata _signature
    ) external {
        Battle storage battle = battles[_battleId];

        if (battle.status != BattleStatus.ACTIVE) revert PredictionArena__BattleNotActive();
        if (_roundNumber != battle.currentRound) revert PredictionArena__InvalidRound();
        if (_roundNumber > MAX_ROUNDS) revert PredictionArena__InvalidRound();

        // Verify AI signature
        bytes32 dataHash = keccak256(abi.encodePacked(
            _battleId,
            _roundNumber,
            _w1ArgumentHash,
            _w2ArgumentHash,
            uint8(_w1Move),
            uint8(_w2Move),
            _w1Score,
            _w2Score
        ));
        bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(dataHash);
        address recovered = ECDSA.recover(ethSignedMessage, _signature);
        if (recovered != aiPublicKey) revert PredictionArena__InvalidSignature();

        // Store round data
        battleRounds[_battleId][_roundNumber] = Round({
            roundNumber: _roundNumber,
            warrior1ArgumentHash: _w1ArgumentHash,
            warrior2ArgumentHash: _w2ArgumentHash,
            warrior1Move: _w1Move,
            warrior2Move: _w2Move,
            warrior1Score: _w1Score,
            warrior2Score: _w2Score,
            isComplete: true
        });

        // Update cumulative scores
        battle.warrior1Score += _w1Score;
        battle.warrior2Score += _w2Score;

        emit RoundCompleted(
            _battleId,
            _roundNumber,
            _w1Score,
            _w2Score,
            _w1Move,
            _w2Move
        );

        // Check if battle is complete
        if (_roundNumber >= MAX_ROUNDS) {
            _completeBattle(_battleId);
        } else {
            battle.currentRound++;
        }
    }

    /**
     * @notice Complete battle and distribute rewards
     */
    function _completeBattle(uint256 _battleId) internal {
        Battle storage battle = battles[_battleId];

        battle.status = BattleStatus.COMPLETED;
        battle.completedAt = block.timestamp;

        uint256 totalPool = battle.stakes * 2;
        uint256 platformFee = (totalPool * PLATFORM_FEE_BPS) / 10000;
        uint256 winnerPayout = totalPool - platformFee;

        totalFeesCollected += platformFee;

        // Determine winner
        uint256 winnerId;
        address winnerOwner;

        if (battle.warrior1Score > battle.warrior2Score) {
            winnerId = battle.warrior1Id;
            winnerOwner = battle.warrior1Owner;
        } else if (battle.warrior2Score > battle.warrior1Score) {
            winnerId = battle.warrior2Id;
            winnerOwner = battle.warrior2Owner;
        } else {
            // Draw - split evenly
            uint256 splitAmount = winnerPayout / 2;
            crownToken.transfer(battle.warrior1Owner, splitAmount);
            crownToken.transfer(battle.warrior2Owner, winnerPayout - splitAmount);

            emit BattleCompleted(
                _battleId,
                0, // No winner (draw)
                address(0),
                battle.warrior1Score,
                battle.warrior2Score,
                splitAmount
            );
            return;
        }

        // Pay winner
        crownToken.transfer(winnerOwner, winnerPayout);

        emit BattleCompleted(
            _battleId,
            winnerId,
            winnerOwner,
            battle.warrior1Score,
            battle.warrior2Score,
            winnerPayout
        );
    }

    /**
     * @notice Store battle data hash (0G Storage reference)
     * @param _battleId Battle ID
     * @param _dataHash 0G Storage root hash containing full battle data
     */
    function storeBattleData(uint256 _battleId, bytes32 _dataHash) external {
        Battle storage battle = battles[_battleId];
        if (battle.status != BattleStatus.COMPLETED) revert PredictionArena__BattleNotActive();

        // Only battle participants or admin can store
        if (msg.sender != battle.warrior1Owner && msg.sender != battle.warrior2Owner) {
            revert PredictionArena__Unauthorized();
        }

        battle.battleDataHash = _dataHash;
        emit BattleDataStored(_battleId, _dataHash);
    }

    // ============ Betting Functions ============

    /**
     * @notice Place a bet on a battle outcome
     * @param _battleId Battle to bet on
     * @param _betOnWarrior1 true = bet on YES (warrior1), false = bet on NO (warrior2)
     * @param _amount Amount to bet in CRwN
     */
    function placeBet(
        uint256 _battleId,
        bool _betOnWarrior1,
        uint256 _amount
    ) external nonReentrant {
        Battle storage battle = battles[_battleId];
        BattleBettingPool storage pool = battleBettingPools[_battleId];

        // Validate
        if (battle.status != BattleStatus.ACTIVE) revert PredictionArena__BattleNotActive();
        if (battle.currentRound > BETTING_CLOSE_ROUND) revert PredictionArena__BettingClosed();
        if (_amount < MIN_BET) revert PredictionArena__InvalidBetAmount();

        // Check if already bet
        Bet storage existingBet = battleBets[_battleId][msg.sender];
        if (existingBet.amount > 0) {
            // Add to existing bet (must be same side)
            if (existingBet.betOnWarrior1 != _betOnWarrior1) {
                revert PredictionArena__InvalidBetAmount();  // Can't bet on both sides
            }
            existingBet.amount += _amount;
        } else {
            // New bet
            battleBets[_battleId][msg.sender] = Bet({
                bettor: msg.sender,
                amount: _amount,
                betOnWarrior1: _betOnWarrior1,
                claimed: false
            });
            battleBettors[_battleId].push(msg.sender);
            pool.totalBettors++;
        }

        // Update pool
        if (_betOnWarrior1) {
            pool.totalWarrior1Bets += _amount;
        } else {
            pool.totalWarrior2Bets += _amount;
        }

        if (!pool.bettingOpen) {
            pool.bettingOpen = true;
        }

        // Transfer tokens
        crownToken.transferFrom(msg.sender, address(this), _amount);

        emit BetPlaced(_battleId, msg.sender, _betOnWarrior1, _amount);
    }

    /**
     * @notice Claim betting winnings after battle completes
     * @param _battleId Battle to claim from
     */
    function claimBet(uint256 _battleId) external nonReentrant {
        Battle storage battle = battles[_battleId];
        Bet storage bet = battleBets[_battleId][msg.sender];
        BattleBettingPool storage pool = battleBettingPools[_battleId];

        if (battle.status != BattleStatus.COMPLETED) revert PredictionArena__BattleNotActive();
        if (bet.amount == 0) revert PredictionArena__NothingToClaim();
        if (bet.claimed) revert PredictionArena__AlreadyClaimed();

        bet.claimed = true;

        // Determine winner
        bool warrior1Won = battle.warrior1Score > battle.warrior2Score;
        bool warrior2Won = battle.warrior2Score > battle.warrior1Score;
        bool isDraw = battle.warrior1Score == battle.warrior2Score;

        uint256 payout = 0;
        bool won = false;

        if (isDraw) {
            // Refund on draw (minus small fee)
            uint256 fee = (bet.amount * BETTING_FEE_BPS) / 10000;
            payout = bet.amount - fee;
            totalFeesCollected += fee;
        } else if ((warrior1Won && bet.betOnWarrior1) || (warrior2Won && !bet.betOnWarrior1)) {
            // Winner - calculate proportional share of losing pool
            won = true;
            uint256 winningPool = bet.betOnWarrior1 ? pool.totalWarrior1Bets : pool.totalWarrior2Bets;
            uint256 losingPool = bet.betOnWarrior1 ? pool.totalWarrior2Bets : pool.totalWarrior1Bets;

            // Proportional share of winnings
            uint256 share = (bet.amount * 1e18) / winningPool;
            uint256 winnings = (losingPool * share) / 1e18;

            // Apply fee to winnings only
            uint256 fee = (winnings * BETTING_FEE_BPS) / 10000;
            totalFeesCollected += fee;

            payout = bet.amount + winnings - fee;
        }
        // Losers get nothing (payout stays 0)

        if (payout > 0) {
            crownToken.transfer(msg.sender, payout);
        }

        emit BetClaimed(_battleId, msg.sender, payout, won);
    }

    /**
     * @notice Get current betting odds for a battle
     * @param _battleId Battle ID
     * @return warrior1Odds Implied odds for warrior1 (YES) (0-10000 bps = 0-100%)
     * @return warrior2Odds Implied odds for warrior2 (NO)
     * @return totalPool Total amount bet
     */
    function getBettingOdds(uint256 _battleId) external view returns (
        uint256 warrior1Odds,
        uint256 warrior2Odds,
        uint256 totalPool
    ) {
        BattleBettingPool storage pool = battleBettingPools[_battleId];
        totalPool = pool.totalWarrior1Bets + pool.totalWarrior2Bets;

        if (totalPool == 0) {
            return (5000, 5000, 0);  // 50/50 if no bets
        }

        warrior1Odds = (pool.totalWarrior1Bets * 10000) / totalPool;
        warrior2Odds = 10000 - warrior1Odds;
    }

    /**
     * @notice Get user's bet on a battle
     * @param _battleId Battle ID
     * @param _bettor Bettor address
     */
    function getUserBet(uint256 _battleId, address _bettor) external view returns (Bet memory) {
        return battleBets[_battleId][_bettor];
    }

    /**
     * @notice Get betting pool info
     * @param _battleId Battle ID
     */
    function getBettingPool(uint256 _battleId) external view returns (BattleBettingPool memory) {
        return battleBettingPools[_battleId];
    }

    // ============ View Functions ============

    function getChallenge(uint256 _challengeId) external view returns (Challenge memory) {
        return challenges[_challengeId];
    }

    function getBattle(uint256 _battleId) external view returns (Battle memory) {
        return battles[_battleId];
    }

    function getRound(uint256 _battleId, uint8 _roundNumber) external view returns (Round memory) {
        return battleRounds[_battleId][_roundNumber];
    }

    function getMarketChallenges(bytes32 _marketKey) external view returns (uint256[] memory) {
        return marketChallenges[_marketKey];
    }

    function getWarriorBattles(uint256 _warriorId) external view returns (uint256[] memory) {
        return warriorBattles[_warriorId];
    }

    function getOpenChallengesCount(bytes32 _marketKey) external view returns (uint256 count) {
        uint256[] memory challengeIds = marketChallenges[_marketKey];
        for (uint256 i = 0; i < challengeIds.length; i++) {
            Challenge memory c = challenges[challengeIds[i]];
            if (!c.isAccepted && !c.isCancelled && block.timestamp <= c.expiresAt) {
                count++;
            }
        }
    }

    // ============ Admin Functions ============

    function withdrawFees(address _to) external {
        // In production, add proper access control
        uint256 amount = totalFeesCollected;
        totalFeesCollected = 0;
        crownToken.transfer(_to, amount);
    }
}
