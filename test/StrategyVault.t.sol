// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {StrategyVault} from "../src/StrategyVault.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {HighYieldPool} from "../src/pools/HighYieldPool.sol";
import {StablePool} from "../src/pools/StablePool.sol";
import {LPPool} from "../src/pools/LPPool.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

contract StrategyVaultTraitConstraintTest is Test {
    StrategyVault public vault;
    CrownToken public crownToken;
    WarriorsNFT public warriorsNFT;
    HighYieldPool public highYieldPool;
    StablePool public stablePool;
    LPPool public lpPool;

    address public owner;
    address public user;

    uint256 constant AI_PRIVATE_KEY = 0xA11CE;
    address public aiSigner;

    uint256 constant DEPOSIT_AMOUNT = 50 ether;
    uint256 public nftId = 1;

    function setUp() public {
        owner = address(this);
        user = makeAddr("user");
        aiSigner = vm.addr(AI_PRIVATE_KEY);

        crownToken = new CrownToken();
        warriorsNFT = new WarriorsNFT(owner, aiSigner, address(0));

        highYieldPool = new HighYieldPool(address(crownToken));
        stablePool = new StablePool(address(crownToken));
        lpPool = new LPPool(address(crownToken));

        vault = new StrategyVault(
            address(crownToken),
            address(warriorsNFT),
            address(highYieldPool),
            address(stablePool),
            address(lpPool)
        );

        // Fund pool reserves
        crownToken.mint{value: 100 ether}(100 ether);
        crownToken.transfer(address(highYieldPool), 30 ether);
        crownToken.transfer(address(stablePool), 30 ether);
        crownToken.transfer(address(lpPool), 30 ether);

        // Fund user
        vm.deal(user, 100 ether);
        vm.prank(user);
        crownToken.mint{value: 100 ether}(100 ether);

        // Mint NFT
        vm.prank(user);
        warriorsNFT.mintNft("uri_1", bytes32(uint256(1)));

        warriorsNFT.setGurukul(owner);

        // Enable trait constraints
        vault.setTraitConstraintsEnabled(true);
    }

    // ═══════════════════════════════════════════════════════
    // ALPHA CONSTRAINT (strength → max concentration)
    // ═══════════════════════════════════════════════════════

    function test_Alpha_LowStrength_RejectsHighConcentration() public {
        // Low strength (2000) → maxConc = 2000 + (2000 * 6000) / 10000 = 3200
        _assignTraits(uint16(nftId), 2000, 5000, 5000, 5000, 5000);
        _depositVault([uint256(3000), uint256(4000), uint256(3000)]);

        // Try to concentrate 5000 in HighYield → exceeds maxConc of 3200
        vm.prank(user);
        vm.expectRevert("HighYield exceeds concentration limit");
        vault.rebalance(nftId, [uint256(5000), uint256(3000), uint256(2000)]);
    }

    function test_Alpha_LowStrength_RejectsHighLP() public {
        _assignTraits(uint16(nftId), 2000, 5000, 5000, 5000, 5000);
        _depositVault([uint256(3000), uint256(4000), uint256(3000)]);

        // Try to concentrate 5000 in LP → exceeds maxConc of 3200
        vm.prank(user);
        vm.expectRevert("LP exceeds concentration limit");
        vault.rebalance(nftId, [uint256(2000), uint256(3000), uint256(5000)]);
    }

    function test_Alpha_HighStrength_AllowsHighConcentration() public {
        // High strength (9000) → maxConc = 2000 + (9000 * 6000) / 10000 = 7400
        // Low defence (1000) → minStable = 500 + (1000 * 6500) / 10000 = 1150
        _assignTraits(uint16(nftId), 9000, 5000, 10000, 1000, 5000);
        _depositVault([uint256(3000), uint256(4000), uint256(3000)]);

        // 7000 in HighYield → within maxConc of 7400, stable 1500 > minStable 1150
        vm.prank(user);
        vault.rebalance(nftId, [uint256(7000), uint256(1500), uint256(1500)]);
    }

    // ═══════════════════════════════════════════════════════
    // HEDGE CONSTRAINT (defence → min stable)
    // ═══════════════════════════════════════════════════════

    function test_Hedge_HighDefence_RequiresMinStable() public {
        // High defence (8000) → minStable = 500 + (8000 * 6500) / 10000 = 5700
        _assignTraits(uint16(nftId), 10000, 5000, 10000, 8000, 5000);
        _depositVault([uint256(3000), uint256(4000), uint256(3000)]);

        // Try stable = 2000 → below minStable of 5700
        vm.prank(user);
        vm.expectRevert("Stable below hedge minimum");
        vault.rebalance(nftId, [uint256(4000), uint256(2000), uint256(4000)]);
    }

    function test_Hedge_HighDefence_AllowsAboveMin() public {
        // High defence (8000) → minStable = 5700
        _assignTraits(uint16(nftId), 5000, 5000, 10000, 8000, 5000);
        _depositVault([uint256(2000), uint256(6000), uint256(2000)]);

        // stable = 6000 → above minStable of 5700
        vm.prank(user);
        vault.rebalance(nftId, [uint256(2000), uint256(6000), uint256(2000)]);
    }

    function test_Hedge_LowDefence_AllowsLowStable() public {
        // Low defence (1000) → minStable = 500 + (1000 * 6500) / 10000 = 1150
        _assignTraits(uint16(nftId), 5000, 5000, 10000, 1000, 5000);
        _depositVault([uint256(3000), uint256(4000), uint256(3000)]);

        // stable = 2000 → above minStable of 1150
        vm.prank(user);
        vault.rebalance(nftId, [uint256(4000), uint256(2000), uint256(4000)]);
    }

    // ═══════════════════════════════════════════════════════
    // MOMENTUM CONSTRAINT (charisma → max rebalance delta)
    // ═══════════════════════════════════════════════════════

    function test_Momentum_LowCharisma_RejectsLargeShift() public {
        // Low charisma (1000) → maxDelta = 500 + (1000 * 4500) / 10000 = 950
        _assignTraits(uint16(nftId), 5000, 5000, 1000, 1000, 5000);
        _depositVault([uint256(4000), uint256(3000), uint256(3000)]);

        // Shift: |4000-2000| + |3000-5000| + |3000-3000| = 2000+2000+0 = 4000
        // totalShift/2 = 2000 > maxDelta 950
        vm.prank(user);
        vm.expectRevert("Rebalance delta exceeds momentum limit");
        vault.rebalance(nftId, [uint256(2000), uint256(5000), uint256(3000)]);
    }

    function test_Momentum_HighCharisma_AllowsLargeShift() public {
        // High charisma (10000) → maxDelta = 500 + (10000 * 4500) / 10000 = 5000
        _assignTraits(uint16(nftId), 5000, 5000, 10000, 1000, 5000);
        _depositVault([uint256(4000), uint256(3000), uint256(3000)]);

        // Shift: |4000-2000| + |3000-5000| + |3000-3000| = 4000
        // totalShift/2 = 2000 <= maxDelta 5000
        vm.prank(user);
        vault.rebalance(nftId, [uint256(2000), uint256(5000), uint256(3000)]);
    }

    // ═══════════════════════════════════════════════════════
    // CONSTRAINTS TOGGLE
    // ═══════════════════════════════════════════════════════

    function test_Constraints_DisabledByDefault() public {
        // Deploy a fresh vault — constraints off by default
        StrategyVault freshVault = new StrategyVault(
            address(crownToken), address(warriorsNFT),
            address(highYieldPool), address(stablePool), address(lpPool)
        );
        assertFalse(freshVault.traitConstraintsEnabled());
    }

    function test_Constraints_WhenDisabled_AllowsAnything() public {
        vault.setTraitConstraintsEnabled(false);

        // Very low traits — would normally fail
        _assignTraits(uint16(nftId), 1000, 1000, 1000, 1000, 1000);
        _depositVault([uint256(3000), uint256(4000), uint256(3000)]);

        // Extreme concentration that would normally violate ALPHA
        vm.prank(user);
        vault.rebalance(nftId, [uint256(8000), uint256(1000), uint256(1000)]);
    }

    function test_Constraints_OnlyOwnerCanToggle() public {
        vm.prank(user);
        vm.expectRevert();
        vault.setTraitConstraintsEnabled(false);
    }

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    function _depositVault(uint256[3] memory allocation) internal {
        vm.startPrank(user);
        crownToken.approve(address(vault), DEPOSIT_AMOUNT);
        vault.deposit(nftId, DEPOSIT_AMOUNT, allocation, bytes32(uint256(100)));
        vm.stopPrank();
    }

    function _assignTraits(
        uint16 tokenId, uint16 strength, uint16 wit, uint16 charisma,
        uint16 defence, uint16 luck
    ) internal {
        bytes32 dataHash = keccak256(abi.encodePacked(
            tokenId, strength, wit, charisma, defence, luck,
            "REBALANCE", "CONCENTRATE", "HEDGE_UP", "COMPOSE", "FLASH"
        ));
        bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(dataHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AI_PRIVATE_KEY, ethSignedMessage);
        bytes memory signature = abi.encodePacked(r, s, v);

        warriorsNFT.assignTraitsAndMoves(
            tokenId, strength, wit, charisma, defence, luck,
            "REBALANCE", "CONCENTRATE", "HEDGE_UP", "COMPOSE", "FLASH",
            signature
        );
    }
}
