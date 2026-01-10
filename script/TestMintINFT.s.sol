// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AIAgentINFT} from "../src/AIAgentINFT.sol";
import {CrownToken} from "../src/CrownToken.sol";

/**
 * @title TestMintINFT
 * @notice Test script for minting an AI Agent iNFT on 0G Galileo Testnet
 *
 * Usage:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * forge script script/TestMintINFT.s.sol:TestMintINFT \
 *   --rpc-url https://evmrpc-testnet.0g.ai \
 *   --broadcast \
 *   -vvvv
 */
contract TestMintINFT is Script {
    // Deployed contract addresses on 0G Galileo Testnet (1 token min stake version)
    address constant AI_AGENT_INFT = 0x7C8484a8082b9E922b594D0Be2f82b4425B65E05;
    address constant CROWN_TOKEN = 0xC13f60749ECfCDE5f79689dd2E5A361E9210f153; // CrownToken on 0G testnet

    uint256 constant CHAIN_ID = 16602;
    uint256 constant MIN_STAKE = 1 ether; // Testnet: 1 token minimum

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("========================================");
        console2.log("  Test iNFT Minting on 0G Galileo");
        console2.log("========================================");
        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);

        require(block.chainid == CHAIN_ID, "Wrong network!");

        AIAgentINFT aiAgentINFT = AIAgentINFT(AI_AGENT_INFT);
        CrownToken crownToken = CrownToken(CROWN_TOKEN);

        // Check balances
        uint256 ethBalance = deployer.balance;
        uint256 crownBalance = crownToken.balanceOf(deployer);

        console2.log("ETH Balance:", ethBalance / 1e18, "A0GI");
        console2.log("CRwN Balance:", crownBalance / 1e18, "CRwN");
        console2.log("Current iNFT Supply:", aiAgentINFT.totalSupply());

        vm.startBroadcast(deployerPrivateKey);

        // If no CRwN, mint some first
        if (crownBalance < MIN_STAKE) {
            console2.log("\n[1/3] Minting CRwN tokens...");
            uint256 mintAmount = MIN_STAKE;
            crownToken.mint{value: mintAmount}(mintAmount);
            console2.log("Minted:", mintAmount / 1e18, "CRwN");
            crownBalance = crownToken.balanceOf(deployer);
        } else {
            console2.log("\n[1/3] CRwN balance sufficient, skipping mint");
        }

        // Approve CrownToken spend
        console2.log("\n[2/3] Approving CRwN for iNFT contract...");
        crownToken.approve(AI_AGENT_INFT, MIN_STAKE);
        console2.log("Approved:", MIN_STAKE / 1e18, "CRwN");

        // Mint iNFT
        console2.log("\n[3/3] Minting AI Agent iNFT...");
        string memory encryptedRef = "0g://test-encrypted-metadata-ref-v1";
        bytes32 metadataHash = keccak256(abi.encodePacked("TestAgent-", block.timestamp));

        uint256 tokenId = aiAgentINFT.mint(
            encryptedRef,
            metadataHash,
            MIN_STAKE,
            true // Enable copy trading
        );

        vm.stopBroadcast();

        console2.log("\n========================================");
        console2.log("    iNFT MINTING SUCCESSFUL!");
        console2.log("========================================");
        console2.log("Token ID:", tokenId);
        console2.log("Owner:", aiAgentINFT.ownerOf(tokenId));
        console2.log("Staked:", aiAgentINFT.getAgentStake(tokenId) / 1e18, "CRwN");
        console2.log("Copy Trading:", aiAgentINFT.isCopyTradingEnabled(tokenId));
        console2.log("Active:", aiAgentINFT.isAgentActive(tokenId));
        console2.log("Tier:", uint256(aiAgentINFT.getAgentTier(tokenId)));
        console2.log("Metadata Ref:", aiAgentINFT.getEncryptedMetadataRef(tokenId));
        console2.log("Total Supply:", aiAgentINFT.totalSupply());
        console2.log("========================================\n");
    }
}

/**
 * @title TestAgentOperations
 * @notice Test authorization and other operations on an existing iNFT
 */
contract TestAgentOperations is Script {
    address constant AI_AGENT_INFT = 0x7C8484a8082b9E922b594D0Be2f82b4425B65E05;
    uint256 constant CHAIN_ID = 16602;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 tokenId = vm.envOr("TOKEN_ID", uint256(1));

        console2.log("Testing operations on Token ID:", tokenId);

        AIAgentINFT aiAgentINFT = AIAgentINFT(AI_AGENT_INFT);

        require(block.chainid == CHAIN_ID, "Wrong network!");
        require(aiAgentINFT.ownerOf(tokenId) == deployer, "Not owner!");

        vm.startBroadcast(deployerPrivateKey);

        // Test authorization
        address testExecutor = address(0x1234567890123456789012345678901234567890);
        uint256 duration = 30 days;

        console2.log("\n[1/2] Authorizing executor...");
        aiAgentINFT.authorizeUsage(tokenId, testExecutor, duration);
        console2.log("Authorized:", testExecutor);

        bool isAuth = aiAgentINFT.isAuthorizedExecutor(tokenId, testExecutor);
        console2.log("Is authorized:", isAuth);

        // Test revoke
        console2.log("\n[2/2] Revoking authorization...");
        aiAgentINFT.revokeUsage(tokenId, testExecutor);

        isAuth = aiAgentINFT.isAuthorizedExecutor(tokenId, testExecutor);
        console2.log("Is authorized after revoke:", isAuth);

        vm.stopBroadcast();

        console2.log("\n========================================");
        console2.log("    OPERATIONS TEST COMPLETE!");
        console2.log("========================================");
    }
}
