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
import { ErrorResponses } from '@/lib/api';
import { vaultService } from '@/services/vaultService';
import { enforceTraitConstraints, type DeFiTraits, type VaultAllocation } from '@/lib/defiConstraints';
import {
  calculateRoundScore,
  calculateEloChange,
  calculateEloChangeDraw,
  generateBaseScore,
  getDynamicKFactor,
} from '@/lib/arenaScoring';
import {
  getTierFromRating,
  areAdjacentTiers,
  getBattleRewardMultiplier,
  getStreakBonus,
  getVeteranBonus,
  MAX_RATING_DIFFERENCE,
  type ArenaTier,
} from '@/lib/arenaTiers';
import { MOVE_MAP, classifyStrategyProfile } from '@/constants/defiTraitMapping';
import { generateVrfSeed, determineHitMiss, applyHitMissModifier } from '@/lib/vrfScoring';
import type { WarriorTraits, DebateMove, ScoreBreakdown } from '@/types/predictionArena';
import { chainsToContracts, crownTokenAbi, warriorsNFTAbi } from '@/constants';
import { STRATEGY_VAULT_ABI } from '@/constants/abis/strategyVaultAbi';
import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  parseEther,
  keccak256,
  encodePacked,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';

// ─── Constants ────────────────────────────────────────

const FLOW_CHAIN_ID = 545;
const contracts = chainsToContracts[FLOW_CHAIN_ID];
const MAX_CYCLES = 5;

// ─── Balance Matching Constants ──────────────────────
const MIN_VAULT_BALANCE_WEI = parseEther('5');  // 5 CRwN minimum to battle
const MAX_BALANCE_RATIO = 20000n;                // 2.0x as basis points (20000 = 2x)
const DEFAULT_TRAITS: WarriorTraits = { strength: 5000, wit: 5000, charisma: 5000, defence: 5000, luck: 5000 };

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
    scheduledStartAt?: Date;
  }) {
    const { warrior1Id, warrior1Owner, warrior2Id, warrior2Owner, stakes } = params;

    // Validate different warriors
    if (warrior1Id === warrior2Id) {
      throw ErrorResponses.badRequest('Cannot battle the same warrior');
    }

    // Validate both have active vaults
    const [v1Active, v2Active] = await Promise.all([
      vaultService.isVaultActive(warrior1Id),
      vaultService.isVaultActive(warrior2Id),
    ]);
    if (!v1Active) throw ErrorResponses.badRequest(`Warrior #${warrior1Id} does not have an active vault`);
    if (!v2Active) throw ErrorResponses.badRequest(`Warrior #${warrior2Id} does not have an active vault`);

    // Validate vault balances are comparable (min balance + max 2x ratio)
    await this.validateVaultBalances(warrior1Id, warrior2Id);

    // Validate matchmaking (tier adjacency + rating proximity)
    const matchInfo = await this.validateMatchmaking(warrior1Id, warrior2Id);

    // Fetch vault records from DB
    const [vault1, vault2] = await Promise.all([
      prisma.vault.findUnique({ where: { nftId: warrior1Id } }),
      prisma.vault.findUnique({ where: { nftId: warrior2Id } }),
    ]);
    if (!vault1) throw ErrorResponses.badRequest(`No vault record for warrior #${warrior1Id}`);
    if (!vault2) throw ErrorResponses.badRequest(`No vault record for warrior #${warrior2Id}`);

    // Create battle + betting pool in an interactive transaction
    const { battle, bettingPool } = await prisma.$transaction(async (tx) => {
      const battle = await tx.predictionBattle.create({
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
          scheduledStartAt: params.scheduledStartAt || null,
          lastCycleAt: null,
          w1RatingAtStart: matchInfo.w1Rating,
          w2RatingAtStart: matchInfo.w2Rating,
          w1TierAtStart: matchInfo.w1Tier,
          w2TierAtStart: matchInfo.w2Tier,
          tierMultiplier: matchInfo.tierMultiplier,
        },
      });

      const bettingPool = await tx.battleBettingPool.create({
        data: {
          battleId: battle.id,
          totalWarrior1Bets: '0',
          totalWarrior2Bets: '0',
          totalBettors: 0,
          bettingOpen: true,
        },
      });

      return { battle, bettingPool };
    });

    console.log(`[StrategyArena] Created battle ${battle.id}: NFT#${warrior1Id} vs NFT#${warrior2Id}`);

    // Fire-and-forget: cache NFT image URLs so list page can show avatars
    Promise.all([
      vaultService.getNFTImageUrl(warrior1Id),
      vaultService.getNFTImageUrl(warrior2Id),
    ]).then(([w1Img, w2Img]) => {
      prisma.predictionBattle.update({
        where: { id: battle.id },
        data: { warrior1ImageUrl: w1Img, warrior2ImageUrl: w2Img },
      }).catch((err) => console.warn(`[StrategyArena] Failed to cache image URLs for battle ${battle.id}:`, err));
    }).catch((err) => console.warn(`[StrategyArena] Failed to fetch NFT images for battle ${battle.id}:`, err));

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
    if (!battle) throw ErrorResponses.notFound(`Battle ${battleId}`);
    if (!battle.isStrategyBattle) throw ErrorResponses.badRequest('Not a strategy battle');
    if (battle.status !== 'active') throw ErrorResponses.badRequest(`Battle is ${battle.status}, not active`);
    if (battle.currentRound >= MAX_CYCLES) throw ErrorResponses.badRequest('All 5 cycles already completed');

    const roundNumber = battle.currentRound + 1;
    console.log(`[StrategyArena] Battle ${battleId} — executing cycle ${roundNumber}/${MAX_CYCLES}`);

    // Auto-close betting when first cycle begins (betting only allowed before battle starts)
    if (roundNumber === 1) {
      await prisma.battleBettingPool.updateMany({
        where: { battleId, bettingOpen: true },
        data: { bettingOpen: false },
      });
      console.log(`[StrategyArena] Betting closed for battle ${battleId} (battle started)`);
    }

    // 2. Get pool APYs (shared for both warriors)
    let poolAPYs: { highYield: number; stable: number; lp: number };
    try {
      poolAPYs = await vaultService.getPoolAPYs();
    } catch (apyErr) {
      console.warn('[StrategyArena] getPoolAPYs failed, using fallback APYs:', apyErr instanceof Error ? apyErr.message : apyErr);
      poolAPYs = { highYield: 1800, stable: 400, lp: 1200 };
    }

    // 3. Determine opponent's last moves for counter strategy
    const lastRound = battle.rounds.length > 0 ? battle.rounds[battle.rounds.length - 1] : null;
    const w1PreviousMoves = battle.rounds.map(r => r.w1Move).filter(Boolean) as string[];
    const w2PreviousMoves = battle.rounds.map(r => r.w2Move).filter(Boolean) as string[];

    // 4 & 5. Execute cycles for BOTH warriors in parallel (P4-5 fix)
    const [w1Result, w2Result] = await Promise.all([
      this.executeWarriorCycle(
        battle.warrior1Id,
        roundNumber,
        lastRound?.w2Move as DebateMove | undefined,
        w1PreviousMoves as DebateMove[],
        poolAPYs,
      ),
      this.executeWarriorCycle(
        battle.warrior2Id,
        roundNumber,
        lastRound?.w1Move as DebateMove | undefined,
        w2PreviousMoves as DebateMove[],
        poolAPYs,
      ),
    ]);

    // 5b. Fetch latest Flow block hash for VRF seed
    let latestBlockHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    try {
      const vrfClient = createPublicClient({ chain: flowTestnet, transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org') });
      const latestBlock = await vrfClient.getBlock({ blockTag: 'latest' });
      latestBlockHash = latestBlock.hash;
    } catch {
      // Fallback: local entropy — less verifiable but functional. Log so operators know VRF is degraded.
      console.warn(`[StrategyArena] VRF degraded: Flow RPC block hash unavailable for battle ${battleId} round ${roundNumber}`);
      const localEntropy = BigInt(Date.now()) ^ process.hrtime.bigint() ^ BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      latestBlockHash = keccak256(encodePacked(['uint256'], [localEntropy]));
    }

    // 5c. Generate VRF seeds and determine hit/miss for each warrior
    const w1VrfSeed = generateVrfSeed(battleId, roundNumber, battle.warrior1Id, latestBlockHash);
    const w2VrfSeed = generateVrfSeed(battleId, roundNumber, battle.warrior2Id, latestBlockHash);

    // 6. Get traits + arena stats for scoring (parallel)
    const [w1RawTraits, w2RawTraits, w1ArenaStats, w2ArenaStats] = await Promise.all([
      vaultService.getNFTTraits(battle.warrior1Id),
      vaultService.getNFTTraits(battle.warrior2Id),
      prisma.warriorArenaStats.findUnique({ where: { warriorId: battle.warrior1Id } }),
      prisma.warriorArenaStats.findUnique({ where: { warriorId: battle.warrior2Id } }),
    ]);
    const w1Traits = w1RawTraits ?? DEFAULT_TRAITS;
    const w2Traits = w2RawTraits ?? DEFAULT_TRAITS;

    // 7. Determine VRF hit/miss for each warrior
    const w1HitResult = determineHitMiss(w1VrfSeed, w1Traits.luck);
    const w2HitResult = determineHitMiss(w2VrfSeed, w2Traits.luck);

    // 8. Score both warriors with move counters + ranking bonuses + VRF hit/miss
    w1Result.score = this.scoreCycle(
      BigInt(w1Result.yieldEarned),
      BigInt(w1Result.balanceBefore),
      w1Traits,
      w1Result.move as DebateMove,
      w2Result.move as DebateMove,
      w2Traits,
      w1ArenaStats,
      w1HitResult.isHit,
    );
    w2Result.score = this.scoreCycle(
      BigInt(w2Result.yieldEarned),
      BigInt(w2Result.balanceBefore),
      w2Traits,
      w2Result.move as DebateMove,
      w1Result.move as DebateMove,
      w1Traits,
      w2ArenaStats,
      w2HitResult.isHit,
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
          judgeReasoning: `Cycle ${roundNumber}: ${w1Result.defiMove} (${w1HitResult.isHit ? 'HIT' : 'MISS'} @${(w1HitResult.hitProbability / 100).toFixed(1)}%) vs ${w2Result.defiMove} (${w2HitResult.isHit ? 'HIT' : 'MISS'} @${(w2HitResult.hitProbability / 100).toFixed(1)}%). W1 yield: ${formatEther(BigInt(w1Result.yieldEarned))} CRwN, W2 yield: ${formatEther(BigInt(w2Result.yieldEarned))} CRwN.`,
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
          // VRF hit/miss fields
          w1VrfSeed: w1VrfSeed,
          w2VrfSeed: w2VrfSeed,
          w1IsHit: w1HitResult.isHit,
          w2IsHit: w2HitResult.isHit,
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
          lastCycleAt: new Date(),
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
        // Concurrent settlement (another cron/request settled first) is fine
        if (err instanceof Error && err.message.includes('already settled')) {
          console.warn(`[StrategyArena] Concurrent settlement for ${battleId} — already settled`);
          settled = true;
        } else {
          console.error(`[StrategyArena] Settlement failed for ${battleId}:`, err);
        }
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
    if (!battle) throw ErrorResponses.notFound(`Battle ${battleId}`);
    if (battle.status === 'completed') throw ErrorResponses.badRequest('Battle already settled');

    const w1Score = battle.warrior1Score;
    const w2Score = battle.warrior2Score;

    const isDraw = w1Score === w2Score;
    const w1Wins = w1Score > w2Score;

    const winnerId = isDraw ? null : (w1Wins ? battle.warrior1Id : battle.warrior2Id);
    const winnerOwner = isDraw ? null : (w1Wins ? battle.warrior1Owner : battle.warrior2Owner);
    const loserId = isDraw ? null : (w1Wins ? battle.warrior2Id : battle.warrior1Id);
    const loserOwner = isDraw ? null : (w1Wins ? battle.warrior2Owner : battle.warrior1Owner);

    // Update ELO ratings with dynamic K-factor + tier multiplier
    const [w1Stats, w2Stats] = await Promise.all([
      prisma.warriorArenaStats.findUnique({ where: { warriorId: battle.warrior1Id } }),
      prisma.warriorArenaStats.findUnique({ where: { warriorId: battle.warrior2Id } }),
    ]);

    const w1Rating = w1Stats?.arenaRating ?? 1000;
    const w2Rating = w2Stats?.arenaRating ?? 1000;

    // Compute effective K-factor: dynamic based on experience, scaled by tier multiplier
    const tierMult = (battle as { tierMultiplier?: number | null }).tierMultiplier ?? 1.0;
    const w1K = getDynamicKFactor(w1Stats?.totalBattles ?? 0);
    const w2K = getDynamicKFactor(w2Stats?.totalBattles ?? 0);
    const effectiveK = Math.round(((w1K + w2K) / 2) * tierMult);

    let w1NewRating: number;
    let w2NewRating: number;

    if (isDraw) {
      const drawResult = calculateEloChangeDraw(w1Rating, w2Rating, effectiveK);
      w1NewRating = drawResult.newRating1;
      w2NewRating = drawResult.newRating2;
    } else if (w1Wins) {
      const eloResult = calculateEloChange(w1Rating, w2Rating, effectiveK);
      w1NewRating = eloResult.winnerNewRating;
      w2NewRating = eloResult.loserNewRating;
    } else {
      const eloResult = calculateEloChange(w2Rating, w1Rating, effectiveK);
      w1NewRating = eloResult.loserNewRating;
      w2NewRating = eloResult.winnerNewRating;
    }

    // Update DB with atomic CAS to prevent double-settlement
    await prisma.$transaction(async (tx) => {
      // Atomic CAS: only settle if not already completed
      const updated = await tx.predictionBattle.updateMany({
        where: { id: battleId, status: { not: 'completed' } },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (updated.count === 0) {
        throw ErrorResponses.badRequest('Battle already settled (concurrent)');
      }

      // Close betting pool
      await tx.battleBettingPool.updateMany({
        where: { battleId },
        data: { bettingOpen: false },
      });

      // Upsert warrior 1 stats
      await tx.warriorArenaStats.upsert({
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
      });

      // Upsert warrior 2 stats
      await tx.warriorArenaStats.upsert({
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
      });

      // Audit trail
      await tx.settlementTransaction.create({
        data: {
          recipient: winnerOwner || battle.warrior1Owner,
          amount: BigInt(battle.stakes),
          type: 'BATTLE_PAYOUT',
          status: 'completed',
          sourceType: 'prediction_battle',
          sourceId: battleId,
          settledAt: new Date(),
        },
      });
    });

    // On-chain settlement: transfer staked CRwN to winner, demote loser NFT (P4-8 + P4-12)
    try {
      const serverPrivateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
      const crwnAddress = contracts.crownToken as Address;

      if (serverPrivateKey && crwnAddress && crwnAddress !== '0x0000000000000000000000000000000000000000') {
        const account = privateKeyToAccount(serverPrivateKey as `0x${string}`);
        const wc = createWalletClient({ account, chain: flowTestnet, transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org') });
        const pc = createPublicClient({ chain: flowTestnet, transport: http(process.env.FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org') });

        // 1. Transfer staked pot (battle.stakes wei) to winner (non-fatal if server wallet lacks balance)
        if (!isDraw && winnerOwner) {
          try {
            const payoutHash = await wc.writeContract({
              address: crwnAddress,
              abi: crownTokenAbi,
              functionName: 'transfer',
              args: [winnerOwner as Address, BigInt(battle.stakes)],
            });
            await pc.waitForTransactionReceipt({ hash: payoutHash, timeout: 30_000 });
            console.log(`[StrategyArena] CRwN payout sent to ${winnerOwner}: ${formatEther(BigInt(battle.stakes))} CRwN`);
          } catch (payoutErr) {
            console.error(`[StrategyArena] CRwN payout failed (non-fatal):`, payoutErr);
          }
        }

        // 2. Demote loser NFT ranking via WarriorsNFT.demoteNFT() (P4-12)
        const warriorsNFTAddress = contracts.warriorsNFT as Address;
        if (!isDraw && loserId && warriorsNFTAddress && warriorsNFTAddress !== '0x0000000000000000000000000000000000000000') {
          try {
            const demoteHash = await wc.writeContract({
              address: warriorsNFTAddress,
              abi: warriorsNFTAbi,
              functionName: 'demoteNFT',
              args: [BigInt(loserId)],
            });
            await pc.waitForTransactionReceipt({ hash: demoteHash, timeout: 30_000 });
            console.log(`[StrategyArena] NFT#${loserId} demoted (defluenced)`);
          } catch (demoteErr) {
            console.error(`[StrategyArena] demoteNFT failed for NFT#${loserId} (non-fatal):`, demoteErr);
          }
        }
      } else {
        console.warn('[StrategyArena] On-chain settlement skipped — SERVER_WALLET_PRIVATE_KEY or crownToken not configured');
      }
    } catch (settlementErr) {
      console.error('[StrategyArena] On-chain settlement error (non-fatal):', settlementErr);
    }

    // P4-16: Write TradeAuditLog record for settlement (non-fatal)
    try {
      await prisma.tradeAuditLog.create({
        data: {
          userId: winnerOwner || battle.warrior1Owner,
          tradeType: 'battle',
          action: 'settle',
          tradeId: battleId,
          amount: battle.stakes.toString(),
          success: true,
          metadata: JSON.stringify({
            battleId,
            isDraw,
            winnerId,
            loserId,
            warrior1Score: w1Score,
            warrior2Score: w2Score,
            w1TotalYield: battle.w1TotalYield,
            w2TotalYield: battle.w2TotalYield,
            eloChanges: { w1NewRating, w2NewRating },
          }),
        },
      });
    } catch (auditErr) {
      console.warn('[StrategyArena] TradeAuditLog write failed (non-fatal):', auditErr);
    }

    // P4-15: Upload battle settlement to 0G Storage for decentralized audit trail (non-fatal)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      // Build BattleDataIndex-compatible payload (warriors + outcome required by /api/0g/store)
      const zeroGPayload = {
        battle: {
          battleId,
          timestamp: Date.now(),
          warriors: [
            {
              id: battle.warrior1Id,
              totalBattles: 1,
              wins: w1Wins ? 1 : 0,
              losses: !isDraw && !w1Wins ? 1 : 0,
            },
            {
              id: battle.warrior2Id,
              totalBattles: 1,
              wins: !isDraw && !w1Wins ? 1 : 0,
              losses: w1Wins ? 1 : 0,
            },
          ],
          rounds: [],
          outcome: isDraw ? 'draw' : (w1Wins ? 'warrior1' : 'warrior2'),
          totalDamage: { warrior1: w1Score, warrior2: w2Score },
          totalRounds: 5,
          // Attach strategy-specific data as marketData.aiPredictionAccuracy
          marketData: {
            finalOdds: { yes: w1Score, no: w2Score },
            totalVolume: battle.stakes.toString(),
          },
          _predictionData: {
            prediction: isDraw ? 'draw' : `warrior${w1Wins ? '1' : '2'}_wins`,
            confidence: Math.abs(w1Score - w2Score) / Math.max(w1Score, w2Score, 1),
            reasoning: `Strategy yields: W1=${battle.w1TotalYield} W2=${battle.w2TotalYield}`,
          },
        },
      };
      const storeAbort = new AbortController();
      const storeTimeout = setTimeout(() => storeAbort.abort(), 10_000);
      try {
        await fetch(`${appUrl}/api/0g/store`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zeroGPayload),
          signal: storeAbort.signal,
        });
        console.log(`[StrategyArena] Battle ${battleId} settlement stored on 0G`);
      } finally {
        clearTimeout(storeTimeout);
      }
    } catch (storeErr) {
      console.warn('[StrategyArena] 0G storage upload failed (non-fatal):', storeErr);
    }

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
  // PRIVATE: Validate vault balances for fair matchmaking
  // ═══════════════════════════════════════════════════════

  private async validateVaultBalances(warrior1Id: number, warrior2Id: number): Promise<{
    balance1: bigint;
    balance2: bigint;
  }> {
    const [state1, state2] = await Promise.all([
      vaultService.getVaultState(warrior1Id),
      vaultService.getVaultState(warrior2Id),
    ]);

    if (!state1) throw ErrorResponses.badRequest(`Cannot read vault state for NFT#${warrior1Id}`);
    if (!state2) throw ErrorResponses.badRequest(`Cannot read vault state for NFT#${warrior2Id}`);

    const balance1 = state1.depositAmount;
    const balance2 = state2.depositAmount;

    // Check minimum balance
    if (balance1 < MIN_VAULT_BALANCE_WEI) {
      throw ErrorResponses.badRequest(
        `Warrior #${warrior1Id} vault balance too low: ${formatEther(balance1)} CRwN (minimum: ${formatEther(MIN_VAULT_BALANCE_WEI)} CRwN)`
      );
    }
    if (balance2 < MIN_VAULT_BALANCE_WEI) {
      throw ErrorResponses.badRequest(
        `Warrior #${warrior2Id} vault balance too low: ${formatEther(balance2)} CRwN (minimum: ${formatEther(MIN_VAULT_BALANCE_WEI)} CRwN)`
      );
    }

    // Check balance ratio using basis points for precise BigInt comparison
    const larger = balance1 > balance2 ? balance1 : balance2;
    const smaller = balance1 > balance2 ? balance2 : balance1;
    if (smaller > 0n && (larger * 10000n) / smaller > MAX_BALANCE_RATIO) {
      throw ErrorResponses.badRequest(
        `Vault balance mismatch too large: ${formatEther(balance1)} CRwN vs ${formatEther(balance2)} CRwN (max 2x ratio allowed)`
      );
    }

    return { balance1, balance2 };
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: Validate matchmaking (tier + rating proximity)
  // ═══════════════════════════════════════════════════════

  private async validateMatchmaking(warrior1Id: number, warrior2Id: number): Promise<{
    w1Rating: number;
    w2Rating: number;
    w1Tier: ArenaTier;
    w2Tier: ArenaTier;
    tierMultiplier: number;
  }> {
    const [w1Stats, w2Stats] = await Promise.all([
      prisma.warriorArenaStats.findUnique({ where: { warriorId: warrior1Id } }),
      prisma.warriorArenaStats.findUnique({ where: { warriorId: warrior2Id } }),
    ]);

    const w1Rating = w1Stats?.arenaRating ?? 1000;
    const w2Rating = w2Stats?.arenaRating ?? 1000;
    const w1Tier = getTierFromRating(w1Rating);
    const w2Tier = getTierFromRating(w2Rating);

    // Check tier adjacency (same or +/- 1 tier)
    if (!areAdjacentTiers(w1Tier, w2Tier)) {
      throw ErrorResponses.badRequest(
        `Tier mismatch: NFT#${warrior1Id} (${w1Tier}, rating ${w1Rating}) vs NFT#${warrior2Id} (${w2Tier}, rating ${w2Rating}). Warriors must be within adjacent tiers.`
      );
    }

    // Check absolute rating difference
    const ratingDiff = Math.abs(w1Rating - w2Rating);
    if (ratingDiff > MAX_RATING_DIFFERENCE) {
      throw ErrorResponses.badRequest(
        `Rating gap too large: ${ratingDiff} (max ${MAX_RATING_DIFFERENCE}). NFT#${warrior1Id} (${w1Rating}) vs NFT#${warrior2Id} (${w2Rating}).`
      );
    }

    const tierMultiplier = getBattleRewardMultiplier(w1Tier, w2Tier);

    return { w1Rating, w2Rating, w1Tier, w2Tier, tierMultiplier };
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
    const tag = `[StrategyArena] NFT#${nftId} R${roundNumber}`;
    console.log(`${tag} — starting warrior cycle`);

    // 1. Get traits (fallback to defaults if RPC fails)
    let rawTraits;
    try {
      rawTraits = await vaultService.getNFTTraits(nftId);
      console.log(`${tag} — traits loaded`);
    } catch (traitErr) {
      console.warn(`${tag} — getNFTTraits failed, using defaults:`, traitErr instanceof Error ? traitErr.message : traitErr);
      rawTraits = DEFAULT_TRAITS;
    }
    const defiTraits = vaultService.mapToDeFiTraits(rawTraits);

    // 2. Get current vault state
    console.log(`${tag} — reading vault state...`);
    const vaultState = await vaultService.getVaultState(nftId);
    if (!vaultState) throw new Error(`Cannot read vault state for NFT#${nftId}`);

    const balanceBefore = vaultState.depositAmount.toString();
    const currentAllocation: VaultAllocation = {
      highYield: Number(vaultState.allocation[0]),
      stable: Number(vaultState.allocation[1]),
      lp: Number(vaultState.allocation[2]),
    };
    console.log(`${tag} — vault state: balance=${formatEther(BigInt(balanceBefore))} CRwN, alloc=[HY:${currentAllocation.highYield} ST:${currentAllocation.stable} LP:${currentAllocation.lp}]`);

    // 3. Select move using DeFi-aware logic based on traits + pool conditions (P4-6 fix)
    const defiMove = this.selectDeFiMove(defiTraits, poolAPYs, currentAllocation, roundNumber);
    // Map defiMove back to a DebateMove enum value for scoring compatibility
    const DEFI_TO_DEBATE: Record<string, string> = {
      CONCENTRATE: 'TAUNT',
      HEDGE_UP: 'DODGE',
      COMPOSE: 'SPECIAL',
      FLASH: 'RECOVER',
      REBALANCE: 'STRIKE',
    };
    const selectedMove = (DEFI_TO_DEBATE[defiMove] || 'STRIKE') as DebateMove;
    console.log(`${tag} — selected move: ${defiMove}`);

    // 4. Get AI-generated allocation from evaluate-cycle
    let newAllocation: VaultAllocation;
    let rationale = '';
    let txHash: string | null = null;

    console.log(`${tag} — calling evaluate-cycle API...`);
    const evalStart = Date.now();
    const evalAbort = new AbortController();
    const evalTimeout = setTimeout(() => evalAbort.abort(), 10_000);
    try {
      const evalResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/vault/evaluate-cycle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nftId, cycleNumber: roundNumber }),
          signal: evalAbort.signal,
        }
      );

      if (evalResponse.ok) {
        const evalData = await evalResponse.json();
        console.log(`${tag} — evaluate-cycle OK in ${Date.now() - evalStart}ms, move=${evalData?.move}`);
        if (
          evalData?.newAllocation &&
          typeof evalData.newAllocation.highYield === 'number' &&
          typeof evalData.newAllocation.stable === 'number' &&
          typeof evalData.newAllocation.lp === 'number'
        ) {
          newAllocation = {
            highYield: evalData.newAllocation.highYield,
            stable: evalData.newAllocation.stable,
            lp: evalData.newAllocation.lp,
          };
          rationale = String(evalData.rationale || `AI selected ${defiMove}`);
        } else {
          console.warn(`${tag} — evaluate-cycle returned invalid allocation, using fallback`);
          newAllocation = this.computeFallbackAllocation(defiTraits, currentAllocation, poolAPYs, defiMove);
          rationale = 'Fallback allocation (invalid AI response)';
        }
      } else {
        console.warn(`${tag} — evaluate-cycle failed with status ${evalResponse.status} in ${Date.now() - evalStart}ms, using fallback`);
        newAllocation = this.computeFallbackAllocation(defiTraits, currentAllocation, poolAPYs, defiMove);
        rationale = 'Fallback allocation (AI unavailable)';
      }
    } catch (evalErr) {
      console.warn(`${tag} — evaluate-cycle error in ${Date.now() - evalStart}ms:`, evalErr instanceof Error ? evalErr.message : evalErr, '— using fallback');
      newAllocation = this.computeFallbackAllocation(defiTraits, currentAllocation, poolAPYs, defiMove);
      rationale = 'Fallback allocation (AI error)';
    } finally {
      clearTimeout(evalTimeout);
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
      console.log(`${tag} — executing on-chain rebalance: [HY:${newAllocation.highYield} ST:${newAllocation.stable} LP:${newAllocation.lp}]...`);
      const rebalanceStart = Date.now();
      try {
        txHash = await this.executeRebalanceOnChain(
          nftId,
          [BigInt(newAllocation.highYield), BigInt(newAllocation.stable), BigInt(newAllocation.lp)]
        );
        console.log(`${tag} — rebalance tx confirmed in ${Date.now() - rebalanceStart}ms: ${txHash}`);

        // Re-read vault state to capture yield
        const stateAfter = await vaultService.getVaultState(nftId);
        if (stateAfter) balanceAfter = stateAfter.depositAmount.toString();
      } catch (err) {
        console.error(`${tag} — rebalance FAILED in ${Date.now() - rebalanceStart}ms:`, err instanceof Error ? err.message : err);
        // If rebalance fails, keep going with zero yield for this cycle
      }
    } else {
      console.log(`${tag} — allocation unchanged (HOLD), skipping on-chain rebalance`);
    }

    const rawYield = BigInt(balanceAfter) - BigInt(balanceBefore);
    const yieldEarned = (rawYield < 0n ? 0n : rawYield).toString();
    console.log(`${tag} — cycle complete: move=${defiMove}, yield=${formatEther(rawYield < 0n ? 0n : rawYield)} CRwN, tx=${txHash || 'none'}`);

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
    balanceBefore: bigint,
    traits: WarriorTraits,
    myMove: DebateMove,
    opponentMove: DebateMove,
    opponentTraits: WarriorTraits,
    arenaStats?: { currentStreak: number; totalBattles: number } | null,
    isHit: boolean = true,
  ): ScoreBreakdown {
    // Yield RATE normalization: yield/balance as basis points, scaled to 0-100
    // Max expected yield rate per cycle = 10% (1000 bps) → score 100
    const MAX_YIELD_RATE_BPS = 1000n;
    const absYield = yieldEarned < 0n ? 0n : yieldEarned;
    const balance = balanceBefore > 0n ? balanceBefore : 1n; // prevent divide-by-zero
    const yieldRateBps = (absYield * 10000n) / balance;
    const yieldNormalized = Math.min(100, Number((yieldRateBps * 100n) / MAX_YIELD_RATE_BPS));

    // AI quality score from luck/timing trait
    const aiBaseScore = generateBaseScore(traits.luck);

    // Weighted: 60% yield performance + 40% AI quality
    const weightedBase = Math.round(yieldNormalized * 0.6 + aiBaseScore * 0.4);

    // Apply ranking-based bonuses (streak + veteran)
    let adjustedBase = weightedBase;
    if (arenaStats) {
      const streakBonus = getStreakBonus(arenaStats.currentStreak);
      const veteranBonus = getVeteranBonus(arenaStats.totalBattles);
      adjustedBase = Math.round(weightedBase * (1 + streakBonus + veteranBonus));
    }

    // Full scoring with trait bonuses, move counters, opponent defense
    const rawResult = calculateRoundScore(
      adjustedBase,
      traits,
      myMove,
      opponentMove,
      opponentTraits,
    );

    // Apply VRF hit/miss modifier: hit = full score, miss = 0.4x
    return {
      ...rawResult,
      finalScore: applyHitMissModifier(rawResult.finalScore, isHit),
    };
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
  // PRIVATE: DeFi-aware move selector (P4-6 fix)
  // Replaces old HP/debate-based selectOptimalMove().
  // Picks the move whose primary trait is strongest given current pool conditions.
  // ═══════════════════════════════════════════════════════

  private selectDeFiMove(
    traits: DeFiTraits,
    poolAPYs: { highYield: number; stable: number; lp: number },
    currentAllocation: VaultAllocation,
    roundNumber: number,
  ): string {
    const { alpha, complexity, momentum, hedge, timing } = traits;

    // Detect market conditions
    const highYieldStrong = poolAPYs.highYield >= poolAPYs.lp && poolAPYs.highYield >= poolAPYs.stable;
    const stableStrong = poolAPYs.stable >= poolAPYs.highYield * 0.7;
    const multiPoolOpportunity = Math.abs(poolAPYs.highYield - poolAPYs.lp) > 400;
    const recoverySignal = currentAllocation.highYield < 3000 && highYieldStrong;

    // Rank moves by trait affinity + market condition bonus
    const scores: [string, number][] = [
      ['CONCENTRATE', alpha + (highYieldStrong ? 2000 : 0)],
      ['HEDGE_UP', hedge + (stableStrong ? 2000 : 0)],
      ['FLASH', timing + (recoverySignal ? 2000 : 0)],
      ['COMPOSE', complexity + (multiPoolOpportunity ? 2000 : 0)],
      ['REBALANCE', momentum + 1000], // baseline bonus — rebalance is always reasonable
    ];
    scores.sort((a, b) => b[1] - a[1]);

    // Cycle-based rotation: each round picks the Nth-ranked move (wraps around)
    // Round 1 → top-ranked, Round 2 → 2nd, Round 3 → 3rd, etc.
    // This ensures variety while traits still influence order
    const moveIndex = (roundNumber - 1) % scores.length;
    return scores[moveIndex][0];
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
      case 'FLASH': {
        // Small precision adjustment — stay close to current
        const hy = Math.round(current.highYield * 0.95 + (poolAPYs.highYield > poolAPYs.lp ? 500 : 0));
        const st = current.stable;
        return { highYield: hy, stable: st, lp: 10000 - hy - st };
      }
      case 'REBALANCE':
      default: {
        // Shift toward highest-APY pool
        const total = poolAPYs.highYield + poolAPYs.stable + poolAPYs.lp;
        if (total === 0) return current;
        const hy = Math.round((poolAPYs.highYield / total) * 10000);
        const st = Math.round((poolAPYs.stable / total) * 10000);
        return { highYield: hy, stable: st, lp: 10000 - hy - st };
      }
    }
  }
}

export const strategyArenaService = new StrategyArenaService();
