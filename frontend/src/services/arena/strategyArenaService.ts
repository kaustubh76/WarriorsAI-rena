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
import { generateVrfSeed, determineHitMiss, applyHitMissModifier } from '@/lib/vrfScoring';
import type { WarriorTraits, DebateMove, ScoreBreakdown } from '@/types/predictionArena';
import { chainsToContracts, crownTokenAbi, warriorsNFTAbi } from '@/constants';
import { STRATEGY_VAULT_ABI } from '@/constants/abis/strategyVaultAbi';
import { BATTLE_MANAGER_ABI } from '@/constants/abis/battleManagerAbi';
import {
  formatEther,
  parseEther,
  keccak256,
  encodePacked,
  decodeEventLog,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createFlowPublicClient, createFlowWalletClient } from '@/lib/flowClient';
import { sendAlertWithRateLimit } from '@/lib/monitoring/alerts';
import { randomBytes } from 'crypto';

// ─── Constants ────────────────────────────────────────

const FLOW_CHAIN_ID = 545;
const contracts = chainsToContracts[FLOW_CHAIN_ID];
const MAX_CYCLES = 5;

// ─── Balance Matching Constants ──────────────────────
const MIN_VAULT_BALANCE_WEI = parseEther('5');  // 5 CRwN minimum to battle
const MAX_BALANCE_RATIO = 20000n;                // 2.0x as basis points (20000 = 2x)
const DEFAULT_TRAITS: WarriorTraits = { strength: 5000, wit: 5000, charisma: 5000, defence: 5000, luck: 5000 };

// BattleManager on-chain integration
const BATTLE_MANAGER_ADDRESS = contracts.battleManager as Address | undefined;
const isBattleManagerDeployed = BATTLE_MANAGER_ADDRESS && BATTLE_MANAGER_ADDRESS !== '0x0000000000000000000000000000000000000000';

// MicroMarketFactory on-chain integration
const MICRO_MARKET_ADDRESS = contracts.microMarketFactory as Address | undefined;
const isMicroMarketDeployed = MICRO_MARKET_ADDRESS && MICRO_MARKET_ADDRESS !== '0x0000000000000000000000000000000000000000';

// Minimal ABI fragments for micro-market strategy calls
const MICRO_MARKET_STRATEGY_ABI = [
  {
    name: 'createStrategyMicroMarkets',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'battleId', type: 'uint256' },
      { name: 'warrior1Id', type: 'uint256' },
      { name: 'warrior2Id', type: 'uint256' },
      { name: 'cycleNumber', type: 'uint8' },
      { name: 'cycleEndTime', type: 'uint256' },
    ],
    outputs: [{ name: 'marketIds', type: 'uint256[]' }],
  },
  {
    name: 'resolveStrategyCycle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'battleId', type: 'uint256' },
      { name: 'cycleNumber', type: 'uint8' },
      { name: 'warrior1Yield', type: 'uint256' },
      { name: 'warrior2Yield', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

/** Map DebateMove enum values to DeFi move names for display */
const DEFI_MOVE_MAP: Record<string, string> = {
  STRIKE: 'REBALANCE',
  TAUNT: 'CONCENTRATE',
  DODGE: 'HEDGE_UP',
  SPECIAL: 'COMPOSE',
  RECOVER: 'FLASH',
};

/** Reverse map: DeFi move names back to DebateMove enum (derived from DEFI_MOVE_MAP) */
const DEFI_TO_DEBATE: Record<string, string> = Object.fromEntries(
  Object.entries(DEFI_MOVE_MAP).map(([k, v]) => [v, k])
);

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
  score: ScoreBreakdown & { strategyBreakdown?: string };
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

  // ─── Shared server wallet clients (timeout + retry via flowClient.ts) ───
  private getServerClients() {
    const pk = process.env.SERVER_WALLET_PRIVATE_KEY;
    if (!pk) return null;
    const account = privateKeyToAccount(pk as `0x${string}`);
    return { wc: createFlowWalletClient(account), pc: createFlowPublicClient() };
  }

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
    txHash?: string;           // Client already created on-chain
    onChainBattleId?: string;  // From BattleCreated event
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

    // On-chain: link battle to BattleManager escrow
    if (params.txHash && params.onChainBattleId) {
      // Client already created the battle on-chain — store the references
      await prisma.predictionBattle.update({
        where: { id: battle.id },
        data: {
          onChainBattleId: params.onChainBattleId,
          txHash: params.txHash,
        },
      });
      console.log(`[StrategyArena] On-chain battle linked: tx ${params.txHash}, onChainId ${params.onChainBattleId}`);
    } else if (isBattleManagerDeployed && BATTLE_MANAGER_ADDRESS) {
      // Server-side fallback: resolver creates on behalf (both users must have pre-approved)
      try {
        const clients = this.getServerClients();
        if (clients) {
          const { wc, pc } = clients;

          const createHash = await wc.writeContract({
            address: BATTLE_MANAGER_ADDRESS,
            abi: BATTLE_MANAGER_ABI,
            functionName: 'createBattle',
            args: [BigInt(warrior1Id), BigInt(warrior2Id), BigInt(stakes)],
          });
          const receipt = await pc.waitForTransactionReceipt({ hash: createHash, timeout: 30_000 });

          // Extract on-chain battle ID from BattleCreated event (not logs[0] — Transfer events come first)
          let onChainBattleId: string | null = null;
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: BATTLE_MANAGER_ABI,
                data: log.data,
                topics: log.topics,
              });
              if (decoded.eventName === 'BattleCreated') {
                onChainBattleId = String((decoded.args as { battleId: bigint }).battleId);
                break;
              }
            } catch {
              // Not a BattleManager event, skip
            }
          }
          await prisma.predictionBattle.update({
            where: { id: battle.id },
            data: {
              onChainBattleId,
              txHash: createHash,
            },
          });
          console.log(`[StrategyArena] On-chain battle created (server): tx ${createHash}`);
        }
      } catch (chainErr) {
        console.error(`[StrategyArena] On-chain battle creation failed:`, chainErr);
        await sendAlertWithRateLimit(
          `arena:create-onchain:${battle.id}`,
          'On-Chain Battle Creation Failed',
          `Battle ${battle.id} created in DB but not on-chain. No escrow held.`,
          'error',
          { battleId: battle.id, error: chainErr instanceof Error ? chainErr.message : String(chainErr) }
        ).catch(() => {});
        // On-chain is now mandatory — throw to signal failure
        throw new Error(`On-chain battle creation failed: ${chainErr instanceof Error ? chainErr.message : String(chainErr)}`);
      }
    } else {
      console.warn(`[StrategyArena] BattleManager not deployed — battle ${battle.id} has no on-chain escrow`);
    }

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

    // 1b. Create micro-markets for this cycle (non-fatal)
    if (isMicroMarketDeployed && MICRO_MARKET_ADDRESS && battle.onChainBattleId) {
      try {
        const clients = this.getServerClients();
        if (clients) {
          const { wc, pc } = clients;

          const cycleEndTime = BigInt(Math.floor(Date.now() / 1000) + 120); // 2 min from now
          const createMmHash = await wc.writeContract({
            address: MICRO_MARKET_ADDRESS,
            abi: MICRO_MARKET_STRATEGY_ABI,
            functionName: 'createStrategyMicroMarkets',
            args: [
              BigInt(battle.onChainBattleId),
              BigInt(battle.warrior1Id),
              BigInt(battle.warrior2Id),
              roundNumber,
              cycleEndTime,
            ],
          });
          await pc.waitForTransactionReceipt({ hash: createMmHash, timeout: 30_000 });
          console.log(`[StrategyArena] Micro-markets created for cycle ${roundNumber}: tx ${createMmHash}`);
        }
      } catch (mmErr) {
        console.error(`[StrategyArena] Micro-market creation failed (non-fatal):`, mmErr);
      }
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

    // 5b. Fetch latest Flow block hash for VRF seed (MANDATORY — no local fallback)
    let latestBlockHash: string;
    try {
      const vrfClient = createFlowPublicClient();
      const latestBlock = await vrfClient.getBlock({ blockTag: 'latest' });
      latestBlockHash = latestBlock.hash;
    } catch (vrfErr) {
      // On-chain VRF is mandatory — fail and let cron retry
      console.error(`[StrategyArena] VRF FAILED: Flow block hash unavailable for battle ${battleId} round ${roundNumber}:`, vrfErr);
      throw new Error(`VRF unavailable: Flow block hash fetch failed for battle ${battleId} cycle ${roundNumber}. Cron will retry.`);
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

    // 8. Guard against NaN/Infinity scores
    if (!Number.isFinite(w1Result.score.finalScore)) {
      console.error(`[StrategyArena] Invalid w1 score for battle ${battleId} round ${roundNumber}: ${w1Result.score.finalScore}, clamping to 0`);
      w1Result.score.finalScore = 0;
    }
    if (!Number.isFinite(w2Result.score.finalScore)) {
      console.error(`[StrategyArena] Invalid w2 score for battle ${battleId} round ${roundNumber}: ${w2Result.score.finalScore}, clamping to 0`);
      w2Result.score.finalScore = 0;
    }

    // 8b. Determine round winner
    const roundWinner =
      w1Result.score.finalScore > w2Result.score.finalScore ? 'warrior1' :
      w2Result.score.finalScore > w1Result.score.finalScore ? 'warrior2' :
      'draw';

    // 9. Update DB in interactive transaction (fresh read prevents stale yield overwrites)
    await prisma.$transaction(async (tx) => {
      // Create round record
      await tx.predictionRound.create({
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
          // Phase 5: Score breakdown for UI visualization
          w1ScoreBreakdown: w1Result.score.strategyBreakdown,
          w2ScoreBreakdown: w2Result.score.strategyBreakdown,
          endedAt: new Date(),
        },
      });

      // Fresh read inside transaction — prevents stale yield overwrite under concurrency
      const current = await tx.predictionBattle.findUniqueOrThrow({ where: { id: battleId } });

      // CAS guard: ensure no other process advanced the round concurrently
      if (current.currentRound !== roundNumber - 1) {
        throw ErrorResponses.conflict(`Race condition: battle ${battleId} expected round ${roundNumber - 1}, found ${current.currentRound}`);
      }

      const freshW1Total = (BigInt(current.w1TotalYield || '0') + BigInt(w1Result.yieldEarned)).toString();
      const freshW2Total = (BigInt(current.w2TotalYield || '0') + BigInt(w2Result.yieldEarned)).toString();

      // Update battle (atomic increment for scores, fresh-read for yield strings)
      await tx.predictionBattle.update({
        where: { id: battleId },
        data: {
          currentRound: roundNumber,
          warrior1Score: { increment: w1Result.score.finalScore },
          warrior2Score: { increment: w2Result.score.finalScore },
          w1TotalYield: freshW1Total,
          w2TotalYield: freshW2Total,
          lastCycleAt: new Date(),
        },
      });
    });

    // 9b. Resolve micro-markets for this cycle (non-fatal)
    if (isMicroMarketDeployed && MICRO_MARKET_ADDRESS && battle.onChainBattleId) {
      try {
        const clients = this.getServerClients();
        if (clients) {
          const { wc, pc } = clients;

          const resolveMmHash = await wc.writeContract({
            address: MICRO_MARKET_ADDRESS,
            abi: MICRO_MARKET_STRATEGY_ABI,
            functionName: 'resolveStrategyCycle',
            args: [
              BigInt(battle.onChainBattleId),
              roundNumber,
              BigInt(w1Result.yieldEarned),
              BigInt(w2Result.yieldEarned),
            ],
          });
          await pc.waitForTransactionReceipt({ hash: resolveMmHash, timeout: 30_000 });
          console.log(`[StrategyArena] Micro-markets resolved for cycle ${roundNumber}: tx ${resolveMmHash}`);
        }
      } catch (mmErr) {
        console.error(`[StrategyArena] Micro-market resolution failed (non-fatal):`, mmErr);
      }
    }

    // 9c. Record cycle score on-chain via BattleManager
    if (isBattleManagerDeployed && BATTLE_MANAGER_ADDRESS && battle.onChainBattleId) {
      try {
        const clients = this.getServerClients();
        if (clients) {
          const { wc, pc } = clients;

          const onChainId = BigInt(battle.onChainBattleId);
          const scoreHash = await wc.writeContract({
            address: BATTLE_MANAGER_ADDRESS,
            abi: BATTLE_MANAGER_ABI,
            functionName: 'recordCycleScore',
            args: [onChainId, BigInt(w1Result.score.finalScore), BigInt(w2Result.score.finalScore)],
          });
          await pc.waitForTransactionReceipt({ hash: scoreHash, timeout: 30_000 });
          console.log(`[StrategyArena] On-chain cycle ${roundNumber} scored: tx ${scoreHash}`);
        }
      } catch (chainErr) {
        console.error(`[StrategyArena] On-chain score recording failed:`, chainErr);
        await sendAlertWithRateLimit(
          `arena:score-onchain:${battle.id}`,
          'On-Chain Score Recording Failed',
          `Battle ${battle.id} cycle ${roundNumber} score not recorded on-chain.`,
          'error',
          { battleId: battle.id, roundNumber, error: chainErr instanceof Error ? chainErr.message : String(chainErr) }
        ).catch(() => {});
        // On-chain is mandatory — propagate failure so cron retries
        throw new Error(`On-chain score recording failed for battle ${battle.id} cycle ${roundNumber}: ${chainErr instanceof Error ? chainErr.message : String(chainErr)}`);
      }
    }

    // 9d. Upload cycle result to 0G Storage for decentralized audit trail (non-fatal)
    try {
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const cyclePayload = {
        battle: {
          battleId,
          timestamp: Date.now(),
          warriors: [
            { id: battle.warrior1Id, totalBattles: 0, wins: 0, losses: 0 },
            { id: battle.warrior2Id, totalBattles: 0, wins: 0, losses: 0 },
          ],
          rounds: [{
            round: roundNumber,
            w1Move: w1Result.defiMove,
            w2Move: w2Result.defiMove,
            w1Score: w1Result.score.finalScore,
            w2Score: w2Result.score.finalScore,
            w1Yield: w1Result.yieldEarned,
            w2Yield: w2Result.yieldEarned,
            w1Hit: w1HitResult.isHit,
            w2Hit: w2HitResult.isHit,
            w1AllocationAfter: w1Result.allocationAfter,
            w2AllocationAfter: w2Result.allocationAfter,
            w1TxHash: w1Result.txHash,
            w2TxHash: w2Result.txHash,
          }],
          outcome: 'in_progress',
          totalDamage: { warrior1: w1Result.score.finalScore, warrior2: w2Result.score.finalScore },
          totalRounds: roundNumber,
          marketData: { totalVolume: battle.stakes.toString() },
          // On-chain verifiability data
          _onChainProof: {
            scoreBreakdown: {
              w1: w1Result.score.strategyBreakdown,
              w2: w2Result.score.strategyBreakdown,
            },
            vrfSeeds: { w1: w1VrfSeed, w2: w2VrfSeed },
            vrfBlockHash: latestBlockHash,
            poolAPYsSnapshot: poolAPYs,
            onChainBattleId: battle.onChainBattleId,
          },
        },
      };
      const storeAbort = new AbortController();
      const storeTimeout = setTimeout(() => storeAbort.abort(), 10_000);
      try {
        await fetch(`${appUrl}/api/0g/store`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cyclePayload),
          signal: storeAbort.signal,
        });
        console.log(`[StrategyArena] Cycle ${roundNumber} for battle ${battleId} stored on 0G`);
      } finally {
        clearTimeout(storeTimeout);
      }
    } catch (storeErr) {
      console.warn('[StrategyArena] 0G cycle storage upload failed (non-fatal):', storeErr);
    }

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

    // On-chain settlement via BattleManager (escrow payout + ELO) or legacy server wallet
    try {
      const clients = this.getServerClients();

      if (clients) {
        const { wc, pc } = clients;

        if (isBattleManagerDeployed && BATTLE_MANAGER_ADDRESS && battle.onChainBattleId) {
          // On-chain: BattleManager handles escrow payout + ELO update
          try {
            const onChainId = BigInt(battle.onChainBattleId);
            const settleHash = await wc.writeContract({
              address: BATTLE_MANAGER_ADDRESS,
              abi: BATTLE_MANAGER_ABI,
              functionName: 'settleBattle',
              args: [onChainId],
            });
            await pc.waitForTransactionReceipt({ hash: settleHash, timeout: 30_000 });
            console.log(`[StrategyArena] On-chain settlement: tx ${settleHash}`);

            // Mark betting pool as on-chain settled
            await prisma.battleBettingPool.updateMany({
              where: { battleId },
              data: { onChainSettled: true },
            });
          } catch (settleErr) {
            console.error(`[StrategyArena] On-chain settlement failed:`, settleErr);
            await sendAlertWithRateLimit(
              `arena:settle-onchain:${battleId}`,
              'On-Chain Settlement Failed',
              `Battle ${battleId} settled in DB but contract settleBattle() failed. Bettors cannot claim.`,
              'critical',
              { battleId, onChainBattleId: battle.onChainBattleId, error: settleErr instanceof Error ? settleErr.message : String(settleErr) }
            ).catch(() => {});
            // On-chain settlement is mandatory — propagate failure so cron retries
            throw new Error(`On-chain settlement failed for battle ${battleId}: ${settleErr instanceof Error ? settleErr.message : String(settleErr)}`);
          }
        } else {
          // BattleManager not deployed or missing onChainBattleId — do NOT fall back to server-wallet transfer
          console.error(`[StrategyArena] On-chain settlement SKIPPED for ${battleId} — BattleManager not available`);
          await sendAlertWithRateLimit(
            `arena:settle-no-contract:${battleId}`,
            'Settlement Blocked: No BattleManager',
            `Battle ${battleId} cannot settle on-chain. Stakes: ${formatEther(BigInt(battle.stakes))} CRwN.`,
            'critical',
            { battleId, stakes: battle.stakes }
          ).catch(() => {});
        }

        // Demote loser NFT ranking via WarriorsNFT.demoteNFT()
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
      const appUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
  // RETRY ON-CHAIN SETTLEMENT
  // ═══════════════════════════════════════════════════════

  async retryOnChainSettlement(battleId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const battle = await prisma.predictionBattle.findUnique({ where: { id: battleId } });
    if (!battle) return { success: false, error: 'Battle not found' };
    if (battle.status !== 'completed') return { success: false, error: 'Battle not completed in DB' };
    if (!battle.onChainBattleId) return { success: false, error: 'No onChainBattleId' };
    if (!isBattleManagerDeployed || !BATTLE_MANAGER_ADDRESS) return { success: false, error: 'BattleManager not deployed' };

    const pool = await prisma.battleBettingPool.findFirst({ where: { battleId } });
    if (pool?.onChainSettled) return { success: true, txHash: 'already-settled' };

    const clients = this.getServerClients();
    if (!clients) return { success: false, error: 'SERVER_WALLET_PRIVATE_KEY not set' };

    try {
      const { wc, pc } = clients;
      const onChainId = BigInt(battle.onChainBattleId);
      const settleHash = await wc.writeContract({
        address: BATTLE_MANAGER_ADDRESS,
        abi: BATTLE_MANAGER_ABI,
        functionName: 'settleBattle',
        args: [onChainId],
      });
      await pc.waitForTransactionReceipt({ hash: settleHash, timeout: 30_000 });

      await prisma.battleBettingPool.updateMany({
        where: { battleId },
        data: { onChainSettled: true },
      });

      console.log(`[StrategyArena] Retry on-chain settlement succeeded for ${battleId}: tx ${settleHash}`);
      return { success: true, txHash: settleHash };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Contract reverts with BattleManager__BattleNotActive if already settled by another process
      if (errorMsg.includes('BattleNotActive') || errorMsg.includes('already settled')) {
        console.log(`[StrategyArena] Retry: battle ${battleId} already settled on-chain — marking DB`);
        await prisma.battleBettingPool.updateMany({
          where: { battleId },
          data: { onChainSettled: true },
        });
        return { success: true, txHash: 'already-settled-on-chain' };
      }

      // Real error — alert
      console.error(`[StrategyArena] Retry on-chain settlement failed for ${battleId}:`, err);
      await sendAlertWithRateLimit(
        `arena:settle-retry:${battleId}`,
        'On-Chain Settlement Retry Failed',
        `Battle ${battleId} retry settlement failed. Manual intervention required.`,
        'critical',
        { battleId, error: errorMsg }
      ).catch(() => {});
      return { success: false, error: errorMsg };
    }
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
        `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/vault/evaluate-cycle`,
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

    // 5b. Validate allocation sums to 10000 (100%), normalize if rounding drift
    const allocSum = newAllocation.highYield + newAllocation.stable + newAllocation.lp;
    if (allocSum !== 10000) {
      console.warn(`${tag} — post-constraint allocation sum ${allocSum} !== 10000, normalizing`);
      const diff = 10000 - allocSum;
      if (newAllocation.stable >= newAllocation.highYield && newAllocation.stable >= newAllocation.lp) {
        newAllocation.stable += diff;
      } else if (newAllocation.highYield >= newAllocation.lp) {
        newAllocation.highYield += diff;
      } else {
        newAllocation.lp += diff;
      }
    }

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
  ): ScoreBreakdown & { strategyBreakdown: string } {
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
    const vrfModifier = isHit ? 1.0 : 0.4;
    const finalScore = applyHitMissModifier(rawResult.finalScore, isHit);

    // Build strategy-specific score breakdown for storage (Phase 5)
    const yieldComponent = Math.round(yieldNormalized * 6); // 60% weight → max 600
    const aiQualityComponent = Math.round(aiBaseScore * 4);  // 40% weight → max 400
    const traitBonusComponent = rawResult.traitBonus;
    const moveCounterComponent = rawResult.counterBonus;

    const strategyBreakdown = JSON.stringify({
      yieldComponent,
      aiQualityComponent,
      traitBonusComponent,
      moveCounterComponent,
      vrfModifier,
      yieldNormalized,
      aiBaseScore,
    });

    return {
      ...rawResult,
      finalScore,
      strategyBreakdown,
    };
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: On-chain rebalance execution
  // ═══════════════════════════════════════════════════════

  private async executeRebalanceOnChain(
    nftId: number,
    newAllocation: [bigint, bigint, bigint]
  ): Promise<string> {
    const clients = this.getServerClients();
    if (!clients) {
      throw new Error('SERVER_WALLET_PRIVATE_KEY not set');
    }
    const { wc: walletClient, pc: publicClient } = clients;

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
        let hy = Math.round(current.highYield * 0.95 + (poolAPYs.highYield > poolAPYs.lp ? 500 : 0));
        let st = current.stable;
        // Guard: ensure lp doesn't go negative from rounding
        if (hy + st > 10000) {
          const excess = hy + st - 10000;
          if (hy >= st) { hy -= excess; } else { st -= excess; }
        }
        return { highYield: hy, stable: st, lp: Math.max(0, 10000 - hy - st) };
      }
      case 'REBALANCE':
      default: {
        // Shift toward highest-APY pool
        const total = poolAPYs.highYield + poolAPYs.stable + poolAPYs.lp;
        if (total === 0) return current;
        let hy = Math.round((poolAPYs.highYield / total) * 10000);
        let st = Math.round((poolAPYs.stable / total) * 10000);
        // Guard: ensure lp doesn't go negative from rounding
        if (hy + st > 10000) {
          const excess = hy + st - 10000;
          if (hy >= st) { hy -= excess; } else { st -= excess; }
        }
        return { highYield: hy, stable: st, lp: Math.max(0, 10000 - hy - st) };
      }
    }
  }
}

export const strategyArenaService = new StrategyArenaService();
