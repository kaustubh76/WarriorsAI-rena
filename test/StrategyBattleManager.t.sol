// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {StrategyBattleManager} from "../src/StrategyBattleManager.sol";
import {IStrategyBattleManager} from "../src/Interfaces/IStrategyBattleManager.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {StrategyVault} from "../src/StrategyVault.sol";
import {HighYieldPool} from "../src/pools/HighYieldPool.sol";
import {StablePool} from "../src/pools/StablePool.sol";
import {LPPool} from "../src/pools/LPPool.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {CRwNStaking} from "../src/CRwNStaking.sol";
import {stCRwN} from "../src/stCRwN.sol";

contract StrategyBattleManagerTest is Test {
    StrategyBattleManager public battleManager;
    CrownToken public crownToken;
    WarriorsNFT public warriorsNFT;
    StrategyVault public strategyVault;
    HighYieldPool public highYieldPool;
    StablePool public stablePool;
    LPPool public lpPool;

    address public owner;
    address public user1;
    address public user2;
    address public spectator;
    address public resolver;

    // AI signer key for trait assignment
    uint256 constant AI_PRIVATE_KEY = 0xA11CE;
    address public aiSigner;

    uint256 constant INITIAL_BALANCE = 1000 ether;
    uint256 constant STAKE_AMOUNT = 10 ether;
    uint256 constant BET_AMOUNT = 5 ether;
    uint256 constant VAULT_DEPOSIT = 50 ether;

    uint256 public nft1Id = 1; // tokenCounter starts at 1
    uint256 public nft2Id = 2;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        spectator = makeAddr("spectator");
        resolver = makeAddr("resolver");
        aiSigner = vm.addr(AI_PRIVATE_KEY);

        // Deploy core contracts
        crownToken = new CrownToken();
        warriorsNFT = new WarriorsNFT(owner, aiSigner, address(0));

        // Deploy pools
        highYieldPool = new HighYieldPool(address(crownToken));
        stablePool = new StablePool(address(crownToken));
        lpPool = new LPPool(address(crownToken));

        // Deploy StrategyVault
        strategyVault = new StrategyVault(
            address(crownToken),
            address(warriorsNFT),
            address(highYieldPool),
            address(stablePool),
            address(lpPool)
        );

        // Deploy BattleManager
        battleManager = new StrategyBattleManager(
            address(crownToken),
            address(warriorsNFT),
            address(strategyVault)
        );
        battleManager.setResolver(resolver);

        // Fund users with ETH and CRwN
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(user2, INITIAL_BALANCE);
        vm.deal(spectator, INITIAL_BALANCE);
        vm.deal(owner, INITIAL_BALANCE * 10);

        vm.prank(user1);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        vm.prank(user2);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        vm.prank(spectator);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        // Mint NFTs (token IDs start at 1)
        vm.prank(user1);
        warriorsNFT.mintNft("encrypted_uri_1", bytes32(uint256(1)));

        vm.prank(user2);
        warriorsNFT.mintNft("encrypted_uri_2", bytes32(uint256(2)));

        // Set gurukul and assign traits with proper AI signature
        warriorsNFT.setGurukul(owner);
        _assignTraitsWithSignature(uint16(nft1Id), 5000, 5000, 5000, 5000, 5000);
        _assignTraitsWithSignature(uint16(nft2Id), 5000, 5000, 5000, 5000, 5000);

        // Fund pool reserves so yield can be paid
        crownToken.mint{value: 100 ether}(100 ether);
        crownToken.transfer(address(highYieldPool), 30 ether);
        crownToken.transfer(address(stablePool), 30 ether);
        crownToken.transfer(address(lpPool), 30 ether);

        // Create vaults for both warriors
        uint256[3] memory allocation = [uint256(4000), uint256(3000), uint256(3000)];

        vm.startPrank(user1);
        crownToken.approve(address(strategyVault), VAULT_DEPOSIT);
        strategyVault.deposit(nft1Id, VAULT_DEPOSIT, allocation, bytes32(uint256(100)));
        vm.stopPrank();

        vm.startPrank(user2);
        crownToken.approve(address(strategyVault), VAULT_DEPOSIT);
        strategyVault.deposit(nft2Id, VAULT_DEPOSIT, allocation, bytes32(uint256(200)));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════
    // BATTLE CREATION TESTS
    // ═══════════════════════════════════════════════════════

    function test_CreateBattle() public {
        vm.prank(user1);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);
        vm.prank(user2);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);

        vm.prank(user1);
        uint256 battleId = battleManager.createBattle(nft1Id, nft2Id, STAKE_AMOUNT);

        assertEq(battleId, 1);
        assertEq(battleManager.getBattleCount(), 1);

        IStrategyBattleManager.Battle memory battle = battleManager.getBattle(battleId);
        assertEq(battle.warrior1Id, nft1Id);
        assertEq(battle.warrior2Id, nft2Id);
        assertEq(battle.stakes, STAKE_AMOUNT);
        assertEq(uint8(battle.status), uint8(IStrategyBattleManager.BattleStatus.ACTIVE));
        assertTrue(battle.bettingOpen);
        assertEq(battle.currentRound, 0);
    }

    function test_CreateBattle_EscrowsStakes() public {
        uint256 user1Before = crownToken.balanceOf(user1);
        uint256 user2Before = crownToken.balanceOf(user2);

        _createBattle();

        // Both users should have lost STAKE_AMOUNT
        assertEq(user1Before - crownToken.balanceOf(user1), STAKE_AMOUNT);
        assertEq(user2Before - crownToken.balanceOf(user2), STAKE_AMOUNT);

        // Contract should hold 2x stakes
        assertEq(crownToken.balanceOf(address(battleManager)), STAKE_AMOUNT * 2);
    }

    function test_CreateBattle_RevertsOnSameWarrior() public {
        vm.prank(user1);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);

        vm.prank(user1);
        vm.expectRevert(IStrategyBattleManager.BattleManager__SameWarrior.selector);
        battleManager.createBattle(nft1Id, nft1Id, STAKE_AMOUNT);
    }

    function test_CreateBattle_RevertsOnLowStakes() public {
        vm.prank(user1);
        vm.expectRevert(IStrategyBattleManager.BattleManager__InvalidStakes.selector);
        battleManager.createBattle(nft1Id, nft2Id, 1 ether);
    }

    // ═══════════════════════════════════════════════════════
    // BETTING TESTS
    // ═══════════════════════════════════════════════════════

    function test_PlaceBet() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        IStrategyBattleManager.BetInfo memory bet = battleManager.getUserBet(battleId, spectator);
        assertEq(bet.amount, BET_AMOUNT);
        assertTrue(bet.betOnWarrior1);
        assertFalse(bet.claimed);
    }

    function test_PlaceBet_UpdatesOdds() public {
        uint256 battleId = _createBattle();

        // Bet 5 on warrior1
        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        // Bet 15 on warrior2
        vm.startPrank(user2);
        crownToken.approve(address(battleManager), 15 ether);
        battleManager.placeBet(battleId, false, 15 ether);
        vm.stopPrank();

        (uint256 w1Odds, uint256 w2Odds, uint256 total) = battleManager.getBettingOdds(battleId);
        assertEq(total, 20 ether);
        assertEq(w1Odds, 2500); // 25% (5/20)
        assertEq(w2Odds, 7500); // 75% (15/20)
    }

    function test_PlaceBet_RevertsAfterBettingClosed() public {
        uint256 battleId = _createBattle();

        // Score first round — auto-closes betting
        vm.prank(resolver);
        battleManager.recordCycleScore(battleId, 100, 80);

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        vm.expectRevert(IStrategyBattleManager.BattleManager__BettingClosed.selector);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════
    // CYCLE SCORING TESTS
    // ═══════════════════════════════════════════════════════

    function test_RecordCycleScores() public {
        uint256 battleId = _createBattle();

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(resolver);
            battleManager.recordCycleScore(battleId, 100, 80);
        }

        IStrategyBattleManager.Battle memory battle = battleManager.getBattle(battleId);
        assertEq(battle.currentRound, 5);
        assertEq(battle.warrior1Score, 500);
        assertEq(battle.warrior2Score, 400);
    }

    function test_RecordCycleScore_AutoClosesBetting() public {
        uint256 battleId = _createBattle();

        IStrategyBattleManager.Battle memory before_ = battleManager.getBattle(battleId);
        assertTrue(before_.bettingOpen);

        vm.prank(resolver);
        battleManager.recordCycleScore(battleId, 100, 80);

        IStrategyBattleManager.Battle memory after_ = battleManager.getBattle(battleId);
        assertFalse(after_.bettingOpen);
    }

    function test_RecordCycleScore_RevertsUnauthorized() public {
        uint256 battleId = _createBattle();

        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__Unauthorized.selector);
        battleManager.recordCycleScore(battleId, 100, 80);
    }

    // ═══════════════════════════════════════════════════════
    // SETTLEMENT TESTS
    // ═══════════════════════════════════════════════════════

    function test_SettleBattle_Warrior1Wins() public {
        uint256 battleId = _createBattle();
        uint256 user1Before = crownToken.balanceOf(user1);

        _scoreRounds(battleId, 100, 80);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        IStrategyBattleManager.Battle memory battle = battleManager.getBattle(battleId);
        assertEq(uint8(battle.status), uint8(IStrategyBattleManager.BattleStatus.SETTLED));
        assertEq(uint8(battle.result), uint8(IStrategyBattleManager.BattleResult.WARRIOR1_WIN));

        // Winner gets 2x stakes
        assertEq(crownToken.balanceOf(user1) - user1Before, STAKE_AMOUNT * 2);
    }

    function test_SettleBattle_Warrior2Wins() public {
        uint256 battleId = _createBattle();
        uint256 user2Before = crownToken.balanceOf(user2);

        _scoreRounds(battleId, 80, 100);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        IStrategyBattleManager.Battle memory battle = battleManager.getBattle(battleId);
        assertEq(uint8(battle.result), uint8(IStrategyBattleManager.BattleResult.WARRIOR2_WIN));
        assertEq(crownToken.balanceOf(user2) - user2Before, STAKE_AMOUNT * 2);
    }

    function test_SettleBattle_Draw() public {
        uint256 battleId = _createBattle();
        uint256 user1Before = crownToken.balanceOf(user1);
        uint256 user2Before = crownToken.balanceOf(user2);

        _scoreRounds(battleId, 100, 100);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        assertEq(crownToken.balanceOf(user1) - user1Before, STAKE_AMOUNT);
        assertEq(crownToken.balanceOf(user2) - user2Before, STAKE_AMOUNT);
    }

    function test_SettleBattle_UpdatesELO() public {
        uint256 battleId = _createBattle();

        _scoreRounds(battleId, 100, 80);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        IStrategyBattleManager.WarriorRating memory w1 = battleManager.getWarriorRating(nft1Id);
        IStrategyBattleManager.WarriorRating memory w2 = battleManager.getWarriorRating(nft2Id);

        assertGt(w1.rating, 1000, "Winner rating should increase");
        assertLt(w2.rating, 1000, "Loser rating should decrease");
        assertEq(w1.wins, 1);
        assertEq(w1.totalBattles, 1);
        assertEq(w2.losses, 1);
        assertEq(w1.currentStreak, 1);
        assertEq(w2.currentStreak, 0);
    }

    function test_SettleBattle_RevertsNotEnoughRounds() public {
        uint256 battleId = _createBattle();

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(resolver);
            battleManager.recordCycleScore(battleId, 100, 80);
        }

        vm.prank(resolver);
        vm.expectRevert(IStrategyBattleManager.BattleManager__NotEnoughRounds.selector);
        battleManager.settleBattle(battleId);
    }

    // ═══════════════════════════════════════════════════════
    // BET CLAIM TESTS
    // ═══════════════════════════════════════════════════════

    function test_ClaimBet_WinnerGetsCorrectPayout() public {
        uint256 battleId = _createBattle();

        // Spectator bets 5 on warrior1
        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        // User2 bets 10 on warrior2
        vm.startPrank(user2);
        crownToken.approve(address(battleManager), 10 ether);
        battleManager.placeBet(battleId, false, 10 ether);
        vm.stopPrank();

        // Warrior1 wins
        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Spectator claims (winner)
        uint256 before_ = crownToken.balanceOf(spectator);
        vm.prank(spectator);
        battleManager.claimBet(battleId);
        uint256 payout = crownToken.balanceOf(spectator) - before_;

        // Payout = 5 (original) + 10 (losing pool) - 5% of 10 = 14.5 ether
        assertEq(payout, 14.5 ether);
    }

    function test_ClaimBet_LoserGetsZero() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, false, BET_AMOUNT); // bet on loser
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        uint256 before_ = crownToken.balanceOf(spectator);
        vm.prank(spectator);
        battleManager.claimBet(battleId);
        assertEq(crownToken.balanceOf(spectator) - before_, 0);
    }

    function test_ClaimBet_DrawRefund() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 100);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        uint256 before_ = crownToken.balanceOf(spectator);
        vm.prank(spectator);
        battleManager.claimBet(battleId);

        // Draw refund: 5 - 5% = 4.75 ether
        assertEq(crownToken.balanceOf(spectator) - before_, 4.75 ether);
    }

    function test_ClaimBet_RevertsDoubleClaim() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 100);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        vm.prank(spectator);
        battleManager.claimBet(battleId);

        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__AlreadyClaimed.selector);
        battleManager.claimBet(battleId);
    }

    function test_ClaimBet_RevertsNotSettled() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__NotSettled.selector);
        battleManager.claimBet(battleId);
    }

    // ═══════════════════════════════════════════════════════
    // INSURANCE TESTS
    // ═══════════════════════════════════════════════════════

    function test_InsuranceReserveAccumulates() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(user2);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, false, BET_AMOUNT);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Winner claims — triggers fee + insurance
        vm.prank(spectator);
        battleManager.claimBet(battleId);

        assertGt(battleManager.insuranceReserve(), 0);
    }

    // ═══════════════════════════════════════════════════════
    // CANCEL BATTLE TESTS
    // ═══════════════════════════════════════════════════════

    function test_CancelBattle_RefundsAll() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        uint256 user1Before = crownToken.balanceOf(user1);
        uint256 user2Before = crownToken.balanceOf(user2);
        uint256 spectBefore = crownToken.balanceOf(spectator);

        battleManager.cancelBattle(battleId);

        assertEq(crownToken.balanceOf(user1) - user1Before, STAKE_AMOUNT);
        assertEq(crownToken.balanceOf(user2) - user2Before, STAKE_AMOUNT);
        assertEq(crownToken.balanceOf(spectator) - spectBefore, BET_AMOUNT);
    }

    // ═══════════════════════════════════════════════════════
    // FEE FORWARDING TO STAKING TESTS
    // ═══════════════════════════════════════════════════════

    function test_ClaimBet_ForwardsFeeToStaking() public {
        // Deploy staking alongside battle manager
        CRwNStaking staking = new CRwNStaking(address(crownToken), address(warriorsNFT));
        stCRwN receipt = new stCRwN(address(staking));
        staking.setReceiptToken(address(receipt));
        staking.addFeeSource(address(battleManager));

        // Wire staking into battle manager
        battleManager.setStakingContract(address(staking));

        // Need at least 1 staker so fees go somewhere meaningful
        crownToken.mint{value: 10 ether}(10 ether);
        crownToken.approve(address(staking), 10 ether);
        staking.stake(10 ether);

        // Create battle, place bets, score, settle
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(user2);
        crownToken.approve(address(battleManager), 10 ether);
        battleManager.placeBet(battleId, false, 10 ether);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        uint256 stakingBefore = staking.totalCRwNStaked();

        // Winner claims — fees should forward to staking
        vm.prank(spectator);
        battleManager.claimBet(battleId);

        // Staking should have received fees
        assertGt(staking.totalCRwNStaked(), stakingBefore, "Staking should receive forwarded fees");
        // Protocol should only have 50% of the non-insurance fee
        assertGt(battleManager.totalFeesCollected(), 0, "Protocol should keep its share");
    }

    function test_ClaimBet_FallbackWhenStakingReverts() public {
        // Set staking contract to an address with no code (will revert on call)
        address fakeStaking = makeAddr("fakeStaking");
        battleManager.setStakingContract(fakeStaking);

        // Create battle, bet, score, settle
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(user2);
        crownToken.approve(address(battleManager), 10 ether);
        battleManager.placeBet(battleId, false, 10 ether);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Winner claims — staking call fails but claim still succeeds
        vm.prank(spectator);
        battleManager.claimBet(battleId);

        // All fees should have fallen back to protocol
        assertGt(battleManager.totalFeesCollected(), 0, "Fallback: all fees should go to protocol");
    }

    // ═══════════════════════════════════════════════════════
    // DOUBLE-SETTLE / RE-ENTRY TESTS
    // ═══════════════════════════════════════════════════════

    function test_SettleBattle_RevertsOnDoubleSettle() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 80);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Second settlement should revert with BattleNotActive
        vm.prank(resolver);
        vm.expectRevert(IStrategyBattleManager.BattleManager__BattleNotActive.selector);
        battleManager.settleBattle(battleId);
    }

    function test_RecordScore_RevertsAfterSettlement() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 80);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Try to score after settlement
        vm.prank(resolver);
        vm.expectRevert(IStrategyBattleManager.BattleManager__BattleNotActive.selector);
        battleManager.recordCycleScore(battleId, 100, 80);
    }

    function test_PlaceBet_RevertsAfterSettlement() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 80);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        vm.expectRevert(IStrategyBattleManager.BattleManager__BattleNotActive.selector);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();
    }

    function test_CancelBattle_RevertsAfterSettlement() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 80);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        vm.expectRevert(IStrategyBattleManager.BattleManager__BattleNotActive.selector);
        battleManager.cancelBattle(battleId);
    }

    // ═══════════════════════════════════════════════════════
    // ELO TESTS — MULTI-BATTLE / VETERAN K-FACTOR
    // ═══════════════════════════════════════════════════════

    function test_ELO_MultipleBattles_RatingProgresses() public {
        // Battle 1: Warrior1 wins
        uint256 b1 = _createBattle();
        _scoreRounds(b1, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(b1);

        IStrategyBattleManager.WarriorRating memory r1 = battleManager.getWarriorRating(nft1Id);
        uint256 ratingAfter1 = r1.rating;
        assertGt(ratingAfter1, 1000, "Winner should gain rating");
        assertEq(r1.totalBattles, 1);
        assertEq(r1.peakRating, ratingAfter1);

        // Battle 2: Warrior1 wins again
        uint256 b2 = _createBattle();
        _scoreRounds(b2, 120, 90);
        vm.prank(resolver);
        battleManager.settleBattle(b2);

        IStrategyBattleManager.WarriorRating memory r2 = battleManager.getWarriorRating(nft1Id);
        assertGt(r2.rating, ratingAfter1, "Second win should increase rating further");
        assertEq(r2.totalBattles, 2);
        assertEq(r2.wins, 2);
        assertEq(r2.currentStreak, 2);
        assertEq(r2.peakRating, r2.rating);
    }

    function test_ELO_DrawDoesNotChangeRatingsSignificantly() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 100);

        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        IStrategyBattleManager.WarriorRating memory r1 = battleManager.getWarriorRating(nft1Id);
        IStrategyBattleManager.WarriorRating memory r2 = battleManager.getWarriorRating(nft2Id);

        // In a draw between equal-rated players, change should be 0
        assertEq(r1.rating, 1000);
        assertEq(r2.rating, 1000);
        assertEq(r1.draws, 1);
        assertEq(r2.draws, 1);
    }

    function test_ELO_LoserStreakResets() public {
        // Battle 1: Warrior1 wins (gets streak=1)
        uint256 b1 = _createBattle();
        _scoreRounds(b1, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(b1);

        IStrategyBattleManager.WarriorRating memory r1 = battleManager.getWarriorRating(nft1Id);
        assertEq(r1.currentStreak, 1);

        // Battle 2: Warrior1 loses (streak resets)
        uint256 b2 = _createBattle();
        _scoreRounds(b2, 60, 100);
        vm.prank(resolver);
        battleManager.settleBattle(b2);

        IStrategyBattleManager.WarriorRating memory r1After = battleManager.getWarriorRating(nft1Id);
        assertEq(r1After.currentStreak, 0, "Losing should reset streak");
        assertEq(r1After.losses, 1);
    }

    // ═══════════════════════════════════════════════════════
    // EDGE CASES
    // ═══════════════════════════════════════════════════════

    function test_ClaimBet_NoBetReverts() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Spectator never placed a bet
        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__NoBetFound.selector);
        battleManager.claimBet(battleId);
    }

    function test_PlaceBet_ZeroAmountReverts() public {
        uint256 battleId = _createBattle();

        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__InvalidBetAmount.selector);
        battleManager.placeBet(battleId, true, 0);
    }

    function test_GetWarriorRating_DefaultsTo1000() public view {
        // NFT that has never battled
        IStrategyBattleManager.WarriorRating memory r = battleManager.getWarriorRating(999);
        assertEq(r.rating, 1000);
        assertEq(r.totalBattles, 0);
    }

    function test_MultipleBets_SameSide_Accumulates() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        // First bet: 3 ether on warrior1
        crownToken.approve(address(battleManager), 3 ether);
        battleManager.placeBet(battleId, true, 3 ether);

        // Second bet: 2 ether on same side
        crownToken.approve(address(battleManager), 2 ether);
        battleManager.placeBet(battleId, true, 2 ether);
        vm.stopPrank();

        IStrategyBattleManager.BetInfo memory bet = battleManager.getUserBet(battleId, spectator);
        assertEq(bet.amount, 5 ether, "Bet amounts should accumulate");
    }

    function test_MultipleBets_OppositeSide_Reverts() public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), 3 ether);
        battleManager.placeBet(battleId, true, 3 ether);

        crownToken.approve(address(battleManager), 2 ether);
        vm.expectRevert(IStrategyBattleManager.BattleManager__InvalidBetAmount.selector);
        battleManager.placeBet(battleId, false, 2 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════
    // AUTHORIZATION & EDGE CASES (Phase 4 Hardening)
    // ═══════════════════════════════════════════════════════

    function test_CreateBattle_RevertsNotOwner() public {
        vm.prank(user1);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);
        vm.prank(user2);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);

        // Spectator is neither owner of warrior1 nor resolver
        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__NotWarriorOwner.selector);
        battleManager.createBattle(nft1Id, nft2Id, STAKE_AMOUNT);
    }

    function test_CreateBattle_ResolverCanCreateOnBehalf() public {
        vm.prank(user1);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);
        vm.prank(user2);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);

        // Resolver can create on behalf of warriors
        vm.prank(resolver);
        uint256 battleId = battleManager.createBattle(nft1Id, nft2Id, STAKE_AMOUNT);
        assertGt(battleId, 0);

        IStrategyBattleManager.Battle memory battle = battleManager.getBattle(battleId);
        assertEq(battle.warrior1Owner, user1);
        assertEq(battle.warrior2Owner, user2);
    }

    function test_CreateBattle_RevertsVaultNotActive() public {
        // Mint a third NFT without a vault
        address user3 = makeAddr("user3");
        vm.deal(user3, INITIAL_BALANCE);
        vm.prank(user3);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);
        vm.prank(user3);
        warriorsNFT.mintNft("encrypted_uri_3", bytes32(uint256(3)));
        uint256 nft3Id = 3;
        _assignTraitsWithSignature(uint16(nft3Id), 5000, 5000, 5000, 5000, 5000);

        vm.prank(user1);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);
        vm.prank(user3);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);

        // nft3 has no vault
        vm.prank(user1);
        vm.expectRevert(IStrategyBattleManager.BattleManager__VaultNotActive.selector);
        battleManager.createBattle(nft1Id, nft3Id, STAKE_AMOUNT);
    }

    function test_RecordCycleScore_RevertsAfter5Rounds() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 80);

        // 6th score should revert (battle has 5 rounds already)
        vm.prank(resolver);
        vm.expectRevert(IStrategyBattleManager.BattleManager__BattleAlreadySettled.selector);
        battleManager.recordCycleScore(battleId, 100, 80);
    }

    function test_SettleBattle_RevertsUnauthorized() public {
        uint256 battleId = _createBattle();
        _scoreRounds(battleId, 100, 80);

        // Spectator is not resolver or owner
        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__Unauthorized.selector);
        battleManager.settleBattle(battleId);
    }

    function test_CloseBetting_OnlyResolver() public {
        uint256 battleId = _createBattle();

        // Non-resolver cannot close betting
        vm.prank(spectator);
        vm.expectRevert(IStrategyBattleManager.BattleManager__Unauthorized.selector);
        battleManager.closeBetting(battleId);

        // Resolver can close betting
        vm.prank(resolver);
        battleManager.closeBetting(battleId);

        IStrategyBattleManager.Battle memory battle = battleManager.getBattle(battleId);
        assertFalse(battle.bettingOpen);

        // Closing again should not revert (idempotent)
        vm.prank(resolver);
        battleManager.closeBetting(battleId);
    }

    function test_ClaimBet_OneSidedPool() public {
        uint256 battleId = _createBattle();

        // Both bettors bet on the winner (warrior1)
        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Winner-side bettor claims — losing pool is 0, so winnings = 0
        uint256 before_ = crownToken.balanceOf(spectator);
        vm.prank(spectator);
        battleManager.claimBet(battleId);
        uint256 payout = crownToken.balanceOf(spectator) - before_;

        // With 0 losing pool, winner gets original back minus fee on 0 winnings = original
        // Actually: winnings = (0 * bet / totalWin) = 0, fee = 0, payout = bet + 0 - 0 = bet
        assertEq(payout, BET_AMOUNT);
    }

    function test_GetBettingOdds_ZeroPool() public {
        uint256 battleId = _createBattle();

        (uint256 w1Odds, uint256 w2Odds, uint256 total) = battleManager.getBettingOdds(battleId);
        assertEq(total, 0);
        assertEq(w1Odds, 5000); // 50%
        assertEq(w2Odds, 5000); // 50%
    }

    function test_ELO_AsymmetricRatings() public {
        // Battle 1: W1 wins → rating diverges from 1000
        uint256 b1 = _createBattle();
        _scoreRounds(b1, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(b1);

        IStrategyBattleManager.WarriorRating memory r1After1 = battleManager.getWarriorRating(nft1Id);
        IStrategyBattleManager.WarriorRating memory r2After1 = battleManager.getWarriorRating(nft2Id);
        uint256 w1R1 = r1After1.rating;
        uint256 w2R1 = r2After1.rating;

        // Battle 2: W2 (underdog) beats W1 (favored) — larger delta
        uint256 b2 = _createBattle();
        _scoreRounds(b2, 60, 100);
        vm.prank(resolver);
        battleManager.settleBattle(b2);

        IStrategyBattleManager.WarriorRating memory r1After2 = battleManager.getWarriorRating(nft1Id);
        IStrategyBattleManager.WarriorRating memory r2After2 = battleManager.getWarriorRating(nft2Id);

        // Underdog win: W2 gained more than first battle delta (upset bonus)
        uint256 w2Gain = r2After2.rating - w2R1;
        uint256 w1GainFirst = w1R1 - 1000;
        assertGt(w2Gain, w1GainFirst, "Underdog should gain more ELO from upset");

        // Favored loser: W1 lost more than first battle delta
        uint256 w1Loss = w1R1 - r1After2.rating;
        assertGt(w1Loss, w1GainFirst, "Favored warrior should lose more ELO from upset");
    }

    function test_ELO_FloorAt100() public {
        // Make warrior2 lose many times to drive rating toward floor
        for (uint256 i = 0; i < 15; i++) {
            uint256 bid = _createBattle();
            _scoreRounds(bid, 200, 10);
            vm.prank(resolver);
            battleManager.settleBattle(bid);
        }

        IStrategyBattleManager.WarriorRating memory r = battleManager.getWarriorRating(nft2Id);
        assertGe(r.rating, 100, "Rating should never drop below 100");
    }

    function test_SetResolver_ZeroAddress_Reverts() public {
        vm.expectRevert("Zero address");
        battleManager.setResolver(address(0));
    }

    function test_StakingFeePercent_Over100_Reverts() public {
        vm.expectRevert("Exceeds 100%");
        battleManager.setStakingFeePercent(10001);
    }

    function test_WithdrawFees_AccumulatesCorrectly() public {
        // Create battle with bets, settle, claim — check fee accumulation
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(user2);
        crownToken.approve(address(battleManager), 10 ether);
        battleManager.placeBet(battleId, false, 10 ether);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        // Winner claims
        vm.prank(spectator);
        battleManager.claimBet(battleId);

        uint256 fees = battleManager.totalFeesCollected();
        assertGt(fees, 0, "Fees should accumulate from claims");

        // Withdraw fees
        uint256 ownerBefore = crownToken.balanceOf(owner);
        battleManager.withdrawFees(owner);

        assertEq(crownToken.balanceOf(owner) - ownerBefore, fees, "Owner should receive all fees");
        assertEq(battleManager.totalFeesCollected(), 0, "Fees should reset after withdrawal");
    }

    function test_WithdrawInsurance_ResetsToZero() public {
        // Accumulate some insurance via claim
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), BET_AMOUNT);
        battleManager.placeBet(battleId, true, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(user2);
        crownToken.approve(address(battleManager), 10 ether);
        battleManager.placeBet(battleId, false, 10 ether);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        vm.prank(spectator);
        battleManager.claimBet(battleId);

        uint256 insurance = battleManager.insuranceReserve();
        assertGt(insurance, 0, "Insurance should accumulate");

        battleManager.withdrawInsurance(owner);
        assertEq(battleManager.insuranceReserve(), 0, "Insurance should reset after withdrawal");
    }

    function test_ELO_DrawBetweenUnequalRatings() public {
        // First: make ratings diverge
        uint256 b1 = _createBattle();
        _scoreRounds(b1, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(b1);

        uint256 w1Before = battleManager.getWarriorRating(nft1Id).rating;
        uint256 w2Before = battleManager.getWarriorRating(nft2Id).rating;
        assertGt(w1Before, w2Before, "Ratings should be different");

        // Then draw — higher-rated player should lose a bit, lower-rated should gain
        uint256 b2 = _createBattle();
        _scoreRounds(b2, 100, 100);
        vm.prank(resolver);
        battleManager.settleBattle(b2);

        uint256 w1After = battleManager.getWarriorRating(nft1Id).rating;
        uint256 w2After = battleManager.getWarriorRating(nft2Id).rating;

        assertLt(w1After, w1Before, "Higher-rated warrior should lose rating in draw");
        assertGt(w2After, w2Before, "Lower-rated warrior should gain rating in draw");
    }

    // ═══════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════

    function testFuzz_CreateBattle_Stakes(uint256 stakes) public {
        vm.prank(user1);
        crownToken.approve(address(battleManager), type(uint256).max);
        vm.prank(user2);
        crownToken.approve(address(battleManager), type(uint256).max);

        if (stakes < 5 ether) {
            vm.prank(user1);
            vm.expectRevert(IStrategyBattleManager.BattleManager__InvalidStakes.selector);
            battleManager.createBattle(nft1Id, nft2Id, stakes);
        } else if (stakes <= crownToken.balanceOf(user1) && stakes <= crownToken.balanceOf(user2)) {
            vm.prank(user1);
            uint256 battleId = battleManager.createBattle(nft1Id, nft2Id, stakes);
            assertGt(battleId, 0);
        }
        // else: transfer will revert (insufficient balance) — acceptable
    }

    function testFuzz_PlaceBet_Amount(uint256 amount) public {
        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), type(uint256).max);

        if (amount == 0) {
            vm.expectRevert(IStrategyBattleManager.BattleManager__InvalidBetAmount.selector);
            battleManager.placeBet(battleId, true, amount);
        } else if (amount <= crownToken.balanceOf(spectator)) {
            battleManager.placeBet(battleId, true, amount);
            IStrategyBattleManager.BetInfo memory bet = battleManager.getUserBet(battleId, spectator);
            assertEq(bet.amount, amount);
        }
        vm.stopPrank();
    }

    function testFuzz_ELO_RatingNeverBelow100(uint8 rounds) public {
        uint256 numBattles = uint256(rounds) % 20 + 1; // 1-20 battles

        for (uint256 i = 0; i < numBattles; i++) {
            uint256 bid = _createBattle();
            // Warrior2 always loses
            _scoreRounds(bid, 200, 10);
            vm.prank(resolver);
            battleManager.settleBattle(bid);
        }

        IStrategyBattleManager.WarriorRating memory r = battleManager.getWarriorRating(nft2Id);
        assertGe(r.rating, 100, "Rating must never drop below 100");
        assertEq(r.losses, numBattles);
    }

    function testFuzz_ClaimBet_PayoutBounded(uint96 betAmt, uint96 opposingBetAmt) public {
        // Bound to reasonable range to avoid running out of balance
        uint256 betAmount = uint256(betAmt) % 50 ether + 1 ether;
        uint256 opposingAmount = uint256(opposingBetAmt) % 50 ether + 1 ether;

        if (betAmount > crownToken.balanceOf(spectator)) return;
        if (opposingAmount > crownToken.balanceOf(user2) - STAKE_AMOUNT) return;

        uint256 battleId = _createBattle();

        vm.startPrank(spectator);
        crownToken.approve(address(battleManager), betAmount);
        battleManager.placeBet(battleId, true, betAmount);
        vm.stopPrank();

        vm.startPrank(user2);
        crownToken.approve(address(battleManager), opposingAmount);
        battleManager.placeBet(battleId, false, opposingAmount);
        vm.stopPrank();

        _scoreRounds(battleId, 100, 80);
        vm.prank(resolver);
        battleManager.settleBattle(battleId);

        uint256 before_ = crownToken.balanceOf(spectator);
        vm.prank(spectator);
        battleManager.claimBet(battleId);
        uint256 payout = crownToken.balanceOf(spectator) - before_;

        // Payout can never exceed bet + entire losing pool
        assertLe(payout, betAmount + opposingAmount, "Payout must not exceed bet + losing pool");
    }

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    function _createBattle() internal returns (uint256) {
        vm.prank(user1);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);
        vm.prank(user2);
        crownToken.approve(address(battleManager), STAKE_AMOUNT);

        vm.prank(user1);
        return battleManager.createBattle(nft1Id, nft2Id, STAKE_AMOUNT);
    }

    function _scoreRounds(uint256 battleId, uint256 w1Score, uint256 w2Score) internal {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(resolver);
            battleManager.recordCycleScore(battleId, w1Score, w2Score);
        }
    }

    function _assignTraitsWithSignature(
        uint16 tokenId,
        uint16 strength,
        uint16 wit,
        uint16 charisma,
        uint16 defence,
        uint16 luck
    ) internal {
        string memory strike = "REBALANCE";
        string memory taunt = "CONCENTRATE";
        string memory dodge = "HEDGE_UP";
        string memory special = "COMPOSE";
        string memory recover = "FLASH";

        bytes32 dataHash = keccak256(
            abi.encodePacked(
                tokenId, strength, wit, charisma, defence, luck,
                strike, taunt, dodge, special, recover
            )
        );
        bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(dataHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AI_PRIVATE_KEY, ethSignedMessage);
        bytes memory signature = abi.encodePacked(r, s, v);

        warriorsNFT.assignTraitsAndMoves(
            tokenId, strength, wit, charisma, defence, luck,
            strike, taunt, dodge, special, recover,
            signature
        );
    }
}
