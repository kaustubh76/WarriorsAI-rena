// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ECDSA} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {IZeroGOracle} from "./Interfaces/IZeroGOracle.sol";
import {IPredictionMarket} from "./Interfaces/IPredictionMarket.sol";
import {IAIDebateOracle} from "./Interfaces/IAIDebateOracle.sol";

/**
 * @title ZeroGOracle
 * @author Warriors AI Arena
 * @notice 0G AI-powered oracle for trustless market resolution
 * @dev Uses multi-AI consensus with cryptographic proofs from 0G Compute Network
 *
 * Resolution Flow:
 * 1. Anyone can request resolution after market ends
 * 2. 0G AI agents analyze battle data and submit signed resolutions
 * 3. Requires 2/3 AI consensus for resolution
 * 4. 24-hour dispute period before finalization
 * 5. Disputes can be resolved by governance or additional AI analysis
 */
contract ZeroGOracle is IZeroGOracle, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Errors
    error ZeroGOracle__InvalidMarket();
    error ZeroGOracle__ResolutionPending();
    error ZeroGOracle__AlreadyResolved();
    error ZeroGOracle__InsufficientConsensus();
    error ZeroGOracle__InvalidSignature();
    error ZeroGOracle__DisputePeriodActive();
    error ZeroGOracle__DisputePeriodExpired();
    error ZeroGOracle__InsufficientDisputeStake();
    error ZeroGOracle__NotDisputed();
    error ZeroGOracle__ProviderExists();
    error ZeroGOracle__ProviderNotFound();
    error ZeroGOracle__Unauthorized();

    // Constants
    uint256 public constant DISPUTE_PERIOD = 24 hours;
    uint256 public constant MIN_DISPUTE_STAKE = 10 ether; // 10 CRwN
    uint256 public constant MIN_CONSENSUS = 2; // Minimum 2 out of 3 AI signers

    // State
    IPredictionMarket public predictionMarket;
    IAIDebateOracle public aiDebateOracle;
    mapping(uint256 => ResolutionRequest) public resolutionRequests;
    mapping(address => AIProvider) public aiProviders;
    address[] public providerAddresses;

    // Dispute tracking
    mapping(uint256 => address) public disputedBy;
    mapping(uint256 => uint256) public disputeStakes;
    mapping(uint256 => bytes) public disputeEvidence;

    // Debate-based resolution tracking
    mapping(uint256 => uint256) public marketToDebate; // marketId => debateId
    mapping(uint256 => bool) public debateBasedResolution; // marketId => was resolved via debate

    // Events (additional to interface)
    event PredictionMarketUpdated(address indexed oldAddress, address indexed newAddress);
    event AIDebateOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event DebateResolutionRequested(uint256 indexed marketId, uint256 indexed debateId, bytes32 dataHash);
    event DebateResolutionSubmitted(uint256 indexed marketId, uint256 indexed debateId, uint8 outcome, uint256 confidence);

    constructor(address _predictionMarket) Ownable(msg.sender) {
        predictionMarket = IPredictionMarket(_predictionMarket);
    }

    // ============ Resolution Request ============

    /**
     * @notice Request resolution for a market
     * @param marketId The market to resolve
     * @param battleId The associated battle ID (0 for custom markets)
     * @param battleData Encoded battle outcome data for AI verification
     */
    function requestResolution(
        uint256 marketId,
        uint256 battleId,
        bytes calldata battleData
    ) external override {
        IPredictionMarket.Market memory market = predictionMarket.getMarket(marketId);

        if (market.id == 0) revert ZeroGOracle__InvalidMarket();
        if (block.timestamp < market.endTime) revert ZeroGOracle__InvalidMarket();
        if (resolutionRequests[marketId].status != ResolutionStatus.PENDING &&
            resolutionRequests[marketId].requestTime != 0) {
            revert ZeroGOracle__ResolutionPending();
        }

        bytes32 dataHash = keccak256(battleData);

        resolutionRequests[marketId] = ResolutionRequest({
            marketId: marketId,
            battleId: battleId,
            requestTime: block.timestamp,
            resolveTime: 0,
            status: ResolutionStatus.PENDING,
            dataHash: dataHash,
            aiSigners: new address[](0),
            aiSignatures: new bytes[](0),
            outcome: 0,
            disputeDeadline: 0
        });

        emit ResolutionRequested(marketId, battleId, dataHash, block.timestamp);
    }

    /**
     * @notice Submit AI resolution with proofs
     * @param marketId The market being resolved
     * @param outcome The determined outcome (1=YES, 2=NO, 3=INVALID)
     * @param aiSignatures Array of AI provider signatures
     * @param aiProof Additional proof data from 0G compute (unused for now, reserved for ZK proofs)
     */
    function submitResolution(
        uint256 marketId,
        uint8 outcome,
        bytes[] calldata aiSignatures,
        bytes calldata aiProof
    ) external override {
        ResolutionRequest storage request = resolutionRequests[marketId];

        if (request.requestTime == 0) revert ZeroGOracle__InvalidMarket();
        if (request.status != ResolutionStatus.PENDING) revert ZeroGOracle__AlreadyResolved();

        // Verify we have enough valid signatures
        uint256 validSignatures = 0;
        address[] memory signers = new address[](aiSignatures.length);

        // Create the message that was signed
        bytes32 messageHash = keccak256(
            abi.encodePacked(marketId, outcome, request.dataHash)
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        for (uint256 i = 0; i < aiSignatures.length; i++) {
            address signer = ethSignedHash.recover(aiSignatures[i]);

            // Check if signer is a registered AI provider
            if (aiProviders[signer].isActive) {
                signers[validSignatures] = signer;
                validSignatures++;
                aiProviders[signer].totalResolutions++;
            }
        }

        if (validSignatures < MIN_CONSENSUS) revert ZeroGOracle__InsufficientConsensus();

        // Update request
        request.status = ResolutionStatus.SUBMITTED;
        request.outcome = outcome;
        request.resolveTime = block.timestamp;
        request.disputeDeadline = block.timestamp + DISPUTE_PERIOD;

        // Store signers (resize array to actual count)
        address[] memory actualSigners = new address[](validSignatures);
        for (uint256 i = 0; i < validSignatures; i++) {
            actualSigners[i] = signers[i];
        }
        request.aiSigners = actualSigners;
        request.aiSignatures = aiSignatures;

        // Mark successful resolutions
        for (uint256 i = 0; i < validSignatures; i++) {
            aiProviders[actualSigners[i]].successfulResolutions++;
        }

        emit ResolutionSubmitted(
            marketId,
            outcome,
            msg.sender,
            keccak256(aiProof)
        );
    }

    /**
     * @notice Finalize resolution after dispute period
     * @param marketId The market to finalize
     */
    function finalizeResolution(uint256 marketId) external override {
        ResolutionRequest storage request = resolutionRequests[marketId];

        if (request.status != ResolutionStatus.SUBMITTED) revert ZeroGOracle__InvalidMarket();
        if (block.timestamp < request.disputeDeadline) revert ZeroGOracle__DisputePeriodActive();

        request.status = ResolutionStatus.FINALIZED;

        // Resolve the market in prediction market contract
        IPredictionMarket.Outcome outcome;
        if (request.outcome == 1) {
            outcome = IPredictionMarket.Outcome.YES;
        } else if (request.outcome == 2) {
            outcome = IPredictionMarket.Outcome.NO;
        } else {
            outcome = IPredictionMarket.Outcome.INVALID;
        }

        predictionMarket.resolveMarket(marketId, outcome, "");

        emit ResolutionFinalized(marketId, request.outcome);
    }

    /**
     * @notice Dispute a resolution during dispute period
     * @param marketId The market to dispute
     * @param evidence Evidence supporting the dispute
     */
    function disputeResolution(
        uint256 marketId,
        bytes calldata evidence
    ) external payable override {
        ResolutionRequest storage request = resolutionRequests[marketId];

        if (request.status != ResolutionStatus.SUBMITTED) revert ZeroGOracle__InvalidMarket();
        if (block.timestamp >= request.disputeDeadline) revert ZeroGOracle__DisputePeriodExpired();
        if (msg.value < MIN_DISPUTE_STAKE) revert ZeroGOracle__InsufficientDisputeStake();

        request.status = ResolutionStatus.DISPUTED;
        disputedBy[marketId] = msg.sender;
        disputeStakes[marketId] = msg.value;
        disputeEvidence[marketId] = evidence;

        emit ResolutionDisputed(marketId, msg.sender, string(evidence));
    }

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
    ) external override onlyOwner {
        ResolutionRequest storage request = resolutionRequests[marketId];

        if (request.status != ResolutionStatus.DISPUTED) revert ZeroGOracle__NotDisputed();

        request.status = ResolutionStatus.FINALIZED;
        request.outcome = finalOutcome;

        // Handle stake
        address disputer = disputedBy[marketId];
        uint256 stake = disputeStakes[marketId];

        if (upholdDispute) {
            // Return stake to disputer + bonus from protocol
            payable(disputer).transfer(stake);
        }
        // If dispute failed, stake is kept by protocol

        // Resolve market
        IPredictionMarket.Outcome outcome;
        if (finalOutcome == 1) {
            outcome = IPredictionMarket.Outcome.YES;
        } else if (finalOutcome == 2) {
            outcome = IPredictionMarket.Outcome.NO;
        } else {
            outcome = IPredictionMarket.Outcome.INVALID;
        }

        predictionMarket.resolveMarket(marketId, outcome, "");

        emit DisputeResolved(marketId, finalOutcome, upholdDispute);
    }

    // ============ Debate-Based Resolution ============

    /**
     * @notice Request resolution using AI debate system
     * @param marketId The market to resolve
     * @param battleId The associated battle ID
     * @param battleData Encoded battle outcome data for AI debate
     */
    function requestResolutionWithDebate(
        uint256 marketId,
        uint256 battleId,
        bytes calldata battleData
    ) external {
        if (address(aiDebateOracle) == address(0)) revert ZeroGOracle__Unauthorized();

        IPredictionMarket.Market memory market = predictionMarket.getMarket(marketId);
        if (market.id == 0) revert ZeroGOracle__InvalidMarket();
        if (block.timestamp < market.endTime) revert ZeroGOracle__InvalidMarket();

        bytes32 dataHash = keccak256(battleData);

        // Initialize resolution request
        resolutionRequests[marketId] = ResolutionRequest({
            marketId: marketId,
            battleId: battleId,
            requestTime: block.timestamp,
            resolveTime: 0,
            status: ResolutionStatus.PENDING,
            dataHash: dataHash,
            aiSigners: new address[](0),
            aiSignatures: new bytes[](0),
            outcome: 0,
            disputeDeadline: 0
        });

        // Start debate in AIDebateOracle
        uint256 debateId = aiDebateOracle.startDebate(marketId, battleId);
        marketToDebate[marketId] = debateId;

        emit DebateResolutionRequested(marketId, debateId, dataHash);
    }

    /**
     * @notice Submit resolution from finalized debate consensus
     * @param marketId The market being resolved
     * @param debateId The debate ID that reached consensus
     */
    function submitResolutionFromDebate(
        uint256 marketId,
        uint256 debateId
    ) external {
        if (address(aiDebateOracle) == address(0)) revert ZeroGOracle__Unauthorized();
        if (marketToDebate[marketId] != debateId) revert ZeroGOracle__InvalidMarket();

        ResolutionRequest storage request = resolutionRequests[marketId];
        if (request.status != ResolutionStatus.PENDING) revert ZeroGOracle__AlreadyResolved();

        // Get debate phase and consensus from AIDebateOracle
        IAIDebateOracle.DebatePhase phase = aiDebateOracle.getDebatePhase(debateId);

        // Verify debate is finalized
        if (phase != IAIDebateOracle.DebatePhase.FINALIZED) {
            revert ZeroGOracle__InsufficientConsensus();
        }

        // Get consensus result
        IAIDebateOracle.ConsensusResult memory consensus = aiDebateOracle.getDebateConsensus(debateId);

        // Verify consensus confidence meets minimum threshold
        if (consensus.confidence < 6000) { // 60% minimum confidence
            revert ZeroGOracle__InsufficientConsensus();
        }

        // Map debate outcome to market outcome
        uint8 outcome;
        if (consensus.outcome == IAIDebateOracle.PredictionOutcome.YES) {
            outcome = 1;
        } else if (consensus.outcome == IAIDebateOracle.PredictionOutcome.NO) {
            outcome = 2;
        } else {
            outcome = 3; // INVALID/DRAW
        }

        // Update resolution request
        request.status = ResolutionStatus.SUBMITTED;
        request.outcome = outcome;
        request.resolveTime = block.timestamp;
        request.disputeDeadline = block.timestamp + DISPUTE_PERIOD;

        // Mark as debate-based resolution
        debateBasedResolution[marketId] = true;

        emit DebateResolutionSubmitted(marketId, debateId, outcome, consensus.confidence);
    }

    /**
     * @notice Check if a market was resolved via debate
     * @param marketId The market to check
     */
    function isDebateBasedResolution(uint256 marketId) external view returns (bool) {
        return debateBasedResolution[marketId];
    }

    /**
     * @notice Get the debate ID for a market
     * @param marketId The market to check
     */
    function getMarketDebateId(uint256 marketId) external view returns (uint256) {
        return marketToDebate[marketId];
    }

    // ============ AI Provider Management ============

    /**
     * @notice Register a new AI provider
     * @param provider The provider's signing address
     * @param model The AI model identifier
     */
    function registerAIProvider(
        address provider,
        string calldata model
    ) external override onlyOwner {
        if (aiProviders[provider].providerAddress != address(0)) {
            revert ZeroGOracle__ProviderExists();
        }

        aiProviders[provider] = AIProvider({
            providerAddress: provider,
            model: model,
            isActive: true,
            totalResolutions: 0,
            successfulResolutions: 0
        });

        providerAddresses.push(provider);

        emit AIProviderRegistered(provider, model);
    }

    /**
     * @notice Remove an AI provider
     * @param provider The provider to remove
     */
    function removeAIProvider(address provider) external override onlyOwner {
        if (aiProviders[provider].providerAddress == address(0)) {
            revert ZeroGOracle__ProviderNotFound();
        }

        aiProviders[provider].isActive = false;

        // Remove from array
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            if (providerAddresses[i] == provider) {
                providerAddresses[i] = providerAddresses[providerAddresses.length - 1];
                providerAddresses.pop();
                break;
            }
        }

        emit AIProviderRemoved(provider);
    }

    // ============ View Functions ============

    function getResolutionRequest(uint256 marketId)
        external view override returns (ResolutionRequest memory)
    {
        return resolutionRequests[marketId];
    }

    function verifyAISignature(
        bytes32 data,
        bytes calldata signature
    ) external view override returns (bool isValid, address signer) {
        bytes32 ethSignedHash = data.toEthSignedMessageHash();
        signer = ethSignedHash.recover(signature);
        isValid = aiProviders[signer].isActive;
    }

    function getAIProviders() external view override returns (AIProvider[] memory) {
        AIProvider[] memory providers = new AIProvider[](providerAddresses.length);
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            providers[i] = aiProviders[providerAddresses[i]];
        }
        return providers;
    }

    function canFinalize(uint256 marketId) external view override returns (bool) {
        ResolutionRequest storage request = resolutionRequests[marketId];
        return request.status == ResolutionStatus.SUBMITTED &&
               block.timestamp >= request.disputeDeadline;
    }

    function getMinConsensus() external pure override returns (uint256) {
        return MIN_CONSENSUS;
    }

    function getDisputePeriod() external pure override returns (uint256) {
        return DISPUTE_PERIOD;
    }

    function getActiveProviderCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < providerAddresses.length; i++) {
            if (aiProviders[providerAddresses[i]].isActive) {
                count++;
            }
        }
        return count;
    }

    // ============ Admin ============

    function setPredictionMarket(address _predictionMarket) external onlyOwner {
        address oldAddress = address(predictionMarket);
        predictionMarket = IPredictionMarket(_predictionMarket);
        emit PredictionMarketUpdated(oldAddress, _predictionMarket);
    }

    /**
     * @notice Set the AI Debate Oracle address
     * @param _aiDebateOracle The address of the AIDebateOracle contract
     */
    function setAIDebateOracle(address _aiDebateOracle) external onlyOwner {
        address oldOracle = address(aiDebateOracle);
        aiDebateOracle = IAIDebateOracle(_aiDebateOracle);
        emit AIDebateOracleUpdated(oldOracle, _aiDebateOracle);
    }

    /**
     * @notice Get the AI Debate Oracle address
     */
    function getAIDebateOracle() external view returns (address) {
        return address(aiDebateOracle);
    }

    /**
     * @notice Emergency withdrawal of stuck funds
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}
