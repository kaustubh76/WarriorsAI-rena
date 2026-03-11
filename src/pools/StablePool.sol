// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BasePool} from "./BasePool.sol";

/**
 * @title StablePool
 * @notice Fixed APY pool (3-5%) — simulates stablecoin vault
 */
contract StablePool is BasePool {
    constructor(address _crownToken)
        BasePool(_crownToken, 400, "Stable") // 4% default APY
    {}
}
