/**
 * 0G Compute Service
 * Handles AI inference via 0G Compute Network for battle predictions and debate reasoning
 */

import type { Address } from 'viem';
import type {
  ZeroGConfig,
  InferenceRequest,
  InferenceResult,
  InferenceProof,
  PredictionResult,
  ReasoningResult,
  BattleDataIndex,
  AIProvider,
  LedgerInfo,
  DebatePredictionRequest,
  DebateReasoningRequest,
  DebateRebuttalRequest
} from '../types/zeroG';
import { ZERO_G_TESTNET_CONFIG, serializeBattleData } from '../types/zeroG';

// ============================================================================
// Constants
// ============================================================================

const MINIMUM_LEDGER_DEPOSIT = 3.0; // OG tokens required for new ledger

// Prompts for different AI tasks
const PROMPTS = {
  battlePrediction: (battleData: BattleDataIndex) => `
You are an expert battle analyst for the Warriors AI Arena prediction market.
Analyze the following battle data and predict the winner.

BATTLE DATA:
${serializeBattleData(battleData)}

WARRIOR 1 STATS:
- Strength: ${battleData.warriors[0]?.traits.strength || 0}
- Wit: ${battleData.warriors[0]?.traits.wit || 0}
- Charisma: ${battleData.warriors[0]?.traits.charisma || 0}
- Defence: ${battleData.warriors[0]?.traits.defence || 0}
- Luck: ${battleData.warriors[0]?.traits.luck || 0}

WARRIOR 2 STATS:
- Strength: ${battleData.warriors[1]?.traits.strength || 0}
- Wit: ${battleData.warriors[1]?.traits.wit || 0}
- Charisma: ${battleData.warriors[1]?.traits.charisma || 0}
- Defence: ${battleData.warriors[1]?.traits.defence || 0}
- Luck: ${battleData.warriors[1]?.traits.luck || 0}

RULES:
- Higher Strength = more damage dealt
- Higher Defence = less damage taken
- Higher Wit = better move selection
- Higher Luck = critical hit chance
- Higher Charisma = recovery effectiveness

Provide your prediction in this exact JSON format:
{
  "outcome": "yes" | "no" | "draw",
  "confidence": <number 0-100>,
  "reasoning": "<one paragraph explaining your prediction>"
}

NOTE: "yes" = Warrior 1 wins, "no" = Warrior 2 wins
`,

  debateReasoning: (context: DebateReasoningRequest) => `
You are participating in an AI debate for the Warriors AI Arena prediction market.
Your task is to provide ${context.phase === 'evidence' ? 'evidence-backed' : 'initial'} reasoning for your prediction.

BATTLE DATA:
${serializeBattleData(context.context.battleData)}

${context.context.otherPredictions ? `
OTHER AGENTS' PREDICTIONS:
${context.context.otherPredictions.map(p => `
- Agent ${p.agentId}: ${p.outcome} - ${p.reasoning}
`).join('')}
` : ''}

Provide detailed reasoning with evidence from the battle statistics.
Format your response as JSON:
{
  "reasoning": "<detailed multi-paragraph reasoning>",
  "evidence": ["<evidence point 1>", "<evidence point 2>", ...],
  "confidence": <number 0-100>
}
`,

  debateRebuttal: (request: DebateRebuttalRequest) => `
You are rebutting another AI agent's prediction in the Warriors AI Arena debate.

TARGET PREDICTION:
Agent ${request.targetAgentId} predicted: ${request.targetPrediction.outcome}
Reasoning: ${request.targetPrediction.reasoning}
Confidence: ${request.targetPrediction.confidence}%

BATTLE DATA:
${serializeBattleData(request.battleData)}

Provide a rebuttal that challenges their reasoning with counter-evidence.
Format your response as JSON:
{
  "rebuttal": "<your counter-argument>",
  "counterEvidence": ["<point 1>", "<point 2>", ...],
  "strengthOfRebuttal": <number 0-100>
}
`
};

// ============================================================================
// Service Class
// ============================================================================

class ZeroGComputeService {
  private config: ZeroGConfig;
  private broker: any = null;
  private initialized: boolean = false;

  constructor(config: ZeroGConfig = ZERO_G_TESTNET_CONFIG) {
    this.config = config;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the 0G compute broker
   * NOTE: This must be called from a server-side context (API route)
   * because it requires the private key
   */
  async initializeBroker(privateKey: string): Promise<void> {
    if (this.initialized && this.broker) {
      return;
    }

    try {
      // Dynamic imports for server-side only modules
      const { ethers } = await import('ethers');
      const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');

      const provider = new ethers.JsonRpcProvider(this.config.computeRpc);
      const wallet = new ethers.Wallet(privateKey, provider);

      this.broker = await createZGComputeNetworkBroker(wallet);
      this.initialized = true;

      // Setup ledger if needed
      await this.ensureLedgerExists();

      console.log('0G Compute broker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize 0G compute broker:', error);
      throw error;
    }
  }

  /**
   * Ensure ledger account exists with sufficient funds
   */
  private async ensureLedgerExists(): Promise<void> {
    if (!this.broker) throw new Error('Broker not initialized');

    try {
      await this.broker.ledger.getLedger();
      console.log('Ledger account exists');
    } catch {
      console.log('Creating new ledger account...');
      try {
        await this.broker.ledger.depositFund(MINIMUM_LEDGER_DEPOSIT);
        console.log(`Deposited ${MINIMUM_LEDGER_DEPOSIT} OG tokens to ledger`);
      } catch (depositError: any) {
        if (!depositError.message?.includes('already exists')) {
          throw depositError;
        }
      }
    }
  }

  /**
   * Get ledger info
   */
  async getLedgerInfo(): Promise<LedgerInfo | null> {
    if (!this.broker) return null;

    try {
      const ledger = await this.broker.ledger.getLedger();
      return {
        balance: BigInt(ledger.balance || ledger[0] || 0),
        totalSpent: BigInt(0), // Would need to track separately
        createdAt: Date.now()
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Provider Management
  // ============================================================================

  /**
   * List available AI providers
   */
  async listProviders(): Promise<AIProvider[]> {
    if (!this.broker) throw new Error('Broker not initialized');

    try {
      const services = await this.broker.inference.listService();
      return services.map((s: any) => ({
        address: s.provider as Address,
        name: s.model || 'Unknown',
        model: s.model || 'Unknown',
        endpoint: s.url || '',
        isActive: true,
        serviceType: s.serviceType as 'chatbot' | 'inference' | 'embedding',
        inputPrice: BigInt(s.inputPrice || 0),
        outputPrice: BigInt(s.outputPrice || 0),
        verifiability: s.verifiability || 'none'
      }));
    } catch (error) {
      console.error('Error listing providers:', error);
      return [];
    }
  }

  /**
   * Get a chatbot provider (preferring index 1 for better models)
   */
  async getPreferredProvider(preferredIndex: number = 1): Promise<AIProvider | null> {
    const providers = await this.listProviders();
    const chatbotProviders = providers.filter(p => p.serviceType === 'chatbot');

    if (chatbotProviders.length === 0) return null;

    const index = Math.min(preferredIndex, chatbotProviders.length - 1);
    return chatbotProviders[index];
  }

  // ============================================================================
  // Core Inference Methods
  // ============================================================================

  /**
   * Submit inference request to 0G compute
   */
  async submitInference(request: InferenceRequest): Promise<InferenceResult> {
    if (!this.broker) throw new Error('Broker not initialized');

    // Get provider
    const provider = await this.getPreferredProvider();
    if (!provider) throw new Error('No chatbot providers available');

    // Acknowledge provider signer
    try {
      await this.broker.inference.acknowledgeProviderSigner(provider.address);
    } catch (error: any) {
      // Ignore if already acknowledged
      if (!error.message?.includes('already acknowledged')) {
        console.warn('Provider acknowledge warning:', error.message);
      }
    }

    // Get service metadata
    const { endpoint, model } = await this.broker.inference.getServiceMetadata(provider.address);

    // Generate authentication headers
    const headers = await this.broker.inference.getRequestHeaders(provider.address, request.prompt);

    // Send request using OpenAI-compatible API
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      baseURL: endpoint,
      apiKey: '' // Empty as per 0G docs
    });

    // Prepare headers
    const requestHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        requestHeaders[key] = value;
      }
    });

    // Send query
    const completion = await openai.chat.completions.create(
      {
        messages: [{ role: 'user', content: request.prompt }],
        model: model,
        max_tokens: request.maxTokens || 1000,
        temperature: request.temperature || 0.7
      },
      { headers: requestHeaders }
    );

    const response = completion.choices[0].message.content || '';
    const chatId = completion.id;

    // Process response and handle payment
    try {
      await this.broker.inference.processResponse(provider.address, response, chatId);
    } catch (paymentError: any) {
      console.warn('Payment processing warning:', paymentError.message);
    }

    // Create proof
    const proof: InferenceProof = {
      signature: chatId, // Use chatId as signature reference
      modelHash: model,
      inputHash: this.hashString(request.prompt),
      outputHash: this.hashString(response),
      providerAddress: provider.address
    };

    return {
      chatId,
      response,
      provider: provider.address,
      timestamp: Date.now(),
      proof,
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        cost: '0' // Would calculate from provider prices
      }
    };
  }

  /**
   * Simple string hash for proofs
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

  // ============================================================================
  // Battle Prediction Methods
  // ============================================================================

  /**
   * Submit AI prediction for a battle
   */
  async submitBattlePrediction(
    battleData: BattleDataIndex
  ): Promise<PredictionResult> {
    const prompt = PROMPTS.battlePrediction(battleData);

    const result = await this.submitInference({ prompt });

    // Parse the response
    try {
      const parsed = this.extractJSON(result.response);

      return {
        outcome: parsed.outcome as 'yes' | 'no' | 'draw',
        confidence: parsed.confidence || 50,
        reasoning: parsed.reasoning || 'No reasoning provided',
        chatId: result.chatId,
        proof: result.proof
      };
    } catch (parseError) {
      console.error('Failed to parse prediction response:', parseError);
      // Return default prediction
      return {
        outcome: 'draw',
        confidence: 50,
        reasoning: result.response,
        chatId: result.chatId,
        proof: result.proof
      };
    }
  }

  /**
   * Analyze battle outcome (post-battle analysis)
   */
  async analyzeBattleOutcome(battleData: BattleDataIndex): Promise<{
    analysis: string;
    keyFactors: string[];
    predictability: number;
  }> {
    const prompt = `
Analyze this completed battle and identify key factors that determined the outcome.

BATTLE DATA:
${serializeBattleData(battleData)}

OUTCOME: ${battleData.outcome}
FINAL DAMAGE: Warrior 1: ${battleData.totalDamage.warrior1}, Warrior 2: ${battleData.totalDamage.warrior2}

Provide analysis in JSON format:
{
  "analysis": "<paragraph explaining why this outcome occurred>",
  "keyFactors": ["<factor 1>", "<factor 2>", ...],
  "predictability": <number 0-100 indicating how predictable this outcome was>
}
`;

    const result = await this.submitInference({ prompt });

    try {
      const parsed = this.extractJSON(result.response);
      return {
        analysis: parsed.analysis || 'Unable to analyze',
        keyFactors: parsed.keyFactors || [],
        predictability: parsed.predictability || 50
      };
    } catch {
      return {
        analysis: result.response,
        keyFactors: [],
        predictability: 50
      };
    }
  }

  // ============================================================================
  // Debate Methods
  // ============================================================================

  /**
   * Generate debate prediction with reasoning
   */
  async generateDebatePrediction(
    request: DebatePredictionRequest
  ): Promise<PredictionResult> {
    return this.submitBattlePrediction(request.battleData);
  }

  /**
   * Generate debate reasoning (evidence phase)
   */
  async generateDebateReasoning(
    request: DebateReasoningRequest
  ): Promise<ReasoningResult> {
    const prompt = PROMPTS.debateReasoning(request);

    const result = await this.submitInference({ prompt });

    try {
      const parsed = this.extractJSON(result.response);
      return {
        reasoning: parsed.reasoning || 'No reasoning provided',
        evidence: parsed.evidence || [],
        confidence: parsed.confidence || 50,
        chatId: result.chatId,
        proof: result.proof
      };
    } catch {
      return {
        reasoning: result.response,
        evidence: [],
        confidence: 50,
        chatId: result.chatId,
        proof: result.proof
      };
    }
  }

  /**
   * Generate debate rebuttal
   */
  async generateDebateRebuttal(
    request: DebateRebuttalRequest
  ): Promise<{
    rebuttal: string;
    counterEvidence: string[];
    strength: number;
    chatId: string;
    proof: InferenceProof;
  }> {
    const prompt = PROMPTS.debateRebuttal(request);

    const result = await this.submitInference({ prompt });

    try {
      const parsed = this.extractJSON(result.response);
      return {
        rebuttal: parsed.rebuttal || 'No rebuttal provided',
        counterEvidence: parsed.counterEvidence || [],
        strength: parsed.strengthOfRebuttal || 50,
        chatId: result.chatId,
        proof: result.proof
      };
    } catch {
      return {
        rebuttal: result.response,
        counterEvidence: [],
        strength: 50,
        chatId: result.chatId,
        proof: result.proof
      };
    }
  }

  // ============================================================================
  // Verification Methods
  // ============================================================================

  /**
   * Verify an inference result
   * In production, this would verify TEE attestations
   */
  async verifyInferenceResult(
    result: InferenceResult,
    _providerAddress: Address
  ): Promise<boolean> {
    // Basic verification - check proof exists
    if (!result.proof || !result.chatId) {
      return false;
    }

    // Verify hashes match
    const expectedOutputHash = this.hashString(result.response);
    if (result.proof.outputHash !== expectedOutputHash) {
      return false;
    }

    // In production, would verify:
    // 1. TEE attestation signature
    // 2. Provider registration on-chain
    // 3. Cryptographic proof chain

    return true;
  }

  /**
   * Get inference proof by chat ID
   */
  async getInferenceProof(chatId: string): Promise<InferenceProof | null> {
    // In production, this would fetch from 0G storage or contract
    // For now, return null (would need to store proofs)
    console.log('getInferenceProof called for:', chatId);
    return null;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Extract JSON from AI response (handles markdown code blocks)
   */
  private extractJSON(response: string): any {
    // Try direct parse first
    try {
      return JSON.parse(response.trim());
    } catch {
      // Try to extract from markdown code block
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }

      // Try to find JSON object in response
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }

      throw new Error('Could not extract JSON from response');
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.broker !== null;
  }

  /**
   * Get configuration
   */
  getConfig(): ZeroGConfig {
    return this.config;
  }
}

// Export singleton instance
export const zeroGComputeService = new ZeroGComputeService();
export default zeroGComputeService;
