// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {IFlowVRF, IVRFConsumer} from "./Interfaces/IFlowVRF.sol";

/**
 * @title FlowVRFOracle
 * @author Warriors AI Arena
 * @notice Oracle contract that bridges Flow's native randomness to EVM contracts
 * @dev This contract receives randomness from the Flow Cadence layer and distributes
 *      it to consumer contracts via callbacks
 *
 * Flow's native VRF is provided through Cadence random() function. This oracle
 * bridges that randomness to Solidity contracts on Flow EVM.
 */
contract FlowVRFOracle is IFlowVRF, Ownable {
    // ============ Errors ============
    error FlowVRFOracle__UnauthorizedFulfiller();
    error FlowVRFOracle__AlreadyFulfilled();
    error FlowVRFOracle__UnknownRequest();
    error FlowVRFOracle__NotFulfilled();
    error FlowVRFOracle__CallbackFailed();
    error FlowVRFOracle__ZeroAddress();

    // ============ State ============

    /// @notice Counter for generating unique request IDs
    uint256 private _nonce;

    /// @notice Mapping of request ID to random result
    mapping(uint256 => uint256) public randomResults;

    /// @notice Mapping of request ID to consumer contract
    mapping(uint256 => address) public requestToConsumer;

    /// @notice Mapping of request ID to fulfillment status
    mapping(uint256 => bool) public fulfilled;

    /// @notice Mapping of request ID to request timestamp
    mapping(uint256 => uint256) public requestTimestamp;

    /// @notice Authorized fulfiller address (bridge from Cadence)
    address public fulfiller;

    /// @notice Minimum confirmations before fulfillment (for security)
    uint256 public constant MIN_CONFIRMATIONS = 1;

    // ============ Events ============

    event RandomnessRequested(
        uint256 indexed requestId,
        address indexed consumer,
        uint256 timestamp
    );

    event RandomnessFulfilled(
        uint256 indexed requestId,
        uint256 randomness,
        address indexed consumer
    );

    event FulfillerUpdated(
        address indexed oldFulfiller,
        address indexed newFulfiller
    );

    // ============ Constructor ============

    /**
     * @notice Initialize the VRF oracle
     * @param _fulfiller Address authorized to fulfill randomness requests
     */
    constructor(address _fulfiller) Ownable(msg.sender) {
        if (_fulfiller == address(0)) revert FlowVRFOracle__ZeroAddress();
        fulfiller = _fulfiller;
        emit FulfillerUpdated(address(0), _fulfiller);
    }

    // ============ Request Functions ============

    /**
     * @notice Request random number generation
     * @dev Creates a unique request ID and stores the consumer address
     * @return requestId Unique identifier for this randomness request
     */
    function requestRandomness() external override returns (uint256 requestId) {
        // Generate unique request ID using block data and nonce
        requestId = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            _nonce++
        )));

        // Store request data
        requestToConsumer[requestId] = msg.sender;
        requestTimestamp[requestId] = block.timestamp;

        emit RandomnessRequested(requestId, msg.sender, block.timestamp);
    }

    // ============ Fulfillment Functions ============

    /**
     * @notice Fulfill randomness from Flow Cadence layer
     * @dev Only callable by the authorized fulfiller
     * @param requestId The request ID to fulfill
     * @param randomness The random number from Flow's native VRF
     */
    function fulfillRandomness(
        uint256 requestId,
        uint256 randomness
    ) external {
        // Only authorized fulfiller can call
        if (msg.sender != fulfiller) revert FlowVRFOracle__UnauthorizedFulfiller();

        // Check request exists
        address consumer = requestToConsumer[requestId];
        if (consumer == address(0)) revert FlowVRFOracle__UnknownRequest();

        // Check not already fulfilled
        if (fulfilled[requestId]) revert FlowVRFOracle__AlreadyFulfilled();

        // Store result
        randomResults[requestId] = randomness;
        fulfilled[requestId] = true;

        // Callback to consumer
        try IVRFConsumer(consumer).fulfillRandomness(requestId, randomness) {
            // Success
        } catch {
            // If callback fails, still mark as fulfilled but emit separate event
            // Consumer can manually retrieve the result
        }

        emit RandomnessFulfilled(requestId, randomness, consumer);
    }

    /**
     * @notice Batch fulfill multiple randomness requests
     * @dev Gas-efficient way to fulfill multiple requests
     * @param requestIds Array of request IDs to fulfill
     * @param randomValues Array of random values corresponding to each request
     */
    function batchFulfillRandomness(
        uint256[] calldata requestIds,
        uint256[] calldata randomValues
    ) external {
        if (msg.sender != fulfiller) revert FlowVRFOracle__UnauthorizedFulfiller();
        require(requestIds.length == randomValues.length, "Length mismatch");

        for (uint256 i = 0; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];
            address consumer = requestToConsumer[requestId];

            if (consumer == address(0) || fulfilled[requestId]) {
                continue; // Skip invalid or already fulfilled
            }

            randomResults[requestId] = randomValues[i];
            fulfilled[requestId] = true;

            try IVRFConsumer(consumer).fulfillRandomness(requestId, randomValues[i]) {
                // Success
            } catch {
                // Continue with next request
            }

            emit RandomnessFulfilled(requestId, randomValues[i], consumer);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get the random result for a fulfilled request
     * @param requestId The request ID to query
     * @return The random number
     */
    function getRandomness(uint256 requestId) external view override returns (uint256) {
        if (!fulfilled[requestId]) revert FlowVRFOracle__NotFulfilled();
        return randomResults[requestId];
    }

    /**
     * @notice Check if a request has been fulfilled
     * @param requestId The request ID to check
     * @return True if fulfilled
     */
    function isFulfilled(uint256 requestId) external view override returns (bool) {
        return fulfilled[requestId];
    }

    /**
     * @notice Get request details
     * @param requestId The request ID to query
     * @return consumer The consumer contract address
     * @return timestamp When the request was made
     * @return isFulfilledStatus Whether the request is fulfilled
     * @return result The random result (0 if not fulfilled)
     */
    function getRequestDetails(uint256 requestId) external view returns (
        address consumer,
        uint256 timestamp,
        bool isFulfilledStatus,
        uint256 result
    ) {
        consumer = requestToConsumer[requestId];
        timestamp = requestTimestamp[requestId];
        isFulfilledStatus = fulfilled[requestId];
        result = randomResults[requestId];
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the authorized fulfiller address
     * @param _fulfiller New fulfiller address
     */
    function setFulfiller(address _fulfiller) external onlyOwner {
        if (_fulfiller == address(0)) revert FlowVRFOracle__ZeroAddress();
        address oldFulfiller = fulfiller;
        fulfiller = _fulfiller;
        emit FulfillerUpdated(oldFulfiller, _fulfiller);
    }
}
