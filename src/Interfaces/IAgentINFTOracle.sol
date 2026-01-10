// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAgentINFTOracle
 * @notice Oracle interface for secure re-encryption during iNFT transfers
 * @dev The oracle handles re-encryption of AI agent metadata when ownership changes.
 *      It uses Trusted Execution Environments (TEE) to ensure the metadata is never
 *      exposed in plaintext during the re-encryption process.
 *
 * Flow:
 * 1. Transfer initiated -> requestReEncryption() called
 * 2. Oracle decrypts metadata in TEE
 * 3. Oracle re-encrypts with new owner's public key
 * 4. Oracle calls onReEncryptionComplete() with proof
 * 5. Contract verifies proof and completes transfer
 */
interface IAgentINFTOracle {
    // ============ Events ============

    /// @notice Emitted when a re-encryption request is submitted
    event ReEncryptionRequested(
        bytes32 indexed requestId,
        uint256 indexed tokenId,
        address indexed newOwner,
        uint256 timestamp
    );

    /// @notice Emitted when re-encryption is completed
    event ReEncryptionCompleted(
        bytes32 indexed requestId,
        uint256 indexed tokenId,
        bool success
    );

    /// @notice Emitted when a request expires or is cancelled
    event ReEncryptionCancelled(
        bytes32 indexed requestId,
        uint256 indexed tokenId,
        string reason
    );

    // ============ Errors ============

    error IAgentINFTOracle__InvalidRequest();
    error IAgentINFTOracle__RequestExpired();
    error IAgentINFTOracle__RequestAlreadyProcessed();
    error IAgentINFTOracle__InvalidProof();
    error IAgentINFTOracle__UnauthorizedCaller();
    error IAgentINFTOracle__InvalidNewOwner();

    // ============ Structs ============

    /// @notice Re-encryption request details
    struct ReEncryptionRequest {
        uint256 tokenId;                    // Token being transferred
        address oldOwner;                   // Current owner
        address newOwner;                   // New owner
        string encryptedMetadataRef;        // Current encrypted metadata reference
        bytes32 currentMetadataHash;        // Current metadata hash
        uint256 requestedAt;                // Request timestamp
        uint256 expiresAt;                  // Expiration timestamp
        bool isProcessed;                   // Whether request has been processed
        bool isSuccessful;                  // Whether re-encryption succeeded
    }

    /// @notice Proof structure for verifying re-encryption
    struct ReEncryptionProof {
        bytes32 requestId;                  // Original request ID
        bytes32 oldMetadataHash;            // Hash before re-encryption
        bytes32 newMetadataHash;            // Hash after re-encryption
        bytes attestation;                  // TEE attestation or signature
        uint256 timestamp;                  // Proof generation timestamp
    }

    // ============ Core Functions ============

    /**
     * @notice Requests re-encryption of metadata for a transfer
     * @dev Called by the iNFT contract when a transfer is initiated
     * @param tokenId Token being transferred
     * @param oldOwner Current owner address
     * @param newOwner New owner address
     * @param encryptedMetadataRef Reference to current encrypted metadata
     * @param currentMetadataHash Hash of current metadata for verification
     * @return requestId Unique identifier for this request
     */
    function requestReEncryption(
        uint256 tokenId,
        address oldOwner,
        address newOwner,
        string calldata encryptedMetadataRef,
        bytes32 currentMetadataHash
    ) external returns (bytes32 requestId);

    /**
     * @notice Callback after re-encryption is complete
     * @dev Called by the oracle service after TEE processing
     * @param requestId The original request ID
     * @param newEncryptedMetadataRef New encrypted metadata reference (0G Storage)
     * @param newMetadataHash Hash of re-encrypted metadata
     * @param sealedKey Encryption key sealed for new owner's public key
     * @param proof Attestation proof from TEE
     */
    function onReEncryptionComplete(
        bytes32 requestId,
        string calldata newEncryptedMetadataRef,
        bytes32 newMetadataHash,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external;

    /**
     * @notice Cancels a pending re-encryption request
     * @dev Can be called by the original requester or after expiry
     * @param requestId Request to cancel
     */
    function cancelRequest(bytes32 requestId) external;

    // ============ Verification Functions ============

    /**
     * @notice Verifies a re-encryption proof
     * @param proof The proof to verify
     * @return isValid True if the proof is valid
     */
    function verifyProof(bytes calldata proof) external view returns (bool isValid);

    /**
     * @notice Verifies a re-encryption proof with full details
     * @param requestId Original request ID
     * @param newMetadataHash Expected new hash
     * @param sealedKey Sealed encryption key
     * @param proof TEE attestation
     * @return isValid True if verification passes
     */
    function verifyReEncryption(
        bytes32 requestId,
        bytes32 newMetadataHash,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external view returns (bool isValid);

    // ============ View Functions ============

    /**
     * @notice Gets details of a re-encryption request
     * @param requestId Request ID to query
     * @return request The request details
     */
    function getRequest(
        bytes32 requestId
    ) external view returns (ReEncryptionRequest memory request);

    /**
     * @notice Checks if a request is still pending
     * @param requestId Request ID to check
     * @return isPending True if pending and not expired
     */
    function isRequestPending(bytes32 requestId) external view returns (bool isPending);

    /**
     * @notice Gets the iNFT contract this oracle serves
     * @return The iNFT contract address
     */
    function getINFTContract() external view returns (address);

    /**
     * @notice Gets the request expiry duration
     * @return Duration in seconds
     */
    function getRequestExpiryDuration() external view returns (uint256);

    // ============ Admin Functions ============

    /**
     * @notice Sets the iNFT contract address
     * @dev Only callable by owner/admin
     * @param inftContract The iNFT contract address
     */
    function setINFTContract(address inftContract) external;

    /**
     * @notice Sets the request expiry duration
     * @dev Only callable by owner/admin
     * @param duration New duration in seconds
     */
    function setRequestExpiryDuration(uint256 duration) external;

    /**
     * @notice Updates the TEE attestation verification key
     * @dev Only callable by owner/admin
     * @param newKey New verification key
     */
    function updateAttestationKey(bytes calldata newKey) external;
}
