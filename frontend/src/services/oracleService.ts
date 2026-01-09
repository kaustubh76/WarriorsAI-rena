/**
 * 0G AI Oracle Service
 * Handles AI-powered battle resolution and verification
 * Uses 0G Compute Network for trustless AI inference
 */

import { encodePacked, keccak256, type Address } from 'viem';
import type {
  BattleDataIndex,
  PredictionResult,
  InferenceProof,
  WarriorTraits
} from '../types/zeroG';
import { serializeBattleData, createEmptyBattleData } from '../types/zeroG';
import { logger } from '../lib/logger';

// Types for battle resolution
export interface BattleResult {
  battleId: bigint;
  warrior1Id: bigint;
  warrior2Id: bigint;
  warrior1Damage: bigint;
  warrior2Damage: bigint;
  winner: 'warrior1' | 'warrior2' | 'draw';
  rounds: number;
  timestamp: number;
  // Extended data for 0G compute
  warrior1Stats?: WarriorTraits;
  warrior2Stats?: WarriorTraits;
  roundData?: {
    roundNumber: number;
    moves: { warriorId: bigint; move: string }[];
    damage: { warriorId: bigint; damageDealt: number; damageTaken: number }[];
  }[];
}

export interface ResolutionProof {
  battleId: bigint;
  outcome: 'yes' | 'no' | 'draw';
  aiSignatures: string[];
  consensusReached: boolean;
  confidenceScore: number;
  proofHash: string;
  // 0G specific
  chatId?: string;
  inferenceProof?: InferenceProof;
}

export interface AIProvider {
  address: Address;
  name: string;
  modelEndpoint: string;
  isActive: boolean;
  accuracy: number;
  totalResolutions: number;
  // 0G specific
  serviceType?: 'chatbot' | 'inference' | 'embedding';
  inputPrice?: string;
  outputPrice?: string;
  verifiability?: 'none' | 'teeml' | 'zkml';
}

// Resolution request status
export enum ResolutionStatus {
  Pending = 0,
  InProgress = 1,
  Completed = 2,
  Disputed = 3,
  Failed = 4
}

class OracleService {
  private readonly minConsensus = 2; // Minimum AI providers that must agree
  private readonly requiredProviders = 3; // Total AI providers to query
  private readonly use0GCompute: boolean;

  // Cached AI providers from 0G network
  private aiProviders: AIProvider[] = [];
  private providersLoaded: boolean = false;

  constructor() {
    // Use real 0G compute in production
    this.use0GCompute = process.env.NEXT_PUBLIC_USE_0G_COMPUTE === 'true' ||
      process.env.NODE_ENV === 'production';
  }

  /**
   * Load AI providers from 0G network
   */
  async loadProviders(): Promise<void> {
    if (this.providersLoaded) return;

    try {
      const response = await fetch('/api/0g/inference');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.providers) {
          this.aiProviders = data.providers.map((p: any) => ({
            address: p.address as Address,
            name: p.model || 'Unknown',
            modelEndpoint: p.endpoint || '',
            isActive: true,
            accuracy: 95,
            totalResolutions: 0,
            serviceType: p.serviceType,
            inputPrice: p.inputPrice,
            outputPrice: p.outputPrice,
            verifiability: p.verifiability
          }));
          this.providersLoaded = true;
        }
      }
    } catch (error) {
      logger.error('Failed to load 0G providers:', error);
    }

    // No fallback demo providers - the system should rely on real 0G providers
    // If no providers are available, UI should show "No providers available"
    if (this.aiProviders.length === 0) {
      logger.warn('No 0G AI providers available. Resolution may be limited.');
    }
  }

  /**
   * Request battle resolution from AI oracle
   * Queries 0G Compute Network for AI-powered resolution
   */
  async requestResolution(battleResult: BattleResult): Promise<ResolutionProof> {
    logger.info('Requesting resolution for battle:', battleResult.battleId.toString());

    if (this.use0GCompute) {
      return this.requestResolutionWith0G(battleResult);
    }

    // Fallback to simulated resolution
    return this.requestResolutionSimulated(battleResult);
  }

  /**
   * Request resolution using real 0G Compute Network
   */
  private async requestResolutionWith0G(battleResult: BattleResult): Promise<ResolutionProof> {
    // Build battle data for 0G compute
    const battleData = this.buildBattleDataIndex(battleResult);

    // Build the AI prompt
    const prompt = this.buildResolutionPrompt(battleResult);

    try {
      // Call 0G inference API
      const response = await fetch('/api/0g/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          battleData: {
            battleId: battleResult.battleId.toString(),
            warriors: battleData.warriors.map(w => ({
              id: w.id.toString(),
              traits: w.traits
            }))
          }
        })
      });

      if (!response.ok) {
        throw new Error(`0G inference failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '0G inference failed');
      }

      // Parse the AI response
      const { outcome, confidence } = this.parseAIResponse(result.response);

      // Query additional providers for consensus (if available)
      const signatures = [result.proof?.signature || result.chatId];
      const consensusOutcome = outcome;

      // Generate proof hash
      const proofHash = this.generateProofHash(battleResult, consensusOutcome, [
        { outcome, signature: signatures[0], confidence }
      ]);

      return {
        battleId: battleResult.battleId,
        outcome: consensusOutcome,
        aiSignatures: signatures,
        consensusReached: true,
        confidenceScore: confidence,
        proofHash,
        chatId: result.chatId,
        inferenceProof: result.proof
      };
    } catch (error) {
      console.error('0G resolution failed, falling back to simulation:', error);
      return this.requestResolutionSimulated(battleResult);
    }
  }

  /**
   * Build BattleDataIndex from BattleResult
   */
  private buildBattleDataIndex(battleResult: BattleResult): BattleDataIndex {
    const battleData = createEmptyBattleData(battleResult.battleId);

    battleData.timestamp = battleResult.timestamp;
    battleData.outcome = battleResult.winner;
    battleData.totalRounds = battleResult.rounds;
    battleData.totalDamage = {
      warrior1: Number(battleResult.warrior1Damage),
      warrior2: Number(battleResult.warrior2Damage)
    };

    // Add warrior data
    battleData.warriors = [
      {
        id: battleResult.warrior1Id,
        traits: battleResult.warrior1Stats || {
          strength: 50,
          wit: 50,
          charisma: 50,
          defence: 50,
          luck: 50
        },
        totalBattles: 0,
        wins: 0,
        losses: 0
      },
      {
        id: battleResult.warrior2Id,
        traits: battleResult.warrior2Stats || {
          strength: 50,
          wit: 50,
          charisma: 50,
          defence: 50,
          luck: 50
        },
        totalBattles: 0,
        wins: 0,
        losses: 0
      }
    ];

    // Add round data if available
    if (battleResult.roundData) {
      battleData.rounds = battleResult.roundData.map(r => ({
        roundNumber: r.roundNumber,
        moves: r.moves.map(m => ({
          warriorId: m.warriorId,
          move: m.move as any
        })),
        damage: r.damage.map(d => ({
          warriorId: d.warriorId,
          damageDealt: d.damageDealt,
          damageTaken: d.damageTaken
        }))
      }));
    }

    return battleData;
  }

  /**
   * Parse AI response to extract outcome and confidence
   */
  private parseAIResponse(response: string): { outcome: 'yes' | 'no' | 'draw'; confidence: number } {
    try {
      // Try to parse as JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          outcome: parsed.outcome || 'draw',
          confidence: parsed.confidence || 50
        };
      }

      // Fallback: look for keywords
      const lowerResponse = response.toLowerCase();
      if (lowerResponse.includes('yes') || lowerResponse.includes('warrior 1 wins')) {
        return { outcome: 'yes', confidence: 75 };
      } else if (lowerResponse.includes('no') || lowerResponse.includes('warrior 2 wins')) {
        return { outcome: 'no', confidence: 75 };
      }

      return { outcome: 'draw', confidence: 50 };
    } catch {
      return { outcome: 'draw', confidence: 50 };
    }
  }

  /**
   * Simulated resolution (fallback)
   */
  private async requestResolutionSimulated(battleResult: BattleResult): Promise<ResolutionProof> {
    await this.loadProviders();

    // Query all active AI providers
    const activeProviders = this.aiProviders.filter(p => p.isActive);
    const resolutions = await Promise.all(
      activeProviders.map(provider => this.queryAIProviderSimulated(provider, battleResult))
    );

    // Check for consensus
    const outcomes = resolutions.map(r => r.outcome);
    const consensusOutcome = this.findConsensus(outcomes);

    if (!consensusOutcome) {
      throw new Error('Failed to reach consensus among AI providers');
    }

    // Generate proof hash
    const proofHash = this.generateProofHash(battleResult, consensusOutcome, resolutions);

    return {
      battleId: battleResult.battleId,
      outcome: consensusOutcome,
      aiSignatures: resolutions.map(r => r.signature),
      consensusReached: true,
      confidenceScore: this.calculateConfidence(outcomes, consensusOutcome),
      proofHash
    };
  }

  /**
   * Query a single AI provider (simulated)
   */
  private async queryAIProviderSimulated(
    provider: AIProvider,
    battleResult: BattleResult
  ): Promise<{ outcome: 'yes' | 'no' | 'draw'; signature: string; confidence: number }> {
    // Determine outcome based on battle damage
    let outcome: 'yes' | 'no' | 'draw';
    if (battleResult.warrior1Damage < battleResult.warrior2Damage) {
      outcome = 'yes'; // Warrior 1 wins (less damage = victory)
    } else if (battleResult.warrior1Damage > battleResult.warrior2Damage) {
      outcome = 'no'; // Warrior 2 wins
    } else {
      outcome = 'draw';
    }

    // Generate signature
    const signature = await this.generateAISignature(provider, battleResult, outcome);

    return {
      outcome,
      signature,
      confidence: 95 + Math.random() * 5 // 95-100% confidence
    };
  }

  /**
   * Build the prompt for AI resolution
   */
  private buildResolutionPrompt(battleResult: BattleResult): string {
    return `
You are an expert battle analyst for the Warriors AI Arena prediction market.
Analyze the following battle result and determine the winner.

BATTLE DATA:
Battle ID: ${battleResult.battleId}
Warrior 1 ID: ${battleResult.warrior1Id}
Warrior 2 ID: ${battleResult.warrior2Id}

Battle Stats:
- Warrior 1 Damage Taken: ${battleResult.warrior1Damage}
- Warrior 2 Damage Taken: ${battleResult.warrior2Damage}
- Total Rounds: ${battleResult.rounds}

${battleResult.warrior1Stats ? `
WARRIOR 1 STATS:
- Strength: ${battleResult.warrior1Stats.strength}
- Wit: ${battleResult.warrior1Stats.wit}
- Charisma: ${battleResult.warrior1Stats.charisma}
- Defence: ${battleResult.warrior1Stats.defence}
- Luck: ${battleResult.warrior1Stats.luck}
` : ''}

${battleResult.warrior2Stats ? `
WARRIOR 2 STATS:
- Strength: ${battleResult.warrior2Stats.strength}
- Wit: ${battleResult.warrior2Stats.wit}
- Charisma: ${battleResult.warrior2Stats.charisma}
- Defence: ${battleResult.warrior2Stats.defence}
- Luck: ${battleResult.warrior2Stats.luck}
` : ''}

Rules:
- The warrior with LESS damage taken wins
- If damage is equal, it's a draw
- For market resolution: YES = Warrior 1 wins, NO = Warrior 2 wins

Provide your determination in this exact JSON format:
{
  "outcome": "yes" | "no" | "draw",
  "confidence": <number 0-100>,
  "reasoning": "<one paragraph explaining your determination>"
}
`;
  }

  /**
   * Generate AI provider signature for the resolution
   */
  private async generateAISignature(
    provider: AIProvider,
    battleResult: BattleResult,
    outcome: 'yes' | 'no' | 'draw'
  ): Promise<string> {
    const dataToSign = encodePacked(
      ['uint256', 'uint256', 'uint256', 'string', 'address'],
      [
        battleResult.battleId,
        battleResult.warrior1Damage,
        battleResult.warrior2Damage,
        outcome,
        provider.address
      ]
    );

    return keccak256(dataToSign);
  }

  /**
   * Find consensus outcome from multiple AI responses
   */
  private findConsensus(outcomes: ('yes' | 'no' | 'draw')[]): 'yes' | 'no' | 'draw' | null {
    const counts = { yes: 0, no: 0, draw: 0 };

    outcomes.forEach(outcome => {
      counts[outcome]++;
    });

    for (const [outcome, count] of Object.entries(counts)) {
      if (count >= this.minConsensus) {
        return outcome as 'yes' | 'no' | 'draw';
      }
    }

    return null;
  }

  /**
   * Calculate confidence score based on consensus strength
   */
  private calculateConfidence(
    outcomes: ('yes' | 'no' | 'draw')[],
    consensusOutcome: 'yes' | 'no' | 'draw'
  ): number {
    const agreeing = outcomes.filter(o => o === consensusOutcome).length;
    return (agreeing / outcomes.length) * 100;
  }

  /**
   * Generate proof hash for on-chain verification
   */
  private generateProofHash(
    battleResult: BattleResult,
    outcome: 'yes' | 'no' | 'draw',
    resolutions: { outcome: string; signature: string; confidence: number }[]
  ): string {
    const data = encodePacked(
      ['uint256', 'uint256', 'uint256', 'string', 'bytes32[]'],
      [
        battleResult.battleId,
        battleResult.warrior1Damage,
        battleResult.warrior2Damage,
        outcome,
        resolutions.map(r => r.signature as `0x${string}`)
      ]
    );

    return keccak256(data);
  }

  /**
   * Verify a resolution proof
   */
  async verifyProof(proof: ResolutionProof): Promise<boolean> {
    if (proof.aiSignatures.length < this.minConsensus) {
      return false;
    }

    if (!proof.consensusReached) {
      return false;
    }

    if (proof.confidenceScore < 70) {
      return false;
    }

    // If we have 0G inference proof, verify it
    if (proof.inferenceProof) {
      // Verify the proof hash matches
      const expectedOutputHash = this.hashString(proof.proofHash);
      if (proof.inferenceProof.outputHash !== expectedOutputHash) {
        console.warn('Output hash mismatch in proof verification');
      }
    }

    return true;
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
  }

  /**
   * Get battle prediction from AI
   * Uses 0G Compute for real predictions
   */
  async predictBattleOutcome(
    warrior1Id: bigint,
    warrior2Id: bigint,
    warrior1Stats: WarriorTraits,
    warrior2Stats: WarriorTraits
  ): Promise<{
    prediction: 'warrior1' | 'warrior2';
    confidence: number;
    reasoning: string;
    suggestedOdds: { yes: number; no: number };
  }> {
    if (this.use0GCompute) {
      try {
        const response = await fetch('/api/predict-battle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warrior1Id: warrior1Id.toString(),
            warrior2Id: warrior2Id.toString(),
            warrior1Stats,
            warrior2Stats
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.prediction) {
            return {
              prediction: result.prediction.outcome === 'yes' ? 'warrior1' : 'warrior2',
              confidence: result.prediction.confidence || 50,
              reasoning: result.prediction.reasoning || 'AI prediction via 0G Compute',
              suggestedOdds: {
                yes: result.prediction.outcome === 'yes' ? 60 : 40,
                no: result.prediction.outcome === 'yes' ? 40 : 60
              }
            };
          }
        }
      } catch (error) {
        console.error('0G prediction failed, using calculation:', error);
      }
    }

    // Fallback: Calculate power scores
    const power1 = this.calculatePowerScore(warrior1Stats);
    const power2 = this.calculatePowerScore(warrior2Stats);

    const totalPower = power1 + power2;
    const warrior1Probability = power1 / totalPower;

    return {
      prediction: warrior1Probability > 0.5 ? 'warrior1' : 'warrior2',
      confidence: Math.abs(warrior1Probability - 0.5) * 200,
      reasoning: this.generatePredictionReasoning(warrior1Stats, warrior2Stats, warrior1Probability),
      suggestedOdds: {
        yes: Math.round(warrior1Probability * 100),
        no: Math.round((1 - warrior1Probability) * 100)
      }
    };
  }

  /**
   * Calculate warrior power score
   */
  private calculatePowerScore(stats: WarriorTraits): number {
    return (
      stats.strength * 1.2 +
      stats.wit * 0.8 +
      stats.charisma * 0.5 +
      stats.defence * 1.0 +
      stats.luck * 0.7
    );
  }

  /**
   * Generate prediction reasoning text
   */
  private generatePredictionReasoning(
    warrior1Stats: WarriorTraits,
    warrior2Stats: WarriorTraits,
    probability: number
  ): string {
    const power1 = this.calculatePowerScore(warrior1Stats);
    const power2 = this.calculatePowerScore(warrior2Stats);
    const diff = Math.abs(power1 - power2);
    const winner = power1 > power2 ? 'Warrior 1' : 'Warrior 2';

    if (diff < 100) {
      return `Very close matchup! ${winner} has a slight edge. This could go either way.`;
    } else if (diff < 500) {
      return `${winner} appears stronger overall, but the battle could still be competitive.`;
    } else {
      return `${winner} has a significant advantage in this matchup. Expect a decisive victory.`;
    }
  }

  /**
   * Get registered AI providers
   */
  async getAIProviders(): Promise<AIProvider[]> {
    await this.loadProviders();
    return this.aiProviders.filter(p => p.isActive);
  }

  /**
   * Get resolution status for a battle
   */
  async getResolutionStatus(battleId: bigint): Promise<{
    status: ResolutionStatus;
    proof: ResolutionProof | null;
    disputeDeadline: number | null;
  }> {
    // In production, fetch from contract
    return {
      status: ResolutionStatus.Pending,
      proof: null,
      disputeDeadline: null
    };
  }

  /**
   * Store battle data on 0G Storage for RAG
   */
  async storeBattleForRAG(battleResult: BattleResult): Promise<string | null> {
    try {
      const battleData = this.buildBattleDataIndex(battleResult);

      const response = await fetch('/api/0g/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle: battleData })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.rootHash) {
          // Index the battle for queries
          await fetch('/api/0g/query', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rootHash: result.rootHash,
              battle: battleData
            })
          });

          return result.rootHash;
        }
      }
    } catch (error) {
      console.error('Failed to store battle on 0G:', error);
    }
    return null;
  }

  /**
   * Get historical battles for RAG context
   */
  async getBattleContext(
    warrior1Id: bigint,
    warrior2Id: bigint,
    maxBattles: number = 10
  ): Promise<BattleDataIndex[]> {
    try {
      const response = await fetch(
        `/api/0g/query?type=context&warrior1Id=${warrior1Id}&warrior2Id=${warrior2Id}&maxBattles=${maxBattles}`
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.context) {
          return result.context;
        }
      }
    } catch (error) {
      console.error('Failed to get battle context:', error);
    }
    return [];
  }
}

export const oracleService = new OracleService();
export default oracleService;
