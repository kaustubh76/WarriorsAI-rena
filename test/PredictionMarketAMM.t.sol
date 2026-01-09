// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {ZeroGOracle} from "../src/ZeroGOracle.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {IPredictionMarket} from "../src/Interfaces/IPredictionMarket.sol";

contract PredictionMarketAMMTest is Test {
    PredictionMarketAMM public market;
    OutcomeToken public outcomeToken;
    ZeroGOracle public oracle;
    CrownToken public crownToken;

    address public owner;
    address public user1;
    address public user2;
    address public aiSigner;

    uint256 constant INITIAL_BALANCE = 1000 ether;
    uint256 constant INITIAL_LIQUIDITY = 100 ether;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        aiSigner = makeAddr("aiSigner");

        // Deploy CrownToken
        crownToken = new CrownToken();

        // Deploy OutcomeToken
        outcomeToken = new OutcomeToken();

        // Deploy PredictionMarketAMM first (Oracle needs a valid address)
        // We pass address(0) for oracle initially
        market = new PredictionMarketAMM(
            address(crownToken),
            address(outcomeToken),
            address(0) // Will set oracle later
        );

        // Deploy Oracle with market address
        oracle = new ZeroGOracle(address(market));
        oracle.registerAIProvider(aiSigner, "TestAI");

        // Update market with oracle address
        market.setOracle(address(oracle));

        // Set market contract in outcome token
        outcomeToken.setMarketContract(address(market));

        // Mint tokens for users (need to provide ETH equal to token amount)
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(user2, INITIAL_BALANCE);
        vm.deal(owner, INITIAL_BALANCE);

        vm.prank(user1);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        vm.prank(user2);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        // Also mint for owner
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);
    }

    function test_CreateMarket() public {
        // Approve tokens
        crownToken.approve(address(market), INITIAL_LIQUIDITY);

        // Create market
        uint256 marketId = market.createMarket(
            "Will it rain tomorrow?",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        assertEq(marketId, 1);

        // Check market data
        IPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.id, 1);
        assertEq(m.question, "Will it rain tomorrow?");
        assertEq(uint8(m.status), uint8(IPredictionMarket.MarketStatus.ACTIVE));
        assertEq(m.liquidity, INITIAL_LIQUIDITY);
    }

    function test_CreateBattleMarket() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);

        uint256 marketId = market.createBattleMarket(
            1, // battleId
            1, // warrior1Id
            2, // warrior2Id
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        IPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.battleId, 1);
        assertEq(m.warrior1Id, 1);
        assertEq(m.warrior2Id, 2);
    }

    function test_BuyYesShares() public {
        // Create market
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        // User1 buys YES shares
        uint256 buyAmount = 10 ether;
        vm.startPrank(user1);
        crownToken.approve(address(market), buyAmount);

        uint256 sharesBefore = outcomeToken.balanceOf(user1, market.getYesTokenId(marketId));
        uint256 sharesReceived = market.buy(marketId, true, buyAmount, 0);
        uint256 sharesAfter = outcomeToken.balanceOf(user1, market.getYesTokenId(marketId));

        vm.stopPrank();

        assertGt(sharesReceived, 0);
        assertEq(sharesAfter - sharesBefore, sharesReceived);
    }

    function test_BuyNoShares() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        uint256 buyAmount = 10 ether;
        vm.startPrank(user1);
        crownToken.approve(address(market), buyAmount);

        uint256 sharesReceived = market.buy(marketId, false, buyAmount, 0);

        vm.stopPrank();

        uint256 noBalance = outcomeToken.balanceOf(user1, market.getNoTokenId(marketId));
        assertEq(noBalance, sharesReceived);
    }

    function test_SellShares() public {
        // Setup: create market and buy shares
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        vm.startPrank(user1);
        crownToken.approve(address(market), 10 ether);
        uint256 sharesBought = market.buy(marketId, true, 10 ether, 0);

        // Approve outcome tokens for sale
        outcomeToken.setApprovalForAll(address(market), true);

        // Sell half the shares
        uint256 sharesToSell = sharesBought / 2;
        uint256 balanceBefore = crownToken.balanceOf(user1);
        uint256 collateralReceived = market.sell(marketId, true, sharesToSell, 0);
        uint256 balanceAfter = crownToken.balanceOf(user1);

        vm.stopPrank();

        assertGt(collateralReceived, 0);
        assertEq(balanceAfter - balanceBefore, collateralReceived);
    }

    function test_AddLiquidity() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        uint256 lpAmount = 50 ether;
        vm.startPrank(user1);
        crownToken.approve(address(market), lpAmount);

        uint256 lpShares = market.addLiquidity(marketId, lpAmount);

        vm.stopPrank();

        assertGt(lpShares, 0);

        IPredictionMarket.Position memory pos = market.getPosition(marketId, user1);
        assertEq(pos.lpShares, lpShares);
    }

    function test_RemoveLiquidity() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        vm.startPrank(user1);
        crownToken.approve(address(market), 50 ether);
        uint256 lpShares = market.addLiquidity(marketId, 50 ether);

        // Remove all liquidity
        (uint256 collateral, uint256 yesTokens, uint256 noTokens) = market.removeLiquidity(marketId, lpShares);

        vm.stopPrank();

        assertGt(collateral + yesTokens + noTokens, 0);
    }

    function test_GetPrice() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        (uint256 yesPrice, uint256 noPrice) = market.getPrice(marketId);

        // Initial prices should be 50/50
        assertEq(yesPrice, 5000); // 50.00%
        assertEq(noPrice, 5000);  // 50.00%
    }

    function test_PriceMovesWithBuys() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        (uint256 yesBefore,) = market.getPrice(marketId);

        // Buy YES shares
        vm.startPrank(user1);
        crownToken.approve(address(market), 20 ether);
        market.buy(marketId, true, 20 ether, 0);
        vm.stopPrank();

        (uint256 yesAfter,) = market.getPrice(marketId);

        // YES price should increase after buying YES
        assertGt(yesAfter, yesBefore);
    }

    function test_ResolveMarket() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        // Fast forward past end time
        vm.warp(block.timestamp + 2 days);

        // Resolve market (owner can resolve)
        market.resolveMarket(marketId, IPredictionMarket.Outcome.YES, "");

        IPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint8(m.status), uint8(IPredictionMarket.MarketStatus.RESOLVED));
        assertEq(uint8(m.outcome), uint8(IPredictionMarket.Outcome.YES));
    }

    function test_ClaimWinnings() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        // User1 buys YES
        vm.startPrank(user1);
        crownToken.approve(address(market), 10 ether);
        uint256 yesShares = market.buy(marketId, true, 10 ether, 0);
        vm.stopPrank();

        // User2 buys NO
        vm.startPrank(user2);
        crownToken.approve(address(market), 10 ether);
        market.buy(marketId, false, 10 ether, 0);
        vm.stopPrank();

        // Fast forward and resolve as YES
        vm.warp(block.timestamp + 2 days);
        market.resolveMarket(marketId, IPredictionMarket.Outcome.YES, "");

        // User1 claims winnings
        vm.startPrank(user1);
        uint256 balanceBefore = crownToken.balanceOf(user1);
        uint256 claimed = market.claimWinnings(marketId);
        uint256 balanceAfter = crownToken.balanceOf(user1);
        vm.stopPrank();

        assertGt(claimed, 0);
        assertEq(balanceAfter - balanceBefore, claimed);
    }

    function test_CannotBuyAfterEnd() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        // Fast forward past end time
        vm.warp(block.timestamp + 2 days);

        vm.startPrank(user1);
        crownToken.approve(address(market), 10 ether);

        vm.expectRevert();
        market.buy(marketId, true, 10 ether, 0);

        vm.stopPrank();
    }

    function test_CannotClaimBeforeResolution() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        vm.startPrank(user1);
        crownToken.approve(address(market), 10 ether);
        market.buy(marketId, true, 10 ether, 0);

        vm.expectRevert();
        market.claimWinnings(marketId);

        vm.stopPrank();
    }

    function test_SlippageProtection() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        // Calculate expected shares
        uint256 buyAmount = 10 ether;
        uint256 expectedShares = market.calculateBuyAmount(marketId, true, buyAmount);

        vm.startPrank(user1);
        crownToken.approve(address(market), buyAmount);

        // Should fail if minimum shares too high
        vm.expectRevert();
        market.buy(marketId, true, buyAmount, expectedShares * 2);

        // Should succeed with correct minimum
        uint256 shares = market.buy(marketId, true, buyAmount, expectedShares * 90 / 100);
        assertGe(shares, expectedShares * 90 / 100);

        vm.stopPrank();
    }

    function test_GetAllMarkets() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY * 3);

        market.createMarket("Market 1", block.timestamp + 1 days, INITIAL_LIQUIDITY);
        market.createMarket("Market 2", block.timestamp + 1 days, INITIAL_LIQUIDITY);
        market.createMarket("Market 3", block.timestamp + 1 days, INITIAL_LIQUIDITY);

        IPredictionMarket.Market[] memory allMarkets = market.getAllMarkets();
        assertEq(allMarkets.length, 3);
    }

    function test_GetActiveMarkets() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY * 2);

        uint256 market1 = market.createMarket("Market 1", block.timestamp + 1 days, INITIAL_LIQUIDITY);
        market.createMarket("Market 2", block.timestamp + 1 days, INITIAL_LIQUIDITY);

        // Resolve market 1
        vm.warp(block.timestamp + 2 days);
        market.resolveMarket(market1, IPredictionMarket.Outcome.YES, "");

        uint256[] memory activeMarkets = market.getActiveMarkets();
        assertEq(activeMarkets.length, 1);
        assertEq(activeMarkets[0], 2);
    }

    function test_CalculateBuyAmount() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        uint256 collateral = 10 ether;
        uint256 expectedShares = market.calculateBuyAmount(marketId, true, collateral);

        assertGt(expectedShares, 0);
        // With 50/50 odds and fee, should get slightly less than collateral
        assertLt(expectedShares, collateral);
    }

    function test_CalculateSellAmount() public {
        crownToken.approve(address(market), INITIAL_LIQUIDITY);
        uint256 marketId = market.createMarket(
            "Test Market",
            block.timestamp + 1 days,
            INITIAL_LIQUIDITY
        );

        // Buy shares first
        vm.startPrank(user1);
        crownToken.approve(address(market), 10 ether);
        uint256 sharesBought = market.buy(marketId, true, 10 ether, 0);
        vm.stopPrank();

        uint256 expectedCollateral = market.calculateSellAmount(marketId, true, sharesBought);
        assertGt(expectedCollateral, 0);
    }
}
