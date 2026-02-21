/**
 * Arbitrage Battle Settlement Service
 * Handles settlement of prediction battles linked to arbitrage trades
 *
 * PRODUCTION IMPLEMENTATION - Actually transfers funds
 */

import { prisma } from '@/lib/prisma';
import { PredictionBattle, ArbitrageTrade } from '@prisma/client';
import { escrowService } from '../escrow';

// ============================================
// TYPES
// ============================================

export interface SettlementResult {
  success: boolean;
  warrior1Payout: bigint;
  warrior2Payout: bigint;
  arbitrageProfit: bigint;
  debateBonus: bigint;
  error?: string;
}

export interface BattleWithTrade extends PredictionBattle {
  arbitrageTrade: ArbitrageTrade;
}

// ============================================
// ARBITRAGE BATTLE SETTLEMENT SERVICE
// ============================================

class ArbitrageBattleSettlementService {
  /**
   * Monitor arbitrage battle for resolution readiness
   */
  async monitorArbitrageBattleResolution(battleId: string): Promise<void> {
    try {
      const battle = await prisma.predictionBattle.findUnique({
        where: { id: battleId },
        include: { arbitrageTrade: true },
      });

      if (!battle || !battle.arbitrageTrade) {
        console.error('[ArbitrageBattleSettlement] Battle or trade not found:', battleId);
        return;
      }

      if (!battle.isArbitrageBattle) {
        console.error('[ArbitrageBattleSettlement] Not an arbitrage battle:', battleId);
        return;
      }

      // Check if battle is complete
      if (battle.status !== 'completed') {
        return; // Still in progress
      }

      // Check if both markets have resolved
      const bothMarketsResolved = await this.checkBothMarketsResolved(battle.arbitrageTrade);

      if (bothMarketsResolved) {
        await this.settleBattle(battle as BattleWithTrade);
      }
    } catch (error) {
      console.error('[ArbitrageBattleSettlement] Error monitoring battle:', error);
    }
  }

  /**
   * Check if both markets in the arbitrage trade have resolved
   */
  async checkBothMarketsResolved(trade: ArbitrageTrade): Promise<boolean> {
    try {
      const [market1, market2] = await Promise.all([
        prisma.externalMarket.findUnique({
          where: { id: trade.market1Id },
        }),
        prisma.externalMarket.findUnique({
          where: { id: trade.market2Id },
        }),
      ]);

      return (
        market1?.status === 'resolved' &&
        market2?.status === 'resolved' &&
        market1.outcome !== null &&
        market2.outcome !== null
      );
    } catch (error) {
      console.error('[ArbitrageBattleSettlement] Error checking market resolution:', error);
      return false;
    }
  }

  /**
   * Settle the arbitrage battle when both markets resolve
   */
  async settleBattle(battle: BattleWithTrade): Promise<SettlementResult> {
    try {
      const trade = battle.arbitrageTrade;

      // Idempotency guard: prevent double-settlement
      const freshTrade = await prisma.arbitrageTrade.findUnique({
        where: { id: trade.id },
      });
      if (freshTrade?.settled) {
        console.log(`[ArbitrageBattleSettlement] Trade ${freshTrade.id} already settled, skipping`);
        return {
          success: true,
          warrior1Payout: 0n,
          warrior2Payout: 0n,
          arbitrageProfit: 0n,
          debateBonus: 0n,
        };
      }

      // 1. Get market outcomes
      const [market1, market2] = await Promise.all([
        prisma.externalMarket.findUnique({
          where: { id: trade.market1Id },
        }),
        prisma.externalMarket.findUnique({
          where: { id: trade.market2Id },
        }),
      ]);

      if (!market1 || !market2 || !market1.outcome || !market2.outcome) {
        return {
          success: false,
          warrior1Payout: 0n,
          warrior2Payout: 0n,
          arbitrageProfit: 0n,
          debateBonus: 0n,
          error: 'Markets not resolved',
        };
      }

      // 2. Calculate external market payouts
      const warrior1Payout = this.calculatePayout(
        battle.warrior1Id,
        trade.market1Side,
        market1.outcome,
        trade.market1Shares || 0
      );

      const warrior2Payout = this.calculatePayout(
        battle.warrior2Id,
        trade.market2Side,
        market2.outcome,
        trade.market2Shares || 0
      );

      // 3. Calculate arbitrage profit (total payout - investment)
      const totalPayout = warrior1Payout + warrior2Payout;
      const arbitrageProfit = totalPayout - trade.investmentAmount;

      // 4. Determine debate winner from scores
      const debateWinner = battle.warrior1Score > battle.warrior2Score ? 1 : 2;

      // 5. Calculate debate bonus from spectator betting pool
      const debateBonus = await this.calculateDebateBonus(battle.id, debateWinner);

      // 6. Update trade status
      await prisma.arbitrageTrade.update({
        where: { id: trade.id },
        data: {
          market1Outcome: market1.outcome === 'yes',
          market2Outcome: market2.outcome === 'yes',
          actualProfit: arbitrageProfit,
          settled: true,
          settledAt: new Date(),
          status: 'settled',
        },
      });

      // 7. Update battle status
      await prisma.predictionBattle.update({
        where: { id: battle.id },
        data: {
          status: 'settled',
          completedAt: new Date(),
        },
      });

      // 8. Distribute payouts
      await this.distributePayouts(
        battle,
        warrior1Payout,
        warrior2Payout,
        arbitrageProfit,
        debateBonus,
        debateWinner
      );

      return {
        success: true,
        warrior1Payout,
        warrior2Payout,
        arbitrageProfit,
        debateBonus,
      };
    } catch (error) {
      console.error('[ArbitrageBattleSettlement] Error settling battle:', error);
      return {
        success: false,
        warrior1Payout: 0n,
        warrior2Payout: 0n,
        arbitrageProfit: 0n,
        debateBonus: 0n,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Calculate payout for a warrior based on market outcome
   */
  private calculatePayout(
    warriorId: number,
    betSide: boolean,
    outcome: string,
    shares: number
  ): bigint {
    const outcomeMatches = (outcome === 'yes' && betSide) || (outcome === 'no' && !betSide);

    if (outcomeMatches) {
      // Winner gets full payout (shares * $1.00 per share)
      return BigInt(Math.floor(shares * 100)) * BigInt(10 ** 16); // Convert to wei
    }

    return 0n; // Loser gets nothing
  }

  /**
   * Calculate debate bonus from spectator betting pool
   */
  private async calculateDebateBonus(battleId: string, winner: 1 | 2): Promise<bigint> {
    try {
      // Get spectator betting pool
      const pool = await prisma.battleBettingPool.findUnique({
        where: { battleId },
      });

      if (!pool) {
        return 0n;
      }

      // Winner takes majority of losing side's pool
      // Split: 60% to debate winner, 30% to debate loser, 10% platform fee
      const losingPool = winner === 1
        ? BigInt(pool.totalWarrior2Bets)
        : BigInt(pool.totalWarrior1Bets);

      const bonusAmount = (losingPool * 60n) / 100n;

      return bonusAmount;
    } catch (error) {
      console.error('[ArbitrageBattleSettlement] Error calculating debate bonus:', error);
      return 0n;
    }
  }

  /**
   * Distribute payouts to warriors
   */
  private async distributePayouts(
    battle: PredictionBattle,
    warrior1Payout: bigint,
    warrior2Payout: bigint,
    arbitrageProfit: bigint,
    debateBonus: bigint,
    debateWinner: 1 | 2
  ): Promise<void> {
    try {
      // Split arbitrage profit equally between both warriors
      const arbitrageSplit = arbitrageProfit / 2n;

      // Warrior 1 receives:
      // - External market payout (if won)
      // - Half of arbitrage profit
      // - Debate bonus (if won debate)
      const warrior1Total =
        warrior1Payout + arbitrageSplit + (debateWinner === 1 ? debateBonus : 0n);

      // Warrior 2 receives:
      // - External market payout (if won)
      // - Half of arbitrage profit
      // - Debate bonus (if won debate)
      const warrior2Total =
        warrior2Payout + arbitrageSplit + (debateWinner === 2 ? debateBonus : 0n);

      // Transfer funds to both warriors
      const [result1, result2] = await Promise.all([
        this.transferCRwN(battle.warrior1Owner, warrior1Total),
        this.transferCRwN(battle.warrior2Owner, warrior2Total),
      ]);

      if (!result1.success || !result2.success) {
        throw new Error(`Settlement transfer failed: ${result1.error || result2.error}`);
      }

      // Release escrow lock if it exists
      const trade = await prisma.arbitrageTrade.findFirst({
        where: { predictionBattleId: battle.id },
      });

      if (trade) {
        const escrowLock = await escrowService.getEscrowLockByReference(trade.id);
        if (escrowLock) {
          await escrowService.releaseFunds(escrowLock.id, 'Battle settled successfully');
          console.log(`[ArbitrageBattleSettlement] Released escrow lock: ${escrowLock.id}`);
        }
      }

      console.log('[ArbitrageBattleSettlement] Payouts distributed:');
      console.log(`  Warrior 1 (${battle.warrior1Id}): ${warrior1Total.toString()} wei`);
      console.log(`  Warrior 2 (${battle.warrior2Id}): ${warrior2Total.toString()} wei`);
    } catch (error) {
      console.error('[ArbitrageBattleSettlement] Error distributing payouts:', error);
      throw error;
    }
  }

  /**
   * Transfer CRwN tokens to recipient
   * Uses database balance system (MVP approach)
   */
  private async transferCRwN(recipient: string, amount: bigint): Promise<{
    success: boolean;
    settlementId?: string;
    error?: string;
  }> {
    try {
      // Use database transaction to credit user balance
      const result = await prisma.$transaction(async (tx) => {
        // 1. Credit recipient's balance
        await tx.userBalance.upsert({
          where: { userId: recipient },
          create: {
            userId: recipient,
            balance: amount,
            lockedBalance: BigInt(0),
          },
          update: {
            balance: {
              increment: amount,
            },
          },
        });

        // 2. Create settlement transaction record
        const settlement = await tx.settlementTransaction.create({
          data: {
            recipient,
            amount,
            type: 'ARBITRAGE_PAYOUT',
            status: 'completed',
            settledAt: new Date(),
          },
        });

        return settlement;
      });

      // 3. Log the transfer
      await prisma.tradeAuditLog.create({
        data: {
          userId: recipient,
          tradeType: 'arbitrage',
          action: 'settle',
          amount: amount.toString(),
          success: true,
          metadata: JSON.stringify({
            settlementId: result.id,
            type: 'ARBITRAGE_PAYOUT',
          }),
        },
      });

      console.log(`[ArbitrageBattleSettlement] Transferred ${amount} CRwN to ${recipient} (settlement: ${result.id})`);

      return {
        success: true,
        settlementId: result.id,
      };
    } catch (error) {
      console.error('[ArbitrageBattleSettlement] Error transferring CRwN:', error);

      // Log the failure
      await prisma.tradeAuditLog.create({
        data: {
          userId: recipient,
          tradeType: 'arbitrage',
          action: 'settle',
          amount: amount.toString(),
          success: false,
          error: (error as Error).message,
        },
      }).catch(console.error);

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get battles ready for settlement
   */
  async getBattlesReadyForSettlement(): Promise<BattleWithTrade[]> {
    try {
      const battles = await prisma.predictionBattle.findMany({
        where: {
          isArbitrageBattle: true,
          status: 'completed',
        },
        include: {
          arbitrageTrade: true,
        },
      });

      // Filter battles where both markets are resolved
      const readyBattles: BattleWithTrade[] = [];

      for (const battle of battles) {
        if (battle.arbitrageTrade && !battle.arbitrageTrade.settled) {
          const bothResolved = await this.checkBothMarketsResolved(battle.arbitrageTrade);
          if (bothResolved) {
            readyBattles.push(battle as BattleWithTrade);
          }
        }
      }

      return readyBattles;
    } catch (error) {
      console.error('[ArbitrageBattleSettlement] Error getting ready battles:', error);
      return [];
    }
  }

  /**
   * Batch settle all ready battles
   */
  async settleAllReadyBattles(): Promise<{
    settled: number;
    failed: number;
    errors: string[];
  }> {
    const readyBattles = await this.getBattlesReadyForSettlement();
    const results = { settled: 0, failed: 0, errors: [] as string[] };

    for (const battle of readyBattles) {
      try {
        const result = await this.settleBattle(battle);
        if (result.success) {
          results.settled++;
        } else {
          results.failed++;
          if (result.error) {
            results.errors.push(`Battle ${battle.id}: ${result.error}`);
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Battle ${battle.id}: ${(error as Error).message}`);
      }
    }

    return results;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const arbitrageBattleSettlementService = new ArbitrageBattleSettlementService();
export default arbitrageBattleSettlementService;
