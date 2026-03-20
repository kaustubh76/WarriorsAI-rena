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

    /// @notice When true, rebalance validates allocation against NFT trait constraints
    bool public traitConstraintsEnabled;

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

        // On-chain trait constraint enforcement
        if (traitConstraintsEnabled) {
            _enforceTraitConstraints(nftId, newAllocation, vault.allocation);
        }

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

    // ─── Admin ────────────────────────────────────────────

    /// @notice Enable or disable on-chain trait constraint enforcement
    function setTraitConstraintsEnabled(bool _enabled) external onlyOwner {
        traitConstraintsEnabled = _enabled;
    }

    // ─── Internal ───────────────────────────────────────

    function _depositToPool(IPool pool, uint256 amount) internal {
        if (amount == 0) return;
        crownToken.approve(address(pool), amount);
        pool.deposit(amount);
    }

    /**
     * @notice On-chain trait constraint enforcement (mirrors defiConstraints.ts logic).
     * @dev Reads NFT traits from WarriorsNFT and validates:
     *      - ALPHA (strength) → max concentration per risky pool
     *      - HEDGE (defence) → min stable pool allocation
     *      - MOMENTUM (charisma) → max allocation shift per rebalance
     */
    function _enforceTraitConstraints(
        uint256 nftId,
        uint256[3] calldata proposed,
        uint256[3] memory prevAllocation
    ) internal view {
        IWarriorsNFT.Traits memory traits = warriorsNFT.getTraits(nftId);

        // ALPHA (strength) → max concentration: 2000 + 6000 * strength / 10000
        uint256 maxConc = 2000 + (uint256(traits.strength) * 6000) / 10000;
        require(proposed[0] <= maxConc, "HighYield exceeds concentration limit");
        require(proposed[2] <= maxConc, "LP exceeds concentration limit");

        // HEDGE (defence) → min stable: 500 + 6500 * defence / 10000
        uint256 minStable = 500 + (uint256(traits.defence) * 6500) / 10000;
        require(proposed[1] >= minStable, "Stable below hedge minimum");

        // MOMENTUM (charisma) → max delta: 500 + 4500 * charisma / 10000
        // Only enforce if previous allocation is non-zero (skip on first deposit)
        if (prevAllocation[0] + prevAllocation[1] + prevAllocation[2] > 0) {
            uint256 maxDelta = 500 + (uint256(traits.charisma) * 4500) / 10000;
            uint256 totalShift = _absDiff(proposed[0], prevAllocation[0])
                               + _absDiff(proposed[1], prevAllocation[1])
                               + _absDiff(proposed[2], prevAllocation[2]);
            require(totalShift / 2 <= maxDelta, "Rebalance delta exceeds momentum limit");
        }
    }

    function _absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }
}
