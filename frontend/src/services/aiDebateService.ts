/**
 * AI Debate Service
 * Multi-agent debate system for prediction market analysis
 * Inspired by Simmer Markets - AI agents research, debate, and forecast
 */

import { prisma } from '@/lib/prisma';
import {
  UnifiedMarket,
  MarketSource,
  DebateResult,
  DebateRound,
  DebateSource,
  DebateAgentRole,
} from '@/types/externalMarket';

// ============================================
// CONSTANTS
// ============================================

const DEBATE_ROUNDS = 3;
const MAX_SOURCES_PER_AGENT = 5;

// Agent system prompts
const AGENT_PROMPTS: Record<DebateAgentRole, string> = {
  bull: `You are a Bull Agent arguing FOR the YES outcome. Present the strongest case for why this prediction should resolve YES. Use evidence, data, and logical reasoning. Be persuasive but honest. Focus on:
- Recent news and developments supporting YES
- Historical patterns favoring YES
- Expert opinions predicting YES
- Statistical trends indicating YES likelihood`,

  bear: `You are a Bear Agent arguing FOR the NO outcome. Present the strongest case for why this prediction should resolve NO. Use evidence, data, and logical reasoning. Be persuasive but honest. Focus on:
- Factors that could prevent YES from happening
- Historical cases where similar predictions failed
- Expert opinions predicting NO
- Risks and uncertainties that favor NO`,

  neutral: `You are a Neutral Agent providing balanced analysis. Present both sides objectively and highlight key uncertainties. Focus on:
- Summarizing the strongest arguments for both sides
- Identifying the most important factors
- Acknowledging unknowns and limitations
- Estimating probability ranges`,

  supervisor: `You are the Supervisor Agent synthesizing the debate. Analyze all arguments and provide a final probability estimate. Consider:
- Quality of evidence presented by each side
- Strength of logical arguments
- Historical accuracy of similar predictions
- Current market sentiment vs fundamentals
Provide a final probability (0-100%) for YES outcome with confidence level (0-100%).`,
};

// ============================================
// TYPES
// ============================================

interface ResearchResult {
  agentRole: DebateAgentRole;
  sources: DebateSource[];
  keyPoints: string[];
}

interface DebateAgentResponse {
  argument: string;
  confidence: number;
  sources: string[];
}

// ============================================
// AI DEBATE SERVICE
// ============================================

class AIDebateService {
  /**
   * Conduct a full multi-agent debate on a market
   */
  async conductDebate(
    marketId: string,
    question: string,
    source: MarketSource = MarketSource.NATIVE
  ): Promise<DebateResult> {
    // Create debate record
    const debate = await prisma.aIDebate.create({
      data: {
        marketId,
        question,
        source,
        status: 'in_progress',
      },
    });

    try {
      const rounds: DebateRound[] = [];

      // Phase 1: Research (parallel)
      const [bullResearch, bearResearch, neutralResearch] = await Promise.all([
        this.conductResearch(question, 'bull'),
        this.conductResearch(question, 'bear'),
        this.conductResearch(question, 'neutral'),
      ]);

      // Phase 2: Round 1 - Initial Arguments
      const round1Bull = await this.generateArgument('bull', question, bullResearch, []);
      rounds.push(await this.saveRound(debate.id, 1, 'bull', round1Bull));

      const round1Bear = await this.generateArgument('bear', question, bearResearch, []);
      rounds.push(await this.saveRound(debate.id, 1, 'bear', round1Bear));

      const round1Neutral = await this.generateArgument('neutral', question, neutralResearch, []);
      rounds.push(await this.saveRound(debate.id, 1, 'neutral', round1Neutral));

      // Phase 3: Round 2 - Rebuttals
      const round2Bull = await this.generateRebuttal('bull', question, rounds);
      rounds.push(await this.saveRound(debate.id, 2, 'bull', round2Bull));

      const round2Bear = await this.generateRebuttal('bear', question, rounds);
      rounds.push(await this.saveRound(debate.id, 2, 'bear', round2Bear));

      // Phase 4: Round 3 - Supervisor Synthesis
      const synthesis = await this.synthesizeDebate(question, rounds);
      rounds.push(await this.saveRound(debate.id, 3, 'supervisor', synthesis));

      // Extract final prediction from synthesis
      const finalPrediction = this.extractPrediction(synthesis.argument);

      // Collect all sources
      const allSources = [
        ...bullResearch.sources,
        ...bearResearch.sources,
        ...neutralResearch.sources,
      ];

      // Extract key factors
      const keyFactors = this.extractKeyFactors(rounds);

      // Update debate record
      await prisma.aIDebate.update({
        where: { id: debate.id },
        data: {
          status: 'completed',
          predictedOutcome: finalPrediction.outcome,
          probability: finalPrediction.probability * 100,
          confidence: finalPrediction.confidence,
          keyFactors: JSON.stringify(keyFactors),
          sources: JSON.stringify(allSources),
          // 0G verification would go here
          isVerified: false,
        },
      });

      return {
        id: debate.id,
        marketId,
        question,
        source,
        rounds,
        finalPrediction,
        keyFactors,
        sources: allSources,
        isVerified: false,
        status: 'completed',
        createdAt: debate.createdAt.getTime(),
      };
    } catch (error) {
      // Mark debate as failed
      await prisma.aIDebate.update({
        where: { id: debate.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  /**
   * Conduct research for an agent role
   */
  private async conductResearch(
    question: string,
    role: DebateAgentRole
  ): Promise<ResearchResult> {
    // In production, this would:
    // 1. Call web search APIs (Tavily, SerpAPI)
    // 2. Scrape news sources
    // 3. Pull historical market data
    // 4. Analyze social sentiment

    // For now, return simulated research
    const sources: DebateSource[] = [
      {
        url: 'https://example.com/source1',
        title: 'Relevant News Article',
        snippet: 'Key information related to the prediction...',
        relevance: 0.85,
      },
      {
        url: 'https://example.com/source2',
        title: 'Expert Analysis',
        snippet: 'Expert opinion on the matter...',
        relevance: 0.78,
      },
    ];

    const keyPoints = [
      `Key point 1 for ${role} perspective`,
      `Key point 2 for ${role} perspective`,
      `Key point 3 for ${role} perspective`,
    ];

    return { agentRole: role, sources, keyPoints };
  }

  /**
   * Generate initial argument from an agent
   */
  private async generateArgument(
    role: DebateAgentRole,
    question: string,
    research: ResearchResult,
    previousRounds: DebateRound[]
  ): Promise<DebateAgentResponse> {
    // In production, this would call OpenAI/Claude/0G Compute
    // For now, generate a simulated response

    const roleConfig = {
      bull: { position: 'YES', confidence: 75 },
      bear: { position: 'NO', confidence: 70 },
      neutral: { position: 'balanced', confidence: 65 },
      supervisor: { position: 'synthesis', confidence: 80 },
    };

    const config = roleConfig[role];

    const argument = this.generateSimulatedArgument(role, question, research);

    return {
      argument,
      confidence: config.confidence,
      sources: research.sources.map((s) => s.url),
    };
  }

  /**
   * Generate rebuttal based on previous arguments
   */
  private async generateRebuttal(
    role: DebateAgentRole,
    question: string,
    previousRounds: DebateRound[]
  ): Promise<DebateAgentResponse> {
    // Find opposing arguments to rebut
    const opposingRole = role === 'bull' ? 'bear' : 'bull';
    const opposingArgs = previousRounds.filter((r) => r.agentRole === opposingRole);

    const argument = `[Rebuttal] After considering the ${opposingRole} argument, I maintain that ${
      role === 'bull' ? 'YES' : 'NO'
    } is more likely because... [Generated rebuttal addressing specific counterpoints]`;

    return {
      argument,
      confidence: 70,
      sources: [],
    };
  }

  /**
   * Synthesize debate and provide final prediction
   */
  private async synthesizeDebate(
    question: string,
    rounds: DebateRound[]
  ): Promise<DebateAgentResponse> {
    // Analyze all arguments and produce synthesis
    const bullConfidence = this.getAverageConfidence(rounds, 'bull');
    const bearConfidence = this.getAverageConfidence(rounds, 'bear');

    // Simple synthesis based on confidence levels
    const yesProbability = bullConfidence / (bullConfidence + bearConfidence);
    const confidence = Math.abs(bullConfidence - bearConfidence) + 50;

    const argument = `After analyzing all arguments, my final assessment is:

**Probability: ${(yesProbability * 100).toFixed(1)}% YES**
**Confidence: ${confidence.toFixed(0)}%**

Key factors:
1. The bull case presents strong evidence regarding recent developments
2. The bear case raises valid concerns about historical patterns
3. Current market sentiment appears ${yesProbability > 0.5 ? 'optimistic' : 'cautious'}

Final recommendation: ${yesProbability > 0.5 ? 'Lean YES' : 'Lean NO'} with ${confidence > 70 ? 'high' : 'moderate'} confidence.`;

    return {
      argument,
      confidence,
      sources: [],
    };
  }

  /**
   * Save debate round to database
   */
  private async saveRound(
    debateId: string,
    roundNumber: number,
    agentRole: DebateAgentRole,
    response: DebateAgentResponse
  ): Promise<DebateRound> {
    const round = await prisma.aIDebateRound.create({
      data: {
        debateId,
        roundNumber,
        agentRole,
        argument: response.argument,
        sources: JSON.stringify(response.sources),
        confidence: response.confidence,
      },
    });

    return {
      id: round.id,
      roundNumber: round.roundNumber,
      agentRole: round.agentRole as DebateAgentRole,
      argument: round.argument,
      sources: response.sources,
      confidence: round.confidence,
      timestamp: round.timestamp.getTime(),
    };
  }

  /**
   * Extract prediction from supervisor synthesis
   */
  private extractPrediction(synthesis: string): {
    outcome: 'yes' | 'no';
    probability: number;
    confidence: number;
  } {
    // Extract probability from synthesis text
    const probMatch = synthesis.match(/(\d+(?:\.\d+)?)\s*%\s*YES/i);
    const probability = probMatch ? parseFloat(probMatch[1]) / 100 : 0.5;

    const confMatch = synthesis.match(/Confidence:\s*(\d+(?:\.\d+)?)\s*%/i);
    const confidence = confMatch ? parseFloat(confMatch[1]) : 50;

    return {
      outcome: probability > 0.5 ? 'yes' : 'no',
      probability,
      confidence,
    };
  }

  /**
   * Extract key factors from debate rounds
   */
  private extractKeyFactors(rounds: DebateRound[]): string[] {
    // In production, use NLP to extract key factors
    return [
      'Recent market developments favor the prediction',
      'Historical patterns provide mixed signals',
      'Expert consensus is divided',
      'Current sentiment trending positive',
    ];
  }

  /**
   * Get average confidence for a role across rounds
   */
  private getAverageConfidence(
    rounds: DebateRound[],
    role: DebateAgentRole
  ): number {
    const roleRounds = rounds.filter((r) => r.agentRole === role);
    if (roleRounds.length === 0) return 50;

    const sum = roleRounds.reduce((acc, r) => acc + r.confidence, 0);
    return sum / roleRounds.length;
  }

  /**
   * Generate simulated argument (placeholder for AI)
   */
  private generateSimulatedArgument(
    role: DebateAgentRole,
    question: string,
    research: ResearchResult
  ): string {
    const templates = {
      bull: `As the Bull Agent, I argue strongly for YES on "${question}".

Based on my research:
${research.keyPoints.map((p) => `- ${p}`).join('\n')}

The evidence clearly supports a YES outcome because of recent positive developments and favorable historical patterns. Market sentiment and expert analysis both point toward this outcome materializing.

**My confidence: ${70 + Math.floor(Math.random() * 20)}%**`,

      bear: `As the Bear Agent, I argue for NO on "${question}".

Based on my research:
${research.keyPoints.map((p) => `- ${p}`).join('\n')}

There are significant factors that could prevent a YES outcome. Historical precedent shows similar predictions have failed, and current uncertainties present substantial risk.

**My confidence: ${65 + Math.floor(Math.random() * 20)}%**`,

      neutral: `As the Neutral Agent, I provide balanced analysis on "${question}".

**For YES:**
${research.keyPoints[0]}

**For NO:**
${research.keyPoints[1]}

**Key Uncertainties:**
${research.keyPoints[2]}

Both sides present valid arguments. The outcome will likely depend on factors that remain uncertain at this time.

**Estimated probability range: 40-60% YES**`,

      supervisor: 'Supervisor synthesis is generated separately.',
    };

    return templates[role];
  }

  // ============================================
  // DATABASE QUERIES
  // ============================================

  /**
   * Get debate by ID
   */
  async getDebate(debateId: string): Promise<DebateResult | null> {
    const debate = await prisma.aIDebate.findUnique({
      where: { id: debateId },
      include: { rounds: true },
    });

    if (!debate) return null;

    return this.formatDebateResult(debate);
  }

  /**
   * Get debate history for a market
   */
  async getDebateHistory(marketId: string): Promise<DebateResult[]> {
    const debates = await prisma.aIDebate.findMany({
      where: { marketId },
      include: { rounds: true },
      orderBy: { createdAt: 'desc' },
    });

    return debates.map((d) => this.formatDebateResult(d));
  }

  /**
   * Format database debate to DebateResult
   */
  private formatDebateResult(debate: {
    id: string;
    marketId: string;
    question: string;
    source: string;
    predictedOutcome: string | null;
    probability: number | null;
    confidence: number | null;
    keyFactors: string | null;
    sources: string | null;
    inputHash: string | null;
    outputHash: string | null;
    providerAddress: string | null;
    isVerified: boolean;
    status: string;
    createdAt: Date;
    rounds: Array<{
      id: string;
      roundNumber: number;
      agentRole: string;
      argument: string;
      sources: string | null;
      confidence: number;
      timestamp: Date;
    }>;
  }): DebateResult {
    return {
      id: debate.id,
      marketId: debate.marketId,
      question: debate.question,
      source: debate.source as MarketSource,
      rounds: debate.rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        agentRole: r.agentRole as DebateAgentRole,
        argument: r.argument,
        sources: r.sources ? JSON.parse(r.sources) : [],
        confidence: r.confidence,
        timestamp: r.timestamp.getTime(),
      })),
      finalPrediction: {
        outcome: (debate.predictedOutcome || 'yes') as 'yes' | 'no',
        probability: (debate.probability || 50) / 100,
        confidence: debate.confidence || 50,
      },
      keyFactors: debate.keyFactors ? JSON.parse(debate.keyFactors) : [],
      sources: debate.sources ? JSON.parse(debate.sources) : [],
      proof: debate.inputHash
        ? {
            inputHash: debate.inputHash,
            outputHash: debate.outputHash || '',
            providerAddress: debate.providerAddress || '',
          }
        : undefined,
      isVerified: debate.isVerified,
      status: debate.status as 'pending' | 'in_progress' | 'completed' | 'failed',
      createdAt: debate.createdAt.getTime(),
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const aiDebateService = new AIDebateService();
export default aiDebateService;
