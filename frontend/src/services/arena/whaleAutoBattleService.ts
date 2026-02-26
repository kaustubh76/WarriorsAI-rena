/**
 * Whale-Triggered Auto Battle Service
 *
 * When a whale trade is detected on a curated market, automatically creates
 * an AI battle where one warrior argues the whale's position and the other
 * argues the opposite.
 *
 * Rate limited: max 1 auto-battle per market per 24 hours.
 */

import { prisma } from '@/lib/prisma';
import { WhaleTrade } from '@/types/externalMarket';
import { MarketSource } from '@/types/predictionArena';
import { executeFullBattle } from '@/services/arena/debateService';
import type { RealMarketData, DebateContext } from '@/types/predictionArena';
import { fetchWarriorTraits } from '@/services/arena/traitService';
import { generateBattleStrategies } from '@/services/arena/aiDebateStrategy';

/** System address used as owner for auto-battle warriors */
const HOUSE_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Default warrior IDs for auto-battles (house warriors) */
const DEFAULT_YES_WARRIOR = 1;
const DEFAULT_NO_WARRIOR = 2;

interface AutoBattleResult {
  battleId: string;
  rounds: number;
  winner: string;
}

/**
 * Attempt to create an auto-battle triggered by a whale trade.
 * Returns null if the market isn't curated or an active battle already exists.
 */
export async function createWhaleTriggeredBattle(
  whaleTrade: WhaleTrade
): Promise<AutoBattleResult | null> {
  // 1. Find the ExternalMarket record
  const marketId = `${whaleTrade.source}_${whaleTrade.marketId}`;
  const market = await prisma.externalMarket.findUnique({
    where: { id: marketId },
  });

  if (!market?.curatedForArena) {
    return null; // Not a curated market — skip
  }

  // 2. Check no active whale-triggered battle already exists for this market (24h window)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.predictionBattle.findFirst({
    where: {
      externalMarketId: market.id,
      whaleTriggered: true,
      status: { in: ['pending', 'active'] },
      createdAt: { gt: oneDayAgo },
    },
  });

  if (existing) {
    return null; // Already have an active whale battle for this market
  }

  // 3. Select warriors — try to find top-rated warriors, fall back to defaults
  const { yesWarrior, noWarrior, yesTraits, noTraits } = await selectAutoWarriors(
    whaleTrade.outcome === 'yes'
  );

  // 4. Create the battle
  const battle = await prisma.predictionBattle.create({
    data: {
      externalMarketId: market.id,
      source: market.source,
      question: market.question,
      warrior1Id: yesWarrior,
      warrior1Owner: HOUSE_ADDRESS,
      warrior2Id: noWarrior,
      warrior2Owner: HOUSE_ADDRESS,
      stakes: '0', // Auto-battles have no stakes (engagement/demo)
      status: 'active',
      currentRound: 1,
      whaleTriggered: true,
      triggerWhaleTradeId: whaleTrade.id,
    },
  });

  // 5. Build market data for context-enriched debate
  const marketData: RealMarketData = {
    yesPrice: market.yesPrice / 100,
    noPrice: market.noPrice / 100,
    volume: market.volume,
    liquidity: market.liquidity,
    endTime: market.endTime.toISOString(),
    category: market.category ?? undefined,
    source: market.source as MarketSource,
  };

  // 6. Optional: pre-generate AI debate strategies via 0G (non-blocking, 5s timeout)
  let strategies: { yesStrategy?: DebateContext['strategy']; noStrategy?: DebateContext['strategy'] } | undefined;
  try {
    const generated = await generateBattleStrategies(
      market.question,
      market.category ?? undefined,
      marketData.yesPrice,
      marketData.noPrice,
    );
    if (generated.yesStrategy || generated.noStrategy) {
      strategies = {
        yesStrategy: generated.yesStrategy ?? undefined,
        noStrategy: generated.noStrategy ?? undefined,
      };
    }
  } catch {
    // Non-fatal: proceed without AI strategy
  }

  // 7. Execute full 5-round battle with real market intelligence
  const result = executeFullBattle(
    yesTraits,
    noTraits,
    market.question,
    market.source as MarketSource,
    marketData,
    strategies,
  );

  // 8. Save rounds to DB
  for (const [i, round] of result.rounds.entries()) {
    await prisma.predictionRound.create({
      data: {
        battleId: battle.id,
        roundNumber: i + 1,
        w1Argument: round.warrior1.argument,
        w1Evidence: JSON.stringify(round.warrior1.evidence),
        w1Move: round.warrior1.move,
        w1Confidence: round.warrior1.confidence,
        w1Score: round.warrior1Score,
        w2Argument: round.warrior2.argument,
        w2Evidence: JSON.stringify(round.warrior2.evidence),
        w2Move: round.warrior2.move,
        w2Confidence: round.warrior2.confidence,
        w2Score: round.warrior2Score,
        roundWinner: round.roundWinner,
        judgeReasoning: round.judgeReasoning,
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });
  }

  // 9. Complete the battle
  await prisma.predictionBattle.update({
    where: { id: battle.id },
    data: {
      status: 'completed',
      warrior1Score: result.warrior1TotalScore,
      warrior2Score: result.warrior2TotalScore,
      currentRound: 5,
      completedAt: new Date(),
    },
  });

  return {
    battleId: battle.id,
    rounds: result.rounds.length,
    winner: result.finalWinner,
  };
}

/**
 * Select two warriors for auto-battle.
 * If whale bought YES, the analytical warrior argues YES and forceful argues NO (and vice versa).
 */
async function selectAutoWarriors(whaleIsYes: boolean) {
  // Try to find top-rated warriors from the arena
  const topWarriors = await prisma.warriorArenaStats.findMany({
    orderBy: { arenaRating: 'desc' },
    take: 10,
  });

  let yesWarrior = DEFAULT_YES_WARRIOR;
  let noWarrior = DEFAULT_NO_WARRIOR;

  // If we have at least 2 warriors with stats, assign top-rated to whale's side
  if (topWarriors.length >= 2) {
    if (whaleIsYes) {
      yesWarrior = topWarriors[0].warriorId;
      noWarrior = topWarriors[1].warriorId;
    } else {
      yesWarrior = topWarriors[1].warriorId;
      noWarrior = topWarriors[0].warriorId;
    }
  }

  // Fetch real on-chain traits for both warriors (falls back to 5000 defaults on RPC failure)
  const [yesTraits, noTraits] = await Promise.all([
    fetchWarriorTraits(yesWarrior),
    fetchWarriorTraits(noWarrior),
  ]);

  return { yesWarrior, noWarrior, yesTraits, noTraits };
}
