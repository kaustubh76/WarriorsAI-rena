// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HighYieldPool} from "../src/pools/HighYieldPool.sol";
import {StablePool} from "../src/pools/StablePool.sol";
import {LPPool} from "../src/pools/LPPool.sol";
import {StrategyVault} from "../src/StrategyVault.sol";

/**
 * @title DeployVault
 * @notice Deploy the 3 DeFi pools + StrategyVault to Flow Testnet
 *
 * Usage:
 * forge script script/DeployVault.s.sol:DeployVault \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast -vvvv
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY
 *   CROWN_TOKEN_ADDRESS (0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6)
 *   WARRIORS_NFT_ADDRESS (0x89f44bEefa27eC5199ddeB8fD16158d94296ED39)
 */
contract DeployVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address crownToken = vm.envAddress("CROWN_TOKEN_ADDRESS");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT_ADDRESS");

        console2.log("Deployer:", deployer);
        console2.log("CrownToken:", crownToken);
        console2.log("WarriorsNFT:", warriorsNFT);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy pools
        HighYieldPool highYield = new HighYieldPool(crownToken);
        console2.log("HighYieldPool deployed at:", address(highYield));

        StablePool stable = new StablePool(crownToken);
        console2.log("StablePool deployed at:", address(stable));

        LPPool lp = new LPPool(crownToken);
        console2.log("LPPool deployed at:", address(lp));

        // 2. Deploy vault
        StrategyVault vault = new StrategyVault(
            crownToken,
            warriorsNFT,
            address(highYield),
            address(stable),
            address(lp)
        );
        console2.log("StrategyVault deployed at:", address(vault));

        vm.stopBroadcast();

        console2.log("\n=== Add to .env ===");
        console2.log("NEXT_PUBLIC_HIGH_YIELD_POOL_ADDRESS=", address(highYield));
        console2.log("NEXT_PUBLIC_STABLE_POOL_ADDRESS=", address(stable));
        console2.log("NEXT_PUBLIC_LP_POOL_ADDRESS=", address(lp));
        console2.log("NEXT_PUBLIC_STRATEGY_VAULT_ADDRESS=", address(vault));
    }
}
