// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StrategyVault} from "../src/StrategyVault.sol";

/**
 * @title RedeployVault
 * @notice Redeploy ONLY the StrategyVault, reusing existing pool contracts.
 *
 * Usage:
 * forge script script/RedeployVault.s.sol:RedeployVault \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast -vvvv
 */
contract RedeployVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address crownToken = vm.envAddress("CROWN_TOKEN_ADDRESS");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT_ADDRESS");
        address highYieldPool = vm.envAddress("NEXT_PUBLIC_HIGH_YIELD_POOL_ADDRESS");
        address stablePool = vm.envAddress("NEXT_PUBLIC_STABLE_POOL_ADDRESS");
        address lpPool = vm.envAddress("NEXT_PUBLIC_LP_POOL_ADDRESS");

        console2.log("Deployer:", deployer);
        console2.log("CrownToken:", crownToken);
        console2.log("WarriorsNFT:", warriorsNFT);
        console2.log("HighYieldPool:", highYieldPool);
        console2.log("StablePool:", stablePool);
        console2.log("LPPool:", lpPool);

        vm.startBroadcast(deployerPrivateKey);

        StrategyVault vault = new StrategyVault(
            crownToken,
            warriorsNFT,
            highYieldPool,
            stablePool,
            lpPool
        );
        console2.log("New StrategyVault deployed at:", address(vault));

        vm.stopBroadcast();

        console2.log("\n=== Update in .env.local ===");
        console2.log("NEXT_PUBLIC_STRATEGY_VAULT_ADDRESS=", address(vault));
    }
}
