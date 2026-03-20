// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/**
 * @title stCRwN — Staked Crown Token
 * @notice ERC20 receipt token for CRwN staking. Only the staking contract can mint/burn.
 *         Transferable and composable — can be used in other DeFi protocols.
 */
contract stCRwN is ERC20 {
    error StCRwN__Unauthorized();

    address public immutable stakingContract;

    constructor(address _stakingContract) ERC20("Staked Crown Token", "stCRwN") {
        stakingContract = _stakingContract;
    }

    modifier onlyStaking() {
        if (msg.sender != stakingContract) revert StCRwN__Unauthorized();
        _;
    }

    function mint(address to, uint256 amount) external onlyStaking {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyStaking {
        _burn(from, amount);
    }
}
