// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ICrownToken} from "../Interfaces/ICrownToken.sol";
import {IPool} from "../Interfaces/IPool.sol";

/**
 * @title BasePool
 * @notice Shared logic for all DeFi strategy pools. Owner-adjustable APY for hackathon demo.
 * @dev Yield accrues per-second based on apyBasisPoints. Yield is paid from a reserve
 *      that the owner funds. One deployment per pool type (HighYield, Stable, LP).
 */
contract BasePool is IPool, ReentrancyGuard, Ownable {
    ICrownToken public immutable crownToken;

    uint256 public apyBasisPoints; // e.g. 1800 = 18% (base APY)
    string public poolName;

    // Dynamic APY: utilization-based (set maxCapacity > 0 to enable)
    uint256 public maxCapacity;              // 0 = unlimited / static APY
    uint256 public targetUtilization = 5000; // 50% in basis points

    struct UserInfo {
        uint256 balance;
        uint256 lastAccrualTime;
        uint256 accruedYield;
    }

    mapping(address => UserInfo) public users;
    uint256 public totalDeposits;

    constructor(
        address _crownToken,
        uint256 _initialAPY,
        string memory _name
    ) Ownable(msg.sender) {
        crownToken = ICrownToken(_crownToken);
        apyBasisPoints = _initialAPY;
        poolName = _name;
    }

    // ─── Deposits ───────────────────────────────────────

    /// @notice Deposit CRwN into the pool. No hard cap on deposits.
    /// @dev When maxCapacity > 0, deposits beyond capacity reduce effective APY
    ///      (dynamic APY floors at 50% of base). This is a soft cap by design.
    function deposit(uint256 amount) external override nonReentrant {
        if (amount == 0) revert Pool__InvalidAmount();

        _accrueYield(msg.sender);

        bool success = crownToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert Pool__TransferFailed();

        users[msg.sender].balance += amount;
        totalDeposits += amount;

        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external override nonReentrant {
        if (amount == 0) revert Pool__InvalidAmount();
        if (users[msg.sender].balance < amount) revert Pool__InsufficientBalance();

        _accrueYield(msg.sender);

        users[msg.sender].balance -= amount;
        totalDeposits -= amount;

        bool success = crownToken.transfer(msg.sender, amount);
        if (!success) revert Pool__TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    // ─── Yield ──────────────────────────────────────────

    function claimYield() external override nonReentrant returns (uint256) {
        _accrueYield(msg.sender);

        uint256 yield_ = users[msg.sender].accruedYield;
        if (yield_ == 0) revert Pool__InvalidAmount();

        users[msg.sender].accruedYield = 0;

        // Yield paid from pool's CRwN reserve (owner must fund the pool)
        bool success = crownToken.transfer(msg.sender, yield_);
        if (!success) revert Pool__TransferFailed();

        emit YieldClaimed(msg.sender, yield_);
        return yield_;
    }

    function _accrueYield(address user) internal {
        UserInfo storage info = users[user];
        if (info.balance > 0 && info.lastAccrualTime > 0) {
            uint256 elapsed = block.timestamp - info.lastAccrualTime;
            uint256 effectiveAPY = getEffectiveAPY();
            // yield = balance * effectiveAPY * elapsed / (365 days * 10000)
            uint256 yield_ = (info.balance * effectiveAPY * elapsed) / (365 days * 10000);
            info.accruedYield += yield_;
        }
        info.lastAccrualTime = block.timestamp;
    }

    // ─── Views ──────────────────────────────────────────

    /// @notice Returns the base APY (static, owner-set)
    function getAPY() external view override returns (uint256) {
        return apyBasisPoints;
    }

    /**
     * @notice Returns the effective APY based on pool utilization.
     * @dev When maxCapacity == 0, returns static apyBasisPoints (backward compatible).
     *      When maxCapacity > 0, APY scales inversely with utilization:
     *        - Under-utilized → APY increases (attracts deposits)
     *        - Over-utilized → APY decreases (pushes capital to other pools)
     *        - Capped between 50% and 200% of base APY
     */
    function getEffectiveAPY() public view returns (uint256) {
        if (maxCapacity == 0) return apyBasisPoints;

        uint256 utilization = (totalDeposits * 10000) / maxCapacity;
        if (utilization == 0) utilization = 1; // prevent division by zero

        // Inverse relationship: multiplier = targetUtilization / actualUtilization
        uint256 multiplier = (targetUtilization * 10000) / utilization;
        if (multiplier > 20000) multiplier = 20000; // cap at 2x
        if (multiplier < 5000) multiplier = 5000;   // floor at 0.5x

        return (apyBasisPoints * multiplier) / 10000;
    }

    /// @notice Returns current pool utilization in basis points (0-10000+)
    function getUtilization() external view returns (uint256) {
        if (maxCapacity == 0) return 0;
        return (totalDeposits * 10000) / maxCapacity;
    }

    function getBalance(address user) external view override returns (uint256) {
        return users[user].balance;
    }

    function getPendingYield(address user) external view override returns (uint256) {
        UserInfo storage info = users[user];
        if (info.balance == 0 || info.lastAccrualTime == 0) return info.accruedYield;
        uint256 elapsed = block.timestamp - info.lastAccrualTime;
        uint256 effectiveAPY = getEffectiveAPY();
        uint256 pending = (info.balance * effectiveAPY * elapsed) / (365 days * 10000);
        return info.accruedYield + pending;
    }

    // ─── Admin ──────────────────────────────────────────

    function setAPY(uint256 _newAPY) external onlyOwner {
        uint256 old = apyBasisPoints;
        apyBasisPoints = _newAPY;
        emit APYUpdated(old, _newAPY);
    }

    /// @notice Set max capacity for dynamic APY. 0 = static APY (backward compatible).
    function setMaxCapacity(uint256 _maxCapacity) external onlyOwner {
        maxCapacity = _maxCapacity;
    }

    /// @notice Set target utilization (basis points, 1-10000). Default 5000 (50%).
    function setTargetUtilization(uint256 _target) external onlyOwner {
        require(_target > 0 && _target <= 10000, "Invalid target");
        targetUtilization = _target;
    }

    /// @notice Owner funds the pool reserve so yield can be paid out
    function fundReserve(uint256 amount) external onlyOwner {
        crownToken.transferFrom(msg.sender, address(this), amount);
    }
}
