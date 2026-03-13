// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ICrownToken} from "../src/Interfaces/ICrownToken.sol";
import {IStrategyVault} from "../src/Interfaces/IStrategyVault.sol";
import {BasePool} from "../src/pools/BasePool.sol";

/**
 * @title SetupVaultTestnet
 * @notice Fund pool reserves + deposit CRwN for NFT#1 and NFT#2 into the new vault
 *
 * Usage:
 * forge script script/SetupVaultTestnet.s.sol:SetupVaultTestnet \
 *   --rpc-url https://testnet.evm.nodes.onflow.org \
 *   --broadcast -vvvv
 */
contract SetupVaultTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        ICrownToken crownToken = ICrownToken(0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6);
        BasePool highYieldPool = BasePool(0x39d85759032fe730abaCDF7aAc403e8E8BB47cAb);
        BasePool stablePool = BasePool(0x14746b6F08e9512F755FbCC64e63f06397dA155F);
        BasePool lpPool = BasePool(0x89d5C59a281Da5BE624d3D592Ab9661B6B44451e);
        IStrategyVault oldVault = IStrategyVault(0x40A0618897A09bDbE508A2c99E0d731dA261abA7);
        IStrategyVault vault = IStrategyVault(0xD7CbEC2D198357213b434E6b61CC4f80BB0feaCF);

        uint256 reserveAmount = 500 ether; // 500 CRwN per pool reserve
        uint256 depositAmount = 100 ether;  // 100 CRwN per NFT vault

        console2.log("Deployer:", deployer);
        console2.log("CRwN balance:", crownToken.balanceOf(deployer));

        vm.startBroadcast(deployerPrivateKey);

        // 0. Withdraw from old vault (if active)
        if (oldVault.isVaultActive(1)) {
            oldVault.withdraw(1);
            console2.log("Withdrew NFT#1 from old vault");
        }
        if (oldVault.isVaultActive(2)) {
            oldVault.withdraw(2);
            console2.log("Withdrew NFT#2 from old vault");
        }
        console2.log("CRwN balance after withdrawals:", crownToken.balanceOf(deployer));

        // 1. Fund pool reserves (so pools can pay out yield)
        crownToken.approve(address(highYieldPool), reserveAmount);
        highYieldPool.fundReserve(reserveAmount);
        console2.log("Funded HighYieldPool reserve:", reserveAmount);

        crownToken.approve(address(stablePool), reserveAmount);
        stablePool.fundReserve(reserveAmount);
        console2.log("Funded StablePool reserve:", reserveAmount);

        crownToken.approve(address(lpPool), reserveAmount);
        lpPool.fundReserve(reserveAmount);
        console2.log("Funded LPPool reserve:", reserveAmount);

        // 2. Deposit 100 CRwN for NFT#1
        uint256[3] memory alloc1 = [uint256(3800), uint256(3300), uint256(2900)];
        crownToken.approve(address(vault), depositAmount);
        vault.deposit(1, depositAmount, alloc1, bytes32(0));
        console2.log("Deposited 100 CRwN for NFT#1");

        // 3. Deposit 100 CRwN for NFT#2
        uint256[3] memory alloc2 = [uint256(4200), uint256(2800), uint256(3000)];
        crownToken.approve(address(vault), depositAmount);
        vault.deposit(2, depositAmount, alloc2, bytes32(0));
        console2.log("Deposited 100 CRwN for NFT#2");

        vm.stopBroadcast();

        console2.log("\n=== Setup Complete ===");
        console2.log("Pool reserves: 500 CRwN each");
        console2.log("NFT#1 vault: 100 CRwN");
        console2.log("NFT#2 vault: 100 CRwN");
    }
}
