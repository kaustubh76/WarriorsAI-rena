// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ICrownToken} from "./Interfaces/ICrownToken.sol";
import {IWarriorsNFT} from "./Interfaces/IWarriorsNFT.sol";
import {IPool} from "./Interfaces/IPool.sol";
import {IStrategyVault} from "./Interfaces/IStrategyVault.sol";

/**
 * @title StrategyVault
 * @notice Vault that deposits CRwN across 3 DeFi pools based on AI-generated allocation.
 *         One vault per Strategy NFT. Allocation is in basis points summing to 10000.
 *
 * Flow:
 * 1. User approves CRwN for this contract
 * 2. User calls deposit(nftId, amount, allocation, proofHash)
 * 3. Contract transfers CRwN from user, splits across pools
 * 4. User can withdraw(nftId) to pull all funds back
 */
contract StrategyVault is IStrategyVault, ReentrancyGuard, Ownable {
    uint256 private constant BASIS_POINTS = 10000;

    ICrownToken public immutable crownToken;
    IWarriorsNFT public immutable warriorsNFT;

    IPool public immutable highYieldPool;
    IPool public immutable stablePool;
    IPool public immutable lpPool;

    mapping(uint256 => VaultState) private vaults;

    constructor(
        address _crownToken,
        address _warriorsNFT,
        address _highYieldPool,
        address _stablePool,
        address _lpPool
    ) Ownable(msg.sender) {
        crownToken = ICrownToken(_crownToken);
        warriorsNFT = IWarriorsNFT(_warriorsNFT);
        highYieldPool = IPool(_highYieldPool);
        stablePool = IPool(_stablePool);
        lpPool = IPool(_lpPool);
    }

    // ─── Deposit ────────────────────────────────────────

    function deposit(
        uint256 nftId,
        uint256 amount,
        uint256[3] calldata allocation,
        bytes32 aiProofHash
    ) external override nonReentrant {
        if (warriorsNFT.ownerOf(nftId) != msg.sender) revert StrategyVault__NotNFTOwner();
        if (vaults[nftId].active) revert StrategyVault__VaultAlreadyActive();
        if (amount == 0) revert StrategyVault__InvalidAmount();
        if (allocation[0] + allocation[1] + allocation[2] != BASIS_POINTS) revert StrategyVault__InvalidAllocation();

        // Transfer CRwN from user to this contract
        bool success = crownToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert StrategyVault__TransferFailed();

        // Calculate per-pool amounts
        uint256 highYieldAmount = (amount * allocation[0]) / BASIS_POINTS;
        uint256 stableAmount = (amount * allocation[1]) / BASIS_POINTS;
        uint256 lpAmount = amount - highYieldAmount - stableAmount; // remainder to avoid rounding dust

        // Approve and deposit into each pool
        _depositToPool(highYieldPool, highYieldAmount);
        _depositToPool(stablePool, stableAmount);
        _depositToPool(lpPool, lpAmount);

        vaults[nftId] = VaultState({
            depositAmount: amount,
            allocation: allocation,
            active: true,
            owner: msg.sender,
            createdAt: block.timestamp,
            aiProofHash: aiProofHash
        });

        emit VaultCreated(nftId, msg.sender, amount, allocation);
    }

    // ─── Rebalance ─────────────────────────────────────

    function rebalance(
        uint256 nftId,
        uint256[3] calldata newAllocation
    ) external override nonReentrant {
        VaultState storage vault = vaults[nftId];
        if (!vault.active) revert StrategyVault__VaultNotActive();
        if (vault.owner != msg.sender && msg.sender != owner()) revert StrategyVault__NotNFTOwner();
        if (newAllocation[0] + newAllocation[1] + newAllocation[2] != BASIS_POINTS) revert StrategyVault__InvalidAllocation();

        uint256 amount = vault.depositAmount;
        uint256[3] memory oldAlloc = vault.allocation;

        // Withdraw from all pools (old allocation)
        uint256 hyOld = (amount * oldAlloc[0]) / BASIS_POINTS;
        uint256 stOld = (amount * oldAlloc[1]) / BASIS_POINTS;
        uint256 lpOld = amount - hyOld - stOld;

        if (hyOld > 0) highYieldPool.withdraw(hyOld);
        if (stOld > 0) stablePool.withdraw(stOld);
        if (lpOld > 0) lpPool.withdraw(lpOld);

        // Claim accrued yield from each pool (try/catch: reverts if yield == 0)
        try highYieldPool.claimYield() {} catch {}
        try stablePool.claimYield() {} catch {}
        try lpPool.claimYield() {} catch {}

        // Current balance now includes principal + claimed yield
        uint256 totalBalance = crownToken.balanceOf(address(this));

        // Re-deposit with new allocation based on current balance (captures yield)
        uint256 hyNew = (totalBalance * newAllocation[0]) / BASIS_POINTS;
        uint256 stNew = (totalBalance * newAllocation[1]) / BASIS_POINTS;
        uint256 lpNew = totalBalance - hyNew - stNew;

        _depositToPool(highYieldPool, hyNew);
        _depositToPool(stablePool, stNew);
        _depositToPool(lpPool, lpNew);

        // Update state — depositAmount grows with yield
        vault.depositAmount = totalBalance;
        vault.allocation = newAllocation;

        emit VaultRebalanced(nftId, newAllocation);
    }

    // ─── Withdraw ───────────────────────────────────────

    function withdraw(uint256 nftId) external override nonReentrant {
        VaultState storage vault = vaults[nftId];
        if (!vault.active) revert StrategyVault__VaultNotActive();
        if (vault.owner != msg.sender) revert StrategyVault__NotNFTOwner();

        uint256 amount = vault.depositAmount;

        // Calculate per-pool amounts (same formula as deposit)
        uint256 highYieldAmount = (amount * vault.allocation[0]) / BASIS_POINTS;
        uint256 stableAmount = (amount * vault.allocation[1]) / BASIS_POINTS;
        uint256 lpAmount = amount - highYieldAmount - stableAmount;

        // Withdraw from each pool back to this contract
        if (highYieldAmount > 0) highYieldPool.withdraw(highYieldAmount);
        if (stableAmount > 0) stablePool.withdraw(stableAmount);
        if (lpAmount > 0) lpPool.withdraw(lpAmount);

        // Claim accrued yield from each pool
        try highYieldPool.claimYield() {} catch {}
        try stablePool.claimYield() {} catch {}
        try lpPool.claimYield() {} catch {}

        // Transfer total back to user (principal + yield)
        uint256 totalBalance = crownToken.balanceOf(address(this));
        bool success = crownToken.transfer(msg.sender, totalBalance);
        if (!success) revert StrategyVault__WithdrawFailed();

        vault.active = false;

        emit VaultWithdrawn(nftId, msg.sender, totalBalance);
    }

    // ─── Views ──────────────────────────────────────────

    function getVaultState(uint256 nftId) external view override returns (VaultState memory) {
        return vaults[nftId];
    }

    function isVaultActive(uint256 nftId) external view override returns (bool) {
        return vaults[nftId].active;
    }

    function getPoolAddresses() external view returns (address, address, address) {
        return (address(highYieldPool), address(stablePool), address(lpPool));
    }

    // ─── Internal ───────────────────────────────────────

    function _depositToPool(IPool pool, uint256 amount) internal {
        if (amount == 0) return;
        crownToken.approve(address(pool), amount);
        pool.deposit(amount);
    }
}
