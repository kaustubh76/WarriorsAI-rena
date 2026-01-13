/**
 * Debate Types
 * Type definitions for AIDebateOracle contract interactions
 */

import type { Address } from 'viem';

// ============================================================================
// Enums (matching IAIDebateOracle.sol)
// ============================================================================

export enum DebatePhase {
  INACTIVE = 0,
  PREDICTION = 1,
  EVIDENCE = 2,
  REBUTTAL = 3,
  CONSENSUS = 4,
  FINALIZED = 5,
  DISPUTED = 6
}

export enum PredictionOutcome {
  UNDECIDED = 0,
  YES = 1,
  NO = 2,
  DRAW = 3
}

export enum DisputeStatus {
  NONE = 0,
  PENDING = 1,
  UPHELD = 2,
  REJECTED = 3
}

// ============================================================================
// Structs (matching IAIDebateOracle.sol)
// ============================================================================

export interface DebateAgent {
  agentId: bigint;
  operator: Address;
  signingKey: Address;
  model: string;
  totalDebates: bigint;
  correctPredictions: bigint;
  accuracyBps: bigint;  // basis points
  isActive: boolean;
}

export interface Prediction {
  agentId: bigint;
  outcome: PredictionOutcome;
  confidence: bigint;  // 0-10000 (basis points)
  reasoningHash: `0x${string}`;
  reasoning: string;
  timestamp: bigint;
  signature: `0x${string}`;
  reasoningRevealed: boolean;
}

export interface Rebuttal {
  agentId: bigint;
  targetAgentId: bigint;
  argument: string;
  evidenceHash: `0x${string}`;
  timestamp: bigint;
}

export interface ConsensusResult {
  outcome: PredictionOutcome;
  confidence: bigint;
  yesWeight: bigint;
  noWeight: bigint;
  drawWeight: bigint;
  totalWeight: bigint;
}

export interface Dispute {
  debateId: bigint;
  disputer: Address;
  evidence: string;
  stake: bigint;
  timestamp: bigint;
  status: DisputeStatus;
}

// ============================================================================
// Frontend-specific types
// ============================================================================

/**
 * Full debate state for UI
 */
export interface DebateState {
  debateId: bigint;
  marketId: bigint;
  battleId: bigint;
  phase: DebatePhase;
  predictions: Prediction[];
  rebuttals: Rebuttal[];
  consensus: ConsensusResult | null;
  dispute: Dispute | null;
  participants: bigint[];  // agent IDs
  phaseDeadlines: PhaseDeadlines;
  isFinalized: boolean;
  canFinalize: boolean;
}

/**
 * Phase timing information
 */
export interface PhaseDeadlines {
  predictionDeadline: bigint;
  evidenceDeadline: bigint;
  rebuttalDeadline: bigint;
  consensusDeadline: bigint;
}

/**
 * Debate with display values
 */
export interface DebateDisplay extends DebateState {
  phaseLabel: string;
  phaseColor: string;
  timeRemaining: string;
  consensusLabel: string;
  consensusConfidencePercent: number;
  participantCount: number;
  hasDispute: boolean;
}

/**
 * Prediction with display values
 */
export interface PredictionDisplay extends Prediction {
  agentName: string;
  agentTier: string;
  outcomeLabel: string;
  confidencePercent: number;
  isRevealed: boolean;
  hasRebuttal: boolean;
}

/**
 * Rebuttal with display values
 */
export interface RebuttalDisplay extends Rebuttal {
  authorAgentName: string;
  targetAgentName: string;
  timestamp: bigint;
  formattedTime: string;
}

/**
 * Consensus breakdown for charts
 */
export interface ConsensusBreakdown {
  outcome: PredictionOutcome;
  label: string;
  weight: bigint;
  percentage: number;
  color: string;
}

/**
 * Debate timeline event
 */
export interface DebateTimelineEvent {
  type: 'phase_change' | 'prediction' | 'reveal' | 'rebuttal' | 'consensus' | 'dispute';
  timestamp: bigint;
  agentId?: bigint;
  description: string;
  data?: Record<string, unknown>;
}

/**
 * Agent accuracy stats
 */
export interface AgentDebateStats {
  agentId: bigint;
  totalDebates: number;
  correctPredictions: number;
  accuracy: number;  // percentage
  avgConfidence: number;
  recentResults: boolean[];  // last 10 predictions
}

// ============================================================================
// Event types
// ============================================================================

export interface DebateStartedEvent {
  debateId: bigint;
  marketId: bigint;
  battleId: bigint;
  predictionDeadline: bigint;
}

export interface PredictionSubmittedEvent {
  debateId: bigint;
  agentId: bigint;
  outcome: PredictionOutcome;
  confidence: bigint;
}

export interface ReasoningRevealedEvent {
  debateId: bigint;
  agentId: bigint;
  reasoning: string;
}

export interface RebuttalSubmittedEvent {
  debateId: bigint;
  agentId: bigint;
  targetAgentId: bigint;
}

export interface PhaseAdvancedEvent {
  debateId: bigint;
  oldPhase: DebatePhase;
  newPhase: DebatePhase;
}

export interface ConsensusReachedEvent {
  debateId: bigint;
  outcome: PredictionOutcome;
  confidence: bigint;
  proofHash: `0x${string}`;
}

export interface DebateFinalizedEvent {
  debateId: bigint;
  outcome: PredictionOutcome;
}

export interface DisputeRaisedEvent {
  debateId: bigint;
  disputer: Address;
  stake: bigint;
}

export interface DisputeResolvedEvent {
  debateId: bigint;
  status: DisputeStatus;
  resolver: Address;
}

// ============================================================================
// Helper functions
// ============================================================================

export function getPhaseLabel(phase: DebatePhase): string {
  const labels: Record<DebatePhase, string> = {
    [DebatePhase.INACTIVE]: 'Inactive',
    [DebatePhase.PREDICTION]: 'Prediction',
    [DebatePhase.EVIDENCE]: 'Evidence',
    [DebatePhase.REBUTTAL]: 'Rebuttal',
    [DebatePhase.CONSENSUS]: 'Consensus',
    [DebatePhase.FINALIZED]: 'Finalized',
    [DebatePhase.DISPUTED]: 'Disputed'
  };
  return labels[phase] ?? 'Unknown';
}

export function getPhaseColor(phase: DebatePhase): string {
  const colors: Record<DebatePhase, string> = {
    [DebatePhase.INACTIVE]: 'gray',
    [DebatePhase.PREDICTION]: 'blue',
    [DebatePhase.EVIDENCE]: 'purple',
    [DebatePhase.REBUTTAL]: 'orange',
    [DebatePhase.CONSENSUS]: 'green',
    [DebatePhase.FINALIZED]: 'emerald',
    [DebatePhase.DISPUTED]: 'red'
  };
  return colors[phase] ?? 'gray';
}

export function getPredictionOutcomeLabel(outcome: PredictionOutcome): string {
  const labels: Record<PredictionOutcome, string> = {
    [PredictionOutcome.UNDECIDED]: 'Undecided',
    [PredictionOutcome.YES]: 'Yes',
    [PredictionOutcome.NO]: 'No',
    [PredictionOutcome.DRAW]: 'Draw'
  };
  return labels[outcome] ?? 'Unknown';
}

export function getPredictionOutcomeColor(outcome: PredictionOutcome): string {
  const colors: Record<PredictionOutcome, string> = {
    [PredictionOutcome.UNDECIDED]: 'gray',
    [PredictionOutcome.YES]: 'green',
    [PredictionOutcome.NO]: 'red',
    [PredictionOutcome.DRAW]: 'yellow'
  };
  return colors[outcome] ?? 'gray';
}

export function getDisputeStatusLabel(status: DisputeStatus): string {
  const labels: Record<DisputeStatus, string> = {
    [DisputeStatus.NONE]: 'None',
    [DisputeStatus.PENDING]: 'Pending',
    [DisputeStatus.UPHELD]: 'Upheld',
    [DisputeStatus.REJECTED]: 'Rejected'
  };
  return labels[status] ?? 'Unknown';
}

export function calculateConsensusBreakdown(consensus: ConsensusResult): ConsensusBreakdown[] {
  const total = consensus.totalWeight;
  if (total === BigInt(0)) {
    return [];
  }

  const breakdown: ConsensusBreakdown[] = [
    {
      outcome: PredictionOutcome.YES,
      label: 'Yes',
      weight: consensus.yesWeight,
      percentage: Number((consensus.yesWeight * BigInt(100)) / total),
      color: 'green'
    },
    {
      outcome: PredictionOutcome.NO,
      label: 'No',
      weight: consensus.noWeight,
      percentage: Number((consensus.noWeight * BigInt(100)) / total),
      color: 'red'
    },
    {
      outcome: PredictionOutcome.DRAW,
      label: 'Draw',
      weight: consensus.drawWeight,
      percentage: Number((consensus.drawWeight * BigInt(100)) / total),
      color: 'yellow'
    }
  ];

  return breakdown.filter(b => b.percentage > 0);
}

export function getPhaseProgress(phase: DebatePhase): number {
  const progress: Record<DebatePhase, number> = {
    [DebatePhase.INACTIVE]: 0,
    [DebatePhase.PREDICTION]: 20,
    [DebatePhase.EVIDENCE]: 40,
    [DebatePhase.REBUTTAL]: 60,
    [DebatePhase.CONSENSUS]: 80,
    [DebatePhase.FINALIZED]: 100,
    [DebatePhase.DISPUTED]: 100
  };
  return progress[phase] ?? 0;
}

export function isDebateActive(phase: DebatePhase): boolean {
  return phase !== DebatePhase.INACTIVE &&
         phase !== DebatePhase.FINALIZED &&
         phase !== DebatePhase.DISPUTED;
}

export function canSubmitPrediction(phase: DebatePhase): boolean {
  return phase === DebatePhase.PREDICTION;
}

export function canRevealReasoning(phase: DebatePhase): boolean {
  return phase === DebatePhase.EVIDENCE;
}

export function canSubmitRebuttal(phase: DebatePhase): boolean {
  return phase === DebatePhase.REBUTTAL;
}

export function formatConfidence(confidence: bigint): string {
  return `${(Number(confidence) / 100).toFixed(1)}%`;
}
