// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {ZeroGOracle} from "../src/ZeroGOracle.sol";
import {CrownToken} from "../src/CrownToken.sol";

/**
 * @title DeployPredictionMarket
 * @notice Deploy the prediction market contracts to Flow Testnet
 *
 * Usage:
 * forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast \
 *   --verify \
 *   -vvvv
 */
contract DeployPredictionMarket is Script {
    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deployer address:", deployer);
        console2.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Check if CrownToken already exists (use existing if so)
        address crownTokenAddress = vm.envOr("CROWN_TOKEN_ADDRESS", address(0));
        CrownToken crownToken;

        if (crownTokenAddress == address(0)) {
            console2.log("Deploying new CrownToken...");
            crownToken = new CrownToken();
            console2.log("CrownToken deployed at:", address(crownToken));
        } else {
            console2.log("Using existing CrownToken at:", crownTokenAddress);
            crownToken = CrownToken(crownTokenAddress);
        }

        // Deploy OutcomeToken
        console2.log("Deploying OutcomeToken...");
        OutcomeToken outcomeToken = new OutcomeToken();
        console2.log("OutcomeToken deployed at:", address(outcomeToken));

        // Deploy PredictionMarketAMM (with temporary zero oracle address)
        console2.log("Deploying PredictionMarketAMM...");
        PredictionMarketAMM market = new PredictionMarketAMM(
            address(crownToken),
            address(outcomeToken),
            address(0) // Will set oracle later
        );
        console2.log("PredictionMarketAMM deployed at:", address(market));

        // Deploy ZeroGOracle
        console2.log("Deploying ZeroGOracle...");
        ZeroGOracle oracle = new ZeroGOracle(address(market));
        console2.log("ZeroGOracle deployed at:", address(oracle));

        // Configure contracts
        console2.log("Configuring contracts...");

        // Set market in outcome token
        outcomeToken.setMarketContract(address(market));
        console2.log("OutcomeToken market contract set");

        // Set oracle in market
        market.setOracle(address(oracle));
        console2.log("Market oracle set");

        // Register AI provider if specified
        address aiProviderAddress = vm.envOr("AI_PROVIDER_ADDRESS", address(0));
        if (aiProviderAddress != address(0)) {
            oracle.registerAIProvider(aiProviderAddress, "0G-AI-Oracle");
            console2.log("AI Provider registered:", aiProviderAddress);
        }

        vm.stopBroadcast();

        // Print deployment summary
        console2.log("\n========== DEPLOYMENT SUMMARY ==========");
        console2.log("Network: Flow Testnet (Chain ID: 545)");
        console2.log("----------------------------------------");
        console2.log("CrownToken:          ", address(crownToken));
        console2.log("OutcomeToken:        ", address(outcomeToken));
        console2.log("PredictionMarketAMM: ", address(market));
        console2.log("ZeroGOracle:         ", address(oracle));
        console2.log("========================================\n");

        // Print environment variables to update
        console2.log("Add to frontend/.env.local:");
        console2.log("NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=", address(market));
        console2.log("NEXT_PUBLIC_OUTCOME_TOKEN_ADDRESS=", address(outcomeToken));
        console2.log("NEXT_PUBLIC_ZEROG_ORACLE_ADDRESS=", address(oracle));
    }
}

/**
 * @title DeployPredictionMarketOnly
 * @notice Deploy only prediction market (when CrownToken already exists)
 */
contract DeployPredictionMarketOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address crownTokenAddress = vm.envAddress("CROWN_TOKEN_ADDRESS");

        require(crownTokenAddress != address(0), "CROWN_TOKEN_ADDRESS required");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy OutcomeToken
        OutcomeToken outcomeToken = new OutcomeToken();
        console2.log("OutcomeToken:", address(outcomeToken));

        // Deploy PredictionMarketAMM
        PredictionMarketAMM market = new PredictionMarketAMM(
            crownTokenAddress,
            address(outcomeToken),
            address(0)
        );
        console2.log("PredictionMarketAMM:", address(market));

        // Deploy ZeroGOracle
        ZeroGOracle oracle = new ZeroGOracle(address(market));
        console2.log("ZeroGOracle:", address(oracle));

        // Configure
        outcomeToken.setMarketContract(address(market));
        market.setOracle(address(oracle));

        vm.stopBroadcast();
    }
}
