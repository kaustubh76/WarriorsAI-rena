/**
 * Debate Service
 * Handles all interactions with the AIDebateOracle smart contract
 * Uses shared RPC client with rate limiting and caching
 */

import {
  formatEther,
  parseEther,
  type Address,
} from 'viem';
import { readContractWithRateLimit, batchReadContractsWithRateLimit } from '../lib/rpcClient';
import { chainsToContracts, AIDebateOracleAbi, crownTokenAbi , getChainId } from '../constants';
import type {
  DebateAgent,
  Prediction,
  Rebuttal,
  ConsensusResult,
  Dispute,
  DebatePhase,
  DebateState,
  DebateDisplay,
  PredictionDisplay,
  ConsensusBreakdown,
  DebateTimelineEvent,
  AgentDebateStats
} from '../types/debate';
import {
  getPhaseLabel,
  getPhaseColor,
  getPredictionOutcomeLabel,
  calculateConsensusBreakdown,
} from '../types/debate';

// Re-export types
export * from '../types/debate';

// Cache TTL configurations (in ms)
const CACHE_TTL = {
  DEBATE: 10000,          // 10 seconds - debate state changes during phases
  PREDICTION: 15000,      // 15 seconds - predictions don't change once submitted
  CONSENSUS: 30000,       // 30 seconds - consensus only changes at phase end
  AGENT: 60000,           // 1 minute - agent stats change slowly
  STATIC: 300000,         // 5 minutes - static data
};

class DebateService {
  private debateOracleAddress: Address;
  private crownTokenAddress: Address;
  private chainId: number = getChainId();

  constructor() {
    const contracts = chainsToContracts[this.chainId];
    this.debateOracleAddress = contracts.aiDebateOracle as Address;
    this.crownTokenAddress = contracts.crownToken as Address;
  }

  /**
   * Set contract address
   */
  setContractAddress(address: Address) {
    this.debateOracleAddress = address;
  }

  // ============================================================================
  // Read Functions (with rate limiting and caching)
  // ============================================================================

  /**
   * Get debate phase
   */
  async getDebatePhase(debateId: bigint): Promise<DebatePhase> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDebatePhase',
        args: [debateId]
      }, { cacheTTL: CACHE_TTL.DEBATE }) as DebatePhase;
    } catch (error) {
      console.error('Error fetching debate phase:', error);
      return 0; // INACTIVE
    }
  }

  /**
   * Get debate consensus
   */
  async getDebateConsensus(debateId: bigint): Promise<ConsensusResult | null> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDebateConsensus',
        args: [debateId]
      }, { cacheTTL: CACHE_TTL.CONSENSUS }) as ConsensusResult;
    } catch (error) {
      console.error('Error fetching debate consensus:', error);
      return null;
    }
  }

  /**
   * Get prediction for an agent in a debate
   */
  async getDebatePrediction(debateId: bigint, agentId: bigint): Promise<Prediction | null> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDebatePrediction',
        args: [debateId, agentId]
      }, { cacheTTL: CACHE_TTL.PREDICTION }) as Prediction;
    } catch (error) {
      console.error('Error fetching debate prediction:', error);
      return null;
    }
  }

  /**
   * Get debate participants
   */
  async getDebateParticipants(debateId: bigint): Promise<bigint[]> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDebateParticipants',
        args: [debateId]
      }, { cacheTTL: CACHE_TTL.DEBATE }) as bigint[];
    } catch (error) {
      console.error('Error fetching debate participants:', error);
      return [];
    }
  }

  /**
   * Get debate rebuttals
   */
  async getDebateRebuttals(debateId: bigint): Promise<Rebuttal[]> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDebateRebuttals',
        args: [debateId]
      }, { cacheTTL: CACHE_TTL.DEBATE }) as Rebuttal[];
    } catch (error) {
      console.error('Error fetching debate rebuttals:', error);
      return [];
    }
  }

  /**
   * Get debate agent info
   */
  async getDebateAgent(agentId: bigint): Promise<DebateAgent | null> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDebateAgent',
        args: [agentId]
      }, { cacheTTL: CACHE_TTL.AGENT }) as DebateAgent;
    } catch (error) {
      console.error('Error fetching debate agent:', error);
      return null;
    }
  }

  /**
   * Get dispute for a debate
   */
  async getDispute(debateId: bigint): Promise<Dispute | null> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDispute',
        args: [debateId]
      }, { cacheTTL: CACHE_TTL.DEBATE }) as Dispute;
    } catch (error) {
      console.error('Error fetching dispute:', error);
      return null;
    }
  }

  /**
   * Check if debate can be finalized
   */
  async canFinalize(debateId: bigint): Promise<boolean> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'canFinalize',
        args: [debateId]
      }, { cacheTTL: CACHE_TTL.DEBATE }) as boolean;
    } catch (error) {
      console.error('Error checking can finalize:', error);
      return false;
    }
  }

  /**
   * Get active debate agents
   */
  async getActiveAgents(): Promise<bigint[]> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getActiveAgents'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint[];
    } catch (error) {
      console.error('Error fetching active agents:', error);
      return [];
    }
  }

  /**
   * Get total debates
   */
  async getTotalDebates(): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'totalDebates'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching total debates:', error);
      return BigInt(0);
    }
  }

  /**
   * Get next debate ID
   */
  async getNextDebateId(): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'nextDebateId'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching next debate ID:', error);
      return BigInt(1);
    }
  }

  // ============================================================================
  // Aggregated Functions (optimized with batching)
  // ============================================================================

  /**
   * Get full debate state - optimized with parallel fetches
   */
  async getDebateState(debateId: bigint, marketId: bigint, battleId: bigint): Promise<DebateState | null> {
    // Fetch basic data in parallel
    const [phase, participants, rebuttals, consensus, dispute, canFinalizeNow] = await Promise.all([
      this.getDebatePhase(debateId),
      this.getDebateParticipants(debateId),
      this.getDebateRebuttals(debateId),
      this.getDebateConsensus(debateId),
      this.getDispute(debateId),
      this.canFinalize(debateId)
    ]);

    // Batch fetch predictions for all participants
    const predictions: Prediction[] = [];
    if (participants.length > 0) {
      const predictionCalls = participants.map(agentId => ({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'getDebatePrediction',
        args: [debateId, agentId]
      }));

      const predictionResults = await batchReadContractsWithRateLimit<(Prediction | null)[]>(
        predictionCalls,
        { cacheTTL: CACHE_TTL.PREDICTION }
      );

      for (const prediction of predictionResults) {
        if (prediction) {
          predictions.push(prediction);
        }
      }
    }

    return {
      debateId,
      marketId,
      battleId,
      phase,
      predictions,
      rebuttals,
      consensus,
      dispute,
      participants,
      phaseDeadlines: {
        predictionDeadline: BigInt(0),
        evidenceDeadline: BigInt(0),
        rebuttalDeadline: BigInt(0),
        consensusDeadline: BigInt(0)
      },
      isFinalized: phase === 5, // FINALIZED
      canFinalize: canFinalizeNow
    };
  }

  /**
   * Get debate with display values
   */
  async getDebateWithDisplay(
    debateId: bigint,
    marketId: bigint,
    battleId: bigint
  ): Promise<DebateDisplay | null> {
    const state = await this.getDebateState(debateId, marketId, battleId);
    if (!state) return null;

    const consensusConfidence = state.consensus
      ? Number(state.consensus.confidence) / 100
      : 0;

    return {
      ...state,
      phaseLabel: getPhaseLabel(state.phase),
      phaseColor: getPhaseColor(state.phase),
      timeRemaining: 'Calculating...',
      consensusLabel: state.consensus
        ? getPredictionOutcomeLabel(state.consensus.outcome)
        : 'Pending',
      consensusConfidencePercent: consensusConfidence,
      participantCount: state.participants.length,
      hasDispute: state.dispute !== null && state.dispute.status !== 0
    };
  }

  /**
   * Get all predictions with display values - optimized with batching
   */
  async getPredictionsWithDisplay(
    debateId: bigint,
    agentNameMap: Map<bigint, string>,
    agentTierMap: Map<bigint, string>
  ): Promise<PredictionDisplay[]> {
    const participants = await this.getDebateParticipants(debateId);
    const rebuttals = await this.getDebateRebuttals(debateId);

    if (participants.length === 0) return [];

    // Batch fetch predictions
    const predictionCalls = participants.map(agentId => ({
      address: this.debateOracleAddress,
      abi: AIDebateOracleAbi,
      functionName: 'getDebatePrediction',
      args: [debateId, agentId]
    }));

    const predictions = await batchReadContractsWithRateLimit<(Prediction | null)[]>(
      predictionCalls,
      { cacheTTL: CACHE_TTL.PREDICTION }
    );

    const displays: PredictionDisplay[] = [];

    for (let i = 0; i < participants.length; i++) {
      const agentId = participants[i];
      const prediction = predictions[i];
      if (!prediction) continue;

      const hasRebuttal = rebuttals.some(r => r.targetAgentId === agentId);

      displays.push({
        ...prediction,
        agentName: agentNameMap.get(agentId) ?? `Agent #${agentId}`,
        agentTier: agentTierMap.get(agentId) ?? 'Unknown',
        outcomeLabel: getPredictionOutcomeLabel(prediction.outcome),
        confidencePercent: Number(prediction.confidence) / 100,
        isRevealed: prediction.reasoningRevealed,
        hasRebuttal
      });
    }

    return displays;
  }

  /**
   * Get consensus breakdown for charts
   */
  async getConsensusBreakdown(debateId: bigint): Promise<ConsensusBreakdown[]> {
    const consensus = await this.getDebateConsensus(debateId);
    if (!consensus) return [];
    return calculateConsensusBreakdown(consensus);
  }

  /**
   * Build debate timeline - optimized with batching
   */
  async buildDebateTimeline(debateId: bigint): Promise<DebateTimelineEvent[]> {
    const timeline: DebateTimelineEvent[] = [];
    const participants = await this.getDebateParticipants(debateId);
    const rebuttals = await this.getDebateRebuttals(debateId);

    if (participants.length === 0) return timeline;

    // Batch fetch predictions
    const predictionCalls = participants.map(agentId => ({
      address: this.debateOracleAddress,
      abi: AIDebateOracleAbi,
      functionName: 'getDebatePrediction',
      args: [debateId, agentId]
    }));

    const predictions = await batchReadContractsWithRateLimit<(Prediction | null)[]>(
      predictionCalls,
      { cacheTTL: CACHE_TTL.PREDICTION }
    );

    // Add prediction events
    for (let i = 0; i < participants.length; i++) {
      const agentId = participants[i];
      const prediction = predictions[i];
      if (prediction && prediction.timestamp > BigInt(0)) {
        timeline.push({
          type: 'prediction',
          timestamp: prediction.timestamp,
          agentId,
          description: `Agent #${agentId} predicted ${getPredictionOutcomeLabel(prediction.outcome)}`,
          data: { confidence: prediction.confidence }
        });

        if (prediction.reasoningRevealed) {
          timeline.push({
            type: 'reveal',
            timestamp: prediction.timestamp + BigInt(1),
            agentId,
            description: `Agent #${agentId} revealed reasoning`
          });
        }
      }
    }

    // Add rebuttal events
    for (const rebuttal of rebuttals) {
      timeline.push({
        type: 'rebuttal',
        timestamp: rebuttal.timestamp,
        agentId: rebuttal.agentId,
        description: `Agent #${rebuttal.agentId} rebutted Agent #${rebuttal.targetAgentId}`
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => Number(a.timestamp - b.timestamp));

    return timeline;
  }

  /**
   * Get agent debate stats
   */
  async getAgentDebateStats(agentId: bigint): Promise<AgentDebateStats | null> {
    const agent = await this.getDebateAgent(agentId);
    if (!agent) return null;

    const accuracy = Number(agent.accuracyBps) / 100;

    return {
      agentId,
      totalDebates: Number(agent.totalDebates),
      correctPredictions: Number(agent.correctPredictions),
      accuracy,
      avgConfidence: 0,
      recentResults: []
    };
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Check token allowance for disputes
   */
  async checkAllowance(owner: Address): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: crownTokenAbi,
        functionName: 'allowance',
        args: [owner, this.debateOracleAddress]
      }, { cacheTTL: CACHE_TTL.DEBATE }) as bigint;
    } catch (error) {
      console.error('Error checking allowance:', error);
      return BigInt(0);
    }
  }

  /**
   * Get minimum dispute stake
   */
  async getMinDisputeStake(): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.debateOracleAddress,
        abi: AIDebateOracleAbi,
        functionName: 'MIN_DISPUTE_STAKE'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching min dispute stake:', error);
      return parseEther('100');
    }
  }

  /**
   * Get phase durations - batched
   */
  async getPhaseDurations(): Promise<{
    prediction: bigint;
    evidence: bigint;
    rebuttal: bigint;
    dispute: bigint;
  }> {
    try {
      const calls = [
        { address: this.debateOracleAddress, abi: AIDebateOracleAbi, functionName: 'PREDICTION_DURATION' },
        { address: this.debateOracleAddress, abi: AIDebateOracleAbi, functionName: 'EVIDENCE_DURATION' },
        { address: this.debateOracleAddress, abi: AIDebateOracleAbi, functionName: 'REBUTTAL_DURATION' },
        { address: this.debateOracleAddress, abi: AIDebateOracleAbi, functionName: 'DISPUTE_PERIOD' }
      ];

      const [prediction, evidence, rebuttal, dispute] = await batchReadContractsWithRateLimit<bigint[]>(
        calls,
        { cacheTTL: CACHE_TTL.STATIC }
      );

      return {
        prediction: prediction as bigint,
        evidence: evidence as bigint,
        rebuttal: rebuttal as bigint,
        dispute: dispute as bigint
      };
    } catch (error) {
      console.error('Error fetching phase durations:', error);
      return {
        prediction: BigInt(600),
        evidence: BigInt(300),
        rebuttal: BigInt(300),
        dispute: BigInt(86400)
      };
    }
  }

  /**
   * Format timestamp to relative time
   */
  formatRelativeTime(timestamp: bigint): string {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const diff = Number(now - timestamp);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  /**
   * Get contract addresses
   */
  getAddresses() {
    return {
      debateOracle: this.debateOracleAddress,
      crownToken: this.crownTokenAddress
    };
  }
}

export const debateService = new DebateService();
export default debateService;
