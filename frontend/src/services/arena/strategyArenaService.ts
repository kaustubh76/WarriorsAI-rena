/**
 * Strategy Arena Service — Phase 4
 *
 * Orchestrates Strategy-vs-Strategy battles:
 *   1. Create a battle between two NFTs with active vaults
 *   2. Execute 5 DeFi yield cycles for both warriors
 *   3. Score each cycle (60% yield + 40% AI quality + trait bonuses + move counters)
 *   4. Settle: winner takes staked pot, ELO updated
 *
 * Reuses:
 *   - vaultService (on-chain reads)
 *   - defiConstraints (trait enforcement)
 *   - arenaScoring (scoring, move selection, ELO)
 *   - defiTraitMapping (move display names)
 *   - vaultYieldService pattern (on-chain rebalance execution)
 */

import { prisma } from '@/lib/prisma';
import { vaultService } from '@/services/vaultService';
import { enforceTraitConstraints, type DeFiTraits, type VaultAllocation } from '@/lib/defiConstraints';
import {
  calculateRoundScore,
  selectOptimalMove,
  calculateEloChange,
  calculateEloChangeDraw,
  generateBaseScore,
} from '@/lib/arenaScoring';
import { MOVE_MAP, classifyStrategyProfile } from '@/constants/defiTraitMapping';
import type { WarriorTraits, DebateMove, ScoreBreakdown } from '@/types/predictionArena';
import { chainsToContracts } from '@/constants';
import { STRATEGY_VAULT_ABI } from '@/constants/abis/strategyVaultAbi';
import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  parseEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';

// ─── Constants ────────────────────────────────────────

const FLOW_CHAIN_ID = 545;
const contracts = chainsToContracts[FLOW_CHAIN_ID];
const MAX_CYCLES = 5;

/** Map DebateMove enum values to DeFi move names for display */
const DEFI_MOVE_MAP: Record<string, string> = {
  STRIKE: 'REBALANCE',
  TAUNT: 'CONCENTRATE',
  DODGE: 'HEDGE_UP',
  SPECIAL: 'COMPOSE',
  RECOVER: 'FLASH',
};

// ─── Types ────────────────────────────────────────────

interface WarriorCycleResult {
  nftId: number;
  move: string;         // DebateMove enum value (STRIKE, TAUNT, etc.)
  defiMove: string;     // Display name (REBALANCE, CONCENTRATE, etc.)
  allocationBefore: VaultAllocation;
  allocationAfter: VaultAllocation;
  balanceBefore: string;
  balanceAfter: string;
  yieldEarned: string;
  txHash: string | null;
  score: ScoreBreakdown;
  rationale: string;
}

interface CycleResult {
  battleId: string;
  roundNumber: number;
  warrior1: WarriorCycleResult;
  warrior2: WarriorCycleResult;
  roundWinner: 'warrior1' | 'warrior2' | 'draw';
  poolAPYs: { highYield: number; stable: number; lp: number };
  settled: boolean;
}

interface SettlementResult {
  battleId: string;
  winnerId: number | null; // null = draw
  winnerOwner: string | null;
  loserId: number | null;
  loserOwner: string | null;
  warrior1FinalScore: number;
  warrior2FinalScore: number;
  warrior1TotalYield: string;
  warrior2TotalYield: string;
  eloChanges: { w1NewRating: number; w2NewRating: number };
}

// ─── Service ──────────────────────────────────────────

class StrategyArenaService {

  // ═══════════════════════════════════════════════════════
  // CREATE STRATEGY BATTLE
  // ═══════════════════════════════════════════════════════

  async createStrategyBattle(params: {
    warrior1Id: number;
    warrior1Owner: string;
    warrior2Id: number;
    warrior2Owner: string;
    stakes: string;
  }) {
    const { warrior1Id, warrior1Owner, warrior2Id, warrior2Owner, stakes } = params;

    // Validate different warriors
    if (warrior1Id === warrior2Id) {
      throw new Error('Cannot battle the same warrior');
    }

    // Validate both have active vaults
    const [v1Active, v2Active] = await Promise.all([
      vaultService.isVaultActive(warrior1Id),
      vaultService.isVaultActive(warrior2Id),
    ]);
    if (!v1Active) throw new Error(`Warrior #${warrior1Id} does not have an active vault`);
    if (!v2Active) throw new Error(`Warrior #${warrior2Id} does not have an active vault`);

    // Fetch vault records from DB
    const [vault1, vault2] = await Promise.all([
      prisma.vault.findUnique({ where: { nftId: warrior1Id } }),
      prisma.vault.findUnique({ where: { nftId: warrior2Id } }),
    ]);
    if (!vault1) throw new Error(`No vault record for warrior #${warrior1Id}`);
    if (!vault2) throw new Error(`No vault record for warrior #${warrior2Id}`);

    // Create battle + betting pool in a transaction
    const [battle, bettingPool] = await prisma.$transaction([
      prisma.predictionBattle.create({
        data: {
          externalMarketId: `strategy_${warrior1Id}_vs_${warrior2Id}_${Date.now()}`,
          source: 'internal',
          question: `Strategy #${warrior1Id} vs #${warrior2Id}: Which vault earns more yield?`,
          warrior1Id,
          warrior1Owner: warrior1Owner.toLowerCase(),
          warrior2Id,
          warrior2Owner: warrior2Owner.toLowerCase(),
          stakes,
          warrior1Score: 0,
          warrior2Score: 0,
          status: 'active',
          currentRound: 0,
          isStrategyBattle: true,
          vault1Id: vault1.id,
          vault2Id: vault2.id,
          w1TotalYield: '0',
          w2TotalYield: '0',
        },
      }),
      prisma.battleBettingPool.create({
        data: {
          battleId: '', // placeholder — will be set below
          totalWarrior1Bets: '0',
          totalWarrior2Bets: '0',
          totalBettors: 0,
          bettingOpen: true,
        },
      }),
    ]);

    // Update betting pool with actual battleId
    await prisma.battleBettingPool.update({
      where: { id: bettingPool.id },
      data: { battleId: battle.id },
    });

    console.log(`[StrategyArena] Created battle ${battle.id}: NFT#${warrior1Id} vs NFT#${warrior2Id}`);

    return { battle, bettingPoolId: bettingPool.id };
  }

  // ═══════════════════════════════════════════════════════
  // EXECUTE ONE CYCLE
  // ═══════════════════════════════════════════════════════

  async executeCycle(battleId: string): Promise<CycleResult> {
    // 1. Load battle
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
      include: { rounds: { orderBy: { roundNumber: 'asc' } } },
    });
    if (!battle) throw new Error(`Battle ${battleId} not found`);
    if (!battle.isStrategyBattle) throw new Error('Not a strategy battle');
    if (battle.status !== 'active') throw new Error(`Battle is ${battle.status}, not active`);
    if (battle.currentRound >= MAX_CYCLES) throw new Error('All 5 cycles already completed');

    const roundNumber = battle.currentRound + 1;
    console.log(`[StrategyArena] Battle ${battleId} — executing cycle ${roundNumber}/${MAX_CYCLES}`);

    // 2. Get pool APYs (shared for both warriors)
    let poolAPYs: { highYield: number; stable: number; lp: number };
    try {
      poolAPYs = await vaultService.getPoolAPYs();
    } catch {
      poolAPYs = { highYield: 1800, stable: 400, lp: 1200 };
    }

    // 3. Determine opponent's last moves for counter strategy
    const lastRound = battle.rounds.length > 0 ? battle.rounds[battle.rounds.length - 1] : null;
    const w1PreviousMoves = battle.rounds.map(r => r.w1Move).filter(Boolean) as string[];
    const w2PreviousMoves = battle.rounds.map(r => r.w2Move).filter(Boolean) as string[];

    // 4. Execute cycle for warrior 1
    const w1Result = await this.executeWarriorCycle(
      battle.warrior1Id,
      roundNumber,
      lastRound?.w2Move as DebateMove | undefined,
      w1PreviousMoves as DebateMove[],
      poolAPYs,
    );

    // 5. Execute cycle for warrior 2
    const w2Result = await this.executeWarriorCycle(
      battle.warrior2Id,
      roundNumber,
      lastRound?.w1Move as DebateMove | undefined,
      w2PreviousMoves as DebateMove[],
      poolAPYs,
    );

    // 6. Get traits for scoring
    const [w1RawTraits, w2RawTraits] = await Promise.all([
      vaultService.getNFTTraits(battle.warrior1Id),
      vaultService.getNFTTraits(battle.warrior2Id),
    ]);

    // 7. Score both warriors with move counters
    w1Result.score = this.scoreCycle(
      BigInt(w1Result.yieldEarned),
      w1RawTraits,
      w1Result.move as DebateMove,
      w2Result.move as DebateMove,
      w2RawTraits,
    );
    w2Result.score = this.scoreCycle(
      BigInt(w2Result.yieldEarned),
      w2RawTraits,
      w2Result.move as DebateMove,
      w1Result.move as DebateMove,
      w1RawTraits,
    );

    // 8. Determine round winner
    const roundWinner =
      w1Result.score.finalScore > w2Result.score.finalScore ? 'warrior1' :
      w2Result.score.finalScore > w1Result.score.finalScore ? 'warrior2' :
      'draw';

    // 9. Update DB in transaction
    const newW1Total = (BigInt(battle.w1TotalYield || '0') + BigInt(w1Result.yieldEarned)).toString();
    const newW2Total = (BigInt(battle.w2TotalYield || '0') + BigInt(w2Result.yieldEarned)).toString();

    await prisma.$transaction([
      // Create round record
      prisma.predictionRound.create({
        data: {
          battleId,
          roundNumber,
          w1Move: w1Result.move,
          w1Score: w1Result.score.finalScore,
          w1Confidence: Math.round(w1Result.score.baseScore),
          w2Move: w2Result.move,
          w2Score: w2Result.score.finalScore,
          w2Confidence: Math.round(w2Result.score.baseScore),
          roundWinner,
          judgeReasoning: `Cycle ${roundNumber}: ${w1Result.defiMove} vs ${w2Result.defiMove}. W1 yield: ${formatEther(BigInt(w1Result.yieldEarned))} CRwN, W2 yield: ${formatEther(BigInt(w2Result.yieldEarned))} CRwN.`,
          // DeFi-specific fields
          w1DeFiMove: w1Result.defiMove,
          w2DeFiMove: w2Result.defiMove,
          w1AllocationBefore: JSON.stringify(w1Result.allocationBefore),
          w2AllocationBefore: JSON.stringify(w2Result.allocationBefore),
          w1AllocationAfter: JSON.stringify(w1Result.allocationAfter),
          w2AllocationAfter: JSON.stringify(w2Result.allocationAfter),
          w1YieldEarned: w1Result.yieldEarned,
          w2YieldEarned: w2Result.yieldEarned,
          w1BalanceBefore: w1Result.balanceBefore,
          w2BalanceBefore: w2Result.balanceBefore,
          w1BalanceAfter: w1Result.balanceAfter,
          w2BalanceAfter: w2Result.balanceAfter,
          w1TxHash: w1Result.txHash,
          w2TxHash: w2Result.txHash,
          poolAPYsSnapshot: JSON.stringify(poolAPYs),
          endedAt: new Date(),
        },
      }),
      // Update battle
      prisma.predictionBattle.update({
        where: { id: battleId },
        data: {
          currentRound: roundNumber,
          warrior1Score: battle.warrior1Score + w1Result.score.finalScore,
          warrior2Score: battle.warrior2Score + w2Result.score.finalScore,
          w1TotalYield: newW1Total,
          w2TotalYield: newW2Total,
        },
      }),
    ]);

    // 10. Auto-settle if final cycle
    let settled = false;
    if (roundNumber >= MAX_CYCLES) {
      try {
        await this.settleBattle(battleId);
        settled = true;
      } catch (err) {
        console.error(`[StrategyArena] Settlement failed for ${battleId}:`, err);
      }
    }

    console.log(`[StrategyArena] Cycle ${roundNumber} complete: W1=${w1Result.score.finalScore} (${w1Result.defiMove}), W2=${w2Result.score.finalScore} (${w2Result.defiMove}), winner=${roundWinner}`);

    return {
      battleId,
      roundNumber,
      warrior1: w1Result,
      warrior2: w2Result,
      roundWinner,
      poolAPYs,
      settled,
    };
  }

  // ═══════════════════════════════════════════════════════
  // SETTLE BATTLE
  // ═══════════════════════════════════════════════════════

  async settleBattle(battleId: string): Promise<SettlementResult> {
    const battle = await prisma.predictionBattle.findUnique({
      where: { id: battleId },
    });
    if (!battle) throw new Error(`Battle ${battleId} not found`);
    if (battle.status === 'completed') throw new Error('Battle already settled');

    const w1Score = battle.warrior1Score;
    const w2Score = battle.warrior2Score;

    const isDraw = w1Score === w2Score;
    const w1Wins = w1Score > w2Score;

    const winnerId = isDraw ? null : (w1Wins ? battle.warrior1Id : battle.warrior2Id);
    const winnerOwner = isDraw ? null : (w1Wins ? battle.warrior1Owner : battle.warrior2Owner);
    const loserId = isDraw ? null : (w1Wins ? battle.warrior2Id : battle.warrior1Id);
    const loserOwner = isDraw ? null : (w1Wins ? battle.warrior2Owner : battle.warrior1Owner);

    // Update ELO ratings
    const [w1Stats, w2Stats] = await Promise.all([
      prisma.warriorArenaStats.findUnique({ where: { warriorId: battle.warrior1Id } }),
      prisma.warriorArenaStats.findUnique({ where: { warriorId: battle.warrior2Id } }),
    ]);

    const w1Rating = w1Stats?.arenaRating ?? 1000;
    const w2Rating = w2Stats?.arenaRating ?? 1000;

    let w1NewRating: number;
    let w2NewRating: number;

    if (isDraw) {
      const drawResult = calculateEloChangeDraw(w1Rating, w2Rating);
      w1NewRating = drawResult.newRating1;
      w2NewRating = drawResult.newRating2;
    } else if (w1Wins) {
      const eloResult = calculateEloChange(w1Rating, w2Rating);
      w1NewRating = eloResult.winnerNewRating;
      w2NewRating = eloResult.loserNewRating;
    } else {
      const eloResult = calculateEloChange(w2Rating, w1Rating);
      w1NewRating = eloResult.loserNewRating;
      w2NewRating = eloResult.winnerNewRating;
    }

    // Update DB
    await prisma.$transaction([
      // Mark battle completed
      prisma.predictionBattle.update({
        where: { id: battleId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      }),
      // Close betting pool
      prisma.battleBettingPool.updateMany({
        where: { battleId },
        data: { bettingOpen: false },
      }),
      // Upsert warrior 1 stats
      prisma.warriorArenaStats.upsert({
        where: { warriorId: battle.warrior1Id },
        create: {
          warriorId: battle.warrior1Id,
          totalBattles: 1,
          wins: w1Wins ? 1 : 0,
          losses: !isDraw && !w1Wins ? 1 : 0,
          draws: isDraw ? 1 : 0,
          arenaRating: w1NewRating,
          peakRating: Math.max(w1NewRating, 1000),
          currentStreak: w1Wins ? 1 : 0,
          longestStreak: w1Wins ? 1 : 0,
        },
        update: {
          totalBattles: { increment: 1 },
          wins: w1Wins ? { increment: 1 } : undefined,
          losses: !isDraw && !w1Wins ? { increment: 1 } : undefined,
          draws: isDraw ? { increment: 1 } : undefined,
          arenaRating: w1NewRating,
          peakRating: Math.max(w1NewRating, w1Stats?.peakRating ?? 1000),
          currentStreak: w1Wins ? (w1Stats?.currentStreak ?? 0) + 1 : 0,
          longestStreak: w1Wins
            ? Math.max((w1Stats?.longestStreak ?? 0), (w1Stats?.currentStreak ?? 0) + 1)
            : (w1Stats?.longestStreak ?? 0),
        },
      }),
      // Upsert warrior 2 stats
      prisma.warriorArenaStats.upsert({
        where: { warriorId: battle.warrior2Id },
        create: {
          warriorId: battle.warrior2Id,
          totalBattles: 1,
          wins: !isDraw && !w1Wins ? 1 : 0,
          losses: w1Wins ? 1 : 0,
          draws: isDraw ? 1 : 0,
          arenaRating: w2NewRating,
          peakRating: Math.max(w2NewRating, 1000),
          currentStreak: !isDraw && !w1Wins ? 1 : 0,
          longestStreak: !isDraw && !w1Wins ? 1 : 0,
        },
        update: {
          totalBattles: { increment: 1 },
          wins: !isDraw && !w1Wins ? { increment: 1 } : undefined,
          losses: w1Wins ? { increment: 1 } : undefined,
          draws: isDraw ? { increment: 1 } : undefined,
          arenaRating: w2NewRating,
          peakRating: Math.max(w2NewRating, w2Stats?.peakRating ?? 1000),
          currentStreak: !isDraw && !w1Wins ? (w2Stats?.currentStreak ?? 0) + 1 : 0,
          longestStreak: !isDraw && !w1Wins
            ? Math.max((w2Stats?.longestStreak ?? 0), (w2Stats?.currentStreak ?? 0) + 1)
            : (w2Stats?.longestStreak ?? 0),
        },
      }),
      // Audit trail
      prisma.settlementTransaction.create({
        data: {
          recipient: winnerOwner || battle.warrior1Owner,
          amount: BigInt(battle.stakes),
          type: 'BATTLE_PAYOUT',
          status: 'completed',
          sourceType: 'prediction_battle',
          sourceId: battleId,
          settledAt: new Date(),
        },
      }),
    ]);

    console.log(`[StrategyArena] Battle ${battleId} settled: ${isDraw ? 'DRAW' : `Winner NFT#${winnerId}`}, W1=${w1Score} W2=${w2Score}`);

    return {
      battleId,
      winnerId,
      winnerOwner,
      loserId,
      loserOwner,
      warrior1FinalScore: w1Score,
      warrior2FinalScore: w2Score,
      warrior1TotalYield: battle.w1TotalYield || '0',
      warrior2TotalYield: battle.w2TotalYield || '0',
      eloChanges: { w1NewRating, w2NewRating },
    };
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: Execute cycle for a single warrior
  // ═══════════════════════════════════════════════════════

  private async executeWarriorCycle(
    nftId: number,
    roundNumber: number,
    opponentLastMove: DebateMove | undefined,
    previousMoves: DebateMove[],
    poolAPYs: { highYield: number; stable: number; lp: number },
  ): Promise<WarriorCycleResult> {
    // 1. Get traits
    const rawTraits = await vaultService.getNFTTraits(nftId);
    const defiTraits = vaultService.mapToDeFiTraits(rawTraits);

    // 2. Get current vault state
    const vaultState = await vaultService.getVaultState(nftId);
    if (!vaultState) throw new Error(`Cannot read vault state for NFT#${nftId}`);

    const balanceBefore = vaultState.depositAmount.toString();
    const currentAllocation: VaultAllocation = {
      highYield: Number(vaultState.allocation[0]),
      stable: Number(vaultState.allocation[1]),
      lp: Number(vaultState.allocation[2]),
    };

    // 3. Select optimal move via arenaScoring (trait-weighted with counter strategy)
    const selectedMove = selectOptimalMove(
      rawTraits,
      roundNumber,
      opponentLastMove,
      previousMoves,
    );
    const defiMove = DEFI_MOVE_MAP[selectedMove] || 'REBALANCE';

    // 4. Get AI-generated allocation from evaluate-cycle
    let newAllocation: VaultAllocation;
    let rationale = '';
    let txHash: string | null = null;

    try {
      const evalResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/vault/evaluate-cycle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nftId, cycleNumber: roundNumber }),
        }
      );

      if (evalResponse.ok) {
        const evalData = await evalResponse.json();
        newAllocation = {
          highYield: evalData.newAllocation.highYield,
          stable: evalData.newAllocation.stable,
          lp: evalData.newAllocation.lp,
        };
        rationale = evalData.rationale || `AI selected ${defiMove}`;
      } else {
        newAllocation = this.computeFallbackAllocation(defiTraits, currentAllocation, poolAPYs, defiMove);
        rationale = 'Fallback allocation (AI unavailable)';
      }
    } catch {
      newAllocation = this.computeFallbackAllocation(defiTraits, currentAllocation, poolAPYs, defiMove);
      rationale = 'Fallback allocation (AI error)';
    }

    // 5. Enforce trait constraints
    newAllocation = enforceTraitConstraints(newAllocation, defiTraits, currentAllocation);

    // 6. Check if allocation actually changed
    const isHold =
      newAllocation.highYield === currentAllocation.highYield &&
      newAllocation.stable === currentAllocation.stable &&
      newAllocation.lp === currentAllocation.lp;

    let balanceAfter = balanceBefore;

    if (!isHold) {
      // 7. Execute rebalance on-chain
      try {
        txHash = await this.executeRebalanceOnChain(
          nftId,
          [BigInt(newAllocation.highYield), BigInt(newAllocation.stable), BigInt(newAllocation.lp)]
        );

        // Re-read vault state to capture yield
        const stateAfter = await vaultService.getVaultState(nftId);
        if (stateAfter) balanceAfter = stateAfter.depositAmount.toString();
      } catch (err) {
        console.error(`[StrategyArena] Rebalance failed for NFT#${nftId}:`, err);
        // If rebalance fails, keep going with zero yield for this cycle
      }
    }

    const yieldEarned = (BigInt(balanceAfter) - BigInt(balanceBefore)).toString();

    return {
      nftId,
      move: selectedMove,
      defiMove,
      allocationBefore: currentAllocation,
      allocationAfter: isHold ? currentAllocation : newAllocation,
      balanceBefore,
      balanceAfter,
      yieldEarned,
      txHash,
      score: { baseScore: 0, traitBonus: 0, moveMultiplier: 1, counterBonus: 0, finalScore: 0 }, // placeholder, scored after both complete
      rationale,
    };
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: Score a warrior's cycle
  // ═══════════════════════════════════════════════════════

  private scoreCycle(
    yieldEarned: bigint,
    traits: WarriorTraits,
    myMove: DebateMove,
    opponentMove: DebateMove,
    opponentTraits: WarriorTraits,
  ): ScoreBreakdown {
    // Yield score: normalize yield earned to 0-100
    // Max expected yield per cycle = 10 CRwN (theoretical ceiling)
    const maxYieldPerCycle = parseEther('10');
    const absYield = yieldEarned < 0n ? 0n : yieldEarned;
    const yieldNormalized = Math.min(100, Number((absYield * 100n) / maxYieldPerCycle));

    // AI quality score from luck/timing trait
    const aiBaseScore = generateBaseScore(traits.luck);

    // Weighted: 60% yield performance + 40% AI quality
    const weightedBase = Math.round(yieldNormalized * 0.6 + aiBaseScore * 0.4);

    // Full scoring with trait bonuses, move counters, opponent defense
    return calculateRoundScore(
      weightedBase,
      traits,
      myMove,
      opponentMove,
      opponentTraits,
    );
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: On-chain rebalance execution
  // ═══════════════════════════════════════════════════════

  private async executeRebalanceOnChain(
    nftId: number,
    newAllocation: [bigint, bigint, bigint]
  ): Promise<string> {
    const serverPrivateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
    if (!serverPrivateKey) {
      throw new Error('SERVER_WALLET_PRIVATE_KEY not set');
    }

    const account = privateKeyToAccount(serverPrivateKey as `0x${string}`);

    const walletClient = createWalletClient({
      account,
      chain: flowTestnet,
      transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org'),
    });

    const publicClient = createPublicClient({
      chain: flowTestnet,
      transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org'),
    });

    const hash = await walletClient.writeContract({
      address: contracts.strategyVault as Address,
      abi: STRATEGY_VAULT_ABI,
      functionName: 'rebalance',
      args: [BigInt(nftId), newAllocation],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 30_000,
    });

    if (receipt.status !== 'success') {
      throw new Error(`Rebalance tx reverted: ${hash}`);
    }

    return hash;
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: Fallback allocation (move-biased)
  // ═══════════════════════════════════════════════════════

  private computeFallbackAllocation(
    traits: DeFiTraits,
    current: VaultAllocation,
    poolAPYs: { highYield: number; stable: number; lp: number },
    defiMove: string,
  ): VaultAllocation {
    // Move-biased fallback
    switch (defiMove) {
      case 'CONCENTRATE': {
        // Push toward highest-APY pool
        const bestPool = poolAPYs.highYield >= poolAPYs.lp ? 'highYield' : 'lp';
        return bestPool === 'highYield'
          ? { highYield: 7000, stable: 1000, lp: 2000 }
          : { highYield: 2000, stable: 1000, lp: 7000 };
      }
      case 'HEDGE_UP':
        return { highYield: 2000, stable: 6000, lp: 2000 };
      case 'COMPOSE':
        return { highYield: 3500, stable: 2000, lp: 4500 };
      case 'FLASH':
        // Small precision adjustment — stay close to current
        return {
          highYield: Math.round(current.highYield * 0.95 + (poolAPYs.highYield > poolAPYs.lp ? 500 : 0)),
          stable: current.stable,
          lp: 0, // recalculated below
        };
      case 'REBALANCE':
      default: {
        // Shift toward highest-APY pool
        const total = poolAPYs.highYield + poolAPYs.stable + poolAPYs.lp;
        if (total === 0) return current;
        return {
          highYield: Math.round((poolAPYs.highYield / total) * 10000),
          stable: Math.round((poolAPYs.stable / total) * 10000),
          lp: 10000 - Math.round((poolAPYs.highYield / total) * 10000) - Math.round((poolAPYs.stable / total) * 10000),
        };
      }
    }
  }
}

export const strategyArenaService = new StrategyArenaService();
