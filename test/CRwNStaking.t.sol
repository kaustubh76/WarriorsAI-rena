// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CRwNStaking} from "../src/CRwNStaking.sol";
import {stCRwN} from "../src/stCRwN.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {ICRwNStaking} from "../src/Interfaces/ICRwNStaking.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

contract CRwNStakingTest is Test {
    CRwNStaking public staking;
    stCRwN public receiptToken;
    CrownToken public crownToken;
    WarriorsNFT public warriorsNFT;

    address public owner;
    address public user1;
    address public user2;
    address public feeSource;

    uint256 constant AI_PRIVATE_KEY = 0xA11CE;
    address public aiSigner;

    uint256 constant INITIAL_BALANCE = 100 ether;
    uint256 constant STAKE_AMOUNT = 10 ether;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        feeSource = makeAddr("feeSource");
        aiSigner = vm.addr(AI_PRIVATE_KEY);

        crownToken = new CrownToken();
        warriorsNFT = new WarriorsNFT(owner, aiSigner, address(0));

        // Deploy staking + receipt token
        staking = new CRwNStaking(address(crownToken), address(warriorsNFT));
        receiptToken = new stCRwN(address(staking));
        staking.setReceiptToken(address(receiptToken));

        // Authorize fee source
        staking.addFeeSource(feeSource);

        // Fund users
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(user2, INITIAL_BALANCE);
        vm.deal(feeSource, INITIAL_BALANCE);

        vm.prank(user1);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        vm.prank(user2);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        vm.prank(feeSource);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        // Mint NFTs for warrior boost tests
        vm.prank(user1);
        warriorsNFT.mintNft("uri_1", bytes32(uint256(1)));

        // Assign traits to set ranking
        warriorsNFT.setGurukul(owner);
        _assignTraits(uint16(1), 5000, 5000, 5000, 5000, 5000);
    }

    // ═══════════════════════════════════════════════════════
    // STAKE TESTS
    // ═══════════════════════════════════════════════════════

    function test_Stake_ReceivesStCRwN_1to1() public {
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        vm.stopPrank();

        // First staker gets 1:1
        assertEq(receiptToken.balanceOf(user1), STAKE_AMOUNT);
        assertEq(staking.totalCRwNStaked(), STAKE_AMOUNT);
    }

    function test_Stake_TransfersCRwN() public {
        uint256 balBefore = crownToken.balanceOf(user1);

        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        vm.stopPrank();

        assertEq(balBefore - crownToken.balanceOf(user1), STAKE_AMOUNT);
        assertEq(crownToken.balanceOf(address(staking)), STAKE_AMOUNT);
    }

    function test_Stake_RevertsOnZero() public {
        vm.prank(user1);
        vm.expectRevert(ICRwNStaking.Staking__InvalidAmount.selector);
        staking.stake(0);
    }

    // ═══════════════════════════════════════════════════════
    // EXCHANGE RATE TESTS
    // ═══════════════════════════════════════════════════════

    function test_ExchangeRate_StartsAt1() public view {
        // Before any stakes: 1:1
        assertEq(staking.getExchangeRate(), 1e18);
    }

    function test_ExchangeRate_IncreasesAfterFees() public {
        // User1 stakes 10
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        vm.stopPrank();

        // Exchange rate should be 1:1 (10 CRwN / 10 stCRwN)
        assertEq(staking.getExchangeRate(), 1e18);

        // Fee source distributes 10 CRwN (100% increase in pool)
        vm.startPrank(feeSource);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.distributeFees(STAKE_AMOUNT);
        vm.stopPrank();

        // Now 20 CRwN / 10 stCRwN = 2:1
        assertEq(staking.getExchangeRate(), 2e18);
    }

    function test_Stake_SecondStaker_GetsFewerShares() public {
        // User1 stakes 10 (gets 10 stCRwN)
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        vm.stopPrank();

        // Fees distributed: +10 CRwN (rate = 2:1)
        vm.startPrank(feeSource);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.distributeFees(STAKE_AMOUNT);
        vm.stopPrank();

        // User2 stakes 10 CRwN at 2:1 → gets 5 stCRwN
        vm.startPrank(user2);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        vm.stopPrank();

        assertEq(receiptToken.balanceOf(user2), 5 ether);
    }

    // ═══════════════════════════════════════════════════════
    // UNSTAKE TESTS
    // ═══════════════════════════════════════════════════════

    function test_RequestUnstake_BurnsStCRwN() public {
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);

        uint256 stCrwnBal = receiptToken.balanceOf(user1);
        assertEq(stCrwnBal, STAKE_AMOUNT);

        staking.requestUnstake(STAKE_AMOUNT);
        vm.stopPrank();

        // stCRwN burned immediately
        assertEq(receiptToken.balanceOf(user1), 0);
    }

    function test_CompleteUnstake_AfterCooldown() public {
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        staking.requestUnstake(STAKE_AMOUNT);
        vm.stopPrank();

        uint256 balBefore = crownToken.balanceOf(user1);

        // Warp past cooldown (7 days)
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(user1);
        staking.completeUnstake();

        assertEq(crownToken.balanceOf(user1) - balBefore, STAKE_AMOUNT);
    }

    function test_CompleteUnstake_RevertsBeforeCooldown() public {
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        staking.requestUnstake(STAKE_AMOUNT);
        vm.stopPrank();

        // Try immediately — should revert
        vm.prank(user1);
        vm.expectRevert(ICRwNStaking.Staking__CooldownNotMet.selector);
        staking.completeUnstake();
    }

    function test_CompleteUnstake_RevertsNoRequest() public {
        vm.prank(user1);
        vm.expectRevert(ICRwNStaking.Staking__NoUnstakeRequest.selector);
        staking.completeUnstake();
    }

    // ═══════════════════════════════════════════════════════
    // FEE DISTRIBUTION TESTS
    // ═══════════════════════════════════════════════════════

    function test_DistributeFees_IncreasesPool() public {
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        vm.stopPrank();

        uint256 totalBefore = staking.totalCRwNStaked();

        vm.startPrank(feeSource);
        crownToken.approve(address(staking), 5 ether);
        staking.distributeFees(5 ether);
        vm.stopPrank();

        assertEq(staking.totalCRwNStaked(), totalBefore + 5 ether);
    }

    function test_DistributeFees_OnlyAuthorized() public {
        address unauthorized = makeAddr("unauthorized");
        vm.deal(unauthorized, 10 ether);
        vm.prank(unauthorized);
        crownToken.mint{value: 10 ether}(10 ether);

        vm.startPrank(unauthorized);
        crownToken.approve(address(staking), 1 ether);
        vm.expectRevert(ICRwNStaking.Staking__Unauthorized.selector);
        staking.distributeFees(1 ether);
        vm.stopPrank();
    }

    function test_DistributeFees_OwnerCanAlways() public {
        // Owner mints and distributes
        crownToken.mint{value: 5 ether}(5 ether);
        crownToken.approve(address(staking), 5 ether);

        // Need at least one staker first
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);
        vm.stopPrank();

        staking.distributeFees(5 ether);
        assertEq(staking.totalCRwNStaked(), STAKE_AMOUNT + 5 ether);
    }

    // ═══════════════════════════════════════════════════════
    // WARRIOR BOOST TESTS
    // ═══════════════════════════════════════════════════════

    function test_StakeWarrior_NFTTransferred() public {
        assertEq(warriorsNFT.ownerOf(1), user1);

        vm.startPrank(user1);
        warriorsNFT.approve(address(staking), 1);
        staking.stakeWarrior(1);
        vm.stopPrank();

        assertEq(warriorsNFT.ownerOf(1), address(staking));
    }

    function test_StakeWarrior_BoostApplied() public {
        vm.startPrank(user1);
        warriorsNFT.approve(address(staking), 1);
        staking.stakeWarrior(1);
        vm.stopPrank();

        (uint256 nftId, uint256 boostBps) = staking.getWarriorBoost(user1);
        assertEq(nftId, 1);
        assertTrue(boostBps >= 10000, "Boost should be at least 1x");
    }

    function test_StakeWarrior_RevertsNotOwner() public {
        vm.prank(user2);
        vm.expectRevert(ICRwNStaking.Staking__NotWarriorOwner.selector);
        staking.stakeWarrior(1); // user2 doesn't own token 1
    }

    function test_StakeWarrior_RevertsAlreadyStaked() public {
        vm.startPrank(user1);
        warriorsNFT.approve(address(staking), 1);
        staking.stakeWarrior(1);

        // NFT is now owned by staking contract, so ownerOf check fails first
        vm.expectRevert(ICRwNStaking.Staking__NotWarriorOwner.selector);
        staking.stakeWarrior(1);
        vm.stopPrank();
    }

    function test_UnstakeWarrior_NFTReturned() public {
        vm.startPrank(user1);
        warriorsNFT.approve(address(staking), 1);
        staking.stakeWarrior(1);

        assertEq(warriorsNFT.ownerOf(1), address(staking));

        staking.unstakeWarrior();
        vm.stopPrank();

        assertEq(warriorsNFT.ownerOf(1), user1);
    }

    function test_UnstakeWarrior_BoostRemoved() public {
        vm.startPrank(user1);
        warriorsNFT.approve(address(staking), 1);
        staking.stakeWarrior(1);
        staking.unstakeWarrior();
        vm.stopPrank();

        (uint256 nftId, uint256 boostBps) = staking.getWarriorBoost(user1);
        assertEq(nftId, 0);
        assertEq(boostBps, 0);
    }

    function test_UnstakeWarrior_RevertsNoStaked() public {
        vm.prank(user1);
        vm.expectRevert(ICRwNStaking.Staking__NoWarriorStaked.selector);
        staking.unstakeWarrior();
    }

    // ═══════════════════════════════════════════════════════
    // STAKED BALANCE WITH BOOST
    // ═══════════════════════════════════════════════════════

    function test_GetStakedBalance_WithBoost() public {
        // Stake CRwN
        vm.startPrank(user1);
        crownToken.approve(address(staking), STAKE_AMOUNT);
        staking.stake(STAKE_AMOUNT);

        // Stake warrior for boost
        warriorsNFT.approve(address(staking), 1);
        staking.stakeWarrior(1);
        vm.stopPrank();

        uint256 stakedBalance = staking.getStakedBalance(user1);
        // With any boost >= 1x, balance should be >= STAKE_AMOUNT
        assertTrue(stakedBalance >= STAKE_AMOUNT, "Boosted balance should be >= raw stake");
    }

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    function _assignTraits(
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
