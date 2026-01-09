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
 * @title Deploy0GTestnet
 * @notice Deploy the AI-Native Gaming Prediction Market contracts to 0G Galileo Testnet
 * @dev 0G Galileo Testnet - Chain ID: 16602
 *
 * Usage:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * forge script script/Deploy0GTestnet.s.sol:Deploy0GTestnet \
 *   --rpc-url https://evmrpc-testnet.0g.ai \
 *   --broadcast \
 *   -vvvv
 *
 * With verification:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * BLOCKSCOUT_API_KEY="" \
 * forge script script/Deploy0GTestnet.s.sol:Deploy0GTestnet \
 *   --rpc-url https://evmrpc-testnet.0g.ai \
 *   --broadcast \
 *   --verify \
 *   --verifier blockscout \
 *   --verifier-url https://chainscan-galileo.0g.ai/api \
 *   -vvvv
 */
contract Deploy0GTestnet is Script {
    // 0G Galileo Testnet Chain ID
    uint256 constant CHAIN_ID = 16602;

    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("========================================");
        console2.log("  Warriors AI-rena: 0G Testnet Deploy");
        console2.log("========================================");
        console2.log("Network: 0G Galileo Testnet");
        console2.log("Chain ID:", CHAIN_ID);
        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance / 1e18, "A0GI");

        require(block.chainid == CHAIN_ID, "Wrong network! Use 0G Testnet RPC");
        require(deployer.balance > 0.1 ether, "Insufficient balance for deployment");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy CrownToken (game currency)
        console2.log("\n[1/8] Deploying CrownToken...");
        CrownToken crownToken = new CrownToken();
        console2.log("CrownToken deployed at:", address(crownToken));

        // 2. Deploy OutcomeToken
        console2.log("\n[2/8] Deploying OutcomeToken...");
        OutcomeToken outcomeToken = new OutcomeToken();
        console2.log("OutcomeToken deployed at:", address(outcomeToken));

        // 3. Deploy AIAgentRegistry
        console2.log("\n[3/8] Deploying AIAgentRegistry...");
        AIAgentRegistry aiAgentRegistry = new AIAgentRegistry(address(crownToken));
        console2.log("AIAgentRegistry deployed at:", address(aiAgentRegistry));

        // 4. Deploy CreatorRevenueShare
        console2.log("\n[4/8] Deploying CreatorRevenueShare...");
        CreatorRevenueShare creatorRevenue = new CreatorRevenueShare(address(crownToken));
        console2.log("CreatorRevenueShare deployed at:", address(creatorRevenue));

        // 5. Deploy PredictionMarketAMM
        console2.log("\n[5/8] Deploying PredictionMarketAMM...");
        PredictionMarketAMM predictionMarket = new PredictionMarketAMM(
            address(crownToken),
            address(outcomeToken),
            address(0) // Will set oracle after deployment
        );
        console2.log("PredictionMarketAMM deployed at:", address(predictionMarket));

        // 6. Deploy ZeroGOracle
        console2.log("\n[6/8] Deploying ZeroGOracle...");
        ZeroGOracle zeroGOracle = new ZeroGOracle(address(predictionMarket));
        console2.log("ZeroGOracle deployed at:", address(zeroGOracle));

        // 7. Deploy AIDebateOracle
        console2.log("\n[7/8] Deploying AIDebateOracle...");
        AIDebateOracle aiDebateOracle = new AIDebateOracle(address(crownToken));
        console2.log("AIDebateOracle deployed at:", address(aiDebateOracle));

        // 8. Deploy MicroMarketFactory
        console2.log("\n[8/8] Deploying MicroMarketFactory...");
        MicroMarketFactory microMarketFactory = new MicroMarketFactory(
            address(crownToken),
            address(0) // Arena address - set later when Arena is deployed
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

        // Set debate oracle in ZeroGOracle
        zeroGOracle.setAIDebateOracle(address(aiDebateOracle));
        console2.log("ZeroGOracle: debate oracle set");

        // Register deployer as initial AI provider
        zeroGOracle.registerAIProvider(deployer, "Warriors-AI-Oracle-0G");
        console2.log("ZeroGOracle: AI provider registered:", deployer);

        // Note: CrownToken uses a bonding curve mint, deployer should mint via UI
        // or the mint function with payment
        console2.log("CrownToken: Ready for minting via bonding curve");

        vm.stopBroadcast();

        // Print deployment summary
        console2.log("\n================================================");
        console2.log("    DEPLOYMENT SUMMARY (0G Galileo Testnet)");
        console2.log("================================================");
        console2.log("Chain ID: 16602");
        console2.log("RPC: https://evmrpc-testnet.0g.ai");
        console2.log("Explorer: https://chainscan-galileo.0g.ai");
        console2.log("------------------------------------------------");
        console2.log("CrownToken:              ", address(crownToken));
        console2.log("OutcomeToken:            ", address(outcomeToken));
        console2.log("AIAgentRegistry:         ", address(aiAgentRegistry));
        console2.log("CreatorRevenueShare:     ", address(creatorRevenue));
        console2.log("PredictionMarketAMM:     ", address(predictionMarket));
        console2.log("ZeroGOracle:             ", address(zeroGOracle));
        console2.log("AIDebateOracle:          ", address(aiDebateOracle));
        console2.log("MicroMarketFactory:      ", address(microMarketFactory));
        console2.log("================================================\n");

        // Print frontend config update
        console2.log("Update frontend/src/constants.ts with:");
        console2.log("----------------------------------------");
        console2.log("16602: {");
        console2.log('  crownToken: "', address(crownToken), '",');
        console2.log('  outcomeToken: "', address(outcomeToken), '",');
        console2.log('  aiAgentRegistry: "', address(aiAgentRegistry), '",');
        console2.log('  microMarketFactory: "', address(microMarketFactory), '",');
        console2.log('  aiDebateOracle: "', address(aiDebateOracle), '",');
        console2.log('  creatorRevenueShare: "', address(creatorRevenue), '",');
        console2.log('  predictionMarketAMM: "', address(predictionMarket), '",');
        console2.log('  zeroGOracle: "', address(zeroGOracle), '",');
        console2.log("},");
    }
}
