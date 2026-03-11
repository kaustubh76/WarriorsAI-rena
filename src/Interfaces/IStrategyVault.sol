// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IStrategyVault - Interface for DeFi Strategy Vault
 * @dev Each Strategy NFT can have one active vault. The vault deposits CRwN
 *      across 3 pools based on AI-generated allocation from 0G.
 */
interface IStrategyVault {
    error StrategyVault__NotNFTOwner();
    error StrategyVault__VaultAlreadyActive();
    error StrategyVault__VaultNotActive();
    error StrategyVault__InvalidAllocation();
    error StrategyVault__InvalidAmount();
    error StrategyVault__TransferFailed();
    error StrategyVault__WithdrawFailed();

    struct VaultState {
        uint256 depositAmount;
        uint256[3] allocation; // [highYield, stable, lp] in basis points, sum = 10000
        bool active;
        address owner;
        uint256 createdAt;
        bytes32 aiProofHash;
    }

    event VaultCreated(uint256 indexed nftId, address indexed owner, uint256 amount, uint256[3] allocation);
    event VaultWithdrawn(uint256 indexed nftId, address indexed owner, uint256 totalWithdrawn);
    event VaultRebalanced(uint256 indexed nftId, uint256[3] newAllocation);

    function deposit(
        uint256 nftId,
        uint256 amount,
        uint256[3] calldata allocation,
        bytes32 aiProofHash
    ) external;

    function withdraw(uint256 nftId) external;

    function rebalance(uint256 nftId, uint256[3] calldata newAllocation) external;

    function getVaultState(uint256 nftId) external view returns (VaultState memory);

    function isVaultActive(uint256 nftId) external view returns (bool);
}
