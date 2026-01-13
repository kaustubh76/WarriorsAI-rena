// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ExternalMarketMirror} from "../src/ExternalMarketMirror.sol";
import {FlowVRFOracle} from "../src/FlowVRFOracle.sol";
import {CrownToken} from "../src/CrownToken.sol";

/**
 * @title DeployExternalMarketMirror
 * @notice Deploy the External Market Mirror system to Flow Testnet
 * @dev This deploys contracts for mirroring Polymarket/Kalshi markets on Flow
 *
 * Usage:
 * forge script script/DeployExternalMarketMirror.s.sol:DeployExternalMarketMirror \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast \
 *   --verify \
 *   -vvvv
 *
 * Required Environment Variables:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment
 *   CROWN_TOKEN_ADDRESS - Existing CrownToken address
 *   PREDICTION_MARKET_ADDRESS - Existing PredictionMarketAMM address
 *   ORACLE_SIGNER_ADDRESS - Address authorized to sign oracle updates (optional, defaults to deployer)
 *   VRF_FULFILLER_ADDRESS - Address authorized to fulfill VRF requests (optional, defaults to deployer)
 */
contract DeployExternalMarketMirror is Script {
    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("========== DEPLOYMENT CONFIG ==========");
        console2.log("Deployer address:", deployer);
        console2.log("Deployer balance:", deployer.balance);

        // Get required addresses
        address crownTokenAddress = vm.envAddress("CROWN_TOKEN_ADDRESS");
        address predictionMarketAddress = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        address oracleSigner = vm.envOr("ORACLE_SIGNER_ADDRESS", deployer);
        address vrfFulfiller = vm.envOr("VRF_FULFILLER_ADDRESS", deployer);

        console2.log("CrownToken address:", crownTokenAddress);
        console2.log("PredictionMarket address:", predictionMarketAddress);
        console2.log("Oracle signer:", oracleSigner);
        console2.log("VRF fulfiller:", vrfFulfiller);
        console2.log("========================================\n");

        require(crownTokenAddress != address(0), "CROWN_TOKEN_ADDRESS required");
        require(predictionMarketAddress != address(0), "PREDICTION_MARKET_ADDRESS required");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy FlowVRFOracle
        console2.log("Deploying FlowVRFOracle...");
        FlowVRFOracle vrfOracle = new FlowVRFOracle(vrfFulfiller);
        console2.log("FlowVRFOracle deployed at:", address(vrfOracle));

        // 2. Deploy ExternalMarketMirror
        console2.log("Deploying ExternalMarketMirror...");
        ExternalMarketMirror mirror = new ExternalMarketMirror(
            crownTokenAddress,
            predictionMarketAddress,
            address(vrfOracle),
            oracleSigner
        );
        console2.log("ExternalMarketMirror deployed at:", address(mirror));

        vm.stopBroadcast();

        // Print deployment summary
        console2.log("\n========== DEPLOYMENT SUMMARY ==========");
        console2.log("Network: Flow Testnet (Chain ID: 545)");
        console2.log("----------------------------------------");
        console2.log("FlowVRFOracle:        ", address(vrfOracle));
        console2.log("ExternalMarketMirror: ", address(mirror));
        console2.log("========================================\n");

        // Print environment variables to update
        console2.log("Add to frontend/.env.local:");
        console2.log("NEXT_PUBLIC_FLOW_VRF_ORACLE_ADDRESS=", address(vrfOracle));
        console2.log("NEXT_PUBLIC_EXTERNAL_MARKET_MIRROR_ADDRESS=", address(mirror));
        console2.log("");
        console2.log("Add to backend .env:");
        console2.log("FLOW_VRF_ORACLE_ADDRESS=", address(vrfOracle));
        console2.log("EXTERNAL_MARKET_MIRROR_ADDRESS=", address(mirror));
    }
}

/**
 * @title DeployFlowVRFOracleOnly
 * @notice Deploy only the FlowVRFOracle (useful for upgrades)
 */
contract DeployFlowVRFOracleOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address vrfFulfiller = vm.envOr("VRF_FULFILLER_ADDRESS", deployer);

        console2.log("Deploying FlowVRFOracle...");
        console2.log("Fulfiller:", vrfFulfiller);

        vm.startBroadcast(deployerPrivateKey);

        FlowVRFOracle vrfOracle = new FlowVRFOracle(vrfFulfiller);
        console2.log("FlowVRFOracle deployed at:", address(vrfOracle));

        vm.stopBroadcast();
    }
}

/**
 * @title DeployExternalMarketMirrorOnly
 * @notice Deploy only ExternalMarketMirror (when VRF Oracle exists)
 */
contract DeployExternalMarketMirrorOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address crownTokenAddress = vm.envAddress("CROWN_TOKEN_ADDRESS");
        address predictionMarketAddress = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        address vrfOracleAddress = vm.envAddress("FLOW_VRF_ORACLE_ADDRESS");
        address oracleSigner = vm.envOr("ORACLE_SIGNER_ADDRESS", deployer);

        require(crownTokenAddress != address(0), "CROWN_TOKEN_ADDRESS required");
        require(predictionMarketAddress != address(0), "PREDICTION_MARKET_ADDRESS required");
        require(vrfOracleAddress != address(0), "FLOW_VRF_ORACLE_ADDRESS required");

        console2.log("Deploying ExternalMarketMirror...");
        console2.log("CrownToken:", crownTokenAddress);
        console2.log("PredictionMarket:", predictionMarketAddress);
        console2.log("VRF Oracle:", vrfOracleAddress);
        console2.log("Oracle Signer:", oracleSigner);

        vm.startBroadcast(deployerPrivateKey);

        ExternalMarketMirror mirror = new ExternalMarketMirror(
            crownTokenAddress,
            predictionMarketAddress,
            vrfOracleAddress,
            oracleSigner
        );
        console2.log("ExternalMarketMirror deployed at:", address(mirror));

        vm.stopBroadcast();
    }
}

/**
 * @title ConfigureExternalMarketMirror
 * @notice Configure an existing ExternalMarketMirror deployment
 */
contract ConfigureExternalMarketMirror is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address mirrorAddress = vm.envAddress("EXTERNAL_MARKET_MIRROR_ADDRESS");

        require(mirrorAddress != address(0), "EXTERNAL_MARKET_MIRROR_ADDRESS required");

        ExternalMarketMirror mirror = ExternalMarketMirror(mirrorAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Update oracle if specified
        address newOracle = vm.envOr("NEW_ORACLE_ADDRESS", address(0));
        if (newOracle != address(0)) {
            mirror.setOracle(newOracle);
            console2.log("Oracle updated to:", newOracle);
        }

        vm.stopBroadcast();

        console2.log("Configuration complete!");
    }
}
