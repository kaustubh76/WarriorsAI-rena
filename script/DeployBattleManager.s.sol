// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StrategyBattleManager} from "../src/StrategyBattleManager.sol";

/**
 * @title DeployBattleManager
 * @notice Deploy the StrategyBattleManager to Flow Testnet
 *
 * Usage:
 * forge script script/DeployBattleManager.s.sol:DeployBattleManager \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast -vvvv
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY
 *   CROWN_TOKEN_ADDRESS   (0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6)
 *   WARRIORS_NFT_ADDRESS  (0x89f44bEefa27eC5199ddeB8fD16158d94296ED39)
 *   STRATEGY_VAULT_ADDRESS (0x1B1f207C391190d86b7fd8af7A291455e2d0cDAB)
 */
contract DeployBattleManager is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address crownToken = vm.envAddress("CROWN_TOKEN_ADDRESS");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT_ADDRESS");
        address strategyVault = vm.envAddress("STRATEGY_VAULT_ADDRESS");

        // Optional: wire resolver and staking after deploy
        address resolver = vm.envOr("RESOLVER_ADDRESS", deployer);
        address stakingAddress = vm.envOr("STAKING_ADDRESS", address(0));

        console2.log("Deployer:", deployer);
        console2.log("CrownToken:", crownToken);
        console2.log("WarriorsNFT:", warriorsNFT);
        console2.log("StrategyVault:", strategyVault);

        vm.startBroadcast(deployerPrivateKey);

        StrategyBattleManager battleManager = new StrategyBattleManager(
            crownToken,
            warriorsNFT,
            strategyVault
        );
        console2.log("StrategyBattleManager deployed at:", address(battleManager));

        // Wire resolver (defaults to deployer if not specified)
        battleManager.setResolver(resolver);
        console2.log("Resolver set to:", resolver);

        // Wire staking contract if provided
        if (stakingAddress != address(0)) {
            battleManager.setStakingContract(stakingAddress);
            console2.log("Staking contract wired:", stakingAddress);
        }

        vm.stopBroadcast();

        console2.log("\n=== Add to .env ===");
        console2.log("NEXT_PUBLIC_BATTLE_MANAGER_ADDRESS=", address(battleManager));
    }
}
