// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CrownToken} from "../src/CrownToken.sol";

/**
 * @title DeployCrownToken0G
 * @notice Deploy CrownToken to 0G Galileo Testnet
 */
contract DeployCrownToken0G is Script {
    uint256 constant CHAIN_ID = 16602;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("========================================");
        console2.log("  CrownToken Deployment to 0G Galileo");
        console2.log("========================================");
        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance / 1e18, "A0GI");

        require(block.chainid == CHAIN_ID, "Wrong network!");

        vm.startBroadcast(deployerPrivateKey);

        CrownToken crownToken = new CrownToken();
        console2.log("CrownToken deployed at:", address(crownToken));

        vm.stopBroadcast();

        console2.log("\n========================================");
        console2.log("  DEPLOYMENT SUMMARY");
        console2.log("========================================");
        console2.log("CrownToken:", address(crownToken));
        console2.log("========================================\n");

        console2.log("Now update AIAgentINFT to use this CrownToken address");
    }
}
