// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IZeroGOracle
 * @notice Interface for the 0G AI-powered Oracle system
 * @dev Uses 0G Compute Network for trustless battle resolution
 */
interface IZeroGOracle {
    // Enums
    enum ResolutionStatus {
        PENDING,     // Waiting for resolution
        SUBMITTED,   // Resolution submitted, in dispute period
        FINALIZED,   // Resolution finalized
        DISPUTED     // Resolution disputed
    }

    // Structs
    struct ResolutionRequest {
        uint256 marketId;
        uint256 battleId;
        uint256 requestTime;
        uint256 resolveTime;
        ResolutionStatus status;
        bytes32 dataHash;           // Hash of battle data for verification
        address[] aiSigners;        // AI signers who participated
        bytes[] aiSignatures;       // Their signatures
        uint8 outcome;              // 1 = YES, 2 = NO, 3 = INVALID
        uint256 disputeDeadline;
    }

    struct AIProvider {
        address providerAddress;
        string model;
        bool isActive;
        uint256 totalResolutions;
        uint256 successfulResolutions;
    }

    // Events
    event ResolutionRequested(
        uint256 indexed marketId,
        uint256 indexed battleId,
        bytes32 dataHash,
        uint256 requestTime
    );

    event ResolutionSubmitted(
        uint256 indexed marketId,
        uint8 outcome,
        address indexed submitter,
        bytes32 proofHash
    );

    event ResolutionFinalized(
        uint256 indexed marketId,
        uint8 outcome
    );

    event ResolutionDisputed(
        uint256 indexed marketId,
        address indexed disputer,
        string reason
    );

    event DisputeResolved(
        uint256 indexed marketId,
        uint8 finalOutcome,
        bool disputeUpheld
    );

    event AIProviderRegistered(
        address indexed provider,
        string model
    );

    event AIProviderRemoved(
        address indexed provider
    );

    // Core Functions

    /**
     * @notice Request resolution for a market
     * @param marketId The market to resolve
     * @param battleId The associated battle ID
     * @param battleData Encoded battle data for AI verification
     */
    function requestResolution(
        uint256 marketId,
        uint256 battleId,
        bytes calldata battleData
    ) external;

    /**
     * @notice Submit AI resolution with proofs
     * @param marketId The market being resolved
     * @param outcome The determined outcome (1=YES, 2=NO, 3=INVALID)
     * @param aiSignatures Array of AI provider signatures
     * @param aiProof Additional proof data from 0G compute
     */
    function submitResolution(
        uint256 marketId,
        uint8 outcome,
        bytes[] calldata aiSignatures,
        bytes calldata aiProof
    ) external;

    /**
     * @notice Finalize resolution after dispute period
     * @param marketId The market to finalize
     */
    function finalizeResolution(uint256 marketId) external;

    /**
     * @notice Dispute a resolution during dispute period
     * @param marketId The market to dispute
     * @param evidence Evidence supporting the dispute
     */
    function disputeResolution(
        uint256 marketId,
        bytes calldata evidence
    ) external payable;

    /**
     * @notice Resolve a dispute (admin/governance only)
     * @param marketId The disputed market
     * @param finalOutcome The final determined outcome
     * @param upholdDispute Whether the dispute was valid
     */
    function resolveDispute(
        uint256 marketId,
        uint8 finalOutcome,
        bool upholdDispute
    ) external;

    // AI Provider Management

    /**
     * @notice Register a new AI provider
     * @param provider The provider's address
     * @param model The AI model identifier
     */
    function registerAIProvider(
        address provider,
        string calldata model
    ) external;

    /**
     * @notice Remove an AI provider
     * @param provider The provider to remove
     */
    function removeAIProvider(address provider) external;

    // View Functions

    /**
     * @notice Get resolution request details
     * @param marketId The market ID
     */
    function getResolutionRequest(uint256 marketId)
        external view returns (ResolutionRequest memory);

    /**
     * @notice Verify an AI signature
     * @param data The data that was signed
     * @param signature The signature to verify
     */
    function verifyAISignature(
        bytes32 data,
        bytes calldata signature
    ) external view returns (bool isValid, address signer);

    /**
     * @notice Get registered AI providers
     */
    function getAIProviders() external view returns (AIProvider[] memory);

    /**
     * @notice Check if resolution can be finalized
     * @param marketId The market to check
     */
    function canFinalize(uint256 marketId) external view returns (bool);

    /**
     * @notice Get minimum required AI consensus
     */
    function getMinConsensus() external view returns (uint256);

    /**
     * @notice Get dispute period duration
     */
    function getDisputePeriod() external view returns (uint256);
}
