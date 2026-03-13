// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";

/**
 * @notice Deploy WarriorsNFT with correct i_AiPublicKey
 *
 * Constructor args:
 *   _dao:          deployer address (can manage contract)
 *   _AiPublicKey:  address derived from GAME_MASTER_PRIVATE_KEY (signs traits)
 *   _oracle:       mock oracle address
 *
 * Usage:
 *   forge script script/DeployWarriorsNFT.s.sol:DeployWarriorsNFT \
 *     --rpc-url https://testnet.evm.nodes.onflow.org \
 *     --private-key <DEPLOYER_PRIVATE_KEY> \
 *     --broadcast
 */
contract DeployWarriorsNFT is Script {
    function run() external {
        // Deployer = msg.sender from --private-key
        // Game Master (signer) address — must match GAME_MASTER_PRIVATE_KEY in .env.local
        address gameMaster = vm.envAddress("GAME_MASTER_ADDRESS");
        address oracle = vm.envAddress("ORACLE_ADDRESS");

        vm.startBroadcast();

        WarriorsNFT warriors = new WarriorsNFT(
            msg.sender,     // _dao
            gameMaster,      // _AiPublicKey — the address that signs traits
            oracle           // _oracle
        );

        console2.log("WarriorsNFT deployed at:", address(warriors));
        console2.log("DAO (deployer):", msg.sender);
        console2.log("i_AiPublicKey (Game Master):", gameMaster);
        console2.log("Oracle:", oracle);

        vm.stopBroadcast();
    }
}
