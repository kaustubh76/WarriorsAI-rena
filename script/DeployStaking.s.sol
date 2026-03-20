// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CRwNStaking} from "../src/CRwNStaking.sol";
import {stCRwN} from "../src/stCRwN.sol";

/**
 * @title DeployStaking
 * @notice Deploy stCRwN + CRwNStaking to Flow Testnet
 *
 * Usage:
 * forge script script/DeployStaking.s.sol:DeployStaking \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast -vvvv
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY
 *   CROWN_TOKEN_ADDRESS
 *   WARRIORS_NFT_ADDRESS
 */
contract DeployStaking is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address crownToken = vm.envAddress("CROWN_TOKEN_ADDRESS");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT_ADDRESS");

        // Optional: fee source contracts to authorize
        address ammAddress = vm.envOr("PREDICTION_MARKET_AMM_ADDRESS", address(0));
        address battleManagerAddress = vm.envOr("BATTLE_MANAGER_ADDRESS", address(0));
        address microMarketAddress = vm.envOr("MICRO_MARKET_FACTORY_ADDRESS", address(0));

        console2.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy staking contract (receipt token set after)
        CRwNStaking staking = new CRwNStaking(crownToken, warriorsNFT);
        console2.log("CRwNStaking deployed at:", address(staking));

        // 2. Deploy stCRwN receipt token pointing to staking
        stCRwN receipt = new stCRwN(address(staking));
        console2.log("stCRwN deployed at:", address(receipt));

        // 3. Wire receipt token into staking contract
        staking.setReceiptToken(address(receipt));
        console2.log("Receipt token wired");

        // 4. Authorize fee source contracts
        if (ammAddress != address(0)) {
            staking.addFeeSource(ammAddress);
            console2.log("Fee source added: AMM", ammAddress);
        }
        if (battleManagerAddress != address(0)) {
            staking.addFeeSource(battleManagerAddress);
            console2.log("Fee source added: BattleManager", battleManagerAddress);
        }
        if (microMarketAddress != address(0)) {
            staking.addFeeSource(microMarketAddress);
            console2.log("Fee source added: MicroMarketFactory", microMarketAddress);
        }

        vm.stopBroadcast();

        console2.log("\n=== Add to .env ===");
        console2.log("NEXT_PUBLIC_STAKING_ADDRESS=", address(staking));
        console2.log("NEXT_PUBLIC_STCRWN_ADDRESS=", address(receipt));
        console2.log("\n=== Then call setStakingContract() on each fee source ===");
        console2.log("AMM.setStakingContract(", address(staking), ")");
        console2.log("BattleManager.setStakingContract(", address(staking), ")");
        console2.log("MicroMarketFactory.setStakingContract(", address(staking), ")");
    }
}
