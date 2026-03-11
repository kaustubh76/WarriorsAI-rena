// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BasePool} from "./BasePool.sol";

/**
 * @title LPPool
 * @notice Variable APY pool (8-15%) — simulates LP position
 */
contract LPPool is BasePool {
    constructor(address _crownToken)
        BasePool(_crownToken, 1200, "LP") // 12% default APY
    {}
}
