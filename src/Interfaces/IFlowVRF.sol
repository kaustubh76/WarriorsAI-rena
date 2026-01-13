// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IFlowVRF
 * @notice Interface for Flow's Verifiable Random Function (VRF)
 * @dev Flow provides native randomness through Cadence - this is the EVM bridge interface
 */
interface IFlowVRF {
    /**
     * @notice Request random number generation
     * @return requestId Unique identifier for the randomness request
     */
    function requestRandomness() external returns (uint256 requestId);

    /**
     * @notice Get the random result for a fulfilled request
     * @param requestId The request ID to query
     * @return The random number (reverts if not yet fulfilled)
     */
    function getRandomness(uint256 requestId) external view returns (uint256);

    /**
     * @notice Check if a request has been fulfilled
     * @param requestId The request ID to check
     * @return True if the request has been fulfilled
     */
    function isFulfilled(uint256 requestId) external view returns (bool);
}

/**
 * @title IVRFConsumer
 * @notice Interface that VRF consumers must implement
 */
interface IVRFConsumer {
    /**
     * @notice Callback function called by VRF oracle when randomness is ready
     * @param requestId The request ID being fulfilled
     * @param randomness The random number generated
     */
    function fulfillRandomness(uint256 requestId, uint256 randomness) external;
}
