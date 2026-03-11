// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPool - Shared interface for DeFi strategy pools
 * @dev All pools (HighYield, Stable, LP) implement this interface.
 *      APY is in basis points (1800 = 18%). Balances are in CRwN wei.
 */
interface IPool {
    error Pool__InsufficientBalance();
    error Pool__InvalidAmount();
    error Pool__TransferFailed();

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event YieldClaimed(address indexed user, uint256 amount);
    event APYUpdated(uint256 oldAPY, uint256 newAPY);

    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claimYield() external returns (uint256);
    function getAPY() external view returns (uint256);
    function getBalance(address user) external view returns (uint256);
    function getPendingYield(address user) external view returns (uint256);
}
