// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {HighYieldPool} from "../src/pools/HighYieldPool.sol";
import {CrownToken} from "../src/CrownToken.sol";

contract BasePoolTest is Test {
    HighYieldPool public pool;
    CrownToken public crownToken;

    address public owner;
    address public user;

    uint256 constant INITIAL_BALANCE = 100 ether;
    uint256 constant DEPOSIT_AMOUNT = 10 ether;

    function setUp() public {
        owner = address(this);
        user = makeAddr("user");

        crownToken = new CrownToken();

        // Deploy HighYieldPool (18% base APY)
        pool = new HighYieldPool(address(crownToken));

        // Fund user
        vm.deal(user, INITIAL_BALANCE);
        vm.prank(user);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        // Fund pool reserve for yield payments
        crownToken.mint{value: 50 ether}(50 ether);
        crownToken.transfer(address(pool), 50 ether);
    }

    // ═══════════════════════════════════════════════════════
    // STATIC APY TESTS (maxCapacity == 0)
    // ═══════════════════════════════════════════════════════

    function test_StaticAPY_WhenNoCapacity() public view {
        assertEq(pool.maxCapacity(), 0);
        assertEq(pool.getEffectiveAPY(), 1800); // 18%
        assertEq(pool.getEffectiveAPY(), pool.getAPY());
    }

    function test_StaticAPY_UtilizationIsZero() public view {
        assertEq(pool.getUtilization(), 0);
    }

    // ═══════════════════════════════════════════════════════
    // DYNAMIC APY TESTS (maxCapacity > 0)
    // ═══════════════════════════════════════════════════════

    function test_DynamicAPY_AtTarget() public {
        // Set capacity = 20, deposit 10 → 50% utilization = target → 1x multiplier
        pool.setMaxCapacity(20 ether);

        vm.startPrank(user);
        crownToken.approve(address(pool), DEPOSIT_AMOUNT);
        pool.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        uint256 utilization = pool.getUtilization();
        assertEq(utilization, 5000); // 50%

        // At target, multiplier = 5000 * 10000 / 5000 = 10000 (1x)
        assertEq(pool.getEffectiveAPY(), 1800); // Same as base
    }

    function test_DynamicAPY_UnderUtilized() public {
        // Set capacity = 100, deposit 10 → 10% utilization → higher APY
        pool.setMaxCapacity(100 ether);

        vm.startPrank(user);
        crownToken.approve(address(pool), DEPOSIT_AMOUNT);
        pool.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        uint256 utilization = pool.getUtilization();
        assertEq(utilization, 1000); // 10%

        // multiplier = 5000 * 10000 / 1000 = 50000 → capped at 20000 (2x)
        assertEq(pool.getEffectiveAPY(), 3600); // 18% * 2 = 36%
    }

    function test_DynamicAPY_OverUtilized() public {
        // Set capacity = 12, deposit 10 → ~83% utilization → lower APY
        pool.setMaxCapacity(12 ether);

        vm.startPrank(user);
        crownToken.approve(address(pool), DEPOSIT_AMOUNT);
        pool.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        uint256 utilization = pool.getUtilization();
        assertEq(utilization, 8333); // ~83%

        // multiplier = 5000 * 10000 / 8333 = 6000 (0.6x)
        uint256 effectiveAPY = pool.getEffectiveAPY();
        assertTrue(effectiveAPY < 1800, "Over-utilized APY should be less than base");
        assertTrue(effectiveAPY >= 900, "APY should not go below floor (0.5x)");
    }

    function test_DynamicAPY_Cap_200Percent() public {
        // Extreme under-utilization: capacity = 1000, deposit = 1 → 0.1%
        pool.setMaxCapacity(1000 ether);

        vm.startPrank(user);
        crownToken.approve(address(pool), 1 ether);
        pool.deposit(1 ether);
        vm.stopPrank();

        // Should cap at 2x base = 36%
        assertEq(pool.getEffectiveAPY(), 3600);
    }

    function test_DynamicAPY_Floor_50Percent() public {
        // Extreme over-utilization: capacity = 10, deposit 10 → 100%
        pool.setMaxCapacity(10 ether);

        vm.startPrank(user);
        crownToken.approve(address(pool), DEPOSIT_AMOUNT);
        pool.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        uint256 utilization = pool.getUtilization();
        assertEq(utilization, 10000); // 100%

        // multiplier = 5000 * 10000 / 10000 = 5000 (0.5x) → at floor
        assertEq(pool.getEffectiveAPY(), 900); // 18% * 0.5 = 9%
    }

    // ═══════════════════════════════════════════════════════
    // YIELD ACCRUAL TESTS
    // ═══════════════════════════════════════════════════════

    function test_AccrueYield_UsesDynamicAPY() public {
        // Set up dynamic APY at 2x (under-utilized)
        pool.setMaxCapacity(100 ether);

        vm.startPrank(user);
        crownToken.approve(address(pool), DEPOSIT_AMOUNT);
        pool.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Dynamic APY should be 2x = 36%
        assertEq(pool.getEffectiveAPY(), 3600);

        // Warp 365 days
        vm.warp(block.timestamp + 365 days);

        // Expected yield: 10 * 3600 / 10000 = 3.6 ether
        uint256 pending = pool.getPendingYield(user);
        // Allow small rounding error (1 wei per second accumulated)
        assertApproxEqAbs(pending, 3.6 ether, 1e15);
    }

    function test_AccrueYield_StaticAPY() public {
        // No dynamic APY
        vm.startPrank(user);
        crownToken.approve(address(pool), DEPOSIT_AMOUNT);
        pool.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        assertEq(pool.getEffectiveAPY(), 1800); // 18%

        vm.warp(block.timestamp + 365 days);

        uint256 pending = pool.getPendingYield(user);
        // Expected: 10 * 1800 / 10000 = 1.8 ether
        assertApproxEqAbs(pending, 1.8 ether, 1e15);
    }

    // ═══════════════════════════════════════════════════════
    // ADMIN TESTS
    // ═══════════════════════════════════════════════════════

    function test_SetMaxCapacity() public {
        pool.setMaxCapacity(50 ether);
        assertEq(pool.maxCapacity(), 50 ether);
    }

    function test_SetTargetUtilization() public {
        pool.setTargetUtilization(7000); // 70%
        assertEq(pool.targetUtilization(), 7000);
    }

    function test_SetTargetUtilization_RevertsOnZero() public {
        vm.expectRevert("Invalid target");
        pool.setTargetUtilization(0);
    }

    function test_SetTargetUtilization_RevertsOver100() public {
        vm.expectRevert("Invalid target");
        pool.setTargetUtilization(10001);
    }

    // ═══════════════════════════════════════════════════════
    // SOFT CAP TESTS
    // ═══════════════════════════════════════════════════════

    function test_Deposit_BeyondMaxCapacity() public {
        // Soft cap: deposits beyond maxCapacity are allowed
        pool.setMaxCapacity(15 ether);

        vm.startPrank(user);
        crownToken.approve(address(pool), 20 ether);
        pool.deposit(20 ether); // exceeds 15 ether cap — should NOT revert
        vm.stopPrank();

        // Utilization > 100%
        uint256 utilization = pool.getUtilization();
        assertGt(utilization, 10000, "Utilization should exceed 100%");

        // APY at floor (0.5x base = 9%)
        assertEq(pool.getEffectiveAPY(), 900);
    }
}
