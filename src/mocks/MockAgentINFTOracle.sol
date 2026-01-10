// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {IAgentINFTOracle} from "../interfaces/IAgentINFTOracle.sol";

/**
 * @title MockAgentINFTOracle
 * @notice Mock oracle for testing iNFT transfers
 * @dev Simulates the re-encryption oracle for development and testing.
 *      In production, this would be replaced with a TEE-based oracle.
 */
contract MockAgentINFTOracle is IAgentINFTOracle, Ownable {
    // ============ State ============
    address public inftContract;
    uint256 public requestExpiryDuration = 1 days;
    bytes public attestationKey;

    uint256 private _requestNonce;

    mapping(bytes32 => ReEncryptionRequest) private _requests;
    mapping(bytes32 => bool) private _processedRequests;

    // For testing: auto-approve mode
    bool public autoApproveEnabled = true;

    // ============ Constructor ============
    constructor() Ownable(msg.sender) {}

    // ============ Core Functions ============

    /**
     * @notice Request re-encryption for a transfer
     */
    function requestReEncryption(
        uint256 tokenId,
        address oldOwner,
        address newOwner,
        string calldata encryptedMetadataRef,
        bytes32 currentMetadataHash
    ) external override returns (bytes32 requestId) {
        if (newOwner == address(0)) revert IAgentINFTOracle__InvalidNewOwner();

        requestId = keccak256(abi.encodePacked(
            tokenId,
            oldOwner,
            newOwner,
            block.timestamp,
            _requestNonce++
        ));

        _requests[requestId] = ReEncryptionRequest({
            tokenId: tokenId,
            oldOwner: oldOwner,
            newOwner: newOwner,
            encryptedMetadataRef: encryptedMetadataRef,
            currentMetadataHash: currentMetadataHash,
            requestedAt: block.timestamp,
            expiresAt: block.timestamp + requestExpiryDuration,
            isProcessed: false,
            isSuccessful: false
        });

        emit ReEncryptionRequested(requestId, tokenId, newOwner, block.timestamp);

        return requestId;
    }

    /**
     * @notice Callback when re-encryption is complete
     * @dev In mock, this can be called by owner to simulate oracle response
     */
    function onReEncryptionComplete(
        bytes32 requestId,
        string calldata newEncryptedMetadataRef,
        bytes32 newMetadataHash,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external override {
        ReEncryptionRequest storage request = _requests[requestId];
        if (request.requestedAt == 0) revert IAgentINFTOracle__InvalidRequest();
        if (request.isProcessed) revert IAgentINFTOracle__RequestAlreadyProcessed();
        if (block.timestamp > request.expiresAt) revert IAgentINFTOracle__RequestExpired();

        request.isProcessed = true;
        request.isSuccessful = true;

        emit ReEncryptionCompleted(requestId, request.tokenId, true);

        // If auto-approve is enabled, directly call the iNFT contract
        if (autoApproveEnabled && inftContract != address(0)) {
            // In production, the oracle would call completeTransfer on the iNFT contract
            // For mock, we just emit the event and let tests handle it
        }
    }

    /**
     * @notice Cancel a pending request
     */
    function cancelRequest(bytes32 requestId) external override {
        ReEncryptionRequest storage request = _requests[requestId];
        if (request.requestedAt == 0) revert IAgentINFTOracle__InvalidRequest();

        // Allow cancellation by old owner or after expiry
        if (msg.sender != request.oldOwner && msg.sender != owner()) {
            if (block.timestamp <= request.expiresAt) {
                revert IAgentINFTOracle__UnauthorizedCaller();
            }
        }

        request.isProcessed = true;
        request.isSuccessful = false;

        emit ReEncryptionCancelled(requestId, request.tokenId, "Cancelled by user");
    }

    // ============ Verification Functions ============

    /**
     * @notice Verify a proof (mock always returns true for valid format)
     */
    function verifyProof(bytes calldata proof) external pure override returns (bool) {
        // Mock: Accept any proof with minimum length
        return proof.length >= 32;
    }

    /**
     * @notice Verify re-encryption with full details
     */
    function verifyReEncryption(
        bytes32 requestId,
        bytes32 newMetadataHash,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external view override returns (bool) {
        ReEncryptionRequest storage request = _requests[requestId];

        // Check request exists and is processed successfully
        if (request.requestedAt == 0) return false;
        if (!request.isProcessed) return false;
        if (!request.isSuccessful) return false;

        // Mock: Accept any valid proof format
        return proof.length >= 32 && sealedKey.length >= 32 && newMetadataHash != bytes32(0);
    }

    // ============ View Functions ============

    function getRequest(bytes32 requestId) external view override returns (ReEncryptionRequest memory) {
        return _requests[requestId];
    }

    function isRequestPending(bytes32 requestId) external view override returns (bool) {
        ReEncryptionRequest storage request = _requests[requestId];
        return request.requestedAt > 0 &&
               !request.isProcessed &&
               block.timestamp <= request.expiresAt;
    }

    function getINFTContract() external view override returns (address) {
        return inftContract;
    }

    function getRequestExpiryDuration() external view override returns (uint256) {
        return requestExpiryDuration;
    }

    // ============ Admin Functions ============

    function setINFTContract(address _inftContract) external override onlyOwner {
        inftContract = _inftContract;
    }

    function setRequestExpiryDuration(uint256 duration) external override onlyOwner {
        requestExpiryDuration = duration;
    }

    function updateAttestationKey(bytes calldata newKey) external override onlyOwner {
        attestationKey = newKey;
    }

    function setAutoApprove(bool enabled) external onlyOwner {
        autoApproveEnabled = enabled;
    }

    // ============ Mock Helper Functions ============

    /**
     * @notice Simulate successful re-encryption (for testing)
     * @dev Owner can call this to approve a pending request
     */
    function simulateReEncryptionSuccess(
        bytes32 requestId,
        string calldata newEncryptedMetadataRef,
        bytes32 newMetadataHash
    ) external onlyOwner {
        ReEncryptionRequest storage request = _requests[requestId];
        if (request.requestedAt == 0) revert IAgentINFTOracle__InvalidRequest();
        if (request.isProcessed) revert IAgentINFTOracle__RequestAlreadyProcessed();

        request.isProcessed = true;
        request.isSuccessful = true;

        emit ReEncryptionCompleted(requestId, request.tokenId, true);
    }

    /**
     * @notice Simulate failed re-encryption (for testing)
     */
    function simulateReEncryptionFailure(bytes32 requestId, string calldata reason) external onlyOwner {
        ReEncryptionRequest storage request = _requests[requestId];
        if (request.requestedAt == 0) revert IAgentINFTOracle__InvalidRequest();
        if (request.isProcessed) revert IAgentINFTOracle__RequestAlreadyProcessed();

        request.isProcessed = true;
        request.isSuccessful = false;

        emit ReEncryptionCancelled(requestId, request.tokenId, reason);
    }

    /**
     * @notice Generate a mock proof for testing
     */
    function generateMockProof(
        bytes32 requestId,
        bytes32 newMetadataHash,
        string calldata newEncryptedRef
    ) external pure returns (bytes memory) {
        // Mock proof format: [newMetadataHash (32)] + [padding (32)] + [newEncryptedRef]
        return abi.encodePacked(
            newMetadataHash,
            bytes32(0), // padding
            bytes(newEncryptedRef)
        );
    }

    /**
     * @notice Generate a mock sealed key for testing
     */
    function generateMockSealedKey(
        address recipient
    ) external pure returns (bytes memory) {
        // Mock sealed key: just hash of recipient
        return abi.encodePacked(keccak256(abi.encodePacked(recipient)));
    }
}
