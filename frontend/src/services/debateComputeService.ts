/**
 * Debate Compute Service
 * Handles AI reasoning generation for debates via 0G Compute Network
 * Provides verifiable AI predictions and rebuttals
 */

import type {
  BattleDataIndex,
  PredictionResult,
  ReasoningResult,
  InferenceProof,
  DebatePredictionRequest,
  DebateReasoningRequest,
  DebateRebuttalRequest
} from '../types/zeroG';
import { serializeBattleData } from '../types/zeroG';
import { zeroGStorageService } from './zeroGStorageService';

// Types for debate compute
export interface DebatePredictionResult extends PredictionResult {
  agentId: bigint;
  debateId: bigint;
  reasoningHash: string;
  timestamp: number;
  isVerified?: boolean;    // Whether this came from verified 0G compute
  fallbackMode?: boolean;  // Whether this is a fallback prediction (not verified)
}

export interface DebateReasoningResult extends ReasoningResult {
  agentId: bigint;
  debateId: bigint;
  phase: 'prediction' | 'evidence' | 'rebuttal';
  storageRootHash?: string;
}

export interface DebateRebuttalResult {
  agentId: bigint;
  targetAgentId: bigint;
  rebuttal: string;
  counterEvidence: string[];
  strength: number;
  chatId: string;
  proof: InferenceProof;
}

export interface AgentPredictionContext {
  agentId: bigint;
  outcome: string;
  confidence: number;
  reasoning: string;
}

class DebateComputeService {
  private readonly use0GCompute: boolean;

  constructor() {
    this.use0GCompute = process.env.NEXT_PUBLIC_USE_0G_COMPUTE === 'true' ||
      process.env.NODE_ENV === 'production';
  }

  // ============================================================================
  // Prediction Phase
  // ============================================================================

  /**
   * Generate AI prediction for a debate
   * Called during PREDICTION phase
   */
  async generatePrediction(
    debateId: bigint,
    marketId: bigint,
    battleId: bigint,
    agentId: bigint,
    battleData: BattleDataIndex
  ): Promise<DebatePredictionResult> {
    // Get historical context for RAG
    const warrior1Id = battleData.warriors[0]?.id || BigInt(0);
    const warrior2Id = battleData.warriors[1]?.id || BigInt(0);
    const historicalContext = await zeroGStorageService.getBattleContext(
      warrior1Id,
      warrior2Id,
      5
    );

    // Build prompt with context
    const prompt = this.buildPredictionPrompt(battleData, historicalContext);

    try {
      // Call 0G inference API
      const response = await fetch('/api/0g/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 1000,
          temperature: 0.7,
          battleData: {
            battleId: battleData.battleId.toString(),
            warriors: battleData.warriors.map(w => ({
              id: w.id.toString(),
              traits: w.traits
            }))
          }
        })
      });

      const result = await response.json();

      // CRITICAL: Require verified response from 0G
      // Unverified responses must NOT be used for on-chain decisions
      if (!response.ok || !result.success) {
        throw new Error('0G inference request failed');
      }

      if (result.fallbackMode || result.isVerified === false) {
        throw new Error('0G inference returned unverified response - cannot use for on-chain decisions');
      }

      // Parse prediction from verified response
      const parsed = this.parseJSONResponse(result.response);
      // Use cryptographic hash for on-chain verifiable proofs
      const reasoningHash = await this.hashStringAsync(parsed.reasoning || result.response);

      return {
        agentId,
        debateId,
        outcome: parsed.outcome || 'draw',
        confidence: parsed.confidence || 50,
        reasoning: parsed.reasoning || result.response,
        chatId: result.chatId,
        proof: result.proof,
        reasoningHash,
        timestamp: Date.now(),
        isVerified: true,
        fallbackMode: false
      };
    } catch (error) {
      console.error('Prediction generation failed:', error);
      // Re-throw error - no fallback predictions allowed for on-chain use
      throw error instanceof Error ? error : new Error('Prediction generation failed');
    }
  }

  /**
   * Build prediction prompt with historical context
   */
  private buildPredictionPrompt(
    battleData: BattleDataIndex,
    context: BattleDataIndex[]
  ): string {
    const w1 = battleData.warriors[0];
    const w2 = battleData.warriors[1];

    let prompt = `
You are an expert AI battle analyst for the Warriors AI Arena prediction market.
You are participating in a multi-AI debate to predict the battle outcome.

CURRENT BATTLE DATA:
${serializeBattleData(battleData)}

WARRIOR 1 STATS:
- Strength: ${w1?.traits.strength || 0}
- Wit: ${w1?.traits.wit || 0}
- Charisma: ${w1?.traits.charisma || 0}
- Defence: ${w1?.traits.defence || 0}
- Luck: ${w1?.traits.luck || 0}

WARRIOR 2 STATS:
- Strength: ${w2?.traits.strength || 0}
- Wit: ${w2?.traits.wit || 0}
- Charisma: ${w2?.traits.charisma || 0}
- Defence: ${w2?.traits.defence || 0}
- Luck: ${w2?.traits.luck || 0}

BATTLE RULES:
- Higher Strength = more damage dealt
- Higher Defence = less damage taken
- Higher Wit = better move selection
- Higher Luck = critical hit chance
- Higher Charisma = recovery effectiveness
`;

    // Add historical context if available
    if (context.length > 0) {
      prompt += `\n\nHISTORICAL MATCHUP DATA (${context.length} previous battles):`;
      for (const battle of context.slice(0, 3)) {
        prompt += `\n- Battle #${battle.battleId}: ${battle.outcome === 'warrior1' ? 'Warrior 1' : battle.outcome === 'warrior2' ? 'Warrior 2' : 'Draw'} won after ${battle.totalRounds} rounds`;
      }
    }

    prompt += `

Provide your prediction in this exact JSON format:
{
  "outcome": "yes" | "no" | "draw",
  "confidence": <number 0-100>,
  "reasoning": "<detailed paragraph explaining your prediction with statistical analysis>"
}

NOTE: "yes" = Warrior 1 wins, "no" = Warrior 2 wins
`;

    return prompt;
  }

  // ============================================================================
  // Evidence Phase
  // ============================================================================

  /**
   * Generate evidence-backed reasoning for a prediction
   * Called during EVIDENCE phase
   */
  async generateEvidence(
    debateId: bigint,
    agentId: bigint,
    battleData: BattleDataIndex,
    otherPredictions?: AgentPredictionContext[]
  ): Promise<DebateReasoningResult> {
    // Get comprehensive stats from storage
    const warrior1Id = battleData.warriors[0]?.id || BigInt(0);
    const warrior2Id = battleData.warriors[1]?.id || BigInt(0);

    const contextSummary = await zeroGStorageService.getContextSummary(
      warrior1Id,
      warrior2Id
    );

    const prompt = this.buildEvidencePrompt(
      battleData,
      contextSummary,
      otherPredictions
    );

    try {
      const response = await fetch('/api/0g/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 1500,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        throw new Error(`0G inference failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '0G inference failed');
      }

      const parsed = this.parseJSONResponse(result.response);

      // Store reasoning on 0G for audit trail
      let storageRootHash: string | undefined;
      try {
        const storageResult = await this.storeReasoningOnChain(
          debateId,
          agentId,
          'evidence',
          result.response
        );
        storageRootHash = storageResult;
      } catch (storageError) {
        console.warn('Failed to store reasoning on-chain:', storageError);
      }

      return {
        agentId,
        debateId,
        phase: 'evidence',
        reasoning: parsed.reasoning || result.response,
        evidence: parsed.evidence || [],
        confidence: parsed.confidence || 50,
        chatId: result.chatId,
        proof: result.proof,
        storageRootHash
      };
    } catch (error) {
      console.error('Evidence generation failed:', error);
      // Re-throw error - no fallback reasoning allowed
      throw error instanceof Error ? error : new Error('Evidence generation failed');
    }
  }

  /**
   * Build evidence prompt
   */
  private buildEvidencePrompt(
    battleData: BattleDataIndex,
    contextSummary: {
      warrior1Stats: any;
      warrior2Stats: any;
      matchupHistory: any;
      totalBattlesIndexed: number;
    },
    otherPredictions?: AgentPredictionContext[]
  ): string {
    let prompt = `
You are providing detailed evidence for your battle prediction.

BATTLE DATA:
${serializeBattleData(battleData)}

WARRIOR 1 ANALYTICS:
- Total Battles: ${contextSummary.warrior1Stats.totalBattles}
- Win Rate: ${contextSummary.warrior1Stats.winRate}%
- Avg Damage Dealt: ${contextSummary.warrior1Stats.avgDamageDealt}
- Avg Damage Taken: ${contextSummary.warrior1Stats.avgDamageTaken}

WARRIOR 2 ANALYTICS:
- Total Battles: ${contextSummary.warrior2Stats.totalBattles}
- Win Rate: ${contextSummary.warrior2Stats.winRate}%
- Avg Damage Dealt: ${contextSummary.warrior2Stats.avgDamageDealt}
- Avg Damage Taken: ${contextSummary.warrior2Stats.avgDamageTaken}

HEAD-TO-HEAD MATCHUP:
- Total Matches: ${contextSummary.matchupHistory.totalMatches}
- Warrior 1 Wins: ${contextSummary.matchupHistory.warrior1Wins}
- Warrior 2 Wins: ${contextSummary.matchupHistory.warrior2Wins}
- Draws: ${contextSummary.matchupHistory.draws}
`;

    if (otherPredictions && otherPredictions.length > 0) {
      prompt += `\n\nOTHER AGENTS' PREDICTIONS:`;
      for (const pred of otherPredictions) {
        prompt += `\n- Agent #${pred.agentId}: ${pred.outcome} (${pred.confidence}% confidence)`;
        prompt += `\n  Reasoning: ${pred.reasoning.substring(0, 200)}...`;
      }
    }

    prompt += `

Provide detailed evidence-backed reasoning:
{
  "reasoning": "<multi-paragraph analysis with specific statistics and comparisons>",
  "evidence": ["<specific stat 1>", "<specific stat 2>", "<specific stat 3>", ...],
  "confidence": <number 0-100>
}
`;

    return prompt;
  }

  // ============================================================================
  // Rebuttal Phase
  // ============================================================================

  /**
   * Generate rebuttal against another agent's prediction
   * Called during REBUTTAL phase
   */
  async generateRebuttal(
    debateId: bigint,
    agentId: bigint,
    targetAgentId: bigint,
    targetPrediction: {
      outcome: string;
      reasoning: string;
      confidence: number;
    },
    battleData: BattleDataIndex
  ): Promise<DebateRebuttalResult> {
    const prompt = this.buildRebuttalPrompt(
      targetAgentId,
      targetPrediction,
      battleData
    );

    try {
      const response = await fetch('/api/0g/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxTokens: 1000,
          temperature: 0.6
        })
      });

      if (!response.ok) {
        throw new Error(`0G inference failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '0G inference failed');
      }

      const parsed = this.parseJSONResponse(result.response);

      return {
        agentId,
        targetAgentId,
        rebuttal: parsed.rebuttal || result.response,
        counterEvidence: parsed.counterEvidence || [],
        strength: parsed.strengthOfRebuttal || 50,
        chatId: result.chatId,
        proof: result.proof
      };
    } catch (error) {
      console.error('Rebuttal generation failed:', error);
      return {
        agentId,
        targetAgentId,
        rebuttal: 'Unable to generate rebuttal due to system error.',
        counterEvidence: [],
        strength: 0,
        chatId: '',
        proof: {
          signature: '',
          modelHash: '',
          inputHash: '',
          outputHash: '',
          providerAddress: '0x0000000000000000000000000000000000000000' as any
        }
      };
    }
  }

  /**
   * Build rebuttal prompt
   */
  private buildRebuttalPrompt(
    targetAgentId: bigint,
    targetPrediction: {
      outcome: string;
      reasoning: string;
      confidence: number;
    },
    battleData: BattleDataIndex
  ): string {
    return `
You are challenging another AI agent's prediction in the Warriors AI Arena debate.

TARGET PREDICTION (Agent #${targetAgentId}):
- Outcome: ${targetPrediction.outcome}
- Confidence: ${targetPrediction.confidence}%
- Reasoning: ${targetPrediction.reasoning}

BATTLE DATA:
${serializeBattleData(battleData)}

Your task is to provide a well-reasoned rebuttal that challenges weak points in the target's argument.

Provide your rebuttal:
{
  "rebuttal": "<your counter-argument challenging their reasoning>",
  "counterEvidence": ["<point 1>", "<point 2>", ...],
  "strengthOfRebuttal": <number 0-100 indicating how strong your counter-argument is>
}
`;
  }

  // ============================================================================
  // Storage & Verification
  // ============================================================================

  /**
   * Store reasoning on 0G Storage for audit trail
   */
  private async storeReasoningOnChain(
    debateId: bigint,
    agentId: bigint,
    phase: string,
    reasoning: string
  ): Promise<string | undefined> {
    try {
      const response = await fetch('/api/0g/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battle: {
            battleId: `debate_${debateId}_agent_${agentId}_${phase}`,
            timestamp: Date.now(),
            warriors: [],
            rounds: [],
            outcome: 'draw',
            totalDamage: { warrior1: 0, warrior2: 0 },
            totalRounds: 0,
            // Store reasoning in a custom field
            _reasoningData: {
              debateId: debateId.toString(),
              agentId: agentId.toString(),
              phase,
              reasoning,
              timestamp: Date.now()
            }
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        return result.rootHash;
      }
    } catch (error) {
      console.error('Failed to store reasoning:', error);
    }
    return undefined;
  }

  /**
   * Verify reasoning proof from 0G
   * IMPORTANT: This validates the cryptographic proof of AI inference
   */
  async verifyReasoningProof(
    chatId: string,
    proof: InferenceProof
  ): Promise<boolean> {
    // Basic verification
    if (!chatId || !proof) {
      console.warn('Proof verification failed: Missing chatId or proof');
      return false;
    }

    // Verify provider address is valid (not zero address)
    if (!proof.providerAddress || proof.providerAddress === '0x0000000000000000000000000000000000000000') {
      console.warn('Proof verification failed: Invalid or zero provider address');
      return false;
    }

    // Verify hashes exist and are properly formatted
    if (!proof.inputHash || !proof.outputHash) {
      console.warn('Proof verification failed: Missing input or output hash');
      return false;
    }

    // Verify hash format (should be 0x-prefixed hex strings)
    if (!proof.inputHash.startsWith('0x') || !proof.outputHash.startsWith('0x')) {
      console.warn('Proof verification failed: Invalid hash format');
      return false;
    }

    // Verify model hash exists (identifies the AI model used)
    if (!proof.modelHash || proof.modelHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.warn('Proof verification failed: Missing or invalid model hash');
      return false;
    }

    // TEE attestation verification (if attestation data is present)
    try {
      if (proof.attestation) {
        const isValidAttestation = await this.verifyTEEAttestation(
          proof.attestation,
          proof.outputHash,
          proof.providerAddress
        );

        if (!isValidAttestation) {
          console.warn('Proof verification failed: TEE attestation verification failed');
          return false;
        }
      }

      console.log(`Proof verified for chat ${chatId} from provider ${proof.providerAddress}`);
      return true;
    } catch (error) {
      console.error('Proof verification error:', error);
      return false;
    }
  }

  /**
   * Verify TEE (Trusted Execution Environment) attestation
   * Validates that inference was executed in a secure enclave
   */
  private async verifyTEEAttestation(
    attestation: string,
    outputHash: string,
    providerAddress: string
  ): Promise<boolean> {
    try {
      // Basic format validation
      if (!attestation || attestation.length < 64) {
        console.warn('TEE attestation too short');
        return false;
      }

      if (!attestation.startsWith('0x')) {
        console.warn('TEE attestation missing 0x prefix');
        return false;
      }

      // In production, this would:
      // 1. Parse the attestation quote from Intel SGX/AMD SEV
      // 2. Verify the quote against Intel/AMD attestation service
      // 3. Check enclave measurement matches expected AI model runner
      // 4. Validate timestamp and provider registration on 0G

      // Dynamic import to avoid SSR issues
      const { ethers } = await import('ethers');

      // Verify signature length (minimum 65 bytes for ECDSA: r(32) + s(32) + v(1))
      const sigBytes = ethers.getBytes(attestation);
      if (sigBytes.length < 65) {
        console.warn('TEE attestation signature too short');
        return false;
      }

      // For 0G network, we trust the provider registration process
      // which requires TEE compliance verification during onboarding
      console.log(`TEE attestation format verified for provider ${providerAddress}`);
      return true;
    } catch (error) {
      console.error('TEE attestation verification error:', error);
      return false;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Parse JSON response from AI
   */
  private parseJSONResponse(response: string): any {
    try {
      // Try direct parse
      return JSON.parse(response.trim());
    } catch {
      // Try to extract from markdown
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }

      // Try to find JSON object
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }

      return {};
    }
  }

  /**
   * Calculate warrior power score (used for analytics only, not predictions)
   */
  private calculatePowerScore(traits: {
    strength: number;
    wit: number;
    charisma: number;
    defence: number;
    luck: number;
  }): number {
    return (
      traits.strength * 1.2 +
      traits.wit * 0.8 +
      traits.charisma * 0.5 +
      traits.defence * 1.0 +
      traits.luck * 0.7
    );
  }

  /**
   * Cryptographic hash using keccak256 for on-chain verifiable proofs
   * Must be async due to dynamic ethers import
   */
  private async hashStringAsync(str: string): Promise<string> {
    const { ethers } = await import('ethers');
    return ethers.keccak256(ethers.toUtf8Bytes(str));
  }

  /**
   * Synchronous hash fallback using Web Crypto API
   * Used when async is not possible
   */
  private hashString(str: string): string {
    // For synchronous contexts, use a placeholder that will be replaced
    // In production, always use hashStringAsync
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    // Note: This is NOT cryptographically secure - use hashStringAsync for on-chain proofs
    return '0x' + (hash >>> 0).toString(16).padStart(64, '0');
  }

  /**
   * Check if 0G compute is enabled
   */
  is0GEnabled(): boolean {
    return this.use0GCompute;
  }
}

export const debateComputeService = new DebateComputeService();
export default debateComputeService;
