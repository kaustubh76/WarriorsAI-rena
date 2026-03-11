// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BasePool} from "./BasePool.sol";

/**
 * @title HighYieldPool
 * @notice Variable APY pool (12-25%) — simulates volatile yield farm
 */
contract HighYieldPool is BasePool {
    constructor(address _crownToken)
        BasePool(_crownToken, 1800, "HighYield") // 18% default APY
    {}
}
