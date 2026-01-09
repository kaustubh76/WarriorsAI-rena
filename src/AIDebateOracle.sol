// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title AIDebateOracle
 * @author Warriors AI Arena
 * @notice Multi-agent debate system for transparent AI-powered market predictions
 * @dev AI agents debate battle outcomes with transparent reasoning before execution
 *
 * Debate Flow:
 * 1. PREDICTION (10 min): Agents submit predictions + reasoning hash
 * 2. EVIDENCE (5 min): Reveal reasoning, query 0G RAG
 * 3. REBUTTAL (5 min): Challenge other predictions
 * 4. CONSENSUS: Bayesian aggregation weighted by accuracy
 * 5. EXECUTION: Publish consensus, agents trade
 *
 * Features:
 * - Multiple AI agents submit signed predictions
 * - Reasoning transparency with hash commitments
 * - Accuracy-weighted consensus
 * - Dispute mechanism for contested outcomes
 */
contract AIDebateOracle is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Errors ============
    error AIDebate__InvalidMarket();
    error AIDebate__DebateNotActive();
    error AIDebate__InvalidPhase();
    error AIDebate__AlreadySubmitted();
    error AIDebate__InvalidSignature();
    error AIDebate__NotRegisteredAgent();
    error AIDebate__InsufficientConsensus();
    error AIDebate__DebateNotFinalized();
    error AIDebate__DisputePeriodActive();
    error AIDebate__DisputePeriodEnded();
    error AIDebate__InvalidDispute();
    error AIDebate__InsufficientStake();
    error AIDebate__NoRebuttalTarget();
    error AIDebate__SelfRebuttalNotAllowed();
    error AIDebate__DebateAlreadyExists();
    error AIDebate__Unauthorized();

    // ============ Enums ============

    /// @notice Debate phases
    enum DebatePhase {
        INACTIVE,
        PREDICTION,     // Agents submit predictions
        EVIDENCE,       // Reveal reasoning
        REBUTTAL,       // Challenge predictions
        CONSENSUS,      // Calculate weighted consensus
        FINALIZED,      // Ready for execution
        DISPUTED        // Under dispute
    }

    /// @notice Prediction outcome
    enum PredictionOutcome {
        UNDECIDED,
        YES,            // Warrior 1 wins
        NO,             // Warrior 2 wins
        DRAW
    }

    /// @notice Dispute status
    enum DisputeStatus {
        NONE,
        PENDING,
        UPHELD,
        REJECTED
    }

    // ============ Structs ============

    /// @notice AI Agent configuration for debates
    struct DebateAgent {
        uint256 agentId;
        address operator;
        address signingKey;         // Key used for signing predictions
        string model;               // AI model identifier (e.g., "0G-GPT-4")
        uint256 totalDebates;
        uint256 correctPredictions;
        uint256 accuracyBps;        // Accuracy in basis points
        bool isActive;
    }

    /// @notice Individual prediction submission
    struct Prediction {
        uint256 agentId;
        PredictionOutcome outcome;
        uint256 confidence;         // 0-10000 basis points
        bytes32 reasoningHash;      // Hash of reasoning (revealed later)
        string reasoning;           // Revealed reasoning
        uint256 timestamp;
        bytes signature;
        bool reasoningRevealed;
    }

    /// @notice Rebuttal to another prediction
    struct Rebuttal {
        uint256 agentId;
        uint256 targetAgentId;      // Agent being rebutted
        string argument;
        bytes32 evidenceHash;
        uint256 timestamp;
    }

    /// @notice Full debate for a market
    struct Debate {
        uint256 marketId;
        uint256 battleId;
        DebatePhase phase;
        uint256 phaseDeadline;
        uint256[] participatingAgents;
        mapping(uint256 => Prediction) predictions;
        Rebuttal[] rebuttals;
        PredictionOutcome consensusOutcome;
        uint256 consensusConfidence;
        bytes32 consensusProofHash;
        uint256 createdAt;
        uint256 finalizedAt;
        DisputeStatus disputeStatus;
    }

    /// @notice Dispute submission
    struct Dispute {
        uint256 debateId;
        address disputer;
        string evidence;
        uint256 stake;
        uint256 timestamp;
        DisputeStatus status;
    }

    /// @notice Consensus result
    struct ConsensusResult {
        PredictionOutcome outcome;
        uint256 confidence;
        uint256 yesWeight;
        uint256 noWeight;
        uint256 drawWeight;
        uint256 totalWeight;
    }

    // ============ Constants ============
    uint256 public constant PREDICTION_DURATION = 10 minutes;
    uint256 public constant EVIDENCE_DURATION = 5 minutes;
    uint256 public constant REBUTTAL_DURATION = 5 minutes;
    uint256 public constant DISPUTE_PERIOD = 24 hours;

    uint256 public constant MIN_CONSENSUS_CONFIDENCE = 6000;    // 60%
    uint256 public constant MIN_AGENTS_FOR_CONSENSUS = 2;
    uint256 public constant MIN_DISPUTE_STAKE = 10 ether;       // 10 CRwN

    uint256 public constant FEE_DENOMINATOR = 10000;

    // ============ State ============
    IERC20 public immutable crownToken;
    address public predictionMarket;
    address public aiAgentRegistry;

    uint256 public nextDebateId = 1;
    uint256 public totalDebates;

    // Debate storage (using mapping + separate struct due to nested mapping)
    mapping(uint256 => uint256) public debateMarketIds;
    mapping(uint256 => uint256) public debateBattleIds;
    mapping(uint256 => DebatePhase) public debatePhases;
    mapping(uint256 => uint256) public debatePhaseDeadlines;
    mapping(uint256 => uint256[]) public debateParticipants;
    mapping(uint256 => mapping(uint256 => Prediction)) public debatePredictions;
    mapping(uint256 => Rebuttal[]) public debateRebuttals;
    mapping(uint256 => ConsensusResult) public debateConsensus;
    mapping(uint256 => uint256) public debateCreatedAt;
    mapping(uint256 => uint256) public debateFinalizedAt;
    mapping(uint256 => DisputeStatus) public debateDisputeStatus;

    // Agent registry
    mapping(uint256 => DebateAgent) public debateAgents;
    mapping(address => uint256) public signingKeyToAgent;
    uint256[] public activeAgentIds;

    // Market to debate mapping
    mapping(uint256 => uint256) public marketToDebate;

    // Disputes
    mapping(uint256 => Dispute) public disputes;

    // ============ Events ============
    event DebateStarted(
        uint256 indexed debateId,
        uint256 indexed marketId,
        uint256 battleId,
        uint256 predictionDeadline
    );

    event PredictionSubmitted(
        uint256 indexed debateId,
        uint256 indexed agentId,
        PredictionOutcome outcome,
        uint256 confidence
    );

    event ReasoningRevealed(
        uint256 indexed debateId,
        uint256 indexed agentId,
        string reasoning
    );

    event RebuttalSubmitted(
        uint256 indexed debateId,
        uint256 indexed agentId,
        uint256 targetAgentId
    );

    event PhaseAdvanced(
        uint256 indexed debateId,
        DebatePhase oldPhase,
        DebatePhase newPhase
    );

    event ConsensusReached(
        uint256 indexed debateId,
        PredictionOutcome outcome,
        uint256 confidence,
        bytes32 proofHash
    );

    event DebateFinalized(
        uint256 indexed debateId,
        PredictionOutcome outcome
    );

    event DisputeRaised(
        uint256 indexed debateId,
        address indexed disputer,
        uint256 stake
    );

    event DisputeResolved(
        uint256 indexed debateId,
        DisputeStatus status,
        address resolver
    );

    event AgentRegistered(
        uint256 indexed agentId,
        address operator,
        address signingKey,
        string model
    );

    event AgentAccuracyUpdated(
        uint256 indexed agentId,
        uint256 newAccuracy
    );

    // ============ Constructor ============
    constructor(address _crownToken) Ownable(msg.sender) {
        crownToken = IERC20(_crownToken);
    }

    // ============ Agent Management ============

    /**
     * @notice Register an AI agent for debates
     */
    function registerDebateAgent(
        uint256 agentId,
        address operator,
        address signingKey,
        string calldata model
    ) external {
        // In production, verify against AIAgentRegistry
        if (signingKey == address(0)) revert AIDebate__InvalidSignature();

        debateAgents[agentId] = DebateAgent({
            agentId: agentId,
            operator: operator,
            signingKey: signingKey,
            model: model,
            totalDebates: 0,
            correctPredictions: 0,
            accuracyBps: 5000,  // Start at 50%
            isActive: true
        });

        signingKeyToAgent[signingKey] = agentId;
        activeAgentIds.push(agentId);

        emit AgentRegistered(agentId, operator, signingKey, model);
    }

    // ============ Debate Lifecycle ============

    /**
     * @notice Start a new debate for a market
     */
    function startDebate(
        uint256 marketId,
        uint256 battleId
    ) external returns (uint256 debateId) {
        if (marketToDebate[marketId] != 0) revert AIDebate__DebateAlreadyExists();

        debateId = nextDebateId++;

        debateMarketIds[debateId] = marketId;
        debateBattleIds[debateId] = battleId;
        debatePhases[debateId] = DebatePhase.PREDICTION;
        debatePhaseDeadlines[debateId] = block.timestamp + PREDICTION_DURATION;
        debateCreatedAt[debateId] = block.timestamp;

        marketToDebate[marketId] = debateId;
        totalDebates++;

        emit DebateStarted(debateId, marketId, battleId, debatePhaseDeadlines[debateId]);
    }

    /**
     * @notice Submit a prediction (PREDICTION phase)
     */
    function submitPrediction(
        uint256 debateId,
        uint256 agentId,
        PredictionOutcome outcome,
        uint256 confidence,
        bytes32 reasoningHash,
        bytes calldata signature
    ) external {
        if (debatePhases[debateId] != DebatePhase.PREDICTION) revert AIDebate__InvalidPhase();
        if (block.timestamp > debatePhaseDeadlines[debateId]) revert AIDebate__InvalidPhase();

        DebateAgent storage agent = debateAgents[agentId];
        if (!agent.isActive) revert AIDebate__NotRegisteredAgent();

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            debateId,
            agentId,
            outcome,
            confidence,
            reasoningHash
        ));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);

        if (recovered != agent.signingKey) revert AIDebate__InvalidSignature();

        // Check not already submitted
        if (debatePredictions[debateId][agentId].timestamp != 0) {
            revert AIDebate__AlreadySubmitted();
        }

        // Store prediction
        debatePredictions[debateId][agentId] = Prediction({
            agentId: agentId,
            outcome: outcome,
            confidence: confidence,
            reasoningHash: reasoningHash,
            reasoning: "",
            timestamp: block.timestamp,
            signature: signature,
            reasoningRevealed: false
        });

        debateParticipants[debateId].push(agentId);

        emit PredictionSubmitted(debateId, agentId, outcome, confidence);
    }

    /**
     * @notice Reveal reasoning (EVIDENCE phase)
     */
    function revealReasoning(
        uint256 debateId,
        uint256 agentId,
        string calldata reasoning
    ) external {
        if (debatePhases[debateId] != DebatePhase.EVIDENCE) revert AIDebate__InvalidPhase();
        if (block.timestamp > debatePhaseDeadlines[debateId]) revert AIDebate__InvalidPhase();

        Prediction storage pred = debatePredictions[debateId][agentId];
        if (pred.timestamp == 0) revert AIDebate__NotRegisteredAgent();
        if (pred.reasoningRevealed) revert AIDebate__AlreadySubmitted();

        // Verify reasoning matches hash
        bytes32 computedHash = keccak256(abi.encodePacked(reasoning));
        if (computedHash != pred.reasoningHash) revert AIDebate__InvalidSignature();

        pred.reasoning = reasoning;
        pred.reasoningRevealed = true;

        emit ReasoningRevealed(debateId, agentId, reasoning);
    }

    /**
     * @notice Submit a rebuttal (REBUTTAL phase)
     */
    function submitRebuttal(
        uint256 debateId,
        uint256 agentId,
        uint256 targetAgentId,
        string calldata argument,
        bytes32 evidenceHash
    ) external {
        if (debatePhases[debateId] != DebatePhase.REBUTTAL) revert AIDebate__InvalidPhase();
        if (block.timestamp > debatePhaseDeadlines[debateId]) revert AIDebate__InvalidPhase();

        if (agentId == targetAgentId) revert AIDebate__SelfRebuttalNotAllowed();

        // Verify target has a prediction
        if (debatePredictions[debateId][targetAgentId].timestamp == 0) {
            revert AIDebate__NoRebuttalTarget();
        }

        debateRebuttals[debateId].push(Rebuttal({
            agentId: agentId,
            targetAgentId: targetAgentId,
            argument: argument,
            evidenceHash: evidenceHash,
            timestamp: block.timestamp
        }));

        emit RebuttalSubmitted(debateId, agentId, targetAgentId);
    }

    /**
     * @notice Advance to next phase
     */
    function advancePhase(uint256 debateId) external {
        DebatePhase currentPhase = debatePhases[debateId];

        // Allow advancing if deadline passed
        if (block.timestamp < debatePhaseDeadlines[debateId]) {
            // Only owner can force advance before deadline
            if (msg.sender != owner()) revert AIDebate__InvalidPhase();
        }

        DebatePhase newPhase;
        uint256 newDeadline;

        if (currentPhase == DebatePhase.PREDICTION) {
            newPhase = DebatePhase.EVIDENCE;
            newDeadline = block.timestamp + EVIDENCE_DURATION;
        } else if (currentPhase == DebatePhase.EVIDENCE) {
            newPhase = DebatePhase.REBUTTAL;
            newDeadline = block.timestamp + REBUTTAL_DURATION;
        } else if (currentPhase == DebatePhase.REBUTTAL) {
            newPhase = DebatePhase.CONSENSUS;
            newDeadline = block.timestamp; // Immediate
            _calculateConsensus(debateId);
        } else if (currentPhase == DebatePhase.CONSENSUS) {
            newPhase = DebatePhase.FINALIZED;
            newDeadline = block.timestamp + DISPUTE_PERIOD;
            debateFinalizedAt[debateId] = block.timestamp;
        } else {
            revert AIDebate__InvalidPhase();
        }

        debatePhases[debateId] = newPhase;
        debatePhaseDeadlines[debateId] = newDeadline;

        emit PhaseAdvanced(debateId, currentPhase, newPhase);

        if (newPhase == DebatePhase.FINALIZED) {
            emit DebateFinalized(debateId, debateConsensus[debateId].outcome);
        }
    }

    // ============ Consensus ============

    /**
     * @notice Calculate weighted consensus from predictions
     */
    function _calculateConsensus(uint256 debateId) internal {
        uint256[] storage participants = debateParticipants[debateId];

        if (participants.length < MIN_AGENTS_FOR_CONSENSUS) {
            revert AIDebate__InsufficientConsensus();
        }

        uint256 yesWeight = 0;
        uint256 noWeight = 0;
        uint256 drawWeight = 0;
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < participants.length; i++) {
            uint256 agentId = participants[i];
            Prediction storage pred = debatePredictions[debateId][agentId];
            DebateAgent storage agent = debateAgents[agentId];

            // Weight = confidence * accuracy
            uint256 weight = (pred.confidence * agent.accuracyBps) / FEE_DENOMINATOR;

            if (pred.outcome == PredictionOutcome.YES) {
                yesWeight += weight;
            } else if (pred.outcome == PredictionOutcome.NO) {
                noWeight += weight;
            } else if (pred.outcome == PredictionOutcome.DRAW) {
                drawWeight += weight;
            }

            totalWeight += weight;
        }

        // Determine consensus outcome
        PredictionOutcome consensusOutcome;
        uint256 winningWeight;

        if (yesWeight >= noWeight && yesWeight >= drawWeight) {
            consensusOutcome = PredictionOutcome.YES;
            winningWeight = yesWeight;
        } else if (noWeight >= yesWeight && noWeight >= drawWeight) {
            consensusOutcome = PredictionOutcome.NO;
            winningWeight = noWeight;
        } else {
            consensusOutcome = PredictionOutcome.DRAW;
            winningWeight = drawWeight;
        }

        // Calculate confidence (winning weight as percentage of total)
        uint256 confidence = totalWeight > 0 ? (winningWeight * FEE_DENOMINATOR) / totalWeight : 0;

        // Check minimum confidence threshold
        if (confidence < MIN_CONSENSUS_CONFIDENCE) {
            // Default to undecided if no strong consensus
            consensusOutcome = PredictionOutcome.UNDECIDED;
        }

        // Generate proof hash
        bytes32 proofHash = keccak256(abi.encodePacked(
            debateId,
            consensusOutcome,
            confidence,
            participants,
            block.timestamp
        ));

        // Store consensus
        debateConsensus[debateId] = ConsensusResult({
            outcome: consensusOutcome,
            confidence: confidence,
            yesWeight: yesWeight,
            noWeight: noWeight,
            drawWeight: drawWeight,
            totalWeight: totalWeight
        });

        emit ConsensusReached(debateId, consensusOutcome, confidence, proofHash);
    }

    // ============ Disputes ============

    /**
     * @notice Raise a dispute against the consensus
     */
    function raiseDispute(
        uint256 debateId,
        string calldata evidence
    ) external nonReentrant {
        if (debatePhases[debateId] != DebatePhase.FINALIZED) revert AIDebate__DebateNotFinalized();
        if (block.timestamp > debateFinalizedAt[debateId] + DISPUTE_PERIOD) {
            revert AIDebate__DisputePeriodEnded();
        }
        if (debateDisputeStatus[debateId] != DisputeStatus.NONE) {
            revert AIDebate__InvalidDispute();
        }

        // Require stake
        crownToken.transferFrom(msg.sender, address(this), MIN_DISPUTE_STAKE);

        disputes[debateId] = Dispute({
            debateId: debateId,
            disputer: msg.sender,
            evidence: evidence,
            stake: MIN_DISPUTE_STAKE,
            timestamp: block.timestamp,
            status: DisputeStatus.PENDING
        });

        debatePhases[debateId] = DebatePhase.DISPUTED;
        debateDisputeStatus[debateId] = DisputeStatus.PENDING;

        emit DisputeRaised(debateId, msg.sender, MIN_DISPUTE_STAKE);
    }

    /**
     * @notice Resolve a dispute (owner only)
     */
    function resolveDispute(
        uint256 debateId,
        bool upheld,
        PredictionOutcome newOutcome
    ) external onlyOwner {
        if (debateDisputeStatus[debateId] != DisputeStatus.PENDING) {
            revert AIDebate__InvalidDispute();
        }

        Dispute storage dispute = disputes[debateId];

        if (upheld) {
            dispute.status = DisputeStatus.UPHELD;
            debateDisputeStatus[debateId] = DisputeStatus.UPHELD;

            // Update consensus
            debateConsensus[debateId].outcome = newOutcome;

            // Refund stake + bonus
            crownToken.transfer(dispute.disputer, dispute.stake + (dispute.stake / 10));
        } else {
            dispute.status = DisputeStatus.REJECTED;
            debateDisputeStatus[debateId] = DisputeStatus.REJECTED;

            // Stake goes to protocol
        }

        debatePhases[debateId] = DebatePhase.FINALIZED;

        emit DisputeResolved(debateId, dispute.status, msg.sender);
    }

    // ============ Agent Accuracy Update ============

    /**
     * @notice Update agent accuracy after market resolution
     */
    function updateAgentAccuracy(
        uint256 debateId,
        PredictionOutcome actualOutcome
    ) external {
        // In production, restrict to authorized contracts
        uint256[] storage participants = debateParticipants[debateId];

        for (uint256 i = 0; i < participants.length; i++) {
            uint256 agentId = participants[i];
            DebateAgent storage agent = debateAgents[agentId];
            Prediction storage pred = debatePredictions[debateId][agentId];

            agent.totalDebates++;

            if (pred.outcome == actualOutcome) {
                agent.correctPredictions++;
            }

            // Recalculate accuracy
            agent.accuracyBps = (agent.correctPredictions * FEE_DENOMINATOR) / agent.totalDebates;

            emit AgentAccuracyUpdated(agentId, agent.accuracyBps);
        }
    }

    // ============ View Functions ============

    function getDebatePhase(uint256 debateId) external view returns (DebatePhase) {
        return debatePhases[debateId];
    }

    function getDebateConsensus(uint256 debateId) external view returns (ConsensusResult memory) {
        return debateConsensus[debateId];
    }

    function getDebatePrediction(uint256 debateId, uint256 agentId) external view returns (Prediction memory) {
        return debatePredictions[debateId][agentId];
    }

    function getDebateParticipants(uint256 debateId) external view returns (uint256[] memory) {
        return debateParticipants[debateId];
    }

    function getDebateRebuttals(uint256 debateId) external view returns (Rebuttal[] memory) {
        return debateRebuttals[debateId];
    }

    function getDebateAgent(uint256 agentId) external view returns (DebateAgent memory) {
        return debateAgents[agentId];
    }

    function getActiveAgents() external view returns (uint256[] memory) {
        return activeAgentIds;
    }

    function getDispute(uint256 debateId) external view returns (Dispute memory) {
        return disputes[debateId];
    }

    function canFinalize(uint256 debateId) external view returns (bool) {
        if (debatePhases[debateId] != DebatePhase.FINALIZED) return false;
        if (debateDisputeStatus[debateId] == DisputeStatus.PENDING) return false;
        if (block.timestamp < debateFinalizedAt[debateId] + DISPUTE_PERIOD) return false;
        return true;
    }

    // ============ Admin Functions ============

    function setPredictionMarket(address _market) external onlyOwner {
        predictionMarket = _market;
    }

    function setAIAgentRegistry(address _registry) external onlyOwner {
        aiAgentRegistry = _registry;
    }

    function deactivateAgent(uint256 agentId) external onlyOwner {
        debateAgents[agentId].isActive = false;
    }

    function reactivateAgent(uint256 agentId) external onlyOwner {
        debateAgents[agentId].isActive = true;
    }
}
