/**
 * AI Debate Service
 * Generates arguments for warriors in prediction arena debates
 */

import {
  WarriorTraits,
  DebateMove,
  DebateContext,
  DebateEvidence,
  GeneratedArgument,
  RoundResult,
  PredictionRound,
  MarketSource,
} from '../../types/predictionArena';

import {
  calculateRoundScore,
  generateBaseScore,
  selectOptimalMove,
  calculateConfidence,
  ScoreBreakdown,
} from '../../lib/arenaScoring';

// ============================================
// ARGUMENT TEMPLATES
// ============================================

const ARGUMENT_TEMPLATES = {
  yes: {
    [DebateMove.STRIKE]: [
      "The evidence overwhelmingly supports YES. {evidence}. The trajectory is clear.",
      "Let me present the hard facts: {evidence}. This points definitively to YES.",
      "Historical patterns don't lie: {evidence}. The outcome will be YES.",
    ],
    [DebateMove.TAUNT]: [
      "My opponent ignores the obvious signs. {evidence}. Their NO position is wishful thinking.",
      "The NO argument crumbles under scrutiny. {evidence}. Face the reality.",
      "While my opponent clings to doubt, {evidence}. The smart money is on YES.",
    ],
    [DebateMove.DODGE]: [
      "While that's an interesting point, let's focus on what matters: {evidence}.",
      "That concern is valid but misses the bigger picture. Consider: {evidence}.",
      "I acknowledge the uncertainty, but the core thesis remains: {evidence}.",
    ],
    [DebateMove.SPECIAL]: [
      "Here's what everyone's missing: {evidence}. This changes everything for YES.",
      "A deeper analysis reveals: {evidence}. The YES case is stronger than it appears.",
      "Consider this overlooked factor: {evidence}. It tips the scales to YES.",
    ],
    [DebateMove.RECOVER]: [
      "Fair point on that weakness. However, the overall picture still supports YES: {evidence}.",
      "I'll concede that aspect, but pivoting to the stronger argument: {evidence}.",
      "That's a valid concern. Let me address it and reinforce: {evidence}.",
    ],
  },
  no: {
    [DebateMove.STRIKE]: [
      "The data clearly indicates NO. {evidence}. The conclusion is unavoidable.",
      "Here are the facts that matter: {evidence}. This leads squarely to NO.",
      "Market signals are telling us: {evidence}. NO is the rational position.",
    ],
    [DebateMove.TAUNT]: [
      "The YES position is built on hopium. {evidence}. Reality says otherwise.",
      "My opponent's optimism ignores: {evidence}. The NO case is airtight.",
      "Wishful thinking won't change: {evidence}. NO is where this lands.",
    ],
    [DebateMove.DODGE]: [
      "That's one perspective, but consider: {evidence}. The NO thesis stands.",
      "An interesting angle, but the fundamentals point elsewhere: {evidence}.",
      "I see that argument, but let's refocus on: {evidence}.",
    ],
    [DebateMove.SPECIAL]: [
      "Here's the insight others miss: {evidence}. This seals the NO case.",
      "Looking deeper reveals: {evidence}. The NO position is underappreciated.",
      "An unconventional but crucial point: {evidence}. NO becomes clearer.",
    ],
    [DebateMove.RECOVER]: [
      "That's a fair critique. However, the NO thesis remains intact: {evidence}.",
      "I acknowledge that point, but consider the counter: {evidence}.",
      "Valid concern, but the weight of evidence still says NO: {evidence}.",
    ],
  },
};

// ============================================
// EVIDENCE GENERATION
// ============================================

/**
 * Generate mock evidence based on market context and luck trait
 * In production, this would call real data APIs
 */
function generateEvidence(
  context: DebateContext,
  luck: number,
  count: number = 2
): DebateEvidence[] {
  const evidenceTypes: DebateEvidence['type'][] = ['news', 'data', 'expert', 'historical', 'market'];

  // Luck influences evidence quality
  const qualityBonus = (luck / 10000) * 20; // 0-20 bonus

  const evidence: DebateEvidence[] = [];

  for (let i = 0; i < count; i++) {
    const type = evidenceTypes[Math.floor(Math.random() * evidenceTypes.length)];
    const relevance = Math.round(60 + qualityBonus + Math.random() * 20);

    evidence.push({
      type,
      source: getEvidenceSource(type, context.marketSource),
      title: getEvidenceTitle(type, context.marketQuestion, context.side),
      snippet: getEvidenceSnippet(type, context.side),
      relevance,
      timestamp: new Date().toISOString(),
    });
  }

  return evidence.sort((a, b) => b.relevance - a.relevance);
}

function getEvidenceSource(type: DebateEvidence['type'], marketSource: MarketSource): string {
  const sources: Record<DebateEvidence['type'], string[]> = {
    news: ['Reuters', 'Bloomberg', 'AP News', 'WSJ', 'Financial Times'],
    data: ['Federal Reserve', 'Bureau of Labor Statistics', 'World Bank', 'IMF'],
    expert: ['Goldman Sachs', 'JPMorgan Research', 'MIT Study', 'Stanford Analysis'],
    historical: ['Historical Records', 'Past Events Database', 'Pattern Analysis'],
    market: [marketSource === 'polymarket' ? 'Polymarket Data' : 'Kalshi Markets', 'Trading Volume Analysis'],
  };

  const options = sources[type];
  return options[Math.floor(Math.random() * options.length)];
}

function getEvidenceTitle(type: DebateEvidence['type'], question: string, side: 'yes' | 'no'): string {
  // Extract keywords from question
  const keywords = question.split(' ').filter(w => w.length > 4).slice(0, 3).join(' ');

  const titles: Record<DebateEvidence['type'], string[]> = {
    news: [
      `Breaking: New developments regarding ${keywords}`,
      `Analysis: Latest updates on ${keywords}`,
    ],
    data: [
      `Data shows trends in ${keywords}`,
      `Statistical analysis of ${keywords}`,
    ],
    expert: [
      `Expert opinion: ${side === 'yes' ? 'Positive' : 'Cautious'} outlook on ${keywords}`,
      `Research findings on ${keywords}`,
    ],
    historical: [
      `Historical patterns in similar ${keywords} situations`,
      `Past precedents suggest ${side === 'yes' ? 'likely' : 'unlikely'} outcome`,
    ],
    market: [
      `Market sentiment ${side === 'yes' ? 'bullish' : 'bearish'} on ${keywords}`,
      `Trading patterns indicate ${side === 'yes' ? 'confidence' : 'skepticism'}`,
    ],
  };

  const options = titles[type];
  return options[Math.floor(Math.random() * options.length)];
}

function getEvidenceSnippet(type: DebateEvidence['type'], side: 'yes' | 'no'): string {
  const snippets: Record<string, string[]> = {
    yes: [
      'Recent trends strongly support this outcome.',
      'Multiple indicators point to a positive resolution.',
      'Expert consensus aligns with this projection.',
      'Historical precedent favors this result.',
      'Market dynamics suggest favorable conditions.',
    ],
    no: [
      'Current data suggests significant headwinds.',
      'Several factors indicate this outcome is unlikely.',
      'Expert analysis raises substantial concerns.',
      'Historical patterns show similar situations failing.',
      'Market signals point to skepticism.',
    ],
  };

  const options = snippets[side];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================
// ARGUMENT GENERATION
// ============================================

/**
 * Generate an argument for a warrior
 */
export function generateWarriorArgument(
  traits: WarriorTraits,
  context: DebateContext,
  previousMoves: DebateMove[] = []
): GeneratedArgument {
  // 1. Select optimal move based on traits and context
  const move = selectOptimalMove(
    traits,
    context.roundNumber,
    context.opponentLastMove,
    previousMoves
  );

  // 2. Generate evidence based on luck
  const evidence = generateEvidence(context, traits.luck, 2);

  // 3. Select argument template
  const templates = ARGUMENT_TEMPLATES[context.side][move];
  const template = templates[Math.floor(Math.random() * templates.length)];

  // 4. Fill in evidence
  const evidenceSummary = evidence
    .map(e => e.snippet)
    .join(' Furthermore, ');

  const argument = template.replace('{evidence}', evidenceSummary);

  // 5. Calculate confidence
  const isWinning = context.previousRounds.length > 0 &&
    context.previousRounds.reduce((sum, r) => {
      const myScore = context.side === 'yes' ? r.w1Score : r.w2Score;
      const oppScore = context.side === 'yes' ? r.w2Score : r.w1Score;
      return sum + (myScore - oppScore);
    }, 0) > 0;

  const confidence = calculateConfidence(traits, move, context.roundNumber, isWinning);

  // 6. Generate internal reasoning
  const reasoning = `Selected ${move} based on traits (STR:${traits.strength}, WIT:${traits.wit}, CHA:${traits.charisma}). ` +
    `Evidence quality: ${evidence[0]?.relevance || 0}. ` +
    (context.opponentLastMove ? `Opponent used ${context.opponentLastMove} last round. ` : '') +
    `Round ${context.roundNumber}/5.`;

  return {
    argument,
    evidence,
    confidence,
    move,
    reasoning,
  };
}

// ============================================
// ROUND EXECUTION
// ============================================

/**
 * Execute a full debate round between two warriors
 */
export function executeDebateRound(
  warrior1Traits: WarriorTraits,
  warrior2Traits: WarriorTraits,
  context: {
    marketQuestion: string;
    marketSource: MarketSource;
    roundNumber: number;
    previousRounds: PredictionRound[];
  }
): RoundResult {
  // Get previous moves for each warrior
  const warrior1PrevMoves = context.previousRounds
    .map(r => r.w1Move as DebateMove)
    .filter(Boolean);
  const warrior2PrevMoves = context.previousRounds
    .map(r => r.w2Move as DebateMove)
    .filter(Boolean);

  // Get opponent's last move
  const lastRound = context.previousRounds[context.previousRounds.length - 1];
  const w1OpponentLastMove = lastRound?.w2Move as DebateMove | undefined;
  const w2OpponentLastMove = lastRound?.w1Move as DebateMove | undefined;

  // Generate arguments for both warriors
  const warrior1Arg = generateWarriorArgument(
    warrior1Traits,
    {
      marketQuestion: context.marketQuestion,
      marketSource: context.marketSource,
      side: 'yes',
      roundNumber: context.roundNumber,
      previousRounds: context.previousRounds,
      opponentLastMove: w1OpponentLastMove,
    },
    warrior1PrevMoves
  );

  const warrior2Arg = generateWarriorArgument(
    warrior2Traits,
    {
      marketQuestion: context.marketQuestion,
      marketSource: context.marketSource,
      side: 'no',
      roundNumber: context.roundNumber,
      previousRounds: context.previousRounds,
      opponentLastMove: w2OpponentLastMove,
    },
    warrior2PrevMoves
  );

  // Generate base scores (influenced by luck)
  const w1BaseScore = generateBaseScore(warrior1Traits.luck);
  const w2BaseScore = generateBaseScore(warrior2Traits.luck);

  // Calculate final scores with trait modifiers and move effectiveness
  const w1ScoreBreakdown = calculateRoundScore(
    w1BaseScore,
    warrior1Traits,
    warrior1Arg.move,
    warrior2Arg.move,
    warrior2Traits
  );

  const w2ScoreBreakdown = calculateRoundScore(
    w2BaseScore,
    warrior2Traits,
    warrior2Arg.move,
    warrior1Arg.move,
    warrior1Traits
  );

  // Determine round winner
  let roundWinner: 'warrior1' | 'warrior2' | 'draw';
  if (w1ScoreBreakdown.finalScore > w2ScoreBreakdown.finalScore) {
    roundWinner = 'warrior1';
  } else if (w2ScoreBreakdown.finalScore > w1ScoreBreakdown.finalScore) {
    roundWinner = 'warrior2';
  } else {
    roundWinner = 'draw';
  }

  // Generate judge reasoning
  const judgeReasoning = generateJudgeReasoning(
    warrior1Arg,
    warrior2Arg,
    w1ScoreBreakdown,
    w2ScoreBreakdown,
    roundWinner
  );

  return {
    warrior1: warrior1Arg,
    warrior2: warrior2Arg,
    warrior1Score: w1ScoreBreakdown.finalScore,
    warrior2Score: w2ScoreBreakdown.finalScore,
    roundWinner,
    judgeReasoning,
  };
}

/**
 * Generate AI judge's reasoning for the round
 */
function generateJudgeReasoning(
  w1Arg: GeneratedArgument,
  w2Arg: GeneratedArgument,
  w1Score: ScoreBreakdown,
  w2Score: ScoreBreakdown,
  winner: 'warrior1' | 'warrior2' | 'draw'
): string {
  const parts: string[] = [];

  // Comment on moves
  parts.push(`YES used ${w1Arg.move} while NO used ${w2Arg.move}.`);

  // Comment on counter effectiveness
  if (w1Score.moveMultiplier > 1) {
    parts.push(`YES's ${w1Arg.move} effectively countered NO's ${w2Arg.move}.`);
  } else if (w2Score.moveMultiplier > 1) {
    parts.push(`NO's ${w2Arg.move} effectively countered YES's ${w1Arg.move}.`);
  }

  // Comment on evidence quality
  const w1EvidenceQuality = w1Arg.evidence[0]?.relevance || 0;
  const w2EvidenceQuality = w2Arg.evidence[0]?.relevance || 0;
  if (Math.abs(w1EvidenceQuality - w2EvidenceQuality) > 10) {
    const betterEvidence = w1EvidenceQuality > w2EvidenceQuality ? 'YES' : 'NO';
    parts.push(`${betterEvidence} presented stronger supporting evidence.`);
  }

  // Final verdict
  if (winner === 'warrior1') {
    parts.push(`Round goes to YES (${w1Score.finalScore} vs ${w2Score.finalScore}).`);
  } else if (winner === 'warrior2') {
    parts.push(`Round goes to NO (${w2Score.finalScore} vs ${w1Score.finalScore}).`);
  } else {
    parts.push(`Round is a draw (${w1Score.finalScore} vs ${w2Score.finalScore}).`);
  }

  return parts.join(' ');
}

// ============================================
// FULL BATTLE EXECUTION
// ============================================

/**
 * Execute all 5 rounds of a prediction battle
 */
export function executeFullBattle(
  warrior1Traits: WarriorTraits,
  warrior2Traits: WarriorTraits,
  marketQuestion: string,
  marketSource: MarketSource
): {
  rounds: RoundResult[];
  finalWinner: 'warrior1' | 'warrior2' | 'draw';
  warrior1TotalScore: number;
  warrior2TotalScore: number;
} {
  const rounds: RoundResult[] = [];
  const previousRounds: PredictionRound[] = [];

  for (let roundNum = 1; roundNum <= 5; roundNum++) {
    const result = executeDebateRound(
      warrior1Traits,
      warrior2Traits,
      {
        marketQuestion,
        marketSource,
        roundNumber: roundNum,
        previousRounds,
      }
    );

    rounds.push(result);

    // Convert to PredictionRound format for next iteration
    previousRounds.push({
      id: `round-${roundNum}`,
      battleId: 'temp',
      roundNumber: roundNum,
      w1Argument: result.warrior1.argument,
      w1Move: result.warrior1.move,
      w1Score: result.warrior1Score,
      w2Argument: result.warrior2.argument,
      w2Move: result.warrior2.move,
      w2Score: result.warrior2Score,
      roundWinner: result.roundWinner,
      startedAt: new Date().toISOString(),
    });
  }

  // Calculate totals
  const warrior1TotalScore = rounds.reduce((sum, r) => sum + r.warrior1Score, 0);
  const warrior2TotalScore = rounds.reduce((sum, r) => sum + r.warrior2Score, 0);

  // Determine final winner
  let finalWinner: 'warrior1' | 'warrior2' | 'draw';
  if (warrior1TotalScore > warrior2TotalScore) {
    finalWinner = 'warrior1';
  } else if (warrior2TotalScore > warrior1TotalScore) {
    finalWinner = 'warrior2';
  } else {
    finalWinner = 'draw';
  }

  return {
    rounds,
    finalWinner,
    warrior1TotalScore,
    warrior2TotalScore,
  };
}
