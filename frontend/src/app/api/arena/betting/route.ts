/**
 * API Route: Arena Betting
 * Handles spectator betting on prediction battles
 * Uses persistent database storage for bets and pools
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleAPIError, ErrorResponses } from '@/lib/api/errorHandler';
import { validateAddress, validateBigIntString, validateBoolean } from '@/lib/api/validation';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';

/**
 * GET /api/arena/betting?battleId=xxx
 * Get betting pool info and user's bet
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const battleId = searchParams.get('battleId');
    const userAddress = searchParams.get('userAddress');

    if (!battleId || typeof battleId !== 'string') {
      throw ErrorResponses.badRequest('battleId is required');
    }

    // Validate userAddress if provided
    if (userAddress) {
      validateAddress(userAddress, 'userAddress');
    }

    // Get battle info
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
    });

    if (!battle) {
      throw ErrorResponses.notFound('Battle');
    }

    // Get or create pool from database
    let pool = await prisma.battleBettingPool.findUnique({
      where: { battleId },
    });

    if (!pool) {
      // Create pool for this battle
      pool = await prisma.battleBettingPool.create({
        data: {
          battleId,
          totalWarrior1Bets: '0',
          totalWarrior2Bets: '0',
          totalBettors: 0,
          bettingOpen: battle.status === 'active' && battle.currentRound <= 2,
        },
      });
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
      const bet = await prisma.battleBet.findUnique({
        where: {
          battleId_bettorAddress: {
            battleId,
            bettorAddress: userAddress.toLowerCase(),
          },
        },
      });

      if (bet) {
        userBet = {
          betOnWarrior1: bet.betOnWarrior1,
          amount: bet.amount,
          placedAt: bet.placedAt,
          claimed: bet.claimed,
          payout: bet.payout,
        };
      }
    }

    return NextResponse.json({
      pool: {
        battleId: pool.battleId,
        totalWarrior1Bets: pool.totalWarrior1Bets,
        totalWarrior2Bets: pool.totalWarrior2Bets,
        totalBettors: pool.totalBettors,
        warrior1Odds,
        warrior2Odds,
        totalPool: totalPool.toString(),
        bettingOpen: pool.bettingOpen,
      },
      userBet,
      bettingOpen: pool.bettingOpen,
    });
  } catch (error) {
    return handleAPIError(error, 'API:Betting:GET');
  }
}

/**
 * POST /api/arena/betting
 * Place a bet on a battle
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'betting',
      ...RateLimitPresets.betting,
    });

    const body = await request.json();
    const { battleId, bettorAddress, betOnWarrior1, amount, txHash } = body;

    // Validate required fields
    if (!battleId || typeof battleId !== 'string') {
      throw ErrorResponses.badRequest('battleId is required');
    }
    validateAddress(bettorAddress, 'bettorAddress');
    validateBoolean(betOnWarrior1, 'betOnWarrior1');
    validateBigIntString(amount, 'amount');

    // Get battle
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
    });

    if (!battle) {
      throw ErrorResponses.notFound('Battle');
    }

    // Check if betting is open
    if (battle.status !== 'active' && battle.status !== 'pending') {
      throw ErrorResponses.badRequest('Battle is not active');
    }

    if (battle.currentRound > 2) {
      throw ErrorResponses.badRequest('Betting closed after round 2');
    }

    const normalizedAddress = bettorAddress.toLowerCase();

    // Use transaction for atomic update
    const result = await prisma.$transaction(async (tx) => {
      // Check for existing bet
      const existingBet = await tx.battleBet.findUnique({
        where: {
          battleId_bettorAddress: {
            battleId,
            bettorAddress: normalizedAddress,
          },
        },
      });

      if (existingBet) {
        // Can only add to existing bet on same side
        if (existingBet.betOnWarrior1 !== betOnWarrior1) {
          throw ErrorResponses.badRequest('Cannot bet on both sides');
        }

        // Update existing bet amount
        const newAmount = (BigInt(existingBet.amount) + BigInt(amount)).toString();
        await tx.battleBet.update({
          where: { id: existingBet.id },
          data: { amount: newAmount },
        });
      } else {
        // Create new bet
        await tx.battleBet.create({
          data: {
            battleId,
            bettorAddress: normalizedAddress,
            betOnWarrior1,
            amount,
            placeTxHash: txHash,
          },
        });
      }

      // Get or create pool
      let pool = await tx.battleBettingPool.findUnique({
        where: { battleId },
      });

      if (!pool) {
        pool = await tx.battleBettingPool.create({
          data: {
            battleId,
            totalWarrior1Bets: '0',
            totalWarrior2Bets: '0',
            totalBettors: 0,
            bettingOpen: true,
          },
        });
      }

      // Update pool
      const newTotalW1 = betOnWarrior1
        ? (BigInt(pool.totalWarrior1Bets) + BigInt(amount)).toString()
        : pool.totalWarrior1Bets;
      const newTotalW2 = !betOnWarrior1
        ? (BigInt(pool.totalWarrior2Bets) + BigInt(amount)).toString()
        : pool.totalWarrior2Bets;
      const newBettorCount = existingBet ? pool.totalBettors : pool.totalBettors + 1;

      const updatedPool = await tx.battleBettingPool.update({
        where: { battleId },
        data: {
          totalWarrior1Bets: newTotalW1,
          totalWarrior2Bets: newTotalW2,
          totalBettors: newBettorCount,
        },
      });

      return { pool: updatedPool, isNewBet: !existingBet };
    });

    return NextResponse.json({
      success: true,
      message: `Bet placed on ${betOnWarrior1 ? 'Warrior 1 (YES)' : 'Warrior 2 (NO)'}`,
      bet: {
        battleId,
        betOnWarrior1,
        amount,
        totalInPool: (BigInt(result.pool.totalWarrior1Bets) + BigInt(result.pool.totalWarrior2Bets)).toString(),
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:Betting:POST');
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

    // Validate inputs
    if (!battleId || typeof battleId !== 'string') {
      throw ErrorResponses.badRequest('battleId is required');
    }
    validateAddress(bettorAddress, 'bettorAddress');

    const normalizedAddress = bettorAddress.toLowerCase();

    // Get battle
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
    });

    if (!battle) {
      throw ErrorResponses.notFound('Battle');
    }

    if (battle.status !== 'completed') {
      throw ErrorResponses.badRequest('Battle not completed');
    }

    // Get user's bet
    const bet = await prisma.battleBet.findUnique({
      where: {
        battleId_bettorAddress: {
          battleId,
          bettorAddress: normalizedAddress,
        },
      },
    });

    if (!bet) {
      throw ErrorResponses.notFound('No bet found for this address');
    }

    if (bet.claimed) {
      throw ErrorResponses.badRequest('Already claimed');
    }

    // Determine winner
    const warrior1Won = battle.warrior1Score > battle.warrior2Score;
    const warrior2Won = battle.warrior2Score > battle.warrior1Score;
    const isDraw = battle.warrior1Score === battle.warrior2Score;

    // Get pool
    const pool = await prisma.battleBettingPool.findUnique({
      where: { battleId },
    });

    if (!pool) {
      throw ErrorResponses.internal('Pool not found');
    }

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
        const fee = (winnings * 500n) / 10000n; // 5% fee on winnings
        payout = betAmount + winnings - fee;
      } else {
        payout = betAmount; // Fallback
      }
    }
    // Losers get 0

    // Update bet as claimed
    await prisma.battleBet.update({
      where: { id: bet.id },
      data: {
        claimed: true,
        payout: payout.toString(),
        claimedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      won,
      payout: payout.toString(),
      message: won
        ? `Congratulations! You won ${payout.toString()} wei`
        : isDraw
        ? `Draw - refunded ${payout.toString()} wei (minus fee)`
        : 'Sorry, you lost this bet',
    });
  } catch (error) {
    return handleAPIError(error, 'API:Betting:PATCH');
  }
}

/**
 * DELETE /api/arena/betting
 * Close betting for a battle (admin action)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const battleId = searchParams.get('battleId');

    if (!battleId || typeof battleId !== 'string') {
      throw ErrorResponses.badRequest('battleId is required');
    }

    await prisma.battleBettingPool.update({
      where: { battleId },
      data: { bettingOpen: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Betting closed for battle',
    });
  } catch (error) {
    return handleAPIError(error, 'API:Betting:DELETE');
  }
}
