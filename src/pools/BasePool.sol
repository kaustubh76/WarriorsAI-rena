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

    uint256 public apyBasisPoints; // e.g. 1800 = 18%
    string public poolName;

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
            // yield = balance * apy * elapsed / (365 days * 10000)
            uint256 yield_ = (info.balance * apyBasisPoints * elapsed) / (365 days * 10000);
            info.accruedYield += yield_;
        }
        info.lastAccrualTime = block.timestamp;
    }

    // ─── Views ──────────────────────────────────────────

    function getAPY() external view override returns (uint256) {
        return apyBasisPoints;
    }

    function getBalance(address user) external view override returns (uint256) {
        return users[user].balance;
    }

    function getPendingYield(address user) external view override returns (uint256) {
        UserInfo storage info = users[user];
        if (info.balance == 0 || info.lastAccrualTime == 0) return info.accruedYield;
        uint256 elapsed = block.timestamp - info.lastAccrualTime;
        uint256 pending = (info.balance * apyBasisPoints * elapsed) / (365 days * 10000);
        return info.accruedYield + pending;
    }

    // ─── Admin ──────────────────────────────────────────

    function setAPY(uint256 _newAPY) external onlyOwner {
        uint256 old = apyBasisPoints;
        apyBasisPoints = _newAPY;
        emit APYUpdated(old, _newAPY);
    }

    /// @notice Owner funds the pool reserve so yield can be paid out
    function fundReserve(uint256 amount) external onlyOwner {
        crownToken.transferFrom(msg.sender, address(this), amount);
    }
}
