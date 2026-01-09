// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";
import {AIAgentRegistry} from "../src/AIAgentRegistry.sol";
import {MicroMarketFactory} from "../src/MicroMarketFactory.sol";
import {CreatorRevenueShare} from "../src/CreatorRevenueShare.sol";
import {AIDebateOracle} from "../src/AIDebateOracle.sol";
import {ZeroGOracle} from "../src/ZeroGOracle.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {CrownToken} from "../src/CrownToken.sol";

/**
 * @title DeployAINative
 * @notice Deploy the AI-Native Gaming Prediction Market contracts to Flow Testnet
 *
 * Usage:
 * DEPLOYER_PRIVATE_KEY=0xd15ba7076d9bc4d05135c6d9c22e20af053ba2b0d66f0b944ce5d66a8b3c8141 \
 * CROWN_TOKEN_ADDRESS=0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6 \
 * forge script script/DeployAINative.s.sol:DeployAINative \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast \
 *   -vvvv
 */
contract DeployAINative is Script {
    // Existing contracts on Flow Testnet (Chain ID: 545)
    address constant CROWN_TOKEN = 0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6;

    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("========== DEPLOYMENT START ==========");
        console2.log("Deployer address:", deployer);
        console2.log("Deployer balance:", deployer.balance / 1e18, "FLOW");
        console2.log("Using CrownToken at:", CROWN_TOKEN);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy OutcomeToken first
        console2.log("\n[1/7] Deploying OutcomeToken...");
        OutcomeToken outcomeToken = new OutcomeToken();
        console2.log("OutcomeToken deployed at:", address(outcomeToken));

        // 2. Deploy AIAgentRegistry
        console2.log("\n[2/7] Deploying AIAgentRegistry...");
        AIAgentRegistry aiAgentRegistry = new AIAgentRegistry(CROWN_TOKEN);
        console2.log("AIAgentRegistry deployed at:", address(aiAgentRegistry));

        // 3. Deploy CreatorRevenueShare
        console2.log("\n[3/7] Deploying CreatorRevenueShare...");
        CreatorRevenueShare creatorRevenue = new CreatorRevenueShare(CROWN_TOKEN);
        console2.log("CreatorRevenueShare deployed at:", address(creatorRevenue));

        // 4. Deploy PredictionMarketAMM (with temporary zero oracle)
        console2.log("\n[4/7] Deploying PredictionMarketAMM...");
        PredictionMarketAMM predictionMarket = new PredictionMarketAMM(
            CROWN_TOKEN,
            address(outcomeToken),
            address(0) // Will set oracle after deployment
        );
        console2.log("PredictionMarketAMM deployed at:", address(predictionMarket));

        // 5. Deploy ZeroGOracle
        console2.log("\n[5/7] Deploying ZeroGOracle...");
        ZeroGOracle zeroGOracle = new ZeroGOracle(address(predictionMarket));
        console2.log("ZeroGOracle deployed at:", address(zeroGOracle));

        // 6. Deploy AIDebateOracle
        console2.log("\n[6/7] Deploying AIDebateOracle...");
        AIDebateOracle aiDebateOracle = new AIDebateOracle(CROWN_TOKEN);
        console2.log("AIDebateOracle deployed at:", address(aiDebateOracle));

        // 7. Deploy MicroMarketFactory
        console2.log("\n[7/7] Deploying MicroMarketFactory...");
        MicroMarketFactory microMarketFactory = new MicroMarketFactory(
            CROWN_TOKEN,
            address(0) // Arena address - set later
        );
        console2.log("MicroMarketFactory deployed at:", address(microMarketFactory));

        // Configure contracts
        console2.log("\n========== CONFIGURING CONTRACTS ==========");

        // Set market contract in outcome token
        outcomeToken.setMarketContract(address(predictionMarket));
        console2.log("OutcomeToken: market contract set");

        // Set oracle in prediction market
        predictionMarket.setOracle(address(zeroGOracle));
        console2.log("PredictionMarketAMM: oracle set");

        // Set AI agent registry in prediction market (if method exists)
        // predictionMarket.setAIAgentRegistry(address(aiAgentRegistry));
        // console2.log("PredictionMarketAMM: AI agent registry set");

        // Set creator revenue share in prediction market (if method exists)
        // predictionMarket.setCreatorRevenueShare(address(creatorRevenue));
        // console2.log("PredictionMarketAMM: creator revenue share set");

        // Set debate oracle in ZeroGOracle
        zeroGOracle.setAIDebateOracle(address(aiDebateOracle));
        console2.log("ZeroGOracle: debate oracle set");

        // Register AI providers
        address aiProvider = deployer; // Use deployer as initial AI provider
        zeroGOracle.registerAIProvider(aiProvider, "Warriors-AI-Oracle");
        console2.log("ZeroGOracle: AI provider registered:", aiProvider);

        vm.stopBroadcast();

        // Print deployment summary
        console2.log("\n========================================");
        console2.log("     DEPLOYMENT SUMMARY (Flow Testnet)");
        console2.log("========================================");
        console2.log("Chain ID: 545");
        console2.log("----------------------------------------");
        console2.log("CrownToken (existing):   ", CROWN_TOKEN);
        console2.log("OutcomeToken:            ", address(outcomeToken));
        console2.log("AIAgentRegistry:         ", address(aiAgentRegistry));
        console2.log("CreatorRevenueShare:     ", address(creatorRevenue));
        console2.log("PredictionMarketAMM:     ", address(predictionMarket));
        console2.log("ZeroGOracle:             ", address(zeroGOracle));
        console2.log("AIDebateOracle:          ", address(aiDebateOracle));
        console2.log("MicroMarketFactory:      ", address(microMarketFactory));
        console2.log("========================================\n");

        // Print update instructions
        console2.log("Update frontend/src/constants.ts with:");
        console2.log("----------------------------------------");
        console2.log("545: {");
        console2.log('  crownToken: "', CROWN_TOKEN, '",');
        console2.log('  aiAgentRegistry: "', address(aiAgentRegistry), '",');
        console2.log('  microMarketFactory: "', address(microMarketFactory), '",');
        console2.log('  aiDebateOracle: "', address(aiDebateOracle), '",');
        console2.log('  creatorRevenueShare: "', address(creatorRevenue), '",');
        console2.log('  predictionMarketAMM: "', address(predictionMarket), '",');
        console2.log("}");
    }
}
