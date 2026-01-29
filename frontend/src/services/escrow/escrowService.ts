/**
 * Escrow Service
 * Handles fund locking and release for trades and battles
 *
 * This provides database-level escrow (MVP approach).
 * For production, consider migrating to smart contract escrow.
 */

import { prisma } from '@/lib/prisma';
import { Prisma, PrismaClient } from '@prisma/client';

// ============================================
// TYPES
// ============================================

export type EscrowPurpose = 'arbitrage_trade' | 'market_bet' | 'battle_stake';
export type EscrowStatus = 'locked' | 'released' | 'forfeited';

// Transaction client type for Prisma interactive transactions
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface LockFundsParams {
  userId: string;
  amount: bigint;
  purpose: EscrowPurpose;
  referenceId: string;
}

export interface LockFundsResult {
  success: boolean;
  lockId?: string;
  error?: string;
}

export interface ReleaseFundsResult {
  success: boolean;
  amountReleased?: bigint;
  error?: string;
}

export interface EscrowSummary {
  userId: string;
  totalBalance: bigint;
  lockedBalance: bigint;
  availableBalance: bigint;
  activeLocks: number;
}

// ============================================
// ESCROW SERVICE CLASS
// ============================================

class EscrowService {
  /**
   * Lock funds for a trade or battle
   * Uses a database transaction for atomicity
   */
  async lockFunds(params: LockFundsParams): Promise<LockFundsResult> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Get or create user balance
        let userBalance = await tx.userBalance.findUnique({
          where: { userId: params.userId },
        });

        if (!userBalance) {
          // Create initial balance record (would be seeded or funded externally)
          userBalance = await tx.userBalance.create({
            data: {
              userId: params.userId,
              balance: BigInt(0),
              lockedBalance: BigInt(0),
            },
          });
        }

        // 2. Calculate available balance
        const availableBalance = userBalance.balance - userBalance.lockedBalance;

        if (availableBalance < params.amount) {
          return {
            success: false,
            error: `Insufficient balance. Available: ${availableBalance.toString()}, Required: ${params.amount.toString()}`,
          };
        }

        // 3. Increment locked balance
        await tx.userBalance.update({
          where: { userId: params.userId },
          data: {
            lockedBalance: {
              increment: params.amount,
            },
          },
        });

        // 4. Create escrow lock record
        const escrowLock = await tx.escrowLock.create({
          data: {
            userId: params.userId,
            amount: params.amount,
            purpose: params.purpose,
            referenceId: params.referenceId,
            status: 'locked',
            lockedAt: new Date(),
          },
        });

        // 5. Log the action
        await tx.tradeAuditLog.create({
          data: {
            userId: params.userId,
            tradeType: params.purpose === 'arbitrage_trade' ? 'arbitrage' : 'bet',
            action: 'escrow_lock',
            tradeId: params.referenceId,
            amount: params.amount.toString(),
            success: true,
            metadata: JSON.stringify({
              lockId: escrowLock.id,
              purpose: params.purpose,
              previousAvailable: availableBalance.toString(),
              newLocked: (userBalance.lockedBalance + params.amount).toString(),
            }),
          },
        });

        return {
          success: true,
          lockId: escrowLock.id,
        };
      });

      return result;
    } catch (error) {
      console.error('[EscrowService] Lock funds error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Lock funds using an existing transaction context
   * Use this when you need to atomically create a bet/trade AND lock funds
   * in a single database transaction.
   *
   * @example
   * ```typescript
   * const result = await prisma.$transaction(async (tx) => {
   *   const bet = await tx.marketBet.create({ ... });
   *   const escrow = await escrowService.lockFundsWithTx(tx, {
   *     userId: bet.userId,
   *     amount: bet.amount,
   *     purpose: 'market_bet',
   *     referenceId: bet.id,
   *   });
   *   if (!escrow.success) throw new Error(escrow.error);
   *   return { bet, escrow };
   * });
   * ```
   */
  async lockFundsWithTx(
    tx: TransactionClient,
    params: LockFundsParams
  ): Promise<LockFundsResult> {
    try {
      // 1. Get or create user balance
      let userBalance = await tx.userBalance.findUnique({
        where: { userId: params.userId },
      });

      if (!userBalance) {
        // Create initial balance record (would be seeded or funded externally)
        userBalance = await tx.userBalance.create({
          data: {
            userId: params.userId,
            balance: BigInt(0),
            lockedBalance: BigInt(0),
          },
        });
      }

      // 2. Calculate available balance
      const availableBalance = userBalance.balance - userBalance.lockedBalance;

      if (availableBalance < params.amount) {
        return {
          success: false,
          error: `Insufficient balance. Available: ${availableBalance.toString()}, Required: ${params.amount.toString()}`,
        };
      }

      // 3. Increment locked balance
      await tx.userBalance.update({
        where: { userId: params.userId },
        data: {
          lockedBalance: {
            increment: params.amount,
          },
        },
      });

      // 4. Create escrow lock record
      const escrowLock = await tx.escrowLock.create({
        data: {
          userId: params.userId,
          amount: params.amount,
          purpose: params.purpose,
          referenceId: params.referenceId,
          status: 'locked',
          lockedAt: new Date(),
        },
      });

      // 5. Log the action
      await tx.tradeAuditLog.create({
        data: {
          userId: params.userId,
          tradeType: params.purpose === 'arbitrage_trade' ? 'arbitrage' : 'bet',
          action: 'escrow_lock',
          tradeId: params.referenceId,
          amount: params.amount.toString(),
          success: true,
          metadata: JSON.stringify({
            lockId: escrowLock.id,
            purpose: params.purpose,
            previousAvailable: availableBalance.toString(),
            newLocked: (userBalance.lockedBalance + params.amount).toString(),
          }),
        },
      });

      return {
        success: true,
        lockId: escrowLock.id,
      };
    } catch (error) {
      console.error('[EscrowService] Lock funds (with tx) error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Release funds after successful trade completion
   */
  async releaseFunds(lockId: string, reason: string): Promise<ReleaseFundsResult> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Get the escrow lock
        const escrowLock = await tx.escrowLock.findUnique({
          where: { id: lockId },
        });

        if (!escrowLock) {
          return {
            success: false,
            error: 'Escrow lock not found',
          };
        }

        if (escrowLock.status !== 'locked') {
          return {
            success: false,
            error: `Cannot release escrow with status: ${escrowLock.status}`,
          };
        }

        // 2. Decrement locked balance
        await tx.userBalance.update({
          where: { userId: escrowLock.userId },
          data: {
            lockedBalance: {
              decrement: escrowLock.amount,
            },
          },
        });

        // 3. Update escrow lock status
        await tx.escrowLock.update({
          where: { id: lockId },
          data: {
            status: 'released',
            releasedAt: new Date(),
            releaseReason: reason,
          },
        });

        // 4. Log the action
        await tx.tradeAuditLog.create({
          data: {
            userId: escrowLock.userId,
            tradeType: escrowLock.purpose === 'arbitrage_trade' ? 'arbitrage' : 'bet',
            action: 'escrow_release',
            tradeId: escrowLock.referenceId,
            amount: escrowLock.amount.toString(),
            success: true,
            metadata: JSON.stringify({
              lockId,
              reason,
            }),
          },
        });

        return {
          success: true,
          amountReleased: escrowLock.amount,
        };
      });

      return result;
    } catch (error) {
      console.error('[EscrowService] Release funds error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Forfeit funds (on rule violation or failed trade)
   * Moves funds to platform treasury
   */
  async forfeitFunds(lockId: string, reason: string): Promise<ReleaseFundsResult> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Get the escrow lock
        const escrowLock = await tx.escrowLock.findUnique({
          where: { id: lockId },
        });

        if (!escrowLock) {
          return {
            success: false,
            error: 'Escrow lock not found',
          };
        }

        if (escrowLock.status !== 'locked') {
          return {
            success: false,
            error: `Cannot forfeit escrow with status: ${escrowLock.status}`,
          };
        }

        // 2. Decrement both locked balance AND total balance (forfeited)
        await tx.userBalance.update({
          where: { userId: escrowLock.userId },
          data: {
            balance: {
              decrement: escrowLock.amount,
            },
            lockedBalance: {
              decrement: escrowLock.amount,
            },
          },
        });

        // 3. Update escrow lock status
        await tx.escrowLock.update({
          where: { id: lockId },
          data: {
            status: 'forfeited',
            releasedAt: new Date(),
            releaseReason: reason,
          },
        });

        // 4. Log the action
        await tx.tradeAuditLog.create({
          data: {
            userId: escrowLock.userId,
            tradeType: escrowLock.purpose === 'arbitrage_trade' ? 'arbitrage' : 'bet',
            action: 'escrow_forfeit',
            tradeId: escrowLock.referenceId,
            amount: escrowLock.amount.toString(),
            success: true,
            metadata: JSON.stringify({
              lockId,
              reason,
            }),
          },
        });

        return {
          success: true,
          amountReleased: escrowLock.amount,
        };
      });

      return result;
    } catch (error) {
      console.error('[EscrowService] Forfeit funds error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get escrow lock by ID
   */
  async getEscrowLock(lockId: string) {
    return await prisma.escrowLock.findUnique({
      where: { id: lockId },
    });
  }

  /**
   * Get escrow lock by reference ID (trade/bet/battle ID)
   */
  async getEscrowLockByReference(referenceId: string) {
    return await prisma.escrowLock.findFirst({
      where: {
        referenceId,
        status: 'locked',
      },
    });
  }

  /**
   * Get all active locks for a user
   */
  async getUserActiveLocks(userId: string) {
    return await prisma.escrowLock.findMany({
      where: {
        userId,
        status: 'locked',
      },
      orderBy: { lockedAt: 'desc' },
    });
  }

  /**
   * Get user's balance summary
   */
  async getUserBalanceSummary(userId: string): Promise<EscrowSummary> {
    const userBalance = await prisma.userBalance.findUnique({
      where: { userId },
    });

    const activeLocks = await prisma.escrowLock.count({
      where: {
        userId,
        status: 'locked',
      },
    });

    const balance = userBalance?.balance ?? BigInt(0);
    const lockedBalance = userBalance?.lockedBalance ?? BigInt(0);

    return {
      userId,
      totalBalance: balance,
      lockedBalance,
      availableBalance: balance - lockedBalance,
      activeLocks,
    };
  }

  /**
   * Add funds to user's balance (for deposits/credits)
   */
  async creditFunds(userId: string, amount: bigint, reason: string): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        // Upsert user balance
        await tx.userBalance.upsert({
          where: { userId },
          create: {
            userId,
            balance: amount,
            lockedBalance: BigInt(0),
          },
          update: {
            balance: {
              increment: amount,
            },
          },
        });

        // Log the credit
        await tx.tradeAuditLog.create({
          data: {
            userId,
            tradeType: 'deposit',
            action: 'credit',
            amount: amount.toString(),
            success: true,
            metadata: JSON.stringify({ reason }),
          },
        });
      });

      return true;
    } catch (error) {
      console.error('[EscrowService] Credit funds error:', error);
      return false;
    }
  }

  /**
   * Debit funds from user's unlocked balance (for withdrawals)
   */
  async debitFunds(userId: string, amount: bigint, reason: string): Promise<boolean> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const userBalance = await tx.userBalance.findUnique({
          where: { userId },
        });

        if (!userBalance) {
          throw new Error('User balance not found');
        }

        const availableBalance = userBalance.balance - userBalance.lockedBalance;
        if (availableBalance < amount) {
          throw new Error(`Insufficient available balance: ${availableBalance.toString()}`);
        }

        // Deduct from balance
        await tx.userBalance.update({
          where: { userId },
          data: {
            balance: {
              decrement: amount,
            },
          },
        });

        // Log the debit
        await tx.tradeAuditLog.create({
          data: {
            userId,
            tradeType: 'withdrawal',
            action: 'debit',
            amount: amount.toString(),
            success: true,
            metadata: JSON.stringify({ reason }),
          },
        });

        return true;
      });

      return result;
    } catch (error) {
      console.error('[EscrowService] Debit funds error:', error);
      return false;
    }
  }

  /**
   * Check if user has sufficient available balance
   */
  async hasAvailableBalance(userId: string, amount: bigint): Promise<boolean> {
    const summary = await this.getUserBalanceSummary(userId);
    return summary.availableBalance >= amount;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const escrowService = new EscrowService();
export default escrowService;
