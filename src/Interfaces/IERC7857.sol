// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "../../lib/openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";

/**
 * @title IERC7857
 * @notice Interface for ERC-7857: Intelligent NFTs for AI Agents
 * @dev Extension of ERC-721 that enables tokenization of AI agents with encrypted metadata,
 *      secure ownership transfers with re-encryption, and authorization-based access control.
 *
 * Key Features:
 * - Encrypted metadata storage (AES-256-GCM)
 * - Secure re-encryption during transfers via oracle
 * - Authorization system for usage rights without ownership transfer
 * - Metadata hash verification for authenticity
 */
interface IERC7857 is IERC721 {
    // ============ Events ============

    /// @notice Emitted when a new iNFT is minted
    event INFTMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 metadataHash,
        string encryptedMetadataRef
    );

    /// @notice Emitted when metadata is updated (e.g., during transfer)
    event MetadataUpdated(
        uint256 indexed tokenId,
        bytes32 oldHash,
        bytes32 newHash
    );

    /// @notice Emitted when usage authorization is granted
    event UsageAuthorized(
        uint256 indexed tokenId,
        address indexed executor,
        uint256 expiresAt
    );

    /// @notice Emitted when usage authorization is revoked
    event UsageRevoked(
        uint256 indexed tokenId,
        address indexed executor
    );

    /// @notice Emitted when a transfer is initiated (pending re-encryption)
    event TransferInitiated(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bytes32 requestId
    );

    /// @notice Emitted when transfer is completed after re-encryption
    event TransferCompleted(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to
    );

    // ============ Errors ============

    error IERC7857__NotOwner();
    error IERC7857__NotAuthorized();
    error IERC7857__InvalidProof();
    error IERC7857__InvalidMetadataHash();
    error IERC7857__InvalidEncryptedMetadataRef();
    error IERC7857__AuthorizationExpired();
    error IERC7857__TransferPending();
    error IERC7857__NoTransferPending();
    error IERC7857__InvalidDuration();
    error IERC7857__ZeroAddress();

    // ============ Structs ============

    /// @notice Authorization details for an executor
    struct Authorization {
        uint256 expiresAt;      // Timestamp when authorization expires
        bool canExecute;        // Can execute agent actions
        bool canViewMetadata;   // Can view decrypted metadata
    }

    /// @notice Pending transfer details
    struct PendingTransfer {
        address from;
        address to;
        bytes32 requestId;
        uint256 initiatedAt;
        bool isPending;
    }

    // ============ Core Functions ============

    /**
     * @notice Mints a new iNFT with encrypted metadata
     * @param encryptedMetadataRef Reference to encrypted metadata in 0G Storage (root hash)
     * @param metadataHash keccak256 hash of the decrypted metadata for verification
     * @return tokenId The ID of the newly minted iNFT
     */
    function mint(
        string calldata encryptedMetadataRef,
        bytes32 metadataHash
    ) external returns (uint256 tokenId);

    /**
     * @notice Transfers an iNFT with secure re-encryption
     * @dev Requires oracle proof of valid re-encryption
     * @param from Current owner address
     * @param to New owner address
     * @param tokenId Token ID to transfer
     * @param sealedKey New encryption key sealed for recipient's public key
     * @param proof Oracle proof of valid re-encryption
     */
    function transferWithReEncryption(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external;

    /**
     * @notice Initiates a transfer (for async re-encryption flow)
     * @param to Recipient address
     * @param tokenId Token ID to transfer
     * @return requestId Unique identifier for this transfer request
     */
    function initiateTransfer(
        address to,
        uint256 tokenId
    ) external returns (bytes32 requestId);

    /**
     * @notice Completes a pending transfer after re-encryption
     * @dev Called by oracle or authorized party with re-encryption proof
     * @param tokenId Token ID being transferred
     * @param newEncryptedMetadataRef New encrypted metadata reference
     * @param newMetadataHash Hash of re-encrypted metadata
     * @param sealedKey New encryption key for recipient
     * @param proof Oracle proof of valid re-encryption
     */
    function completeTransfer(
        uint256 tokenId,
        string calldata newEncryptedMetadataRef,
        bytes32 newMetadataHash,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external;

    /**
     * @notice Cancels a pending transfer
     * @param tokenId Token ID with pending transfer
     */
    function cancelTransfer(uint256 tokenId) external;

    // ============ Authorization Functions ============

    /**
     * @notice Grants usage authorization to an executor
     * @param tokenId Token ID to authorize
     * @param executor Address being granted authorization
     * @param duration Duration in seconds for the authorization
     */
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        uint256 duration
    ) external;

    /**
     * @notice Revokes usage authorization from an executor
     * @param tokenId Token ID
     * @param executor Address to revoke authorization from
     */
    function revokeUsage(
        uint256 tokenId,
        address executor
    ) external;

    /**
     * @notice Checks if an address is authorized to execute agent actions
     * @param tokenId Token ID
     * @param executor Address to check
     * @return True if authorized and not expired
     */
    function isAuthorizedExecutor(
        uint256 tokenId,
        address executor
    ) external view returns (bool);

    /**
     * @notice Gets authorization details for an executor
     * @param tokenId Token ID
     * @param executor Address to check
     * @return Authorization struct with details
     */
    function getAuthorization(
        uint256 tokenId,
        address executor
    ) external view returns (Authorization memory);

    // ============ Metadata Functions ============

    /**
     * @notice Gets the encrypted metadata reference (0G Storage root hash)
     * @param tokenId Token ID
     * @return Reference string (typically IPFS or 0G Storage hash)
     */
    function getEncryptedMetadataRef(
        uint256 tokenId
    ) external view returns (string memory);

    /**
     * @notice Gets the metadata hash for verification
     * @param tokenId Token ID
     * @return keccak256 hash of the decrypted metadata
     */
    function getMetadataHash(
        uint256 tokenId
    ) external view returns (bytes32);

    /**
     * @notice Gets pending transfer details
     * @param tokenId Token ID
     * @return PendingTransfer struct
     */
    function getPendingTransfer(
        uint256 tokenId
    ) external view returns (PendingTransfer memory);

    // ============ ERC-165 ============

    /**
     * @notice Returns true if this contract implements the interface
     * @dev See {IERC165-supportsInterface}
     * @param interfaceId The interface identifier
     * @return True if the interface is supported
     */
    function supportsInterface(
        bytes4 interfaceId
    ) external view override returns (bool);
}

// Interface ID for ERC-7857
// bytes4(keccak256("mint(string,bytes32)")) ^ bytes4(keccak256("transferWithReEncryption(address,address,uint256,bytes,bytes)")) ^ ...
bytes4 constant IERC7857_INTERFACE_ID = 0x7857a1e7;
