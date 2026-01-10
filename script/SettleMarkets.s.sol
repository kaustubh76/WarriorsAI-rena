// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

interface IPredictionMarketAMM {
    enum MarketStatus { ACTIVE, RESOLVED, CANCELLED }
    enum Outcome { YES, NO, INVALID, UNDECIDED }

    struct Market {
        uint256 id;
        string question;
        uint256 endTime;
        uint256 resolutionTime;
        MarketStatus status;
        Outcome outcome;
        uint256 yesTokens;
        uint256 noTokens;
        uint256 liquidity;
        uint256 totalVolume;
        address creator;
        uint256 battleId;
        uint256 warrior1Id;
        uint256 warrior2Id;
        uint256 createdAt;
    }

    function getMarket(uint256 marketId) external view returns (Market memory);
    function getActiveMarkets() external view returns (uint256[] memory);
    function resolveMarket(uint256 marketId, Outcome outcome, bytes calldata oracleProof) external;
    function owner() external view returns (address);
}

/**
 * @title SettleMarkets
 * @notice Script to settle expired prediction markets
 * @dev Only owner can resolve markets. Uses AI_SIGNER_PRIVATE_KEY (0xFc46DA4cbAbDca9f903863De571E03A39D9079aD)
 *
 * Run command:
 * DEPLOYER_PRIVATE_KEY=0xd15ba7076d9bc4d05135c6d9c22e20af053ba2b0d66f0b944ce5d66a8b3c8141 \
 * forge script script/SettleMarkets.s.sol:SettleMarkets \
 * --rpc-url https://testnet.evm.nodes.onflow.org \
 * --broadcast -vvvv
 *
 * Or to settle specific market with specific outcome:
 * DEPLOYER_PRIVATE_KEY=0xd15ba7076d9bc4d05135c6d9c22e20af053ba2b0d66f0b944ce5d66a8b3c8141 \
 * MARKET_ID=1 OUTCOME=1 \
 * forge script script/SettleMarkets.s.sol:SettleMarkets \
 * --rpc-url https://testnet.evm.nodes.onflow.org \
 * --broadcast -vvvv
 */
contract SettleMarkets is Script {
    // PredictionMarketAMM on Flow Testnet (Chain 545)
    address constant PREDICTION_MARKET = 0x1b26203A2752557ecD4763a9A8A26119AC5e18e4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Market Settlement Script ===");
        console2.log("Deployer:", deployer);

        IPredictionMarketAMM market = IPredictionMarketAMM(PREDICTION_MARKET);

        // Check ownership
        address owner = market.owner();
        console2.log("Contract owner:", owner);
        require(deployer == owner, "Deployer must be contract owner");

        // Check for specific market to settle
        uint256 specificMarketId = vm.envOr("MARKET_ID", uint256(0));
        uint256 specificOutcome = vm.envOr("OUTCOME", uint256(0)); // 0=UNDECIDED, 1=YES, 2=NO, 3=INVALID

        if (specificMarketId > 0) {
            // Settle specific market
            _settleMarket(market, specificMarketId, IPredictionMarketAMM.Outcome(specificOutcome), deployerPrivateKey);
        } else {
            // Get all active markets and settle expired ones
            uint256[] memory activeMarkets = market.getActiveMarkets();
            console2.log("");
            console2.log("Active markets:", activeMarkets.length);

            for (uint256 i = 0; i < activeMarkets.length; i++) {
                uint256 marketId = activeMarkets[i];
                IPredictionMarketAMM.Market memory m = market.getMarket(marketId);

                console2.log("");
                console2.log("--- Market #", marketId, "---");
                console2.log("Question:", m.question);
                console2.log("End time:", m.endTime);
                console2.log("Current time:", block.timestamp);

                if (block.timestamp >= m.endTime) {
                    console2.log("Status: EXPIRED - needs settlement");

                    // Determine outcome based on market activity
                    // Default to YES if more YES tokens, NO if more NO tokens
                    IPredictionMarketAMM.Outcome outcome;
                    if (m.yesTokens > m.noTokens) {
                        outcome = IPredictionMarketAMM.Outcome.YES;
                        console2.log("Determined outcome: YES (more YES tokens)");
                    } else if (m.noTokens > m.yesTokens) {
                        outcome = IPredictionMarketAMM.Outcome.NO;
                        console2.log("Determined outcome: NO (more NO tokens)");
                    } else {
                        outcome = IPredictionMarketAMM.Outcome.INVALID;
                        console2.log("Determined outcome: INVALID (tied)");
                    }

                    _settleMarket(market, marketId, outcome, deployerPrivateKey);
                } else {
                    console2.log("Status: Still active (not expired)");
                }
            }
        }

        console2.log("");
        console2.log("=== Settlement Complete ===");
    }

    function _settleMarket(
        IPredictionMarketAMM market,
        uint256 marketId,
        IPredictionMarketAMM.Outcome outcome,
        uint256 privateKey
    ) internal {
        console2.log("");
        console2.log("Settling market #", marketId);
        console2.log("Outcome:", uint256(outcome));

        vm.startBroadcast(privateKey);

        // Empty oracle proof for now (owner can resolve without proof)
        bytes memory oracleProof = "";
        market.resolveMarket(marketId, outcome, oracleProof);

        vm.stopBroadcast();

        console2.log("Market #", marketId, "settled successfully!");
    }
}
