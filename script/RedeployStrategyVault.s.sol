// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StrategyVault} from "../src/StrategyVault.sol";

/**
 * @title RedeployStrategyVault
 * @notice Redeploy StrategyVault pointing to the NEW WarriorsNFT contract.
 *         Reuses existing pool contracts (they don't reference WarriorsNFT).
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... forge script script/RedeployStrategyVault.s.sol:RedeployStrategyVault \
 *     --rpc-url https://testnet.evm.nodes.onflow.org \
 *     --broadcast
 */
contract RedeployStrategyVault is Script {
    // Existing contracts on Flow Testnet (unchanged)
    address constant CROWN_TOKEN    = 0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6;
    address constant WARRIORS_NFT   = 0x89f44bEefa27eC5199ddeB8fD16158d94296ED39; // NEW contract
    address constant HIGH_YIELD_POOL = 0x39d85759032fe730abaCDF7aAc403e8E8BB47cAb;
    address constant STABLE_POOL    = 0x14746b6F08e9512F755FbCC64e63f06397dA155F;
    address constant LP_POOL        = 0x89d5C59a281Da5BE624d3D592Ab9661B6B44451e;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deployer:", deployer);
        console2.log("CrownToken:", CROWN_TOKEN);
        console2.log("WarriorsNFT (NEW):", WARRIORS_NFT);

        vm.startBroadcast(deployerPrivateKey);

        StrategyVault vault = new StrategyVault(
            CROWN_TOKEN,
            WARRIORS_NFT,
            HIGH_YIELD_POOL,
            STABLE_POOL,
            LP_POOL
        );

        console2.log("StrategyVault deployed at:", address(vault));

        vm.stopBroadcast();

        console2.log("\n=== Update .env.local ===");
        console2.log("NEXT_PUBLIC_STRATEGY_VAULT_ADDRESS=", address(vault));
    }
}
