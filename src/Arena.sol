// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ICrownToken} from "./Interfaces/ICrownToken.sol";
import {ECDSA} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {IWarriorsNFT} from "./Interfaces/IWarriorsNFT.sol";
import {IArenaFactory} from "./Interfaces/IArenaFactory.sol";
import {IMicroMarketFactory} from "./Interfaces/IMicroMarketFactory.sol";

/**
 * @title Arena
 * @author Yug Agarwal
 * @notice This is the core contract that mints the Arena NFTs.
 * @dev A user (Arena maker) must pass the arena attributes in the token URI.
 *
 *                          .            .                                   .#
 *                        +#####+---+###+#############+-                  -+###.
 *                        +###+++####+##-+++++##+++##++####+-.         -+###+++
 *                        +#########.-#+--+####++###- -########+---+++#####+++
 *                        +#######+#+++--+####+-..-+-.###+++########+-++###++.
 *                       +######.     +#-#####+-.-------+############+++####-
 *                      +####++...     ########-++-        +##########++++++.
 *                     -#######-+.    .########+++          -++######+++-
 *                     #++########--+-+####++++-- . ..    .-#++--+##+####.
 *                    -+++++++++#####---###---.----###+-+########..-+#++##-
 *                    ++###+++++#####-..---.. .+##++++#++#++-+--.   .-++++#
 *                   .###+.  .+#+-+###+ ..    +##+##+#++----...---.  .-+--+.
 *                   ###+---------+####+   -####+-.......    ...--++.  .---.
 *                  -#++++-----#######+-  .-+###+.... .....      .-+##-.  .
 *                  ##+++###++######++-.   .--+---++---........  ...---.  .
 *                 -####+-+#++###++-.        .--.--...-----.......--..... .
 *                 +######+++###+--..---.....  ...---------------.. .. .  .
 *                .-#########+#+++--++--------......----++--.--.  .--+---.
 *                 -+++########++--++++----------------------.--+++--+++--
 *            .######-.-++++###+----------------------..---++--++-+++---..
 *            -##########-------+-----------------------+-++-++----..----+----+#####++--..
 *            -#############+..  ..--..----------.....-+++++++++++++++++##################+.
 *            --+++++#########+-   . ....  ....... -+++++++++++++++++++############-.----+##-
 *            -----....-+#######+-             .. -+++++++++++++++++++++##+######+.       +++.
 *            --------.....---+#####+--......----.+++++++++++++++++++++##+-+++##+.        -++-
 *            -------...   .--++++++---.....-----.+++++++++++++++++++++++. -+++##-        .---
 *            #################+--.....-------.  .+++++++++++++++++++++-       -+-.       .---
 *            +#########++++-.. .......-+--..--++-++++++++++++++++++++-         .-... ....----
 *            -#####++---..   .--       -+++-.  ..+++++++++++++++++++--        .-+-......-+---
 *            +####+---...    -+#-   .  --++++-. .+++++++++++++++++++---        --        -+--
 *            ++++++++++--....-++.--++--.--+++++-.+++++++++++++++++++---. .......         ----
 *           .--++#########++-.--.+++++--++++###+-++++++++++++++++++++----   .-++-        ----
 *            .-+#############+-.++#+-+-++#######-++++++++++++++++++++----   -++++-      ..---
 *           .---+############+.+###++--++#####++-+++++++++++++++++++++-------++++-........-+-
 *            --+-+##########-+######+++++-++++++-++++++++++++++++++++++-----.----.......---+-
 *           .--+---#######..+#######+++++++--+++-+++++++++++++++++++++++-----------------+++-
 *           .++--..-+##-.-########+++++---++ .+-.+++++++++++++++++++++++++++++++++++---+++++-
 *           -+++. ..-..-+#########++-++--..--....+++++++++++++++++++++++++++++++++++++++++++-
 *           -++-......-+++############++++----- .+++++++++++++++++++++++++++++++++++++++++++-
 *           +##-.....---+#######+####+####+--++-.+++++++++++++++++++++++++++++++++++++++++++-
 *          .#+++-...-++######++-+-----..----++##-+++++++++++++++++++++++++++++++++++++++++++-
 *          .+++--------+##----+------+-..----+++-+++++++++++++++++++++++++++++++++++++++++++-
 *           ----.-----+++-+-...------++-----...--+++++++++++++++++++++++++++++++++++++++++++-
 *          .-..-.--.----..--.... ....++--.  ....-+++++++++++++++++++++++++++++++++++++++++++-
 *           -----------.---..--..   ..+.  . ... .+++++++++++++++++++++++++++++++++++++++++++-
 *         .+#+#+---####+-.    .....--...   .    .+++++++++++++++++++++++++++++++++++++++++++-
 *         -+++++#++++++++.    ..-...--.. ..     .+++++++++++++++++++++++++++++++++++++++++++-
 *         ++++++-------++--   . ....--.. . . .. .+++++++++++++++++++++++++-+----------...
 *         -++++--++++.------......-- ...  ..  . .---------------...
 *         -++-+####+++---..-.........
 *           .....
 */
contract Arena {
    error Arena__NotValidBridgeAddress();
    error Arena__GameNotStartedYet();
    error Arena__GameFinishConditionNotMet();
    error Arena__PlayerHasAlreadyBettedOnPlayerOne();
    error Arena__GameAlreadyStarted();
    error Arena__InvalidBetAmount();
    error Arena__CanOnlyBetOnOnePlayer();
    error Arena__GameNotInitializedYet();
    error Arena__InvalidTokenAddress();
    error Arena__CostCannotBeZero();
    error Arena__InvalidRankCategory();
    error Arena__ThereShouldBeBettersOnBothSide();
    error Arena__LastBattleIsStillGoingOn();
    error Arena__BattleIsCurrentlyOngoingCannotInfluenceOrDefluence();
    error Arena__PlayerAlreadyUsedDefluence();
    error Arena__BettingPeriodStillGoingOn();
    error Arena__BattleRoundIntervalPeriodIsStillGoingOn();
    error Arena__GameAlreadyInitialized();
    error Arena__WarriorsIdsCannotBeSame();
    error Arena__InvalidSignature();
    error Arena__Locked();
    error Arena__InvalidAddress();
    error Arena__BettingPeriodNotActive();
    error Arena__Unauthorized();

    enum RankCategory {
        UNRANKED,
        BRONZE,
        SILVER,
        GOLD,
        PLATINUM
    }

    enum PlayerMoves {
        STRIKE, // strength
        TAUNT, // charisma + wit
        DODGE, // defence
        SPECIAL, // personality + strength
        RECOVER // defence + charisma

    }

    // enum LockStatus {
    //     UNLOCKED,
    //     LOCKED
    // }

    IWarriorsNFT.Ranking immutable i_rankCategory;
    // Rank categories can be UNRANKED, BRONZE, SILVER, GOLD, PLATINUM.
    ICrownToken private immutable i_CrownToken; // Contract inteface of Crown Token
    address private immutable i_ArenaFactory;
    // LockStatus private s_lockStatus; // Retrency lock status of the game
    address private immutable i_cadenceArch; // contract address of cadence arch to generate the random number using flow's vrf
    uint256 private immutable i_costToInfluence; // Cost to influence a Warriors
    uint256 private s_costToInfluenceWarriorsOne;
    uint256 private s_costToInfluenceWarriorsTwo;
    uint256 private immutable i_costToDefluence; // Cost to defluence a Warriors
    uint256 private s_costToDefluenceWarriorsOne;
    uint256 private s_costToDefluenceWarriorsTwo;
    address private immutable i_AiPublicKey; // Public key of the ai that selects the next moves of the Warriorss
    address private immutable i_WarriorsNFTCollection; // Address of the Warriors NFT collection contract
    uint256 private immutable i_betAmount; // Amount to be betted by the players on Warriors One and Warriors Two
    uint256 private s_totalInfluencePointsOfWarriorsOneForNextRound;
    uint256 private s_totalDefluencePointsOfWarriorsOneForNextRound;
    uint256 private s_totalInfluencePointsOfWarriorsTwoForNextRound;
    uint256 private s_totalDefluencePointsOfWarriorsTwoForNextRound;
    uint256 private s_WarriorsOneNFTId; // NFT ID of Warriors One
    uint256 private s_WarriorsTwoNFTId; // NFT ID of Warriors Two
    // address private s_bridgeAddress; // Address of bridge contract the connects this Flow chain to  chain(holding the AI agents)
    uint8 private s_currentRound; // Current Round of the game (0 when game is not started yet can be initialized, 1-5 when game is in progress)
    address[] private s_playerOneBetAddresses; // Players' addresses that have placed their bets on Warriors One
    // mapping(address => uint256) private s_playerOneBetAmounts; // Bet amounts of the betters siding with Warriors One
    address[] private s_playerTwoBetAddresses; // Players' addresses that have places their bets on Warriors Two
    // mapping(address => uint256) private s_playerTwoBetAmounts; // Bet amount of the betters siding with Warriors Two
    mapping(address => bool) private s_playersAlreadyUsedDefluenceAddresses; // Track if a player has already defluenced a Warriors in the game since a player can only defluence a Warriors once per game
    bool private s_gameInitialized; // Flag to check if the game has been initialized (not started but initialized with Warriors NFT Ids and bridge address)
    bool private s_isBattleOngoing; // flog to check if the battle round is currently ongoing
    // bool private s_isCalculatingWinner; // Flag to check if the winner is being calculated
    uint256 private s_gameInitializedAt;
    uint256 private s_lastRoundEndedAt;
    uint256 private s_damageOnWarriorsOne; // To keep track of damage of Warriors one during the game
    uint256 private s_damageOnWarriorsTwo; // To keep track of damage of Warriors two during the game
    bool private s_isBettingPeriod; // Flag to check if the betting period is active

    uint8 private constant MIN_Warriors_BETTING_PERIOD = 60;
    uint8 private constant MIN_BATTLE_ROUNDS_INTERVAL = 30;
    uint8 private constant Warriors_ONE_CUT = 5; // 5 % of the total bet amounts

    // Micro-market factory for round-by-round betting
    IMicroMarketFactory public microMarketFactory;
    uint256 private s_battleId; // Unique battle ID for micro-market integration

    /**
     * @notice Constructor to initialize the Arena game.
     * @dev Rank categories can be UNRANKED, BRONZE, SILVER, GOLD, PLATINUM.
     * @param _costToInfluence The cost to influenfce a Warriors
     * @param _costToDefluence The cost to defluence a Warriors
     * @dev Cost to influence and defluence is in Crown tokens.
     * @param _CrownTokenAddress Contract address of Crown token.
     */
    constructor(
        uint256 _costToInfluence,
        uint256 _costToDefluence,
        address _CrownTokenAddress,
        address _AiPublicKey,
        address _cadenceArch,
        address _WarriorsNFTCollection,
        uint256 _betAmount,
        IWarriorsNFT.Ranking _rankCategory
    ) {
        if (_CrownTokenAddress == address(0)) {
            revert Arena__InvalidTokenAddress();
        }
        if (_costToInfluence == 0 || _costToDefluence == 0) {
            revert Arena__CostCannotBeZero();
        }
        if (_AiPublicKey == address(0)) {
            revert Arena__InvalidAddress();
        }
        if (_cadenceArch == address(0)) {
            revert Arena__InvalidAddress();
        }
        if (_WarriorsNFTCollection == address(0)) {
            revert Arena__InvalidAddress();
        }
        if (_betAmount == 0) {
            revert Arena__InvalidBetAmount();
        }

        i_costToInfluence = _costToInfluence;
        s_costToInfluenceWarriorsOne = _costToInfluence;
        s_costToInfluenceWarriorsTwo = _costToInfluence;
        i_costToDefluence = _costToDefluence;
        s_costToDefluenceWarriorsOne = _costToDefluence;
        s_costToDefluenceWarriorsTwo = _costToDefluence;
        i_CrownToken = ICrownToken(_CrownTokenAddress);
        i_AiPublicKey = _AiPublicKey;
        i_cadenceArch = _cadenceArch;
        i_WarriorsNFTCollection = _WarriorsNFTCollection;
        i_betAmount = _betAmount;
        i_rankCategory = _rankCategory;
        i_ArenaFactory = msg.sender;

        // s_lockStatus = LockStatus.UNLOCKED; // Initialize the lock status to unlocked
    }

    event GameInitialized(
        uint256 indexed WarriorsOneNFTId, uint256 indexed WarriorsTwoNFTId, uint256 indexed gameInitializedAt
    );

    event BetPlacedOnWarriorsOne(address indexed player, uint256 indexed multiplier, uint256 indexed betAmount);

    event BetPlacedOnWarriorsTwo(address indexed player, uint256 indexed multiplier, uint256 indexed betAmount);

    event GameStarted(uint256 indexed gameStartedAt);

    event GameFinished(
        uint256 indexed WarriorsOneNFTId,
        uint256 indexed WarriorsTwoNFTId,
        uint256 indexed damageOnWarriorsOne,
        uint256 damageOnWarriorsTwo
    );

    event WarriorsOneInfluenced(address indexed player, uint256 indexed WarriorsNFTId, uint256 indexed currentRound);

    event WarriorsTwoInfluenced(address indexed player, uint256 indexed WarriorsNFTId, uint256 indexed currentRound);

    event WarriorsOneDefluenced(address indexed player, uint256 indexed WarriorsNFTId, uint256 indexed currentRound);

    event WarriorsTwoDefluenced(address indexed player, uint256 indexed WarriorsNFTId, uint256 indexed currentRound);

    event RoundOver(
        uint256 indexed roundNumber,
        uint256 indexed WarriorsOneNFTId,
        uint256 indexed WarriorsTwoNFTId,
        uint256 WarriorsOneDamage,
        uint256 WarriorsOneRecovery,
        uint256 WarriorsTwoDamage,
        uint256 WarriorsTwoRecovery
    );

    event WarriorsMoveExecuted(
        address indexed player,
        uint256 indexed currentRound,
        PlayerMoves indexed move,
        uint256 damageOnOpponentWarriors,
        uint256 recoveryOnSelfWarriors,
        bool dodged
    );

    event GameResetted(uint256 indexed WarriorsOneNFTId, uint256 indexed WarriorsTwoNFTId);

    event GameRefunded(
        address[] indexed playerBetAddresses, uint256 indexed WarriorsNFTId
    );

    // Micro-market integration events
    event MicroMarketFactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event BattleIdAssigned(uint256 indexed battleId, uint256 indexed warriorsOneId, uint256 indexed warriorsTwoId);
    event RoundStartedForMicroMarket(uint256 indexed battleId, uint8 indexed round, uint256 timestamp);
    event MoveSelectedForMicroMarket(uint256 indexed battleId, uint256 indexed warriorId, PlayerMoves move, uint8 round);
    event DamageDealtForMicroMarket(uint256 indexed battleId, uint256 indexed attackerId, uint256 damage, uint8 round);

    /**
     * @notice Initializes the game with the given parameters.
     * @param _WarriorsOneNFTId The NFT ID of Warriors One.
     * @param _WarriorsTwoNFTId The NFT ID of Warriors Two.
     */
    function initializeGame(uint256 _WarriorsOneNFTId, uint256 _WarriorsTwoNFTId) public {
        if (s_gameInitialized) {
            revert Arena__GameAlreadyInitialized();
        }
        if (_WarriorsOneNFTId == 0 || _WarriorsTwoNFTId == 0) {
            revert Arena__InvalidTokenAddress();
        }
        if (_WarriorsOneNFTId == _WarriorsTwoNFTId) {
            revert Arena__WarriorsIdsCannotBeSame();
        }
        if (
            IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(_WarriorsOneNFTId) == address(0)
                || IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(_WarriorsTwoNFTId) == address(0)
        ) {
            revert Arena__InvalidTokenAddress();
        }
        if (
            IWarriorsNFT(i_WarriorsNFTCollection).getRanking(_WarriorsOneNFTId)
                != IWarriorsNFT(i_WarriorsNFTCollection).getRanking(_WarriorsTwoNFTId)
                || IWarriorsNFT(i_WarriorsNFTCollection).getRanking(_WarriorsOneNFTId) != i_rankCategory
                || IWarriorsNFT(i_WarriorsNFTCollection).getRanking(_WarriorsTwoNFTId) != i_rankCategory
        ) {
            revert Arena__InvalidRankCategory();
        }

        s_WarriorsOneNFTId = _WarriorsOneNFTId;
        s_WarriorsTwoNFTId = _WarriorsTwoNFTId;
        s_gameInitialized = true;
        s_gameInitializedAt = block.timestamp;
        s_isBettingPeriod = true;

        // Generate unique battle ID for micro-market integration
        s_battleId = uint256(keccak256(abi.encodePacked(
            _WarriorsOneNFTId,
            _WarriorsTwoNFTId,
            block.timestamp,
            address(this)
        )));

        emit GameInitialized(_WarriorsOneNFTId, _WarriorsTwoNFTId, s_gameInitializedAt);
        emit BattleIdAssigned(s_battleId, _WarriorsOneNFTId, _WarriorsTwoNFTId);
    }

    /**
     * @notice Places a bet on Warriors One.
     * @param _multiplier The multiplier for the bet amount.
     */
    function betOnWarriorsOne(uint256 _multiplier) external {
        if (!s_gameInitialized) {
            revert Arena__GameNotStartedYet();
        }
        if (s_currentRound != 0) {
            revert Arena__GameAlreadyStarted();
        }
        if (_multiplier == 0) {
            revert Arena__InvalidBetAmount();
        }
        if (!s_isBettingPeriod) {
            revert Arena__BettingPeriodNotActive();
        }

        for (uint256 i = 0; i < _multiplier; i++) {
            s_playerOneBetAddresses.push(msg.sender);
        }
        i_CrownToken.transferFrom(msg.sender, address(this), i_betAmount * _multiplier);

        emit BetPlacedOnWarriorsOne(msg.sender, _multiplier, i_betAmount);
    }

    /**
     * @notice Places a bet on Warriors Two.
     * @param _multiplier The multiplier for the bet amount.
     */
    function betOnWarriorsTwo(uint256 _multiplier) external {
        if (_multiplier == 0) {
            revert Arena__InvalidBetAmount();
        }
        if (!s_gameInitialized) {
            revert Arena__GameNotStartedYet();
        }
        if (s_currentRound != 0) {
            revert Arena__GameAlreadyStarted();
        }
        if (!s_isBettingPeriod) {
            revert Arena__BettingPeriodNotActive();
        }


        for (uint256 i = 0; i < _multiplier; i++) {
            s_playerTwoBetAddresses.push(msg.sender);
        }
        i_CrownToken.transferFrom(msg.sender, address(this), i_betAmount * _multiplier);

        emit BetPlacedOnWarriorsTwo(msg.sender, _multiplier, i_betAmount);
    }

    /**
     * @notice Starts the game.
     * @dev This function checks if there are at least better on both the sides to prevent unnecessary starting of the game
     */
    function startGame() external {
        if (block.timestamp < MIN_Warriors_BETTING_PERIOD + s_gameInitializedAt) {
            revert Arena__BettingPeriodStillGoingOn();
        }
        if (!s_gameInitialized) {
            revert Arena__GameNotInitializedYet();
        }
        if (s_currentRound != 0) {
            revert Arena__GameAlreadyStarted();
        }

        s_isBettingPeriod = false;

        if (s_playerTwoBetAddresses.length == 0 || s_playerOneBetAddresses.length == 0) {
            if(s_playerOneBetAddresses.length == 0) {
                _refund(false);
            } else{
                _refund(true);
            }

            return;
        }
        s_currentRound = 1;
        s_lastRoundEndedAt = block.timestamp;

        emit GameStarted(block.timestamp);
    }

    /**
     * @notice Allows players to influence Warriors One.
     */
    function influenceWarriorsOne() external {
        if (!s_gameInitialized) {
            revert Arena__GameNotInitializedYet();
        }
        if (s_currentRound == 0 || s_currentRound >= 6) {
            revert Arena__GameNotStartedYet();
        }
        if (s_isBattleOngoing) revert Arena__BattleIsCurrentlyOngoingCannotInfluenceOrDefluence();

        i_CrownToken.transferFrom(msg.sender, address(this), s_costToInfluenceWarriorsOne);
        s_totalInfluencePointsOfWarriorsOneForNextRound++;

        emit WarriorsOneInfluenced(msg.sender, s_WarriorsOneNFTId, s_currentRound);
    }

    /**
     * @notice Allows players to defluence Warriors One.
     */
    function defluenceWarriorsOne() external {
        if (!s_gameInitialized) {
            revert Arena__GameNotInitializedYet();
        }
        if (s_currentRound == 0 || s_currentRound >= 6) {
            revert Arena__GameNotStartedYet();
        }
        if (s_isBattleOngoing) revert Arena__BattleIsCurrentlyOngoingCannotInfluenceOrDefluence();
        if (s_playersAlreadyUsedDefluenceAddresses[msg.sender]) revert Arena__PlayerAlreadyUsedDefluence();

        i_CrownToken.transferFrom(msg.sender, address(this), s_costToDefluenceWarriorsOne);
        s_totalDefluencePointsOfWarriorsOneForNextRound++;
        s_playersAlreadyUsedDefluenceAddresses[msg.sender] = true;

        emit WarriorsOneDefluenced(msg.sender, s_WarriorsOneNFTId, s_currentRound);
    }

    /**
     * @notice Allows players to influence Warriors Two.
     */
    function influenceWarriorsTwo() external {
        if (!s_gameInitialized) {
            revert Arena__GameNotInitializedYet();
        }
        if (s_currentRound == 0 || s_currentRound >= 6) {
            revert Arena__GameNotStartedYet();
        }
        if (s_isBattleOngoing) revert Arena__BattleIsCurrentlyOngoingCannotInfluenceOrDefluence();

        i_CrownToken.transferFrom(msg.sender, address(this), s_costToInfluenceWarriorsTwo);
        s_totalInfluencePointsOfWarriorsTwoForNextRound++;

        emit WarriorsTwoInfluenced(msg.sender, s_WarriorsTwoNFTId, s_currentRound);
    }

    /**
     * @notice Allows players to defluence Warriors Two.
     */
    function defluenceWarriorsTwo() external {
        if (!s_gameInitialized) {
            revert Arena__GameNotInitializedYet();
        }
        if (s_currentRound == 0 || s_currentRound >= 6) {
            revert Arena__GameNotStartedYet();
        }
        if (s_isBattleOngoing) revert Arena__BattleIsCurrentlyOngoingCannotInfluenceOrDefluence();
        if (s_playersAlreadyUsedDefluenceAddresses[msg.sender]) revert Arena__PlayerAlreadyUsedDefluence();

        i_CrownToken.transferFrom(msg.sender, address(this), s_costToDefluenceWarriorsTwo);
        s_totalDefluencePointsOfWarriorsTwoForNextRound++;
        s_playersAlreadyUsedDefluenceAddresses[msg.sender] = true;

        emit WarriorsTwoDefluenced(msg.sender, s_WarriorsTwoNFTId, s_currentRound);
    }

    /**
     * @notice Function to execute the battle between two Warriorss.
     * @param _WarriorsOneMove The move of Warriors One.
     * @param _WarriorsTwoMove The move of Warriors Two.
     * @param _signedData The signed data from the AI agent.
     * @dev this function can only be called by the signed data of the AI agent
     */
    function battle(PlayerMoves _WarriorsOneMove, PlayerMoves _WarriorsTwoMove, bytes memory _signedData) external {
        if (block.timestamp < s_lastRoundEndedAt + MIN_BATTLE_ROUNDS_INTERVAL) {
            revert Arena__BattleRoundIntervalPeriodIsStillGoingOn();
        }
        if (s_isBattleOngoing) {
            revert Arena__LastBattleIsStillGoingOn();
        }
        if (!s_gameInitialized) {
            revert Arena__GameNotInitializedYet();
        }
        if (s_currentRound == 0) {
            revert Arena__GameNotStartedYet();
        }
        if (s_playerTwoBetAddresses.length == 0 || s_playerOneBetAddresses.length == 0) {
            revert Arena__ThereShouldBeBettersOnBothSide();
        }
        bytes32 dataHash = keccak256(abi.encodePacked(_WarriorsOneMove, _WarriorsTwoMove));
        if (s_currentRound >= 6) {
            finishGame();
            return;
        }
        bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(dataHash);
        address recovered = ECDSA.recover(ethSignedMessage, _signedData);
        if (recovered != i_AiPublicKey) {
            revert Arena__InvalidSignature();
        }

        s_isBattleOngoing = true;

        // Emit round start for micro-markets
        emit RoundStartedForMicroMarket(s_battleId, s_currentRound, block.timestamp);

        // Notify micro-market factory of round start
        if (address(microMarketFactory) != address(0)) {
            microMarketFactory.onRoundStart(s_battleId, s_currentRound);
        }

        //Logic to detemine the winner of the battle
        (uint256 damageOnWarriorsTwo, uint256 recoveryOfWarriorsOne, bool WarriorsOneDodged) =
            _executeWarriorsMove(_WarriorsOneMove, s_WarriorsOneNFTId, s_WarriorsTwoNFTId);
        (uint256 damageOnWarriorsOne, uint256 recoveryOfWarriorsTwo, bool WarriorsTwoDodged) =
            _executeWarriorsMove(_WarriorsTwoMove, s_WarriorsTwoNFTId, s_WarriorsOneNFTId);

        // Emit move selections for micro-markets
        emit MoveSelectedForMicroMarket(s_battleId, s_WarriorsOneNFTId, _WarriorsOneMove, s_currentRound);
        emit MoveSelectedForMicroMarket(s_battleId, s_WarriorsTwoNFTId, _WarriorsTwoMove, s_currentRound);

        // Notify micro-market factory of moves
        if (address(microMarketFactory) != address(0)) {
            microMarketFactory.onMoveExecuted(s_battleId, s_WarriorsOneNFTId, IMicroMarketFactory.PlayerMoves(uint8(_WarriorsOneMove)), s_currentRound);
            microMarketFactory.onMoveExecuted(s_battleId, s_WarriorsTwoNFTId, IMicroMarketFactory.PlayerMoves(uint8(_WarriorsTwoMove)), s_currentRound);
        }

        if (s_damageOnWarriorsOne < recoveryOfWarriorsOne) recoveryOfWarriorsOne = s_damageOnWarriorsOne;
        if (s_damageOnWarriorsTwo < recoveryOfWarriorsTwo) recoveryOfWarriorsTwo = s_damageOnWarriorsTwo;

        if (!WarriorsOneDodged && !WarriorsTwoDodged) {
            s_damageOnWarriorsOne = s_damageOnWarriorsOne + damageOnWarriorsOne;
            s_damageOnWarriorsTwo = s_damageOnWarriorsTwo + damageOnWarriorsTwo;

            // Emit damage dealt events for micro-markets
            if (damageOnWarriorsOne > 0) {
                emit DamageDealtForMicroMarket(s_battleId, s_WarriorsTwoNFTId, damageOnWarriorsOne, s_currentRound);
            }
            if (damageOnWarriorsTwo > 0) {
                emit DamageDealtForMicroMarket(s_battleId, s_WarriorsOneNFTId, damageOnWarriorsTwo, s_currentRound);
            }
        }

        if (s_damageOnWarriorsOne < recoveryOfWarriorsOne) {
            s_damageOnWarriorsOne = 0;
        } else {
            s_damageOnWarriorsOne -= recoveryOfWarriorsOne;
        }
        if (s_damageOnWarriorsTwo < recoveryOfWarriorsTwo) {
            s_damageOnWarriorsTwo = 0;
        } else {
            s_damageOnWarriorsTwo -= recoveryOfWarriorsTwo;
        }

        // Resolve micro-markets for this round
        if (address(microMarketFactory) != address(0)) {
            microMarketFactory.resolveRound(
                s_battleId,
                s_currentRound,
                damageOnWarriorsOne,
                damageOnWarriorsTwo,
                IMicroMarketFactory.PlayerMoves(uint8(_WarriorsOneMove)),
                IMicroMarketFactory.PlayerMoves(uint8(_WarriorsTwoMove)),
                WarriorsOneDodged,
                WarriorsTwoDodged
            );
        }

        s_currentRound++;
        s_lastRoundEndedAt = block.timestamp;

        emit RoundOver(
            s_currentRound - 1,
            s_WarriorsOneNFTId,
            s_WarriorsTwoNFTId,
            damageOnWarriorsOne,
            recoveryOfWarriorsOne,
            damageOnWarriorsTwo,
            recoveryOfWarriorsTwo
        );

        if (s_currentRound >= 6) {
            finishGame();
        }

        s_isBattleOngoing = false;
    }

    /**
     * @param _WarriorsMove The move of the Warriors.
     * @return damageOnOpponent The damage inflicted on the opponent Warriors.
     * @return recoveryOfSelf The recovery of the Warriors itself.
     */
    function _executeWarriorsMove(PlayerMoves _WarriorsMove, uint256 _WarriorsNFTId, uint256 _WarriorsOpponentNFTId)
        private
        returns (uint256 damageOnOpponent, uint256 recoveryOfSelf, bool dodged)
    {
        // formulae to find our the damage and recovery if success
        IWarriorsNFT.Traits memory traitsOfWarriors = IWarriorsNFT(i_WarriorsNFTCollection).getTraits(_WarriorsNFTId);
        IWarriorsNFT.Traits memory traitsOfOpponentWarriors = IWarriorsNFT(i_WarriorsNFTCollection).getTraits(_WarriorsOpponentNFTId);

        // Strike
        if (_WarriorsMove == PlayerMoves.STRIKE) {
            uint256 successRate = _calculateSuccessRate(traitsOfWarriors.luck, traitsOfOpponentWarriors.luck);
            uint256 randomNumber = uint256(_revertibleRandom()) % 10000;
            if (randomNumber <= successRate) {
                uint256 influencePoints;
                uint256 defluencePoints;
                if (_WarriorsNFTId == s_WarriorsOneNFTId) {
                    influencePoints = s_totalInfluencePointsOfWarriorsOneForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsOneForNextRound;
                } else {
                    influencePoints = s_totalInfluencePointsOfWarriorsTwoForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsTwoForNextRound;
                }
                damageOnOpponent = _calculateDamage(
                    traitsOfWarriors.strength, traitsOfOpponentWarriors.defence, influencePoints, defluencePoints
                );
                recoveryOfSelf = 0;
                dodged = false;
            } else {
                damageOnOpponent = 0;
                recoveryOfSelf = 0;
                dodged = false;
            }
        } else if (_WarriorsMove == PlayerMoves.DODGE) {
            uint256 successRate = _calculateSuccessRate(traitsOfWarriors.luck, traitsOfOpponentWarriors.luck);
            uint256 randomNumber = uint256(_revertibleRandom()) % 10000;
            if (randomNumber <= successRate) {
                damageOnOpponent = 0;
                recoveryOfSelf = 0;
                dodged = true;
            } else {
                damageOnOpponent = 0;
                recoveryOfSelf = 0;
                dodged = false;
            }
        } else if (_WarriorsMove == PlayerMoves.TAUNT) {
            uint256 successRate = _calculateSuccessRate(traitsOfWarriors.luck, traitsOfOpponentWarriors.luck);
            uint256 randomNumber = uint256(_revertibleRandom()) % 10000;
            if (randomNumber <= successRate) {
                uint16 damagePoints = (traitsOfWarriors.charisma + traitsOfWarriors.wit) / 2;
                uint16 defencePoints = traitsOfOpponentWarriors.defence;
                damageOnOpponent = 0;
                recoveryOfSelf = 0;
                dodged = false;

                uint256 influencePoints;
                uint256 defluencePoints;
                if (_WarriorsNFTId == s_WarriorsOneNFTId) {
                    influencePoints = s_totalInfluencePointsOfWarriorsOneForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsOneForNextRound;
                } else {
                    influencePoints = s_totalInfluencePointsOfWarriorsTwoForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsTwoForNextRound;
                }

                uint256 discountOnCostOfInfluenceAndDefluence =
                    _calculateDamage(damagePoints, defencePoints, influencePoints, defluencePoints);

                if (_WarriorsNFTId == s_WarriorsOneNFTId) {
                    s_costToInfluenceWarriorsOne = s_costToInfluenceWarriorsOne
                        - (discountOnCostOfInfluenceAndDefluence * s_costToInfluenceWarriorsOne) / 10000;
                    s_costToDefluenceWarriorsTwo = s_costToDefluenceWarriorsTwo
                        - (discountOnCostOfInfluenceAndDefluence * s_costToDefluenceWarriorsTwo) / 10000;
                } else {
                    s_costToInfluenceWarriorsTwo = s_costToInfluenceWarriorsTwo
                        - (discountOnCostOfInfluenceAndDefluence * s_costToInfluenceWarriorsTwo) / 10000;
                    s_costToDefluenceWarriorsOne = s_costToDefluenceWarriorsOne
                        - (discountOnCostOfInfluenceAndDefluence * s_costToDefluenceWarriorsOne) / 10000;
                }
            } else {
                damageOnOpponent = 0;
                recoveryOfSelf = 0;
                dodged = false;
            }
        } else if (_WarriorsMove == PlayerMoves.SPECIAL) {
            uint256 successRate = _calculateSuccessRate(traitsOfWarriors.luck, traitsOfOpponentWarriors.luck);
            uint256 randomNumber = uint256(_revertibleRandom()) % 10000;
            if (randomNumber <= successRate) {
                uint256 influencePoints;
                uint256 defluencePoints;
                if (_WarriorsNFTId == s_WarriorsOneNFTId) {
                    influencePoints = s_totalInfluencePointsOfWarriorsOneForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsOneForNextRound;
                } else {
                    influencePoints = s_totalInfluencePointsOfWarriorsTwoForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsTwoForNextRound;
                }
                uint16 damagePoints = (traitsOfWarriors.strength + traitsOfWarriors.charisma + traitsOfWarriors.wit) / 3;
                uint16 defencePoints = traitsOfOpponentWarriors.defence;
                damageOnOpponent = _calculateDamage(damagePoints, defencePoints, influencePoints, defluencePoints);
                recoveryOfSelf = 0;
                dodged = false;
            } else {
                damageOnOpponent = 0;
                recoveryOfSelf = 0;
                dodged = false;
            }
        } else {
            uint256 successRate = _calculateSuccessRate(traitsOfWarriors.luck, traitsOfOpponentWarriors.luck);
            uint256 randomNumber = uint256(_revertibleRandom()) % 10000;
            if (randomNumber <= successRate) {
                uint256 influencePoints;
                uint256 defluencePoints;
                if (_WarriorsNFTId == s_WarriorsOneNFTId) {
                    influencePoints = s_totalInfluencePointsOfWarriorsOneForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsOneForNextRound;
                } else {
                    influencePoints = s_totalInfluencePointsOfWarriorsTwoForNextRound;
                    defluencePoints = s_totalDefluencePointsOfWarriorsTwoForNextRound;
                }
                uint16 damagePoints = (traitsOfWarriors.defence + traitsOfWarriors.charisma) / 2;
                damageOnOpponent = 0;
                recoveryOfSelf = _calculateDamage(damagePoints, 0, influencePoints, defluencePoints);
                dodged = false;
            } else {
                damageOnOpponent = 0;
                recoveryOfSelf = 0;
                dodged = false;
            }
        }

        emit WarriorsMoveExecuted(msg.sender, s_currentRound, _WarriorsMove, damageOnOpponent, recoveryOfSelf, dodged);
    }

    /**
     * @notice Calculate the success rate of a Warriors's move.
     * @param _attackerLuck The luck of the attacking Warriors.
     * @param _defenderLuck The luck of the defending Warriors.
     */
    function _calculateSuccessRate(uint16 _attackerLuck, uint16 _defenderLuck)
        private
        pure
        returns (uint256 successRate)
    {
        // Convert to uint256 (safe: max 10000)
        uint256 attackerLuckScaled = uint256(_attackerLuck);
        uint256 defenderLuckScaled = uint256(_defenderLuck);

        // Safe calculations (max values shown in comments)
        uint256 luckDifference = attackerLuckScaled + 5000; // Max: 15000
        uint256 totalLuck = attackerLuckScaled + defenderLuckScaled + 10000; // Max: 30000

        // Safe multiplication and division
        successRate = (luckDifference * 10000) / totalLuck; // Max intermediate: 150M

        // Bounds enforcement (prevents any edge case issues)
        successRate = successRate < 1000 ? 1000 : successRate;
        successRate = successRate > 9000 ? 9000 : successRate;
    }

    /**
     * @notice Calculate the damage/discount/recovery dealt by a Warriors's move. This is named to calculate damage but it can also be used to calculate discount on cost of influence and defluence and recovery.
     * @param _attackerStrength The strength of the attacking Warriors.
     * @param _defenderDefence The defence of the defending Warriors.
     * @param _influencePoints The influence points applied to the attack.
     * @param _defluencePoints The defluence points applied to the attack.
     */
    function _calculateDamage(
        uint16 _attackerStrength,
        uint16 _defenderDefence,
        uint256 _influencePoints,
        uint256 _defluencePoints
    ) private pure returns (uint256 _damage) {
        // Base damage calculation - Safe: max value is 5000
        uint256 baseDamage = (uint256(_attackerStrength) * 5000) / 10000;

        // Defence reduction - SAFE: explicitly capped at 80
        uint256 defenceReduction = (uint256(_defenderDefence) * 80) / 10000;
        // defenceReduction is guaranteed ≤ 80, so (100 - defenceReduction) ≥ 20
        uint256 damageAfterDefence = baseDamage * (100 - defenceReduction) / 100;

        // Influence multiplier - SAFE: explicitly capped at 200
        uint256 influenceBonus = _influencePoints > 200 ? 200 : _influencePoints;
        // Max multiplication: damageAfterDefence * 300 (safe for reasonable values)
        uint256 damageAfterInfluence = damageAfterDefence * (100 + influenceBonus) / 100;

        // Defluence reduction - SAFE: explicitly capped at 90
        uint256 defluenceReduction = (_defluencePoints * 50) / 100;
        defluenceReduction = defluenceReduction > 90 ? 90 : defluenceReduction;
        // defluenceReduction is guaranteed ≤ 90, so (100 - defluenceReduction) ≥ 10
        uint256 finalDamage = damageAfterInfluence * (100 - defluenceReduction) / 100;

        // Final scaling - Check for overflow
        _damage = finalDamage * 2;
        // Max possible: 5000 * 0.2 * 3 * 0.1 * 2 = 600, well within uint256

        // Ensure bounds
        _damage = _damage < 1 ? 1 : _damage;
        _damage = _damage > 10000 ? 10000 : _damage;
    }

    /**
     * @notice Function to finish the game and distribute rewards.
     */
    function finishGame() public {
        if (s_currentRound < 6) {
            revert Arena__GameFinishConditionNotMet();
        }
        // Warriors One Winner
        if (s_damageOnWarriorsOne < s_damageOnWarriorsTwo) {
            uint256 cutOfWarriorsOneMaker = (i_CrownToken.balanceOf(address(this)) * Warriors_ONE_CUT) / 100;
            i_CrownToken.transfer(IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(s_WarriorsOneNFTId), cutOfWarriorsOneMaker);
            uint256 winnerPrice = i_CrownToken.balanceOf(address(this)) / s_playerOneBetAddresses.length;
            IArenaFactory(i_ArenaFactory).updateWinnings(
                s_WarriorsOneNFTId, i_CrownToken.balanceOf(address(this))
            );
            for (uint256 i = 0; i < s_playerOneBetAddresses.length; i++) {
                if (i == s_playerOneBetAddresses.length - 1) {
                    i_CrownToken.transfer(s_playerOneBetAddresses[i], i_CrownToken.balanceOf(address(this)));
                    break;
                }
                i_CrownToken.transfer(s_playerOneBetAddresses[i], winnerPrice);
            }
        }
        // Warriors Two Winner
        else if (s_damageOnWarriorsTwo < s_damageOnWarriorsOne) {
            uint256 cutOfWarriorsTwoMaker = (i_CrownToken.balanceOf(address(this)) * Warriors_ONE_CUT) / 100;
            i_CrownToken.transfer(IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(s_WarriorsTwoNFTId), cutOfWarriorsTwoMaker);
            uint256 winnerPrice = i_CrownToken.balanceOf(address(this)) / s_playerTwoBetAddresses.length;
            IArenaFactory(i_ArenaFactory).updateWinnings(
                s_WarriorsTwoNFTId, i_CrownToken.balanceOf(address(this))
            );
            for (uint256 i = 0; i < s_playerTwoBetAddresses.length; i++) {
                if (i == s_playerTwoBetAddresses.length - 1) {
                    i_CrownToken.transfer(s_playerTwoBetAddresses[i], i_CrownToken.balanceOf(address(this)));
                    break;
                }
                i_CrownToken.transfer(s_playerTwoBetAddresses[i], winnerPrice);
            }
        }
        // Draw
        else {
            uint256 cutOfWarriorsMaker = ((i_CrownToken.balanceOf(address(this)) * Warriors_ONE_CUT) / 100) / 2;
            i_CrownToken.transfer(IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(s_WarriorsOneNFTId), cutOfWarriorsMaker);
            i_CrownToken.transfer(IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(s_WarriorsTwoNFTId), cutOfWarriorsMaker);
            uint256 winnerPrice =
                i_CrownToken.balanceOf(address(this)) / (s_playerOneBetAddresses.length + s_playerTwoBetAddresses.length);
            IArenaFactory(i_ArenaFactory).updateWinnings(
                s_WarriorsOneNFTId, i_CrownToken.balanceOf(address(this)) / 2
            );
            IArenaFactory(i_ArenaFactory).updateWinnings(
                s_WarriorsTwoNFTId, i_CrownToken.balanceOf(address(this)) / 2
            );
            // for (
            //     uint256 i = 0;
            //     i
            //         < (
            //             s_playerOneBetAddresses.length > s_playerTwoBetAddresses.length
            //                 ? s_playerOneBetAddresses.length
            //                 : s_playerTwoBetAddresses.length
            //         );
            //     i++
            // ) {
            //     if (i >= s_playerOneBetAddresses.length && i == s_playerTwoBetAddresses.length - 1) {}
            //     if (i < s_playerOneBetAddresses.length) {
            //         i_CrownToken.transfer(s_playerOneBetAddresses[i], winnerPrice);
            //     }
            //     if (i < s_playerTwoBetAddresses.length) {
            //         i_CrownToken.transfer(s_playerTwoBetAddresses[i], winnerPrice);
            //     }
            // }
            for (uint256 i = 0; i < s_playerOneBetAddresses.length; i++) {
                i_CrownToken.transfer(s_playerOneBetAddresses[i], winnerPrice);
            }
            for (uint256 i = 0; i < s_playerTwoBetAddresses.length; i++) {
                if (i == s_playerTwoBetAddresses.length - 1) {
                    i_CrownToken.transfer(s_playerTwoBetAddresses[i], i_CrownToken.balanceOf(address(this)));
                    break;
                }
                i_CrownToken.transfer(s_playerTwoBetAddresses[i], winnerPrice);
            }
        }

        emit GameFinished(s_WarriorsOneNFTId, s_WarriorsTwoNFTId, s_damageOnWarriorsOne, s_damageOnWarriorsTwo);

        _resetGame();
    }

    /**
     * @dev Function to calculate the square root of a number using the Babylonian method.
     * @param x The number to calculate the square root of.
     */
    function _sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**
     * @dev Function to fetch a pseudo-random value
     */
    function _revertibleRandom() private view returns (uint64) {
        // Static call to the Cadence Arch contract's revertibleRandom function
        (bool ok, bytes memory data) = i_cadenceArch.staticcall(abi.encodeWithSignature("revertibleRandom()"));
        require(ok, "Failed to fetch a random number through Cadence Arch");
        uint64 output = abi.decode(data, (uint64));
        // Return the random value
        return output;
    }

    /**
     * @notice Reset the defluence mapping by implementing a new function to handle this
     */
    function _resetGame() private {
        _clearDefluenceAddresses();
        s_WarriorsOneNFTId = 0;
        s_WarriorsTwoNFTId = 0;
        s_currentRound = 0;
        s_totalInfluencePointsOfWarriorsOneForNextRound = 0;
        s_totalDefluencePointsOfWarriorsOneForNextRound = 0;
        s_totalInfluencePointsOfWarriorsTwoForNextRound = 0;
        s_totalDefluencePointsOfWarriorsTwoForNextRound = 0;
        s_playerOneBetAddresses = new address[](0);
        s_playerTwoBetAddresses = new address[](0);
        s_gameInitialized = false;
        s_isBattleOngoing = false;
        s_gameInitializedAt = 0;
        s_lastRoundEndedAt = 0;
        s_damageOnWarriorsOne = 0;
        s_damageOnWarriorsTwo = 0;
        s_costToDefluenceWarriorsOne = i_costToDefluence;
        s_costToDefluenceWarriorsTwo = i_costToDefluence;
        s_costToInfluenceWarriorsOne = i_costToInfluence;
        s_costToInfluenceWarriorsTwo = i_costToInfluence;

        emit GameResetted(s_WarriorsOneNFTId, s_WarriorsTwoNFTId);
    }

    /**
     * @notice Helper function to clear defluence addresses mapping
     */
    function _clearDefluenceAddresses() private {
        for (
            uint256 i = 0;
            i
                < (
                    s_playerOneBetAddresses.length > s_playerTwoBetAddresses.length
                        ? s_playerOneBetAddresses.length
                        : s_playerTwoBetAddresses.length
                );
            i++
        ) {
            if (i < s_playerOneBetAddresses.length) {
                s_playersAlreadyUsedDefluenceAddresses[s_playerOneBetAddresses[i]] = false;
            }
            if (i < s_playerTwoBetAddresses.length) {
                s_playersAlreadyUsedDefluenceAddresses[s_playerTwoBetAddresses[i]] = false;
            }
        }
    }

    /**
     * 
     * @param isPlayerOne A boolean indicating if the refund is for Player One or Player Two.
     * @notice Refunds the bet amount to all players who bet on the specified Warriors
     */
    function _refund(bool isPlayerOne) private {
        if (isPlayerOne) {
            for (uint256 i = 0; i < s_playerOneBetAddresses.length; i++) {
                i_CrownToken.transfer(s_playerOneBetAddresses[i], i_betAmount);
            }
            emit GameRefunded(s_playerOneBetAddresses, s_WarriorsOneNFTId);
        } else {
            for (uint256 i = 0; i < s_playerTwoBetAddresses.length; i++) {
                i_CrownToken.transfer(s_playerTwoBetAddresses[i], i_betAmount);
            }
            emit GameRefunded(s_playerTwoBetAddresses, s_WarriorsTwoNFTId);
        }
        _resetGame();
    }

    /* Helper Getter Functions */

    function getCrownTokenAddress() external view returns (address) {
        return address(i_CrownToken);
    }

    function getCadenceArchAddress() external view returns (address) {
        return i_cadenceArch;
    }

    function getCostToInfluence() external view returns (uint256) {
        return i_costToInfluence;
    }

    function getCostToInfluenceWarriorsOne() external view returns (uint256) {
        return s_costToInfluenceWarriorsOne;
    }

    function getCostToInfluenceWarriorsTwo() external view returns (uint256) {
        return s_costToInfluenceWarriorsTwo;
    }

    function getCostToDefluence() external view returns (uint256) {
        return i_costToDefluence;
    }

    function getCostToDefluenceWarriorsOne() external view returns (uint256) {
        return s_costToDefluenceWarriorsOne;
    }

    function getCostToDefluenceWarriorsTwo() external view returns (uint256) {
        return s_costToDefluenceWarriorsTwo;
    }

    function getAiPublicKey() external view returns (address) {
        return i_AiPublicKey;
    }

    function getBetAmount() external view returns (uint256) {
        return i_betAmount;
    }

    function getWarriorsOneNFTId() external view returns (uint256) {
        return s_WarriorsOneNFTId;
    }

    function getWarriorsTwoNFTId() external view returns (uint256) {
        return s_WarriorsTwoNFTId;
    }

    function getCurrentRound() external view returns (uint8) {
        return s_currentRound;
    }

    function getPlayerOneBetAddresses() external view returns (address[] memory) {
        return s_playerOneBetAddresses;
    }

    function getPlayerTwoBetAddresses() external view returns (address[] memory) {
        return s_playerTwoBetAddresses;
    }

    function getInitializationStatus() external view returns (bool) {
        return s_gameInitialized;
    }

    function getBattleStatus() external view returns (bool) {
        return s_isBattleOngoing;
    }

    function getGameInitializedAt() external view returns (uint256) {
        return s_gameInitializedAt;
    }

    function getLastRoundEndedAt() external view returns (uint256) {
        return s_lastRoundEndedAt;
    }

    function getDamageOnWarriorsOne() external view returns (uint256) {
        return s_damageOnWarriorsOne;
    }

    function getIsBettingPeriodGoingOn() external view returns (bool) {
        return s_isBettingPeriod;
    }

    function getDamageOnWarriorsTwo() external view returns (uint256) {
        return s_damageOnWarriorsTwo;
    }

    function getMinWarriorsBettingPeriod() external pure returns (uint8) {
        return MIN_Warriors_BETTING_PERIOD;
    }

    function getMinBattleRoundsInterval() external pure returns (uint8) {
        return MIN_BATTLE_ROUNDS_INTERVAL;
    }

    function getBattleId() external view returns (uint256) {
        return s_battleId;
    }

    function getMicroMarketFactory() external view returns (address) {
        return address(microMarketFactory);
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the micro-market factory address
     * @param _microMarketFactory The address of the MicroMarketFactory contract
     * @dev Can only be called by the ArenaFactory contract
     */
    function setMicroMarketFactory(address _microMarketFactory) external {
        if (msg.sender != i_ArenaFactory) {
            revert Arena__Unauthorized();
        }
        address oldFactory = address(microMarketFactory);
        microMarketFactory = IMicroMarketFactory(_microMarketFactory);
        emit MicroMarketFactoryUpdated(oldFactory, _microMarketFactory);
    }
}