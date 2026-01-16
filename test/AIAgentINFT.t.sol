// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {AIAgentINFT} from "../src/AIAgentINFT.sol";
import {MockAgentINFTOracle} from "../src/mocks/MockAgentINFTOracle.sol";
import {CrownToken} from "../src/CrownToken.sol";

/**
 * @title AIAgentINFTTest
 * @notice Comprehensive tests for ERC-7857 AI Agent iNFT contract
 */
contract AIAgentINFTTest is Test {
    AIAgentINFT public aiAgentINFT;
    MockAgentINFTOracle public oracle;
    CrownToken public crownToken;

    address public owner;
    address public user1;
    address public user2;
    address public executor;

    uint256 constant MIN_STAKE = 100 ether;
    uint256 constant STAKE_AMOUNT = 500 ether;

    event INFTMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 metadataHash,
        string encryptedMetadataRef,
        uint256 stakedAmount
    );

    event UsageAuthorized(
        uint256 indexed tokenId,
        address indexed executor,
        uint256 expiresAt
    );

    event UsageRevoked(
        uint256 indexed tokenId,
        address indexed executor
    );

    event StakeAdded(
        uint256 indexed tokenId,
        uint256 amount,
        uint256 newTotal
    );

    event TradeRecorded(
        uint256 indexed tokenId,
        bool won,
        int256 pnl
    );

    event TierUpdated(
        uint256 indexed tokenId,
        AIAgentINFT.AgentTier oldTier,
        AIAgentINFT.AgentTier newTier
    );

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        executor = makeAddr("executor");

        // Deploy CrownToken
        crownToken = new CrownToken();

        // Deploy MockAgentINFTOracle
        oracle = new MockAgentINFTOracle();
        oracle.setAutoApprove(true);

        // Deploy AIAgentINFT
        aiAgentINFT = new AIAgentINFT(address(crownToken), address(oracle));

        // Set iNFT contract in oracle
        oracle.setINFTContract(address(aiAgentINFT));

        // Mint CrownTokens for testing
        _mintCrownTokens(user1, 50000 ether);
        _mintCrownTokens(user2, 50000 ether);
    }

    function _mintCrownTokens(address to, uint256 amount) internal {
        // CrownToken mint is 1:1 with ETH sent
        vm.deal(to, amount);
        vm.prank(to);
        crownToken.mint{value: amount}(amount);
    }

    // ============ Minting Tests ============

    function test_MintINFT() public {
        string memory metadataRef = "0g://encrypted-metadata-hash-123";
        bytes32 metadataHash = keccak256("test-metadata");

        vm.startPrank(user1);
        crownToken.approve(address(aiAgentINFT), STAKE_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit INFTMinted(1, user1, metadataHash, metadataRef, STAKE_AMOUNT);

        uint256 tokenId = aiAgentINFT.mint(metadataRef, metadataHash, STAKE_AMOUNT, true);
        vm.stopPrank();

        assertEq(tokenId, 1);
        assertEq(aiAgentINFT.ownerOf(1), user1);
        assertEq(aiAgentINFT.getEncryptedMetadataRef(1), metadataRef);
        assertEq(aiAgentINFT.getMetadataHash(1), metadataHash);
        assertEq(aiAgentINFT.getAgentStake(1), STAKE_AMOUNT);
        assertTrue(aiAgentINFT.isCopyTradingEnabled(1));
        assertTrue(aiAgentINFT.isAgentActive(1));
    }

    function test_MintWithMinimumStake() public {
        string memory metadataRef = "0g://encrypted-metadata-hash-456";
        bytes32 metadataHash = keccak256("test-metadata-2");

        vm.startPrank(user1);
        crownToken.approve(address(aiAgentINFT), MIN_STAKE);
        uint256 tokenId = aiAgentINFT.mint(metadataRef, metadataHash, MIN_STAKE, false);
        vm.stopPrank();

        assertEq(tokenId, 1);
        assertEq(aiAgentINFT.getAgentStake(1), MIN_STAKE);
        assertFalse(aiAgentINFT.isCopyTradingEnabled(1));
    }

    function test_RevertMintInsufficientStake() public {
        string memory metadataRef = "0g://test";
        bytes32 metadataHash = keccak256("test");

        vm.startPrank(user1);
        // MIN_STAKE_NOVICE is 0.01 ether, so use less than that
        crownToken.approve(address(aiAgentINFT), 0.001 ether);

        vm.expectRevert(AIAgentINFT.AIAgentINFT__InvalidStakeAmount.selector);
        aiAgentINFT.mint(metadataRef, metadataHash, 0.001 ether, true);
        vm.stopPrank();
    }

    function test_RevertMintEmptyMetadataRef() public {
        bytes32 metadataHash = keccak256("test");

        vm.startPrank(user1);
        crownToken.approve(address(aiAgentINFT), MIN_STAKE);

        vm.expectRevert(AIAgentINFT.AIAgentINFT__InvalidEncryptedMetadataRef.selector);
        aiAgentINFT.mint("", metadataHash, MIN_STAKE, true);
        vm.stopPrank();
    }

    function test_RevertMintZeroMetadataHash() public {
        string memory metadataRef = "0g://test";

        vm.startPrank(user1);
        crownToken.approve(address(aiAgentINFT), MIN_STAKE);

        vm.expectRevert(AIAgentINFT.AIAgentINFT__InvalidMetadataHash.selector);
        aiAgentINFT.mint(metadataRef, bytes32(0), MIN_STAKE, true);
        vm.stopPrank();
    }

    // ============ Authorization Tests ============

    function test_AuthorizeUsage() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.startPrank(user1);
        uint256 duration = 7 days;
        uint256 expectedExpiry = block.timestamp + duration;

        vm.expectEmit(true, true, false, true);
        emit UsageAuthorized(tokenId, executor, expectedExpiry);

        aiAgentINFT.authorizeUsage(tokenId, executor, duration);
        vm.stopPrank();

        assertTrue(aiAgentINFT.isAuthorizedExecutor(tokenId, executor));

        AIAgentINFT.Authorization memory auth = aiAgentINFT.getAuthorization(tokenId, executor);
        assertEq(auth.expiresAt, expectedExpiry);
        assertTrue(auth.canExecute);
        assertTrue(auth.canViewMetadata);
    }

    function test_RevokeUsage() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.startPrank(user1);
        aiAgentINFT.authorizeUsage(tokenId, executor, 7 days);
        assertTrue(aiAgentINFT.isAuthorizedExecutor(tokenId, executor));

        vm.expectEmit(true, true, false, false);
        emit UsageRevoked(tokenId, executor);

        aiAgentINFT.revokeUsage(tokenId, executor);
        vm.stopPrank();

        assertFalse(aiAgentINFT.isAuthorizedExecutor(tokenId, executor));
    }

    function test_AuthorizationExpires() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.prank(user1);
        aiAgentINFT.authorizeUsage(tokenId, executor, 1 days);

        assertTrue(aiAgentINFT.isAuthorizedExecutor(tokenId, executor));

        // Fast forward past expiration
        vm.warp(block.timestamp + 2 days);

        assertFalse(aiAgentINFT.isAuthorizedExecutor(tokenId, executor));
    }

    function test_OwnerIsAlwaysAuthorized() public {
        uint256 tokenId = _mintTestINFT(user1);

        assertTrue(aiAgentINFT.isAuthorizedExecutor(tokenId, user1));
    }

    function test_RevertAuthorizeNotOwner() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.prank(user2);
        vm.expectRevert(AIAgentINFT.AIAgentINFT__NotOwner.selector);
        aiAgentINFT.authorizeUsage(tokenId, executor, 7 days);
    }

    // ============ Staking Tests ============

    function test_AddStake() public {
        uint256 tokenId = _mintTestINFT(user1);
        uint256 additionalStake = 400 ether;

        vm.startPrank(user1);
        crownToken.approve(address(aiAgentINFT), additionalStake);

        uint256 expectedTotal = STAKE_AMOUNT + additionalStake;
        vm.expectEmit(true, false, false, true);
        emit StakeAdded(tokenId, additionalStake, expectedTotal);

        aiAgentINFT.addStake(tokenId, additionalStake);
        vm.stopPrank();

        assertEq(aiAgentINFT.getAgentStake(tokenId), expectedTotal);
    }

    function test_RequestAndWithdrawStake() public {
        uint256 tokenId = _mintTestINFT(user1);

        // Add extra stake first
        vm.startPrank(user1);
        crownToken.approve(address(aiAgentINFT), 500 ether);
        aiAgentINFT.addStake(tokenId, 500 ether);

        // Request unstake
        aiAgentINFT.requestUnstake(tokenId);

        // Cannot withdraw before cooldown
        vm.expectRevert(AIAgentINFT.AIAgentINFT__CooldownActive.selector);
        aiAgentINFT.withdrawStake(tokenId, 100 ether);

        // Fast forward past cooldown
        vm.warp(block.timestamp + 8 days);

        // Can withdraw now (keeping minimum stake)
        uint256 balanceBefore = crownToken.balanceOf(user1);
        aiAgentINFT.withdrawStake(tokenId, 400 ether);

        assertEq(crownToken.balanceOf(user1), balanceBefore + 400 ether);
        assertEq(aiAgentINFT.getAgentStake(tokenId), 600 ether);
        vm.stopPrank();
    }

    function test_RevertWithdrawBelowMinimum() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.startPrank(user1);
        aiAgentINFT.requestUnstake(tokenId);
        vm.warp(block.timestamp + 8 days);

        // Try to withdraw more than minimum allows
        // MIN_STAKE_NOVICE is 0.01 ether, STAKE_AMOUNT is 500 ether
        // Withdrawing 499.995 ether would leave only 0.005 ether (below minimum)
        vm.expectRevert(AIAgentINFT.AIAgentINFT__InsufficientStake.selector);
        aiAgentINFT.withdrawStake(tokenId, 499.995 ether);
        vm.stopPrank();
    }

    // ============ Transfer Tests ============

    function test_StandardTransferReverts() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.prank(user1);
        vm.expectRevert(AIAgentINFT.AIAgentINFT__TransferNotAllowed.selector);
        aiAgentINFT.transferFrom(user1, user2, tokenId);
    }

    function test_SafeTransferReverts() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.prank(user1);
        vm.expectRevert(AIAgentINFT.AIAgentINFT__TransferNotAllowed.selector);
        aiAgentINFT.safeTransferFrom(user1, user2, tokenId, "");
    }

    function test_TransferWithReEncryption() public {
        uint256 tokenId = _mintTestINFT(user1);

        bytes memory sealedKey = abi.encode("sealed-key-for-user2");
        bytes memory proof = abi.encodePacked(
            keccak256("new-metadata-hash"),
            bytes32(0),
            "0g://new-encrypted-ref"
        );

        vm.prank(user1);
        aiAgentINFT.transferWithReEncryption(user1, user2, tokenId, sealedKey, proof);

        assertEq(aiAgentINFT.ownerOf(tokenId), user2);
        assertEq(aiAgentINFT.getAgentStake(tokenId), STAKE_AMOUNT); // Stake transferred
    }

    function test_InitiateAndCompleteTransfer() public {
        uint256 tokenId = _mintTestINFT(user1);

        // Initiate transfer
        vm.prank(user1);
        bytes32 requestId = aiAgentINFT.initiateTransfer(user2, tokenId);

        AIAgentINFT.PendingTransfer memory pending = aiAgentINFT.getPendingTransfer(tokenId);
        assertTrue(pending.isPending);
        assertEq(pending.from, user1);
        assertEq(pending.to, user2);
        assertEq(pending.requestId, requestId);

        // Simulate oracle completing re-encryption
        string memory newRef = "0g://re-encrypted-metadata";
        bytes32 newHash = keccak256("re-encrypted");
        bytes memory sealedKey = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)));
        bytes memory proof = abi.encodePacked(bytes32(uint256(3)), bytes32(uint256(4)));

        // First, simulate oracle processing the request
        oracle.onReEncryptionComplete(requestId, newRef, newHash, sealedKey, proof);

        // Now complete the transfer
        aiAgentINFT.completeTransfer(tokenId, newRef, newHash, sealedKey, proof);

        assertEq(aiAgentINFT.ownerOf(tokenId), user2);
        assertEq(aiAgentINFT.getEncryptedMetadataRef(tokenId), newRef);
        assertEq(aiAgentINFT.getMetadataHash(tokenId), newHash);
    }

    function test_CancelTransfer() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.prank(user1);
        aiAgentINFT.initiateTransfer(user2, tokenId);

        assertTrue(aiAgentINFT.getPendingTransfer(tokenId).isPending);

        vm.prank(user1);
        aiAgentINFT.cancelTransfer(tokenId);

        assertFalse(aiAgentINFT.getPendingTransfer(tokenId).isPending);
        assertEq(aiAgentINFT.ownerOf(tokenId), user1);
    }

    function test_CancelTransferAfterTimeout() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.prank(user1);
        aiAgentINFT.initiateTransfer(user2, tokenId);

        // Anyone can cancel after timeout
        vm.warp(block.timestamp + 2 days);

        vm.prank(user2);
        aiAgentINFT.cancelTransfer(tokenId);

        assertFalse(aiAgentINFT.getPendingTransfer(tokenId).isPending);
    }

    // ============ Performance & Tier Tests ============

    function test_RecordTrade() public {
        uint256 tokenId = _mintTestINFT(user1);

        vm.expectEmit(true, false, false, true);
        emit TradeRecorded(tokenId, true, 100 ether);

        aiAgentINFT.recordTrade(tokenId, true, 100 ether);

        AIAgentINFT.AgentPerformance memory perf = aiAgentINFT.getAgentPerformance(tokenId);
        assertEq(perf.totalTrades, 1);
        assertEq(perf.winningTrades, 1);
        assertEq(perf.totalPnL, 100 ether);
        assertEq(perf.accuracyBps, 10000); // 100%
    }

    function test_TierUpgradeWithPerformance() public {
        // Mint with SKILLED stake
        vm.startPrank(user1);
        crownToken.approve(address(aiAgentINFT), 500 ether);
        uint256 tokenId = aiAgentINFT.mint("0g://ref", keccak256("hash"), 500 ether, true);
        vm.stopPrank();

        // Initial tier is NOVICE (not enough trades)
        assertEq(uint256(aiAgentINFT.getAgentTier(tokenId)), uint256(AIAgentINFT.AgentTier.NOVICE));

        // Record 100 trades with 56% win rate
        for (uint256 i = 0; i < 56; i++) {
            aiAgentINFT.recordTrade(tokenId, true, 10 ether);
        }
        for (uint256 i = 0; i < 44; i++) {
            aiAgentINFT.recordTrade(tokenId, false, -5 ether);
        }

        // Now should be SKILLED
        assertEq(uint256(aiAgentINFT.getAgentTier(tokenId)), uint256(AIAgentINFT.AgentTier.SKILLED));
    }

    // ============ Agent Configuration Tests ============

    function test_SetCopyTradingEnabled() public {
        uint256 tokenId = _mintTestINFT(user1);

        assertTrue(aiAgentINFT.isCopyTradingEnabled(tokenId));

        vm.prank(user1);
        aiAgentINFT.setCopyTradingEnabled(tokenId, false);

        assertFalse(aiAgentINFT.isCopyTradingEnabled(tokenId));
    }

    function test_SetAgentActive() public {
        uint256 tokenId = _mintTestINFT(user1);

        assertTrue(aiAgentINFT.isAgentActive(tokenId));

        vm.prank(user1);
        aiAgentINFT.setAgentActive(tokenId, false);

        assertFalse(aiAgentINFT.isAgentActive(tokenId));
    }

    // ============ ERC-165 Interface Tests ============

    function test_SupportsERC7857Interface() public view {
        // ERC-721 interface
        assertTrue(aiAgentINFT.supportsInterface(0x80ac58cd)); // ERC-721
        // ERC-721 Enumerable
        assertTrue(aiAgentINFT.supportsInterface(0x780e9d63)); // ERC-721 Enumerable
        // ERC-165
        assertTrue(aiAgentINFT.supportsInterface(0x01ffc9a7)); // ERC-165
    }

    // ============ View Function Tests ============

    function test_GetAgentData() public {
        uint256 tokenId = _mintTestINFT(user1);

        AIAgentINFT.AgentOnChainData memory data = aiAgentINFT.getAgentData(tokenId);

        assertEq(uint256(data.tier), uint256(AIAgentINFT.AgentTier.NOVICE));
        assertEq(data.stakedAmount, STAKE_AMOUNT);
        assertTrue(data.isActive);
        assertTrue(data.copyTradingEnabled);
        assertGt(data.createdAt, 0);
        assertGt(data.lastUpdatedAt, 0);
    }

    function test_TotalStaked() public {
        _mintTestINFT(user1);
        _mintTestINFT(user2);

        assertEq(aiAgentINFT.totalStaked(), STAKE_AMOUNT * 2);
    }

    function test_TotalSupply() public {
        _mintTestINFT(user1);
        _mintTestINFT(user2);

        assertEq(aiAgentINFT.totalSupply(), 2);
    }

    // ============ Admin Function Tests ============

    function test_SetOracle() public {
        MockAgentINFTOracle newOracle = new MockAgentINFTOracle();

        aiAgentINFT.setOracle(address(newOracle));

        assertEq(address(aiAgentINFT.oracle()), address(newOracle));
    }

    function test_RevertSetOracleNotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        aiAgentINFT.setOracle(address(0));
    }

    // ============ Helper Functions ============

    function _mintTestINFT(address to) internal returns (uint256 tokenId) {
        string memory metadataRef = "0g://test-metadata-ref";
        bytes32 metadataHash = keccak256(abi.encode(to, block.timestamp));

        vm.startPrank(to);
        crownToken.approve(address(aiAgentINFT), STAKE_AMOUNT);
        tokenId = aiAgentINFT.mint(metadataRef, metadataHash, STAKE_AMOUNT, true);
        vm.stopPrank();
    }
}
