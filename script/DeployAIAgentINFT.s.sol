// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AIAgentINFT} from "../src/AIAgentINFT.sol";
import {MockAgentINFTOracle} from "../src/mocks/MockAgentINFTOracle.sol";
import {CrownToken} from "../src/CrownToken.sol";

/**
 * @title DeployAIAgentINFT
 * @notice Deploy the ERC-7857 AI Agent iNFT contracts to 0G Galileo Testnet
 * @dev Deploys MockAgentINFTOracle and AIAgentINFT with encrypted metadata support
 *
 * Usage (with existing CrownToken):
 * DEPLOYER_PRIVATE_KEY=0x... \
 * CROWN_TOKEN=0x... \
 * forge script script/DeployAIAgentINFT.s.sol:DeployAIAgentINFT \
 *   --rpc-url https://evmrpc-testnet.0g.ai \
 *   --broadcast \
 *   -vvvv
 *
 * With verification:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * CROWN_TOKEN=0x... \
 * BLOCKSCOUT_API_KEY="" \
 * forge script script/DeployAIAgentINFT.s.sol:DeployAIAgentINFT \
 *   --rpc-url https://evmrpc-testnet.0g.ai \
 *   --broadcast \
 *   --verify \
 *   --verifier blockscout \
 *   --verifier-url https://chainscan-galileo.0g.ai/api \
 *   -vvvv
 */
contract DeployAIAgentINFT is Script {
    // 0G Galileo Testnet Chain ID
    uint256 constant CHAIN_ID = 16602;

    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Get CrownToken address (required)
        address crownTokenAddr = vm.envAddress("CROWN_TOKEN");

        console2.log("================================================");
        console2.log("  AI Agent iNFT (ERC-7857) Deployment");
        console2.log("================================================");
        console2.log("Network: 0G Galileo Testnet");
        console2.log("Chain ID:", CHAIN_ID);
        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance / 1e18, "A0GI");
        console2.log("CrownToken:", crownTokenAddr);

        require(block.chainid == CHAIN_ID, "Wrong network! Use 0G Testnet RPC");
        require(deployer.balance > 0.05 ether, "Insufficient balance for deployment");
        require(crownTokenAddr != address(0), "CROWN_TOKEN env var required");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockAgentINFTOracle (for testnet)
        console2.log("\n[1/2] Deploying MockAgentINFTOracle...");
        MockAgentINFTOracle oracle = new MockAgentINFTOracle();
        console2.log("MockAgentINFTOracle deployed at:", address(oracle));

        // Enable auto-approve for testing
        oracle.setAutoApprove(true);
        console2.log("MockAgentINFTOracle: auto-approve enabled");

        // 2. Deploy AIAgentINFT
        console2.log("\n[2/2] Deploying AIAgentINFT...");
        AIAgentINFT aiAgentINFT = new AIAgentINFT(
            crownTokenAddr,
            address(oracle)
        );
        console2.log("AIAgentINFT deployed at:", address(aiAgentINFT));

        // Configure oracle with iNFT contract
        oracle.setINFTContract(address(aiAgentINFT));
        console2.log("MockAgentINFTOracle: iNFT contract set");

        vm.stopBroadcast();

        // Print deployment summary
        console2.log("\n================================================");
        console2.log("    AI AGENT iNFT DEPLOYMENT SUMMARY");
        console2.log("================================================");
        console2.log("Chain ID: 16602 (0G Galileo Testnet)");
        console2.log("------------------------------------------------");
        console2.log("MockAgentINFTOracle:     ", address(oracle));
        console2.log("AIAgentINFT:             ", address(aiAgentINFT));
        console2.log("CrownToken (existing):   ", crownTokenAddr);
        console2.log("================================================\n");

        // Print frontend config update
        console2.log("Update frontend/src/constants.ts with:");
        console2.log("----------------------------------------");
        console2.log("// Add to CONTRACT_ADDRESSES[16602]:");
        console2.log('aiAgentINFT: "', address(aiAgentINFT), '",');
        console2.log('agentINFTOracle: "', address(oracle), '",');
        console2.log("");

        // Print verification commands
        console2.log("To verify contracts on Blockscout:");
        console2.log("----------------------------------------");
        console2.log("See deployment output for verification commands.");
        console2.log("Oracle address:", address(oracle));
        console2.log("AIAgentINFT address:", address(aiAgentINFT));
    }
}

/**
 * @title DeployAIAgentINFTFull
 * @notice Full deployment including new CrownToken (for fresh testnet deployment)
 */
contract DeployAIAgentINFTFull is Script {
    uint256 constant CHAIN_ID = 16602;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("================================================");
        console2.log("  AI Agent iNFT FULL Deployment (with CrownToken)");
        console2.log("================================================");
        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance / 1e18, "A0GI");

        require(block.chainid == CHAIN_ID, "Wrong network!");
        require(deployer.balance > 0.1 ether, "Insufficient balance");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy CrownToken
        console2.log("\n[1/3] Deploying CrownToken...");
        CrownToken crownToken = new CrownToken();
        console2.log("CrownToken deployed at:", address(crownToken));

        // 2. Deploy MockAgentINFTOracle
        console2.log("\n[2/3] Deploying MockAgentINFTOracle...");
        MockAgentINFTOracle oracle = new MockAgentINFTOracle();
        oracle.setAutoApprove(true);
        console2.log("MockAgentINFTOracle deployed at:", address(oracle));

        // 3. Deploy AIAgentINFT
        console2.log("\n[3/3] Deploying AIAgentINFT...");
        AIAgentINFT aiAgentINFT = new AIAgentINFT(
            address(crownToken),
            address(oracle)
        );
        console2.log("AIAgentINFT deployed at:", address(aiAgentINFT));

        // Configure
        oracle.setINFTContract(address(aiAgentINFT));

        vm.stopBroadcast();

        console2.log("\n================================================");
        console2.log("    FULL DEPLOYMENT SUMMARY");
        console2.log("================================================");
        console2.log("CrownToken:              ", address(crownToken));
        console2.log("MockAgentINFTOracle:     ", address(oracle));
        console2.log("AIAgentINFT:             ", address(aiAgentINFT));
        console2.log("================================================\n");
    }
}
