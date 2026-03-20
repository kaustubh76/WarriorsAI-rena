// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICRwNStaking
 * @notice Interface for the CRwN staking contract. Fee sources call distributeFees().
 */
interface ICRwNStaking {
    error Staking__InvalidAmount();
    error Staking__NoUnstakeRequest();
    error Staking__CooldownNotMet();
    error Staking__TransferFailed();
    error Staking__NotWarriorOwner();
    error Staking__WarriorAlreadyStaked();
    error Staking__NoWarriorStaked();
    error Staking__Unauthorized();

    event Staked(address indexed user, uint256 crwnAmount, uint256 stCrwnMinted);
    event UnstakeRequested(address indexed user, uint256 stCrwnAmount, uint256 crwnAmount, uint256 unlockTime);
    event UnstakeCompleted(address indexed user, uint256 crwnAmount);
    event FeesDistributed(address indexed source, uint256 amount);
    event WarriorStaked(address indexed user, uint256 indexed nftId, uint256 boostBps);
    event WarriorUnstaked(address indexed user, uint256 indexed nftId);

    function stake(uint256 amount) external;
    function requestUnstake(uint256 stCrwnAmount) external;
    function completeUnstake() external;
    function distributeFees(uint256 amount) external;
    function stakeWarrior(uint256 nftId) external;
    function unstakeWarrior() external;

    function getExchangeRate() external view returns (uint256);
    function getTotalStaked() external view returns (uint256);
    function getStakedBalance(address user) external view returns (uint256);
}
