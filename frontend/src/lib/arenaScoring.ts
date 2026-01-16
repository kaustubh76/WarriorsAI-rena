/**
 * Arena Scoring Algorithm
 * Calculates debate scores based on warrior traits and move effectiveness
 */

import {
  WarriorTraits,
  DebateMove,
  TraitModifiers,
  ScoreBreakdown,
  MOVE_COUNTERS,
  MOVE_TRAIT_SCALING,
} from '../types/predictionArena';

// ============================================
// CONSTANTS
// ============================================

// Maximum trait value (from WarriorsNFT.sol - 2 decimal precision)
const MAX_TRAIT_VALUE = 10000;

// Bonus percentages (as decimals)
const TRAIT_BONUS_CAPS = {
  strength: 0.25,    // +25% max to argument quality
  wit: 0.20,         // +20% max to rebuttal effectiveness
  charisma: 0.15,    // +15% max to persuasiveness
  defence: 0.20,     // -20% max damage reduction
  luck: 0.10,        // +10% max to evidence quality
};

// Move effectiveness multipliers
const COUNTER_BONUS = 1.3;      // 30% bonus when countering
const COUNTERED_PENALTY = 0.7; // 30% penalty when countered

// Base score range
const MIN_BASE_SCORE = 40;
const MAX_BASE_SCORE = 100;

// ============================================
// TRAIT MODIFIERS
// ============================================

/**
 * Calculate trait-based modifiers for a warrior
 */
export function calculateTraitModifiers(traits: WarriorTraits): TraitModifiers {
  return {
    strengthBonus: (traits.strength / MAX_TRAIT_VALUE) * TRAIT_BONUS_CAPS.strength,
    witBonus: (traits.wit / MAX_TRAIT_VALUE) * TRAIT_BONUS_CAPS.wit,
    charismaBonus: (traits.charisma / MAX_TRAIT_VALUE) * TRAIT_BONUS_CAPS.charisma,
    defenceBonus: (traits.defence / MAX_TRAIT_VALUE) * TRAIT_BONUS_CAPS.defence,
    luckBonus: (traits.luck / MAX_TRAIT_VALUE) * TRAIT_BONUS_CAPS.luck,
  };
}

/**
 * Get the trait bonus for a specific move
 */
export function getMoveTraitBonus(move: DebateMove, traits: WarriorTraits): number {
  const scalingTraits = MOVE_TRAIT_SCALING[move];

  if (scalingTraits.length === 0) return 0;

  // Average the relevant traits
  const traitSum = scalingTraits.reduce((sum, trait) => sum + traits[trait], 0);
  const avgTrait = traitSum / scalingTraits.length;

  // Convert to bonus (max ~20%)
  return (avgTrait / MAX_TRAIT_VALUE) * 0.20;
}

// ============================================
// MOVE EFFECTIVENESS
// ============================================

/**
 * Calculate move multiplier based on counter relationships
 */
export function calculateMoveMultiplier(
  myMove: DebateMove,
  opponentMove: DebateMove
): number {
  const myMoveData = MOVE_COUNTERS[myMove];

  // Check if I counter opponent
  if (myMoveData.counters === opponentMove) {
    return COUNTER_BONUS;
  }

  // Check if opponent counters me
  if (myMoveData.counteredBy === opponentMove) {
    return COUNTERED_PENALTY;
  }

  // Neutral matchup
  return 1.0;
}

/**
 * Check if move A counters move B
 */
export function doesCounter(moveA: DebateMove, moveB: DebateMove): boolean {
  return MOVE_COUNTERS[moveA].counters === moveB;
}

// ============================================
// SCORE CALCULATION
// ============================================

/**
 * Calculate the final round score for a warrior
 *
 * @param baseScore - AI-judged argument quality (0-100)
 * @param traits - Warrior's traits
 * @param myMove - Warrior's chosen move
 * @param opponentMove - Opponent's chosen move
 * @param opponentTraits - Opponent's traits (for defence calculation)
 */
export function calculateRoundScore(
  baseScore: number,
  traits: WarriorTraits,
  myMove: DebateMove,
  opponentMove: DebateMove,
  opponentTraits?: WarriorTraits
): ScoreBreakdown {
  // 1. Apply trait bonus for the move
  const traitBonus = getMoveTraitBonus(myMove, traits);
  let score = baseScore * (1 + traitBonus);

  // 2. Apply move effectiveness multiplier
  const moveMultiplier = calculateMoveMultiplier(myMove, opponentMove);
  score *= moveMultiplier;

  // 3. Apply opponent's defence reduction (if they have high defence)
  if (opponentTraits) {
    const opponentDefence = opponentTraits.defence / MAX_TRAIT_VALUE;
    const damageReduction = opponentDefence * TRAIT_BONUS_CAPS.defence;
    score *= (1 - damageReduction);
  }

  // 4. Calculate counter bonus separately for breakdown
  const counterBonus = moveMultiplier > 1 ? (moveMultiplier - 1) * baseScore : 0;

  // Ensure score is within bounds
  const finalScore = Math.round(Math.min(Math.max(score, 0), 1000));

  return {
    baseScore,
    traitBonus: Math.round(baseScore * traitBonus),
    moveMultiplier,
    counterBonus: Math.round(counterBonus),
    finalScore,
  };
}

/**
 * Generate a base score influenced by luck
 * Used when AI generates arguments
 */
export function generateBaseScore(luck: number): number {
  // Luck affects the range of possible scores
  const luckFactor = luck / MAX_TRAIT_VALUE;

  // Higher luck = higher minimum and better average
  const minScore = MIN_BASE_SCORE + (luckFactor * 20); // 40-60 range
  const maxScore = MAX_BASE_SCORE;

  // Random score within the luck-adjusted range
  const randomFactor = Math.random();
  const score = minScore + (randomFactor * (maxScore - minScore));

  return Math.round(score);
}

// ============================================
// MOVE SELECTION
// ============================================

/**
 * Select optimal move based on warrior traits and strategy
 */
export function selectOptimalMove(
  traits: WarriorTraits,
  roundNumber: number,
  opponentLastMove?: DebateMove,
  previousMoves: DebateMove[] = []
): DebateMove {
  // Calculate weights for each move based on traits
  const weights: Record<DebateMove, number> = {
    [DebateMove.STRIKE]: traits.strength / MAX_TRAIT_VALUE,
    [DebateMove.TAUNT]: (traits.charisma + traits.wit) / (2 * MAX_TRAIT_VALUE),
    [DebateMove.DODGE]: traits.defence / MAX_TRAIT_VALUE,
    [DebateMove.SPECIAL]: (traits.strength + traits.charisma + traits.wit) / (3 * MAX_TRAIT_VALUE),
    [DebateMove.RECOVER]: (traits.defence + traits.charisma) / (2 * MAX_TRAIT_VALUE),
  };

  // Boost counter moves if we know opponent's last move
  if (opponentLastMove) {
    // Find which move counters the opponent's likely next move
    // Assume opponent might repeat or follow a pattern
    Object.entries(MOVE_COUNTERS).forEach(([move, data]) => {
      if (data.counters === opponentLastMove) {
        weights[move as DebateMove] *= 1.5; // 50% boost to countering moves
      }
    });
  }

  // Round-based strategy adjustments
  if (roundNumber === 1) {
    // First round: favor strong openers
    weights[DebateMove.STRIKE] *= 1.3;
    weights[DebateMove.SPECIAL] *= 1.2;
  } else if (roundNumber === 5) {
    // Final round: high risk/reward
    weights[DebateMove.SPECIAL] *= 1.5;
  } else if (roundNumber >= 3) {
    // Mid-game: consider recovery if we've been aggressive
    const aggressiveMoves = previousMoves.filter(m =>
      m === DebateMove.STRIKE || m === DebateMove.SPECIAL
    ).length;
    if (aggressiveMoves >= 2) {
      weights[DebateMove.RECOVER] *= 1.4;
      weights[DebateMove.DODGE] *= 1.3;
    }
  }

  // Avoid repeating the same move too often
  const moveCounts: Record<DebateMove, number> = {
    [DebateMove.STRIKE]: 0,
    [DebateMove.TAUNT]: 0,
    [DebateMove.DODGE]: 0,
    [DebateMove.SPECIAL]: 0,
    [DebateMove.RECOVER]: 0,
  };
  previousMoves.forEach(m => moveCounts[m]++);

  Object.entries(moveCounts).forEach(([move, count]) => {
    if (count >= 2) {
      weights[move as DebateMove] *= 0.5; // Penalize overused moves
    }
  });

  // Weighted random selection
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (const [move, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) {
      return move as DebateMove;
    }
  }

  // Fallback
  return DebateMove.STRIKE;
}

// ============================================
// ELO RATING
// ============================================

const ELO_K_FACTOR = 32;

/**
 * Calculate new Elo ratings after a battle
 */
export function calculateEloChange(
  winnerRating: number,
  loserRating: number
): { winnerNewRating: number; loserNewRating: number } {
  // Expected scores
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  // New ratings
  const winnerNewRating = Math.round(winnerRating + ELO_K_FACTOR * (1 - expectedWinner));
  const loserNewRating = Math.round(loserRating + ELO_K_FACTOR * (0 - expectedLoser));

  return {
    winnerNewRating: Math.max(100, winnerNewRating), // Minimum rating of 100
    loserNewRating: Math.max(100, loserNewRating),
  };
}

/**
 * Calculate Elo change for a draw
 */
export function calculateEloChangeDraw(
  rating1: number,
  rating2: number
): { newRating1: number; newRating2: number } {
  const expected1 = 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
  const expected2 = 1 - expected1;

  return {
    newRating1: Math.round(rating1 + ELO_K_FACTOR * (0.5 - expected1)),
    newRating2: Math.round(rating2 + ELO_K_FACTOR * (0.5 - expected2)),
  };
}

// ============================================
// CONFIDENCE CALCULATION
// ============================================

/**
 * Calculate confidence level based on traits and round context
 */
export function calculateConfidence(
  traits: WarriorTraits,
  move: DebateMove,
  roundNumber: number,
  isWinning: boolean
): number {
  // Base confidence from conviction-like traits
  let confidence = 50;

  // Charisma adds to base confidence
  confidence += (traits.charisma / MAX_TRAIT_VALUE) * 20;

  // Strength adds confidence for aggressive moves
  if (move === DebateMove.STRIKE || move === DebateMove.SPECIAL) {
    confidence += (traits.strength / MAX_TRAIT_VALUE) * 15;
  }

  // Defence adds confidence for defensive moves
  if (move === DebateMove.DODGE || move === DebateMove.RECOVER) {
    confidence += (traits.defence / MAX_TRAIT_VALUE) * 10;
  }

  // Luck adds variance
  const luckVariance = (traits.luck / MAX_TRAIT_VALUE - 0.5) * 10;
  confidence += luckVariance;

  // Winning position increases confidence
  if (isWinning) {
    confidence += 10;
  }

  // Final round confidence boost/stress
  if (roundNumber === 5) {
    confidence += isWinning ? 5 : -5;
  }

  // Clamp to 0-100
  return Math.round(Math.min(Math.max(confidence, 10), 95));
}
