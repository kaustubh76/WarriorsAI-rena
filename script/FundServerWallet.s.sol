// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ICrownToken} from "../src/Interfaces/ICrownToken.sol";

/**
 * @title FundServerWallet
 * @notice Script to fund the server wallet with CRwN tokens for agent trading
 * @dev Uses the bonding curve mint (1 FLOW = 1 CRwN)
 *
 * Prerequisites:
 * 1. Server wallet must have FLOW from testnet faucet: https://testnet-faucet.onflow.org/
 * 2. Enter address: 0x5a6472782a098230e04A891a78BeEE1b7d48E90c
 *
 * Run command:
 * DEPLOYER_PRIVATE_KEY=0xc6354f2a405a24b97b0afefd1374d1ba490f3db8944217f8d53387cc9fdecaa2 \
 * forge script script/FundServerWallet.s.sol:FundServerWallet \
 * --rpc-url https://testnet.evm.nodes.onflow.org \
 * --broadcast -vvvv
 */
contract FundServerWallet is Script {
    // CRwN Token on Flow Testnet (Chain 545)
    address constant CROWN_TOKEN = 0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6;

    function run() external {
        // Amount to mint (1 FLOW = 1 CRwN via bonding curve)
        uint256 mintAmount = 100 ether; // 100 CRwN

        // Get deployer info
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Fund Server Wallet ===");
        console2.log("Wallet:", deployer);

        // Check current balances
        ICrownToken crown = ICrownToken(CROWN_TOKEN);
        uint256 flowBalance = deployer.balance;
        uint256 crwnBalance = crown.balanceOf(deployer);

        console2.log("");
        console2.log("Current Balances:");
        console2.log("  FLOW:", flowBalance / 1e18, "FLOW");
        console2.log("  CRwN:", crwnBalance / 1e18, "CRwN");

        // Check if we have enough FLOW
        if (flowBalance < mintAmount) {
            console2.log("");
            console2.log("ERROR: Insufficient FLOW balance!");
            console2.log("  Need:", mintAmount / 1e18, "FLOW");
            console2.log("  Have:", flowBalance / 1e18, "FLOW");
            console2.log("");
            console2.log("Get FLOW from faucet: https://testnet-faucet.onflow.org/");
            console2.log("Enter address:", deployer);
            return;
        }

        // Start broadcast
        vm.startBroadcast(deployerPrivateKey);

        // Mint CRwN by sending FLOW (1:1 bonding curve)
        console2.log("");
        console2.log("Minting", mintAmount / 1e18, "CRwN...");
        crown.mint{value: mintAmount}(mintAmount);

        vm.stopBroadcast();

        // Show new balance
        uint256 newCrwnBalance = crown.balanceOf(deployer);
        uint256 newFlowBalance = deployer.balance;

        console2.log("");
        console2.log("=== SUCCESS ===");
        console2.log("New Balances:");
        console2.log("  FLOW:", newFlowBalance / 1e18, "FLOW");
        console2.log("  CRwN:", newCrwnBalance / 1e18, "CRwN");
        console2.log("");
        console2.log("Server wallet is now funded for agent trading!");
    }
}
