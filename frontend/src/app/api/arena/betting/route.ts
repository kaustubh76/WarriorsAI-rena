/**
 * API Route: Arena Betting
 * Handles spectator betting on prediction battles
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// DATABASE MODELS (extend Prisma schema)
// ============================================

// Note: These models should be added to prisma/schema.prisma
// For now, we use in-memory storage as a fallback

interface BattleBet {
  id: string;
  battleId: string;
  bettorAddress: string;
  betOnWarrior1: boolean;
  amount: string;
  placedAt: Date;
  claimed: boolean;
  payout?: string;
}

interface BattleBettingPool {
  battleId: string;
  totalWarrior1Bets: string;
  totalWarrior2Bets: string;
  totalBettors: number;
  bettingOpen: boolean;
}

// In-memory storage fallback
const betsMap = new Map<string, BattleBet[]>();
const poolsMap = new Map<string, BattleBettingPool>();

/**
 * GET /api/arena/betting?battleId=xxx
 * Get betting pool info and user's bet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const battleId = searchParams.get('battleId');
    const userAddress = searchParams.get('userAddress');

    if (!battleId) {
      return NextResponse.json(
        { error: 'battleId is required' },
        { status: 400 }
      );
    }

    // Get battle info
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
    });

    if (!battle) {
      return NextResponse.json(
        { error: 'Battle not found' },
        { status: 404 }
      );
    }

    // Get or create pool
    let pool = poolsMap.get(battleId);
    if (!pool) {
      pool = {
        battleId,
        totalWarrior1Bets: '0',
        totalWarrior2Bets: '0',
        totalBettors: 0,
        bettingOpen: battle.status === 'active' && battle.currentRound <= 2,
      };
      poolsMap.set(battleId, pool);
    }

    // Calculate odds
    const totalW1 = BigInt(pool.totalWarrior1Bets);
    const totalW2 = BigInt(pool.totalWarrior2Bets);
    const totalPool = totalW1 + totalW2;

    let warrior1Odds = 5000;
    let warrior2Odds = 5000;
    if (totalPool > 0n) {
      warrior1Odds = Number((totalW1 * 10000n) / totalPool);
      warrior2Odds = 10000 - warrior1Odds;
    }

    // Get user's bet if address provided
    let userBet = null;
    if (userAddress) {
      const bets = betsMap.get(battleId) || [];
      userBet = bets.find(b => b.bettorAddress.toLowerCase() === userAddress.toLowerCase());
    }

    return NextResponse.json({
      pool: {
        ...pool,
        warrior1Odds,
        warrior2Odds,
        totalPool: totalPool.toString(),
      },
      userBet: userBet ? {
        betOnWarrior1: userBet.betOnWarrior1,
        amount: userBet.amount,
        placedAt: userBet.placedAt,
        claimed: userBet.claimed,
        payout: userBet.payout,
      } : null,
      bettingOpen: pool.bettingOpen,
    });
  } catch (error) {
    console.error('Error fetching betting info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch betting info' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/arena/betting
 * Place a bet on a battle
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { battleId, bettorAddress, betOnWarrior1, amount, txHash } = body;

    if (!battleId || !bettorAddress || betOnWarrior1 === undefined || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get battle
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
    });

    if (!battle) {
      return NextResponse.json(
        { error: 'Battle not found' },
        { status: 404 }
      );
    }

    // Check if betting is open
    if (battle.status !== 'active') {
      return NextResponse.json(
        { error: 'Battle is not active' },
        { status: 400 }
      );
    }

    if (battle.currentRound > 2) {
      return NextResponse.json(
        { error: 'Betting closed after round 2' },
        { status: 400 }
      );
    }

    // Get or create bets array
    let bets = betsMap.get(battleId) || [];

    // Check for existing bet
    const existingBetIndex = bets.findIndex(
      b => b.bettorAddress.toLowerCase() === bettorAddress.toLowerCase()
    );

    if (existingBetIndex >= 0) {
      // Update existing bet (add to it)
      const existingBet = bets[existingBetIndex];
      if (existingBet.betOnWarrior1 !== betOnWarrior1) {
        return NextResponse.json(
          { error: 'Cannot bet on both sides' },
          { status: 400 }
        );
      }
      existingBet.amount = (BigInt(existingBet.amount) + BigInt(amount)).toString();
    } else {
      // Create new bet
      bets.push({
        id: `bet_${Date.now()}_${bettorAddress.slice(0, 8)}`,
        battleId,
        bettorAddress,
        betOnWarrior1,
        amount,
        placedAt: new Date(),
        claimed: false,
      });
    }

    betsMap.set(battleId, bets);

    // Update pool
    let pool = poolsMap.get(battleId) || {
      battleId,
      totalWarrior1Bets: '0',
      totalWarrior2Bets: '0',
      totalBettors: 0,
      bettingOpen: true,
    };

    if (betOnWarrior1) {
      pool.totalWarrior1Bets = (BigInt(pool.totalWarrior1Bets) + BigInt(amount)).toString();
    } else {
      pool.totalWarrior2Bets = (BigInt(pool.totalWarrior2Bets) + BigInt(amount)).toString();
    }

    if (existingBetIndex < 0) {
      pool.totalBettors++;
    }

    poolsMap.set(battleId, pool);

    return NextResponse.json({
      success: true,
      message: `Bet placed on ${betOnWarrior1 ? 'YES (Warrior 1)' : 'NO (Warrior 2)'}`,
      bet: {
        battleId,
        betOnWarrior1,
        amount,
        totalInPool: (BigInt(pool.totalWarrior1Bets) + BigInt(pool.totalWarrior2Bets)).toString(),
      },
    });
  } catch (error) {
    console.error('Error placing bet:', error);
    return NextResponse.json(
      { error: 'Failed to place bet' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/arena/betting
 * Claim winnings from a completed battle
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { battleId, bettorAddress } = body;

    if (!battleId || !bettorAddress) {
      return NextResponse.json(
        { error: 'battleId and bettorAddress are required' },
        { status: 400 }
      );
    }

    // Get battle
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
    });

    if (!battle) {
      return NextResponse.json(
        { error: 'Battle not found' },
        { status: 404 }
      );
    }

    if (battle.status !== 'completed') {
      return NextResponse.json(
        { error: 'Battle not completed' },
        { status: 400 }
      );
    }

    // Get user's bet
    const bets = betsMap.get(battleId) || [];
    const betIndex = bets.findIndex(
      b => b.bettorAddress.toLowerCase() === bettorAddress.toLowerCase()
    );

    if (betIndex < 0) {
      return NextResponse.json(
        { error: 'No bet found' },
        { status: 404 }
      );
    }

    const bet = bets[betIndex];

    if (bet.claimed) {
      return NextResponse.json(
        { error: 'Already claimed' },
        { status: 400 }
      );
    }

    // Determine winner
    const warrior1Won = battle.warrior1Score > battle.warrior2Score;
    const warrior2Won = battle.warrior2Score > battle.warrior1Score;
    const isDraw = battle.warrior1Score === battle.warrior2Score;

    // Get pool
    const pool = poolsMap.get(battleId)!;
    const totalW1 = BigInt(pool.totalWarrior1Bets);
    const totalW2 = BigInt(pool.totalWarrior2Bets);
    const betAmount = BigInt(bet.amount);

    let payout = 0n;
    let won = false;

    if (isDraw) {
      // Refund on draw (minus 5% fee)
      const fee = (betAmount * 500n) / 10000n;
      payout = betAmount - fee;
    } else if ((warrior1Won && bet.betOnWarrior1) || (warrior2Won && !bet.betOnWarrior1)) {
      // Winner
      won = true;
      const winningPool = bet.betOnWarrior1 ? totalW1 : totalW2;
      const losingPool = bet.betOnWarrior1 ? totalW2 : totalW1;

      if (winningPool > 0n) {
        const share = (betAmount * 10n ** 18n) / winningPool;
        const winnings = (losingPool * share) / 10n ** 18n;
        const fee = (winnings * 500n) / 10000n;
        payout = betAmount + winnings - fee;
      } else {
        payout = betAmount; // Fallback
      }
    }
    // Losers get 0

    bet.claimed = true;
    bet.payout = payout.toString();
    bets[betIndex] = bet;
    betsMap.set(battleId, bets);

    return NextResponse.json({
      success: true,
      won,
      payout: payout.toString(),
      message: won
        ? `Congratulations! You won ${payout.toString()} wei`
        : isDraw
        ? `Draw - refunded ${payout.toString()} wei`
        : 'Sorry, you lost this bet',
    });
  } catch (error) {
    console.error('Error claiming bet:', error);
    return NextResponse.json(
      { error: 'Failed to claim bet' },
      { status: 500 }
    );
  }
}
