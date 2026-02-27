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
  RealMarketData,
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
 * Generate evidence for a warrior's argument.
 * When real market data is available, produces evidence grounded in actual prices and volume.
 * Falls back to generic templates when no market data is present.
 */
function generateEvidence(
  context: DebateContext,
  traits: WarriorTraits,
  count: number = 2
): DebateEvidence[] {
  if (context.marketData) {
    return generateMarketEvidence(context, traits, count);
  }
  return generateFallbackEvidence(context, traits.luck, count);
}

/**
 * Generate evidence using real market data, styled by warrior traits.
 * High WIT → analytical price data. High CHA → persuasive sentiment framing.
 * High STR → forceful conviction from volume. High DEF → cautious risk framing.
 */
function generateMarketEvidence(
  context: DebateContext,
  traits: WarriorTraits,
  count: number
): DebateEvidence[] {
  const md = context.marketData!;
  const side = context.side;
  const price = side === 'yes' ? md.yesPrice : md.noPrice;
  const opposingPrice = side === 'yes' ? md.noPrice : md.yesPrice;
  const sourceName = md.source === 'polymarket' ? 'Polymarket' : 'Kalshi';
  const qualityBonus = (traits.luck / 10000) * 20;

  // Calculate days remaining
  const msRemaining = new Date(md.endTime).getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.round(msRemaining / (1000 * 60 * 60 * 24)));

  // Determine dominant trait for style selection
  const traitScores = {
    wit: traits.wit,
    charisma: traits.charisma,
    strength: traits.strength,
    defence: traits.defence,
  };
  const dominantTrait = (Object.entries(traitScores) as [string, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const evidence: DebateEvidence[] = [];

  // Evidence piece 1: Price-based (always include real price data)
  const priceEvidence = buildPriceEvidence(
    dominantTrait, side, price, opposingPrice, sourceName, md, qualityBonus
  );
  evidence.push(priceEvidence);

  // Evidence piece 2: Volume/spread/time-based (varies by what data is available)
  if (count >= 2) {
    const secondaryEvidence = buildSecondaryEvidence(
      dominantTrait, side, md, daysRemaining, qualityBonus
    );
    evidence.push(secondaryEvidence);
  }

  // Additional evidence pieces if requested
  for (let i = 2; i < count; i++) {
    evidence.push(buildContextEvidence(side, md, context.marketQuestion, qualityBonus));
  }

  return evidence.sort((a, b) => b.relevance - a.relevance);
}

/** Build price-focused evidence styled by dominant trait */
function buildPriceEvidence(
  dominantTrait: string,
  side: 'yes' | 'no',
  price: number,
  opposingPrice: number,
  sourceName: string,
  md: RealMarketData,
  qualityBonus: number,
): DebateEvidence {
  const priceFormatted = price.toFixed(1);
  const oppFormatted = opposingPrice.toFixed(1);

  let snippet: string;
  switch (dominantTrait) {
    case 'wit':
      snippet = side === 'yes'
        ? `The ${priceFormatted}% implied probability on ${sourceName} reflects the weight of evidence. With ${oppFormatted}% pricing in the downside, the market is allocating a ${priceFormatted}-to-${oppFormatted} odds ratio in favor of YES.`
        : `At ${priceFormatted}% NO probability, the market is signaling substantial doubt. The ${oppFormatted}% YES price means nearly ${Math.round(100 - parseFloat(oppFormatted))} cents on the dollar disagree with the YES thesis.`;
      break;
    case 'charisma':
      snippet = side === 'yes'
        ? `${sourceName} traders have spoken — ${priceFormatted}% are backing YES. That's not a coin flip, that's conviction from thousands of market participants putting real money on the line.`
        : `Only ${oppFormatted}% of ${sourceName} money is on YES — that means the majority of traders see this failing. The crowd wisdom is clear: NO at ${priceFormatted}%.`;
      break;
    case 'strength':
      snippet = side === 'yes'
        ? `${priceFormatted}% YES on ${sourceName}. The numbers don't lie and they don't negotiate. The market has priced this in and the direction is clear.`
        : `${priceFormatted}% NO on ${sourceName}. That's the hard reality — the market has weighed the evidence and it's not even close. YES is trading at a mere ${oppFormatted}%.`;
      break;
    default: // defence
      snippet = side === 'yes'
        ? `The current ${priceFormatted}% YES price on ${sourceName} accounts for known risks while still favoring this outcome. Even factoring in uncertainty, the probability-weighted case supports YES.`
        : `At ${priceFormatted}% NO, the market has already priced in the optimistic scenarios and still leans against. The ${oppFormatted}% YES price represents an upper bound that may not hold.`;
  }

  // Add cross-platform data if available
  if (md.crossPlatformPrice !== undefined && md.crossPlatformSource) {
    const crossName = md.crossPlatformSource === 'polymarket' ? 'Polymarket' : 'Kalshi';
    snippet += ` Cross-platform: ${crossName} prices this at ${md.crossPlatformPrice.toFixed(1)}% YES.`;
  }

  return {
    type: 'market',
    source: `${sourceName} Live Data`,
    title: `${sourceName} market pricing: ${priceFormatted}% ${side.toUpperCase()}`,
    snippet,
    relevance: Math.round(75 + qualityBonus + Math.random() * 10),
    timestamp: new Date().toISOString(),
  };
}

/** Build secondary evidence from volume, spread, or time data */
function buildSecondaryEvidence(
  dominantTrait: string,
  side: 'yes' | 'no',
  md: RealMarketData,
  daysRemaining: number,
  qualityBonus: number,
): DebateEvidence {
  // Prefer cross-platform spread data if available (arbitrage context)
  if (md.spread !== undefined && md.crossPlatformSource) {
    const spreadFormatted = md.spread.toFixed(1);
    const crossName = md.crossPlatformSource === 'polymarket' ? 'Polymarket' : 'Kalshi';
    const sourceName = md.source === 'polymarket' ? 'Polymarket' : 'Kalshi';

    return {
      type: 'data',
      source: 'Cross-Platform Analysis',
      title: `${spreadFormatted}% price spread between ${sourceName} and ${crossName}`,
      snippet: side === 'yes'
        ? `A ${spreadFormatted}% spread between ${sourceName} (${md.yesPrice.toFixed(1)}% YES) and ${crossName} (${md.crossPlatformPrice!.toFixed(1)}% YES) reveals the market hasn't converged — suggesting underpricing of the YES outcome on at least one platform.`
        : `The ${spreadFormatted}% cross-platform spread shows disagreement between ${sourceName} and ${crossName}. This divergence indicates the YES case is far from settled, and the NO position exploits this uncertainty.`,
      relevance: Math.round(70 + qualityBonus + Math.random() * 15),
      timestamp: new Date().toISOString(),
    };
  }

  // Volume-based evidence
  const volume = md.volume;
  const hasSignificantVolume = parseFloat(volume) > 100000;

  if (hasSignificantVolume) {
    return {
      type: 'data',
      source: `${md.source === 'polymarket' ? 'Polymarket' : 'Kalshi'} Trading Data`,
      title: `$${formatVolume(volume)} in trading volume`,
      snippet: dominantTrait === 'strength'
        ? `$${formatVolume(volume)} in volume — that's serious capital backing this market. ${side === 'yes' ? 'Smart money' : 'Sophisticated traders'} don't deploy this kind of capital on a whim.`
        : `With $${formatVolume(volume)} traded, this market has deep liquidity and genuine price discovery. The ${side === 'yes' ? 'YES' : 'NO'} price reflects real conviction from informed participants.`,
      relevance: Math.round(65 + qualityBonus + Math.random() * 15),
      timestamp: new Date().toISOString(),
    };
  }

  // Time-based evidence
  return {
    type: 'data',
    source: 'Market Timeline Analysis',
    title: `${daysRemaining} days until resolution`,
    snippet: daysRemaining > 30
      ? `With ${daysRemaining} days remaining, there's ample time for the ${side === 'yes' ? 'positive' : 'negative'} thesis to play out. Early positioning at current prices offers an edge.`
      : `Only ${daysRemaining} days remain. The market is in its final pricing phase — current prices at this stage are highly informative and strongly favor ${side.toUpperCase()}.`,
    relevance: Math.round(60 + qualityBonus + Math.random() * 15),
    timestamp: new Date().toISOString(),
  };
}

/** Build additional context evidence from category and question */
function buildContextEvidence(
  side: 'yes' | 'no',
  md: RealMarketData,
  question: string,
  qualityBonus: number,
): DebateEvidence {
  const keywords = question.split(' ').filter(w => w.length > 4).slice(0, 3).join(' ');
  const category = md.category || 'General';

  return {
    type: 'expert',
    source: `${category} Domain Analysis`,
    title: `${category} sector signals on ${keywords}`,
    snippet: side === 'yes'
      ? `Domain analysis in the ${category} sector supports the YES outcome. Current market pricing aligns with sector-specific indicators and expert assessments.`
      : `${category} sector analysis raises flags against the YES thesis. Historical patterns in this domain suggest the market may be overly optimistic.`,
    relevance: Math.round(55 + qualityBonus + Math.random() * 15),
    timestamp: new Date().toISOString(),
  };
}

/** Format volume for display (e.g., 1500000 → "1.5M") */
function formatVolume(volume: string): string {
  const num = parseFloat(volume);
  if (isNaN(num)) return volume;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toFixed(0);
}

/**
 * Fallback evidence generation (original behavior).
 * Used when no real market data is available.
 */
function generateFallbackEvidence(
  context: DebateContext,
  luck: number,
  count: number = 2
): DebateEvidence[] {
  const evidenceTypes: DebateEvidence['type'][] = ['news', 'data', 'expert', 'historical', 'market'];
  const qualityBonus = (luck / 10000) * 20;
  const evidence: DebateEvidence[] = [];

  for (let i = 0; i < count; i++) {
    const type = evidenceTypes[Math.floor(Math.random() * evidenceTypes.length)];
    const relevance = Math.round(60 + qualityBonus + Math.random() * 20);

    evidence.push({
      type,
      source: getFallbackSource(type, context.marketSource),
      title: getFallbackTitle(type, context.marketQuestion, context.side),
      snippet: getFallbackSnippet(context.side),
      relevance,
      timestamp: new Date().toISOString(),
      simulated: true,
    });
  }

  return evidence.sort((a, b) => b.relevance - a.relevance);
}

function getFallbackSource(type: DebateEvidence['type'], marketSource: MarketSource): string {
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

function getFallbackTitle(type: DebateEvidence['type'], question: string, side: 'yes' | 'no'): string {
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

function getFallbackSnippet(side: 'yes' | 'no'): string {
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
// CONTEXT-AWARE ARGUMENT GENERATION
// ============================================

/** Extract meaningful topic keywords from a market question */
function extractTopicKeywords(question: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'will', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'should',
    'would', 'may', 'might', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
    'by', 'from', 'as', 'into', 'through', 'before', 'after', 'this', 'that',
    'what', 'which', 'who', 'how', 'and', 'but', 'or', 'if', 'not', 'no',
    'yes', 'than', 'more', 'most', 'any', 'all', 'each', 'every', 'its',
    'there', 'here', 'when', 'where', 'why', 'about', 'above', 'below',
    'between', 'under', 'over', 'very', 'just', 'also', 'only', 'then',
  ]);

  return question
    .replace(/[?!.,;:'"()[\]{}]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 6);
}

/** Get domain-specific framing based on market category */
function getCategoryFraming(category: string | undefined): { domain: string; experts: string; metric: string } {
  switch (category?.toLowerCase()) {
    case 'politics':
      return { domain: 'political landscape', experts: 'Political analysts and pollsters', metric: 'polling data and electoral trends' };
    case 'crypto':
    case 'cryptocurrency':
      return { domain: 'crypto markets', experts: 'On-chain analysts and crypto researchers', metric: 'on-chain metrics and trading volumes' };
    case 'finance':
    case 'economics':
      return { domain: 'financial markets', experts: 'Economists and market strategists', metric: 'economic indicators and market signals' };
    case 'science':
    case 'technology':
      return { domain: 'technology sector', experts: 'Industry analysts and researchers', metric: 'adoption metrics and development milestones' };
    case 'climate':
    case 'environment':
      return { domain: 'climate science', experts: 'Climate scientists and policy researchers', metric: 'emissions data and climate models' };
    default:
      return { domain: 'current events', experts: 'Domain experts and analysts', metric: 'available data and trend analysis' };
  }
}

/** Get rhetorical style label from dominant trait */
function getStyleLabel(dominantTrait: string): string {
  switch (dominantTrait) {
    case 'wit': return 'analytical';
    case 'charisma': return 'persuasive';
    case 'strength': return 'forceful';
    case 'defence': return 'measured';
    default: return 'balanced';
  }
}

/**
 * Generate a context-aware argument using real market data.
 * Constructs arguments from the specific market question, category, price data,
 * and the warrior's dominant trait rather than using generic templates.
 */
function generateMarketContextArgument(
  side: 'yes' | 'no',
  move: DebateMove,
  traits: WarriorTraits,
  context: DebateContext,
  evidenceSummary: string,
): string {
  const md = context.marketData!;
  const strategy = context.strategy;
  const keywords = extractTopicKeywords(context.marketQuestion);
  const topic = keywords.slice(0, 3).join(' ');
  const framing = getCategoryFraming(md.category);
  const price = side === 'yes' ? md.yesPrice : md.noPrice;
  const sourceName = md.source === 'polymarket' ? 'Polymarket' : 'Kalshi';

  // Use AI strategy style if available, otherwise derive from dominant trait
  const traitEntries = [
    ['wit', traits.wit], ['charisma', traits.charisma],
    ['strength', traits.strength], ['defence', traits.defence],
  ] as [string, number][];
  const dominantTrait = strategy?.rhetoricalStyle
    ? ({ analytical: 'wit', aggressive: 'strength', persuasive: 'charisma', defensive: 'defence' }[strategy.rhetoricalStyle] || traitEntries.sort((a, b) => b[1] - a[1])[0][0])
    : traitEntries.sort((a, b) => b[1] - a[1])[0][0];
  const style = getStyleLabel(dominantTrait);

  // Enrich evidence with AI strategy's best evidence if available
  const fullEvidence = strategy?.bestEvidence
    ? `${evidenceSummary} Moreover, ${strategy.bestEvidence}`
    : evidenceSummary;

  // Build move-specific, market-context-aware argument
  switch (move) {
    case DebateMove.STRIKE: {
      // Use AI key thesis if available for a stronger opening
      if (strategy?.keyThesis) {
        return `${strategy.keyThesis} ${fullEvidence} At ${price.toFixed(1)}% on ${sourceName}, the ${style} case for ${side.toUpperCase()} is backed by both data and conviction.`;
      }
      if (dominantTrait === 'wit') {
        return `The ${framing.metric} on ${topic} paint a clear picture. ${fullEvidence} At ${price.toFixed(1)}% on ${sourceName}, the ${style} case for ${side.toUpperCase()} is data-driven and definitive.`;
      }
      if (dominantTrait === 'charisma') {
        return `In the ${framing.domain}, the momentum on ${topic} is undeniable. ${fullEvidence} ${sourceName} traders see it — ${price.toFixed(1)}% conviction speaks louder than speculation.`;
      }
      if (dominantTrait === 'strength') {
        return `The facts on ${topic} are inescapable. ${fullEvidence} ${price.toFixed(1)}% ${side.toUpperCase()} on ${sourceName} — the market has spoken and there's no room for doubt.`;
      }
      return `A careful analysis of ${topic} within ${framing.domain} supports ${side.toUpperCase()}. ${fullEvidence} The ${price.toFixed(1)}% probability on ${sourceName} reflects a well-reasoned assessment of the risks.`;
    }

    case DebateMove.TAUNT: {
      const oppSide = side === 'yes' ? 'NO' : 'YES';
      if (strategy?.keyWeakness) {
        return `The ${oppSide} position has a critical flaw: ${strategy.keyWeakness} ${fullEvidence} With ${sourceName} pricing ${side.toUpperCase()} at ${price.toFixed(1)}%, the ${oppSide} case is crumbling.`;
      }
      if (dominantTrait === 'charisma') {
        return `My opponent's ${oppSide} position on ${topic} ignores what ${framing.experts.toLowerCase()} have been saying. ${fullEvidence} The smart money at ${price.toFixed(1)}% on ${sourceName} sees through the ${oppSide} wishful thinking.`;
      }
      return `The ${oppSide} argument on ${topic} crumbles under scrutiny. ${fullEvidence} With ${sourceName} pricing ${side.toUpperCase()} at ${price.toFixed(1)}%, the ${oppSide} position is increasingly untenable.`;
    }

    case DebateMove.DODGE: {
      if (strategy?.keyWeakness) {
        return `I understand the concern about ${strategy.keyWeakness}, but let's look at the full picture. ${fullEvidence} The broader ${framing.domain} context reinforces the ${side.toUpperCase()} thesis at ${price.toFixed(1)}%.`;
      }
      return `While that's a fair point about ${topic}, let's refocus on what the ${framing.metric} actually show. ${fullEvidence} The broader ${framing.domain} context reinforces the ${side.toUpperCase()} thesis at ${price.toFixed(1)}%.`;
    }

    case DebateMove.SPECIAL: {
      if (md.spread !== undefined && md.crossPlatformSource) {
        const crossName = md.crossPlatformSource === 'polymarket' ? 'Polymarket' : 'Kalshi';
        return `Here's an overlooked signal on ${topic}: the ${md.spread.toFixed(1)}% price divergence between ${sourceName} and ${crossName} reveals the market hasn't fully priced in the ${side.toUpperCase()} case. ${fullEvidence} ${framing.experts} would recognize this gap as a leading indicator.`;
      }
      if (strategy?.keyThesis) {
        return `Here's what most analyses miss: ${strategy.keyThesis} ${fullEvidence} ${framing.experts} point to an underappreciated dynamic that strengthens the ${side.toUpperCase()} position beyond the current ${price.toFixed(1)}% pricing.`;
      }
      return `Here's what most analyses of ${topic} miss: ${fullEvidence} ${framing.experts} point to an underappreciated dynamic in the ${framing.domain} that strengthens the ${side.toUpperCase()} position beyond the current ${price.toFixed(1)}% pricing.`;
    }

    case DebateMove.RECOVER: {
      if (strategy?.keyWeakness) {
        return `That's a valid point about ${strategy.keyWeakness}. However, the core ${side.toUpperCase()} thesis remains intact: ${fullEvidence} At ${price.toFixed(1)}% on ${sourceName}, the ${framing.domain} fundamentals still favor this outcome.`;
      }
      return `That's a valid criticism, and I acknowledge the uncertainty around ${topic}. However, the core ${side.toUpperCase()} thesis remains intact: ${fullEvidence} At ${price.toFixed(1)}% on ${sourceName}, the ${framing.domain} fundamentals still favor this outcome.`;
    }
  }
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

  // 2. Generate evidence (real market data when available, fallback otherwise)
  const evidence = generateEvidence(context, traits, 2);

  // 3. Build evidence summary
  const evidenceSummary = evidence
    .map(e => e.snippet)
    .join(' Furthermore, ');

  // 4. Generate argument — context-aware when market data available, template fallback otherwise
  let argument: string;
  if (context.marketData) {
    argument = generateMarketContextArgument(context.side, move, traits, context, evidenceSummary);
  } else {
    const templates = ARGUMENT_TEMPLATES[context.side][move];
    const template = templates[Math.floor(Math.random() * templates.length)];
    argument = template.replace('{evidence}', evidenceSummary);
  }

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
    `Round ${context.roundNumber}/5.` +
    (context.strategy ? ` AI strategy: ${context.strategy.rhetoricalStyle}.` : '');

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
    marketData?: RealMarketData;
    /** Optional AI-generated strategy for YES warrior */
    yesStrategy?: DebateContext['strategy'];
    /** Optional AI-generated strategy for NO warrior */
    noStrategy?: DebateContext['strategy'];
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
      marketData: context.marketData,
      strategy: context.yesStrategy,
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
      marketData: context.marketData,
      strategy: context.noStrategy,
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

  // Generate judge reasoning (with market context if available)
  const judgeReasoning = generateJudgeReasoning(
    warrior1Arg,
    warrior2Arg,
    w1ScoreBreakdown,
    w2ScoreBreakdown,
    roundWinner,
    context.marketData
  );

  return {
    roundNumber: context.roundNumber,
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
  winner: 'warrior1' | 'warrior2' | 'draw',
  marketData?: RealMarketData
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

  // Market context commentary
  if (marketData) {
    const yesPrice = marketData.yesPrice;
    if (yesPrice >= 70) {
      parts.push(`Market sentiment strongly favors YES at ${yesPrice}%, giving YES's arguments natural weight.`);
    } else if (yesPrice <= 30) {
      parts.push(`Market sentiment leans heavily NO at ${100 - yesPrice}%, putting pressure on YES to justify the contrarian stance.`);
    } else if (marketData.spread && marketData.spread > 10) {
      parts.push(`The ${marketData.spread.toFixed(0)}% cross-platform spread adds significance to this exchange.`);
    }
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
  marketSource: MarketSource,
  marketData?: RealMarketData,
  strategies?: { yesStrategy?: DebateContext['strategy']; noStrategy?: DebateContext['strategy'] },
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
        marketData,
        yesStrategy: strategies?.yesStrategy,
        noStrategy: strategies?.noStrategy,
      }
    );

    rounds.push(result);

    // Convert to PredictionRound format for next iteration (include evidence & reasoning for context)
    previousRounds.push({
      id: `round-${roundNum}`,
      battleId: 'temp',
      roundNumber: roundNum,
      w1Argument: result.warrior1.argument,
      w1Evidence: JSON.stringify(result.warrior1.evidence),
      w1Move: result.warrior1.move,
      w1Confidence: result.warrior1.confidence,
      w1Score: result.warrior1Score,
      w2Argument: result.warrior2.argument,
      w2Evidence: JSON.stringify(result.warrior2.evidence),
      w2Move: result.warrior2.move,
      w2Confidence: result.warrior2.confidence,
      w2Score: result.warrior2Score,
      roundWinner: result.roundWinner,
      judgeReasoning: result.judgeReasoning,
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
