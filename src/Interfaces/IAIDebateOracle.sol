// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAIDebateOracle
 * @notice Interface for AI Debate Oracle contract
 */
interface IAIDebateOracle {
    // Enums
    enum DebatePhase {
        INACTIVE,
        PREDICTION,
        EVIDENCE,
        REBUTTAL,
        CONSENSUS,
        FINALIZED,
        DISPUTED
    }

    enum PredictionOutcome {
        UNDECIDED,
        YES,
        NO,
        DRAW
    }

    enum DisputeStatus {
        NONE,
        PENDING,
        UPHELD,
        REJECTED
    }

    // Structs
    struct DebateAgent {
        uint256 agentId;
        address operator;
        address signingKey;
        string model;
        uint256 totalDebates;
        uint256 correctPredictions;
        uint256 accuracyBps;
        bool isActive;
    }

    struct Prediction {
        uint256 agentId;
        PredictionOutcome outcome;
        uint256 confidence;
        bytes32 reasoningHash;
        string reasoning;
        uint256 timestamp;
        bytes signature;
        bool reasoningRevealed;
    }

    struct Rebuttal {
        uint256 agentId;
        uint256 targetAgentId;
        string argument;
        bytes32 evidenceHash;
        uint256 timestamp;
    }

    struct ConsensusResult {
        PredictionOutcome outcome;
        uint256 confidence;
        uint256 yesWeight;
        uint256 noWeight;
        uint256 drawWeight;
        uint256 totalWeight;
    }

    struct Dispute {
        uint256 debateId;
        address disputer;
        string evidence;
        uint256 stake;
        uint256 timestamp;
        DisputeStatus status;
    }

    // Events
    event DebateStarted(uint256 indexed debateId, uint256 indexed marketId, uint256 battleId, uint256 predictionDeadline);
    event PredictionSubmitted(uint256 indexed debateId, uint256 indexed agentId, PredictionOutcome outcome, uint256 confidence);
    event ReasoningRevealed(uint256 indexed debateId, uint256 indexed agentId, string reasoning);
    event RebuttalSubmitted(uint256 indexed debateId, uint256 indexed agentId, uint256 targetAgentId);
    event PhaseAdvanced(uint256 indexed debateId, DebatePhase oldPhase, DebatePhase newPhase);
    event ConsensusReached(uint256 indexed debateId, PredictionOutcome outcome, uint256 confidence, bytes32 proofHash);
    event DebateFinalized(uint256 indexed debateId, PredictionOutcome outcome);
    event DisputeRaised(uint256 indexed debateId, address indexed disputer, uint256 stake);
    event DisputeResolved(uint256 indexed debateId, DisputeStatus status, address resolver);

    // Functions
    function startDebate(uint256 marketId, uint256 battleId) external returns (uint256 debateId);
    function getDebatePhase(uint256 debateId) external view returns (DebatePhase);
    function getDebateConsensus(uint256 debateId) external view returns (ConsensusResult memory);
    function getDebatePrediction(uint256 debateId, uint256 agentId) external view returns (Prediction memory);
    function getDebateParticipants(uint256 debateId) external view returns (uint256[] memory);
    function getDebateRebuttals(uint256 debateId) external view returns (Rebuttal[] memory);
    function getDebateAgent(uint256 agentId) external view returns (DebateAgent memory);
    function canFinalize(uint256 debateId) external view returns (bool);
    function updateAgentAccuracy(uint256 debateId, PredictionOutcome actualOutcome) external;
}
