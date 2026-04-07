'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { useStrategyBattle } from '@/hooks/arena/useStrategyBattle';
import { useAutoExecuteBattle } from '@/hooks/arena/useAutoExecuteBattle';
import { useBattleBetting, formatOdds, formatMultiplier } from '@/hooks/arena';
import { useWarriorMessage } from '@/contexts/WarriorMessageContext';
import { WARRIOR_MESSAGES } from '@/utils/warriorMessages';
import { TRAIT_MAP } from '@/constants/defiTraitMapping';
import { getFlowExplorerUrl } from '@/constants';
import { PredictionRound } from '@/types/predictionArena';
import BattleShareButton from '@/components/arena/BattleShareButton';
import MicroMarketGrid from '@/components/micro-markets/MicroMarketGrid';
import { useBattleMicroMarkets } from '@/hooks/useMicroMarkets';
import ScoreProgressionChart from '@/components/arena/ScoreProgressionChart';
import CycleCountdown from '@/components/arena/CycleCountdown';
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Swords,
  ArrowRight,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  Radio,
  Shield,
  Target,
  Eye,
  EyeOff,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import '../../page-glass.css';

// ─── Move colors ──────────────────────────────────────

const MOVE_COLORS: Record<string, string> = {
  REBALANCE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CONCENTRATE: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  HEDGE_UP: 'bg-green-500/20 text-green-400 border-green-500/30',
  COMPOSE: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  FLASH: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  HOLD: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const MOVE_ICONS: Record<string, string> = {
  REBALANCE: '⚖️',
  CONCENTRATE: '🎯',
  HEDGE_UP: '🛡️',
  COMPOSE: '🔗',
  FLASH: '⚡',
  HOLD: '⏸️',
};

const POOL_COLORS = {
  highYield: { bg: 'bg-orange-500', label: 'High Yield' },
  stable: { bg: 'bg-green-500', label: 'Stable' },
  lp: { bg: 'bg-blue-500', label: 'LP' },
};

// ─── Funny Move Commentary ─────────────────────────────

const MOVE_COMMENTARY: Record<string, string[]> = {
  REBALANCE: [
    'Classic portfolio shuffle — playing it safe like a true gigabrain',
    'Rebalancing the bags... nothing says "I read the charts" like a gentle nudge',
    'A careful redistribution. Boring? Maybe. Profitable? We shall see',
    'Textbook rebalance. The quant in them is showing',
  ],
  CONCENTRATE: [
    'Going all-in?! This warrior woke up and chose violence',
    'Full send into one pool — no risk management, just vibes',
    'Concentration play! Either genius or about to get rekt',
    'Doubling down harder than a degen at 3am',
  ],
  HEDGE_UP: [
    'Running to stables like there\'s a bear chasing them',
    'Hedge activated — someone\'s reading the fear & greed index',
    'Playing defense! The vault goes full bunker mode',
    'Safety first! Parking the funds where the yields are boring but alive',
  ],
  COMPOSE: [
    'Multi-hop wizardry — this one actually read the whitepaper',
    'Composability unlocked! Chaining protocols like a DeFi sommelier',
    'A compose play?! Someone\'s feeling fancy today',
    'Advanced strat deployed. The other warriors are taking notes',
  ],
  FLASH: [
    'Flash move! Blink and you missed that reallocation',
    'Lightning rebalance! In and out faster than a memecoin pump',
    'Precision timing activated — this warrior has atomic clock energy',
    'Speed demon mode! The block was barely confirmed',
  ],
  HOLD: [
    'Diamond hands activated. Refusing to move a single basis point',
    'HODL gang reporting in. Sometimes the best move is no move',
    'Standing still in a hurricane of yields. Bold strategy',
    'Not moving. Not even a little. The ultimate power move... or laziness',
  ],
};

const MATCHUP_COMMENTARY: Record<string, string[]> = {
  mirror: [
    'Great minds think alike... or maybe neither read the market',
    'Mirror match! Who wore it better?',
    'Same move, same energy — but only one gets the VRF blessing',
    'Copy-paste strategies! Someone\'s peeking at the other vault',
  ],
  'CONCENTRATE_vs_HEDGE_UP': [
    'One\'s going full degen while the other runs for cover!',
    'Maximum offense meets maximum defense — clash of philosophies!',
    'All-in vs all-out! The crowd is on the edge of their seats',
  ],
  'FLASH_vs_HOLD': [
    'Lightning speed meets an immovable object!',
    'One moves at lightspeed while the other doesn\'t move at all',
    'Flash vs diamond hands — the eternal DeFi struggle',
  ],
  'CONCENTRATE_vs_COMPOSE': [
    'Brute force meets big brain energy!',
    'Simple aggression vs complex strategy — who wins?',
  ],
  'REBALANCE_vs_HOLD': [
    'One shuffles the deck while the other refuses to play',
    'Rebalancing against a wall. Interesting matchup',
  ],
  'FLASH_vs_COMPOSE': [
    'Speed vs strategy! The sprinter vs the chess player',
    'Fast and furious meets slow and calculated',
  ],
};

const VRF_COMMENTARY = {
  doubleHit: [
    'Both warriors land their moves! The crowd goes wild!',
    'Clean execution on both sides — the pools barely knew what hit them!',
    'Double hit! Both vaults rebalanced perfectly on-chain',
  ],
  doubleMiss: [
    'Complete whiff from both sides — the pools didn\'t even notice',
    'Double miss! The gas was paid but the yields weren\'t moved',
    'Both fumbled... awkward silence in the arena',
  ],
  hitConcentrate: [
    'Full send AND it landed?! Absolute degen perfection',
    'The concentrated bet paid off — surgical precision!',
  ],
  missConcentrate: [
    'Went all-in and missed — that\'s gotta sting',
    'Concentrated into the void. The yield gods show no mercy',
  ],
  hitHedge: [
    'Safety play pays off — the hedge connected perfectly',
    'Defense wins championships! Clean hedge execution',
  ],
  missFlash: [
    'Tried to flash but got flash-botted instead',
    'The speed play didn\'t land — timing is everything',
  ],
  hitFlash: [
    'Lightning reflexes! The flash move was pixel-perfect',
    'Timed it to the block — absolute sniper execution',
  ],
};

function getCycleCommentary(
  w1Move: string | null,
  w2Move: string | null,
  w1IsHit: boolean | null,
  w2IsHit: boolean | null,
  roundNumber: number,
  w1NftId: number,
  w2NftId: number,
): string {
  if (!w1Move || !w2Move) return '';

  // Use roundNumber as deterministic seed
  const pick = <T,>(arr: T[], offset = 0): T => arr[(roundNumber + offset) % arr.length];

  // Layer 1: Matchup commentary
  let matchup = '';
  if (w1Move === w2Move) {
    matchup = pick(MATCHUP_COMMENTARY.mirror);
  } else {
    const key1 = `${w1Move}_vs_${w2Move}`;
    const key2 = `${w2Move}_vs_${w1Move}`;
    const matchupLines = MATCHUP_COMMENTARY[key1] || MATCHUP_COMMENTARY[key2];
    if (matchupLines) {
      matchup = pick(matchupLines, 1);
    } else {
      // Fallback: pick from the more dramatic move's commentary
      const dramaticMove = ['CONCENTRATE', 'FLASH', 'COMPOSE'].includes(w1Move) ? w1Move : w2Move;
      matchup = pick(MOVE_COMMENTARY[dramaticMove] || MOVE_COMMENTARY.REBALANCE, 2);
    }
  }

  // Layer 2: VRF hit/miss flavor
  let vrfLine = '';
  if (w1IsHit !== null && w2IsHit !== null) {
    if (w1IsHit && w2IsHit) {
      vrfLine = pick(VRF_COMMENTARY.doubleHit, 3);
    } else if (!w1IsHit && !w2IsHit) {
      vrfLine = pick(VRF_COMMENTARY.doubleMiss, 3);
    } else {
      // One hit, one miss — comment on the specific moves
      const hitter = w1IsHit ? w1Move : w2Move;
      const hitterId = w1IsHit ? w1NftId : w2NftId;
      const misserId = w1IsHit ? w2NftId : w1NftId;

      if (hitter === 'CONCENTRATE') {
        vrfLine = `#${hitterId} ${pick(VRF_COMMENTARY.hitConcentrate, 4)}`;
      } else if (hitter === 'FLASH') {
        vrfLine = `#${hitterId} ${pick(VRF_COMMENTARY.hitFlash, 4)}`;
      } else if (hitter === 'HEDGE_UP') {
        vrfLine = `#${hitterId} ${pick(VRF_COMMENTARY.hitHedge, 4)}`;
      } else {
        vrfLine = `#${hitterId} lands clean while #${misserId} fumbles the execution!`;
      }

      // Add miss flavor for specific dramatic misses
      const misser = w1IsHit ? w2Move : w1Move;
      if (!vrfLine.includes('fumbles') && misser === 'CONCENTRATE') {
        vrfLine += ` Meanwhile #${misserId} — ${pick(VRF_COMMENTARY.missConcentrate, 5)}`;
      } else if (!vrfLine.includes('fumbles') && misser === 'FLASH') {
        vrfLine += ` Meanwhile #${misserId} — ${pick(VRF_COMMENTARY.missFlash, 5)}`;
      }
    }
  }

  return vrfLine ? `${matchup} ${vrfLine}` : matchup;
}

// ─── Helpers ──────────────────────────────────────────

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function safeBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try { return BigInt(value); }
  catch { return 0n; }
}

function HitMissBadge({ isHit }: { isHit: boolean | null }) {
  if (isHit === null || isHit === undefined) return null;
  return isHit ? (
    <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
      <Target className="w-3 h-3" /> HIT
    </span>
  ) : (
    <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
      <Shield className="w-3 h-3" /> MISS
    </span>
  );
}

function AllocationBar({ allocation }: { allocation: { highYield: number; stable: number; lp: number } | null }) {
  if (!allocation) return <div className="h-3 bg-white/5 rounded-full" />;
  const hy = allocation.highYield / 100;
  const st = allocation.stable / 100;
  const lp = allocation.lp / 100;
  return (
    <div className="flex h-3 rounded-full overflow-hidden gap-px">
      <div className={`${POOL_COLORS.highYield.bg}`} style={{ width: `${hy}%` }} title={`HY: ${hy.toFixed(1)}%`} />
      <div className={`${POOL_COLORS.stable.bg}`} style={{ width: `${st}%` }} title={`ST: ${st.toFixed(1)}%`} />
      <div className={`${POOL_COLORS.lp.bg}`} style={{ width: `${lp}%` }} title={`LP: ${lp.toFixed(1)}%`} />
    </div>
  );
}

function TraitBar({ label, value, maxValue = 10000 }: { label: string; value: number; maxValue?: number }) {
  const pct = (value / maxValue) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-24 font-mono">{label}</span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-12 text-right font-mono">{(value / 100).toFixed(0)}</span>
    </div>
  );
}

/** Score pill shown for each warrior in the scoreboard */
function ScoreBadge({ score, leading, color }: { score: number; leading: boolean; color: 'blue' | 'red' }) {
  const base = color === 'blue' ? 'from-blue-600 to-blue-500' : 'from-red-600 to-red-500';
  return (
    <motion.div
      key={`score-${score}`}
      initial={{ scale: 1.15, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`relative inline-flex items-center justify-center ${leading ? 'ring-2 ring-yellow-500/50' : ''}`}
    >
      <span className={`text-5xl font-bold bg-gradient-to-b ${base} bg-clip-text text-transparent`}>
        {score}
      </span>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────

export default function StrategyBattlePage() {
  const params = useParams();
  const battleId = params?.id as string;
  const { battle, loading, error, refresh } = useStrategyBattle(battleId);
  const { address } = useAccount();
  const onChainId = battle?.onChainBattleId ? parseInt(battle.onChainBattleId) : undefined;
  const { pool, userBet, placeBet, claimWinnings, isPlacingBet, isClaiming, betStage, error: betError } = useBattleBetting(battleId, undefined, onChainId);
  const { showMessage } = useWarriorMessage();
  const explorerUrl = getFlowExplorerUrl();
  const microMarketBattleId = battle?.onChainBattleId ? BigInt(battle.onChainBattleId) : null;
  const { markets: microMarkets, groupedMarkets } = useBattleMicroMarkets(microMarketBattleId);

  // Auto-execute cycles after battle creation
  const {
    phase: execPhase,
    currentCycle: execCycle,
    isExecuting: isAutoExecuting,
    error: execError,
    bettingTimeRemaining,
    startExecution,
  } = useAutoExecuteBattle(refresh);

  // Auto-start execution if this is a fresh battle (round 0, created < 2 min ago)
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (
      !autoStarted &&
      battle &&
      battle.status === 'active' &&
      battle.currentRound === 0 &&
      address &&
      (battle.warrior1?.owner?.toLowerCase() === address.toLowerCase() ||
       battle.warrior2?.owner?.toLowerCase() === address.toLowerCase())
    ) {
      const createdAt = new Date(battle.createdAt).getTime();
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      if (createdAt > thirtyMinutesAgo) {
        setAutoStarted(true);
        startExecution(battleId);
      }
    }
  }, [battle, address, battleId, autoStarted, startExecution]);

  const [betAmount, setBetAmount] = useState('1');
  const [betSide, setBetSide] = useState<'warrior1' | 'warrior2'>('warrior1');
  const [showTraits, setShowTraits] = useState(false);
  const [claimResult, setClaimResult] = useState<{ won: boolean; payout: string } | null>(null);
  const [expandedCycles, setExpandedCycles] = useState<Set<number>>(new Set());

  const toggleCycle = (roundNumber: number) => {
    setExpandedCycles((prev: Set<number>) => {
      const next = new Set(prev);
      if (next.has(roundNumber)) next.delete(roundNumber);
      else next.add(roundNumber);
      return next;
    });
  };

  // Auto-expand the latest cycle when cycles first load
  const [autoExpanded, setAutoExpanded] = useState(false);
  useEffect(() => {
    if (!autoExpanded && battle?.cycles && battle.cycles.length > 0) {
      const latest = battle.cycles[battle.cycles.length - 1];
      setExpandedCycles(new Set([latest.roundNumber]));
      setAutoExpanded(true);
    }
  }, [battle?.cycles, autoExpanded]);

  const handlePlaceBet = async () => {
    const success = await placeBet(betSide === 'warrior1', betAmount);
    if (success) {
      showMessage({
        id: 'bet_placed',
        text: pickRandom(WARRIOR_MESSAGES.ARENA.BETTING_PLACED),
        duration: 4000,
      });
    }
  };

  const handleClaimWinnings = async () => {
    const result = await claimWinnings();
    if (result) {
      setClaimResult(result);
      showMessage({
        id: 'winnings_claimed',
        text: result.won
          ? pickRandom(WARRIOR_MESSAGES.ARENA.WINNINGS_CLAIMED)
          : pickRandom(WARRIOR_MESSAGES.ARENA.BATTLE_LOST),
        duration: 5000,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <p className="text-sm text-gray-400 animate-pulse">Loading battle...</p>
        </div>
      </div>
    );
  }

  if (error || !battle) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-panel p-6 rounded-xl text-center">
          <p className="text-red-400">{error || 'Battle not found'}</p>
          <Link href="/arena" className="text-purple-400 hover:text-purple-300 text-sm mt-3 block">
            Back to Arena
          </Link>
        </div>
      </div>
    );
  }

  const isActive = battle.status === 'active';
  const isCompleted = battle.status === 'completed';
  const isCancelled = battle.status === 'cancelled';
  const w1Wins = isCompleted && battle.warrior1.score > battle.warrior2.score;
  const w2Wins = isCompleted && battle.warrior2.score > battle.warrior1.score;
  const isDraw = isCompleted && battle.warrior1.score === battle.warrior2.score;
  const w1Leading = battle.warrior1.score > battle.warrior2.score;
  const w2Leading = battle.warrior2.score > battle.warrior1.score;
  const canBet = (isActive || battle.status === 'pending') && battle.betting?.bettingOpen === true;

  // Determine bet outcome for completed battles
  const betOutcome = (() => {
    if (!isCompleted || !userBet) return null;
    if (claimResult) return claimResult;
    if (userBet.claimed && userBet.payout) {
      return {
        won: safeBigInt(userBet.payout) > safeBigInt(userBet.amount),
        payout: userBet.payout,
      };
    }
    return null;
  })();

  const traitKeys = Object.keys(TRAIT_MAP) as Array<keyof typeof TRAIT_MAP>;

  // Map strategy cycles to chart format
  const completedCycles = (battle.cycles ?? []).filter(c => c.roundWinner !== null);
  const chartRounds = completedCycles.map(c => ({
    roundNumber: c.roundNumber,
    w1Score: c.warrior1.score,
    w2Score: c.warrior2.score,
  } as PredictionRound));

  // Move stats
  const w1Moves = (battle.cycles ?? []).map(c => c.warrior1.defiMove).filter(Boolean) as string[];
  const w2Moves = (battle.cycles ?? []).map(c => c.warrior2.defiMove).filter(Boolean) as string[];
  const w1Hits = (battle.cycles ?? []).filter(c => c.w1IsHit === true).length;
  const w2Hits = (battle.cycles ?? []).filter(c => c.w2IsHit === true).length;

  if (isCancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-panel p-8 rounded-xl text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Battle Cancelled</h2>
          <p className="text-gray-400 mb-4">
            This battle has been cancelled. All stakes and bets have been refunded on-chain.
          </p>
          <Link href="/arena" className="text-purple-400 hover:text-purple-300 text-sm">
            Back to Arena
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="battlefield-bg w-full h-full" />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: 1 }} />
      </div>
      {/* Decorative gradient lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-600 to-transparent opacity-25" />
        <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-600 to-transparent opacity-20" />
      </div>

      <div className="relative z-10 p-4 md:p-8 max-w-6xl mx-auto space-y-5">
      {/* Back Navigation + Share */}
      <div className="flex items-center justify-between">
        <Link href="/arena" className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1">
          &larr; Back to Arena
        </Link>
        <BattleShareButton
          battleId={battle.id}
          question={`Strategy Duel: #${battle.warrior1.nftId} vs #${battle.warrior2.nftId}`}
          warrior1Score={battle.warrior1.score}
          warrior2Score={battle.warrior2.score}
          status={battle.status}
          battlePath="/arena/strategy/"
        />
      </div>

      {/* ═══ Auto-Execution Progress Banner ═══ */}
      {isAutoExecuting && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-4 rounded-xl border border-purple-500/30 bg-purple-900/20"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-purple-400 flex-shrink-0" />
            <div className="flex-1">
              {execPhase === 'betting-window' ? (
                <>
                  <p className="text-sm font-medium text-purple-300">Betting Window Open</p>
                  <p className="text-xs text-gray-400">Place your bets now! Cycle execution starts in {bettingTimeRemaining}s...</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-purple-300">Executing Cycle {execCycle}/5</p>
                  <p className="text-xs text-gray-400">0G AI inference + on-chain rebalance + VRF scoring...</p>
                </>
              )}
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(c => (
                <div
                  key={c}
                  className={`w-2 h-2 rounded-full ${
                    c < execCycle ? 'bg-green-400' :
                    c === execCycle ? 'bg-purple-400 animate-pulse' :
                    'bg-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
      {execPhase === 'done' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-4 rounded-xl border border-green-500/30 bg-green-900/20"
        >
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-green-400" />
            <p className="text-sm font-medium text-green-300">Battle Complete! All 5 cycles executed and settled on-chain.</p>
          </div>
        </motion.div>
      )}
      {execError && (
        <div className="glass-panel p-4 rounded-xl border border-red-500/30 bg-red-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{execError}</p>
            </div>
            {battle.currentRound < 5 && (
              <button
                onClick={() => startExecution(battleId, true)}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex-shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Start Battle fallback */}
      {isActive && battle.currentRound === 0 && !isAutoExecuting && execPhase !== 'done' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-5 rounded-xl border border-orange-500/30 bg-orange-900/10 text-center"
        >
          <Swords className="w-8 h-8 text-orange-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-orange-300 mb-1">
            {execPhase === 'error' ? 'Execution Failed' : 'Battle Ready'}
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            {execPhase === 'error'
              ? 'Auto-execution encountered an error. Click below to retry.'
              : 'Click below to begin the 5-cycle battle.'}
          </p>
          <button
            onClick={() => startExecution(battleId)}
            className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Start Battle
          </button>
        </motion.div>
      )}

      {/* ═══ Header ═══ */}
      <div className="glass-panel p-5 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Swords className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Strategy Arena</h1>
              <p className="text-xs text-gray-500">
                #{battle.warrior1.nftId} vs #{battle.warrior2.nftId} — {Math.round(Number(battle.stakes))} CRwN each
              </p>
              {battle.status === 'pending' && battle.scheduledStartAt && (
                <p className="text-xs text-blue-400/70 mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 inline" />
                  Starts {new Date(battle.scheduledStartAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {battle.status === 'pending' && (
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> PENDING
              </span>
            )}
            {isActive && (
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold flex items-center gap-1.5">
                <Radio className="w-3 h-3 animate-pulse" /> LIVE
              </span>
            )}
            {isCompleted && (
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-bold flex items-center gap-1.5">
                <Trophy className="w-3 h-3" /> SETTLED
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Countdown Timer ═══ */}
      <CycleCountdown
        nextCycleEstimate={battle.nextCycleEstimate}
        currentRound={battle.currentRound}
        totalRounds={5}
        isActive={isActive}
        status={battle.status}
      />

      {/* ═══ Warriors Scoreboard ═══ */}
      <div className="glass-panel p-5 rounded-xl">
        <div className="flex flex-col md:flex-row items-stretch justify-between gap-4">
          {/* Warrior 1 */}
          <div className={`flex-1 rounded-xl p-4 border transition-all ${
            w1Wins
              ? 'border-yellow-500/40 bg-yellow-500/5'
              : w1Leading
                ? 'border-blue-500/30 bg-blue-500/5'
                : 'border-white/5 bg-white/[0.02]'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all bg-gray-700 flex-shrink-0 ${
                w1Wins
                  ? 'border-yellow-500 shadow-lg shadow-yellow-500/25'
                  : w1Leading
                    ? 'border-blue-500 shadow-md shadow-blue-500/20'
                    : 'border-blue-500/40'
              }`}>
                <img
                  src={battle.warrior1.imageUrl}
                  alt={`Warrior #${battle.warrior1.nftId}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/lazered.png'; }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-blue-400 font-bold text-sm">#{battle.warrior1.nftId}</p>
                <p className="text-xs text-gray-500 truncate">{shortenAddress(battle.warrior1.owner)}</p>
                <p className="text-xs text-purple-400/80 font-medium">{battle.warrior1.strategyProfile}</p>
              </div>
              {w1Wins && <Trophy className="w-5 h-5 text-yellow-400 ml-auto flex-shrink-0" />}
            </div>

            {/* Score */}
            <div className="text-center mb-3">
              <ScoreBadge score={battle.warrior1.score} leading={w1Leading} color="blue" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-xs text-gray-500">Yield</p>
                <p className={`text-sm font-mono font-medium ${
                  (isNaN(Number(battle.warrior1.totalYieldFormatted)) ? 0 : Number(battle.warrior1.totalYieldFormatted)) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {(() => { const v = isNaN(Number(battle.warrior1.totalYieldFormatted)) ? 0 : Number(battle.warrior1.totalYieldFormatted); return `${v >= 0 ? '+' : ''}${v.toFixed(0)}`; })()}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-xs text-gray-500">Hits</p>
                <p className="text-sm font-mono font-medium text-emerald-400">
                  {w1Hits}/{battle.cycles?.length || 0}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-xs text-gray-500">Odds</p>
                <p className="text-sm font-mono font-medium text-gray-300">
                  {pool ? formatOdds(pool.warrior1Odds) : '—'}
                </p>
              </div>
            </div>

            {/* Move history pills */}
            {w1Moves.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {w1Moves.map((move, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 text-xs font-mono rounded border ${MOVE_COLORS[move] || MOVE_COLORS.HOLD}`}
                    title={`Cycle ${i + 1}: ${move}`}
                  >
                    {MOVE_ICONS[move] || '•'} {move}
                  </span>
                ))}
              </div>
            )}

            {/* Allocation */}
            {battle.warrior1.currentAllocation && (
              <div className="mt-3">
                <AllocationBar allocation={battle.warrior1.currentAllocation} />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>HY {(battle.warrior1.currentAllocation.highYield / 100).toFixed(0)}%</span>
                  <span>ST {(battle.warrior1.currentAllocation.stable / 100).toFixed(0)}%</span>
                  <span>LP {(battle.warrior1.currentAllocation.lp / 100).toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>

          {/* VS Divider */}
          <div className="flex items-center justify-center md:py-0 py-2">
            <div className="w-14 h-14 bg-gray-800/80 rounded-full flex items-center justify-center border border-gray-700 shadow-lg">
              <span className="text-lg font-bold text-gray-500">VS</span>
            </div>
          </div>

          {/* Warrior 2 */}
          <div className={`flex-1 rounded-xl p-4 border transition-all ${
            w2Wins
              ? 'border-yellow-500/40 bg-yellow-500/5'
              : w2Leading
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-white/5 bg-white/[0.02]'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all bg-gray-700 flex-shrink-0 ${
                w2Wins
                  ? 'border-yellow-500 shadow-lg shadow-yellow-500/25'
                  : w2Leading
                    ? 'border-red-500 shadow-md shadow-red-500/20'
                    : 'border-red-500/40'
              }`}>
                <img
                  src={battle.warrior2.imageUrl}
                  alt={`Warrior #${battle.warrior2.nftId}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/lazered.png'; }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-red-400 font-bold text-sm">#{battle.warrior2.nftId}</p>
                <p className="text-xs text-gray-500 truncate">{shortenAddress(battle.warrior2.owner)}</p>
                <p className="text-xs text-purple-400/80 font-medium">{battle.warrior2.strategyProfile}</p>
              </div>
              {w2Wins && <Trophy className="w-5 h-5 text-yellow-400 ml-auto flex-shrink-0" />}
            </div>

            {/* Score */}
            <div className="text-center mb-3">
              <ScoreBadge score={battle.warrior2.score} leading={w2Leading} color="red" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-xs text-gray-500">Yield</p>
                <p className={`text-sm font-mono font-medium ${
                  (isNaN(Number(battle.warrior2.totalYieldFormatted)) ? 0 : Number(battle.warrior2.totalYieldFormatted)) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {(() => { const v = isNaN(Number(battle.warrior2.totalYieldFormatted)) ? 0 : Number(battle.warrior2.totalYieldFormatted); return `${v >= 0 ? '+' : ''}${v.toFixed(0)}`; })()}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-xs text-gray-500">Hits</p>
                <p className="text-sm font-mono font-medium text-emerald-400">
                  {w2Hits}/{battle.cycles?.length || 0}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <p className="text-xs text-gray-500">Odds</p>
                <p className="text-sm font-mono font-medium text-gray-300">
                  {pool ? formatOdds(pool.warrior2Odds) : '—'}
                </p>
              </div>
            </div>

            {/* Move history pills */}
            {w2Moves.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {w2Moves.map((move, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 text-xs font-mono rounded border ${MOVE_COLORS[move] || MOVE_COLORS.HOLD}`}
                    title={`Cycle ${i + 1}: ${move}`}
                  >
                    {MOVE_ICONS[move] || '•'} {move}
                  </span>
                ))}
              </div>
            )}

            {/* Allocation */}
            {battle.warrior2.currentAllocation && (
              <div className="mt-3">
                <AllocationBar allocation={battle.warrior2.currentAllocation} />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>HY {(battle.warrior2.currentAllocation.highYield / 100).toFixed(0)}%</span>
                  <span>ST {(battle.warrior2.currentAllocation.stable / 100).toFixed(0)}%</span>
                  <span>LP {(battle.warrior2.currentAllocation.lp / 100).toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Score comparison bar */}
        {(battle.warrior1.score + battle.warrior2.score) > 0 && (
          <div className="mt-4 px-1">
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div
                className="bg-blue-500 rounded-l-full transition-all duration-700"
                style={{ width: `${(battle.warrior1.score / (battle.warrior1.score + battle.warrior2.score)) * 100}%` }}
              />
              <div
                className="bg-red-500 rounded-r-full transition-all duration-700"
                style={{ width: `${(battle.warrior2.score / (battle.warrior1.score + battle.warrior2.score)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1 font-mono">
              <span className="text-blue-400/70">#{battle.warrior1.nftId}</span>
              <span className="text-gray-600">
                {battle.warrior1.score} — {battle.warrior2.score}
              </span>
              <span className="text-red-400/70">#{battle.warrior2.nftId}</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Score Progression Chart ═══ */}
      {chartRounds.length > 0 && (
        <ScoreProgressionChart
          rounds={chartRounds}
          warrior1Score={battle.warrior1.score}
          warrior2Score={battle.warrior2.score}
        />
      )}

      {/* ═══ Betting Panel ═══ */}
      {canBet && (
        <div className="glass-panel p-5 rounded-xl border-purple-500/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-400" />
                Place Your Bet
              </h3>
              <p className="text-sm text-gray-400">Betting closes when battle starts</p>
            </div>
            {pool && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Total Pool</p>
                <p className="text-lg font-bold text-purple-400">
                  {Math.round(Number(formatEther(BigInt(pool.totalPool || '0'))))} CRwN
                </p>
              </div>
            )}
          </div>

          {userBet ? (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
              <p className="text-gray-400 text-sm">Your Bet</p>
              <p className="text-white font-bold">
                {Math.round(Number(formatEther(BigInt(userBet.amount))))} CRwN on {userBet.betOnWarrior1 ? `#${battle.warrior1.nftId}` : `#${battle.warrior2.nftId}`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setBetSide('warrior1')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    betSide === 'warrior1'
                      ? 'border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/10'
                      : 'border-gray-700 bg-white/[0.02] hover:border-gray-600'
                  }`}
                >
                  <p className="text-blue-400 font-bold">#{battle.warrior1.nftId}</p>
                  {pool && (
                    <p className="text-xs text-gray-400 mt-1">
                      {formatMultiplier(true, pool)} potential
                    </p>
                  )}
                </button>
                <button
                  onClick={() => setBetSide('warrior2')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    betSide === 'warrior2'
                      ? 'border-red-500 bg-red-500/10 shadow-md shadow-red-500/10'
                      : 'border-gray-700 bg-white/[0.02] hover:border-gray-600'
                  }`}
                >
                  <p className="text-red-400 font-bold">#{battle.warrior2.nftId}</p>
                  {pool && (
                    <p className="text-xs text-gray-400 mt-1">
                      {formatMultiplier(false, pool)} potential
                    </p>
                  )}
                </button>
              </div>

              <div className="flex gap-3">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  min="1"
                  step="1"
                  className="flex-1 bg-white/5 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all"
                  placeholder="Amount in CRwN (whole number)"
                />
                <button
                  onClick={handlePlaceBet}
                  disabled={isPlacingBet || !betAmount || isNaN(Number(betAmount)) || Number(betAmount) <= 0 || !address}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-white hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
                >
                  {betStage === 'checking' ? 'Checking balance...'
                    : betStage === 'confirming' ? 'Confirm in wallet...'
                    : betStage === 'recording' ? 'Recording bet...'
                    : 'Place Bet'}
                </button>
              </div>
              {!address && (
                <p className="text-xs text-yellow-400/80">Connect wallet to place a bet</p>
              )}
              {betError && (
                <p className="text-xs text-red-400">{betError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Betting Pool (closed) ═══ */}
      {!canBet && pool && (
        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Betting Pool
            </h3>
            {isActive && (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
                BETS CLOSED
              </span>
            )}
          </div>
          {/* Pool bar visualization */}
          <div className="mb-3">
            {(() => {
              const w1Total = Number(formatEther(BigInt(pool.totalWarrior1Bets || '0')));
              const w2Total = Number(formatEther(BigInt(pool.totalWarrior2Bets || '0')));
              const total = w1Total + w2Total;
              const w1Pct = total > 0 ? (w1Total / total) * 100 : 50;
              const w2Pct = total > 0 ? (w2Total / total) * 100 : 50;
              return (
                <div className="space-y-2">
                  <div className="flex h-3 rounded-full overflow-hidden gap-px">
                    <div className="bg-blue-500 rounded-l-full transition-all" style={{ width: `${w1Pct}%` }} />
                    <div className="bg-red-500 rounded-r-full transition-all" style={{ width: `${w2Pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-blue-400 font-mono">#{battle.warrior1.nftId}: {Math.round(w1Total)} CRwN</span>
                    <span className="text-gray-500">{pool.totalBettors} bettors</span>
                    <span className="text-red-400 font-mono">#{battle.warrior2.nftId}: {Math.round(w2Total)} CRwN</span>
                  </div>
                </div>
              );
            })()}
          </div>
          {userBet && (
            <div className="pt-3 border-t border-white/5 text-center">
              <p className="text-xs text-gray-500">Your Bet</p>
              <p className="text-sm text-white font-medium">
                {Math.round(Number(formatEther(BigInt(userBet.amount))))} CRwN on {userBet.betOnWarrior1 ? `#${battle.warrior1.nftId}` : `#${battle.warrior2.nftId}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ Collapsible Traits ═══ */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <button
          onClick={() => setShowTraits(!showTraits)}
          aria-expanded={showTraits}
          className="w-full p-4 flex items-center justify-between text-white hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-bold flex items-center gap-2">
            {showTraits ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
            Warrior Traits
          </span>
          {showTraits ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        <AnimatePresence>
          {showTraits && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 pt-0">
                {[battle.warrior1, battle.warrior2].map((warrior) => (
                  <div key={warrior.nftId}>
                    <p className="text-xs text-gray-400 mb-2">#{warrior.nftId} — {warrior.strategyProfile}</p>
                    {warrior.traits && (
                      <div className="space-y-1.5">
                        {traitKeys.map((key) => (
                          <TraitBar
                            key={key}
                            label={TRAIT_MAP[key].display}
                            value={warrior.traits![key as keyof typeof warrior.traits]}
                          />
                        ))}
                      </div>
                    )}
                    {warrior.currentAllocation && (
                      <div className="mt-3">
                        <div className="text-xs text-gray-400 mb-1">Allocation</div>
                        <AllocationBar allocation={warrior.currentAllocation} />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>HY: {(warrior.currentAllocation.highYield / 100).toFixed(1)}%</span>
                          <span>ST: {(warrior.currentAllocation.stable / 100).toFixed(1)}%</span>
                          <span>LP: {(warrior.currentAllocation.lp / 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ Cycle Timeline ═══ */}
      <div className="glass-panel p-5 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Cycle Timeline</h3>
          {(battle.cycles ?? []).length > 0 && (
            <span className="text-xs text-gray-500 font-mono">
              {(battle.cycles ?? []).length} / 5 cycles
            </span>
          )}
        </div>

        {(battle.cycles ?? []).length === 0 ? (
          <div className="text-center py-8">
            <Radio className="w-8 h-8 text-gray-600 mx-auto mb-2 animate-pulse" />
            <p className="text-sm text-gray-500">Waiting for first cycle to execute...</p>
            <p className="text-xs text-gray-600 mt-1">Cycles run automatically every ~60 seconds</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {(battle.cycles ?? []).map((cycle, idx) => {
                const isExpanded = expandedCycles.has(cycle.roundNumber);
                const isLatest = idx === (battle.cycles ?? []).length - 1;
                const w1Won = cycle.roundWinner === 'warrior1';
                const w2Won = cycle.roundWinner === 'warrior2';

                return (
                  <motion.div
                    key={cycle.roundNumber}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    className={`rounded-lg border overflow-hidden transition-all ${
                      isLatest && isActive
                        ? 'border-purple-500/30 bg-purple-500/[0.03]'
                        : 'border-white/5 bg-white/[0.02]'
                    }`}
                  >
                    {/* Cycle header — always visible, clickable */}
                    <button
                      onClick={() => toggleCycle(cycle.roundNumber)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Cycle number badge */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          w1Won
                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                            : w2Won
                              ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                              : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {cycle.roundNumber}
                        </div>

                        {/* Moves summary */}
                        <div className="flex items-center gap-2 text-xs">
                          {cycle.warrior1.defiMove && (
                            <span className={`px-2 py-0.5 rounded border font-mono ${MOVE_COLORS[cycle.warrior1.defiMove] || MOVE_COLORS.HOLD}`}>
                              {MOVE_ICONS[cycle.warrior1.defiMove] || '•'} {cycle.warrior1.defiMove}
                            </span>
                          )}
                          <span className="text-gray-600">vs</span>
                          {cycle.warrior2.defiMove && (
                            <span className={`px-2 py-0.5 rounded border font-mono ${MOVE_COLORS[cycle.warrior2.defiMove] || MOVE_COLORS.HOLD}`}>
                              {MOVE_ICONS[cycle.warrior2.defiMove] || '•'} {cycle.warrior2.defiMove}
                            </span>
                          )}
                        </div>

                        {/* VRF badges */}
                        <div className="hidden sm:flex items-center gap-1">
                          <HitMissBadge isHit={cycle.w1IsHit} />
                          <HitMissBadge isHit={cycle.w2IsHit} />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Winner badge */}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          w1Won
                            ? 'bg-blue-500/20 text-blue-400'
                            : w2Won
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {w1Won
                            ? `#${battle.warrior1.nftId}`
                            : w2Won
                              ? `#${battle.warrior2.nftId}`
                              : 'Draw'}
                        </span>

                        {/* Score */}
                        <span className="text-xs font-mono text-gray-400">
                          {cycle.warrior1.score}-{cycle.warrior2.score}
                        </span>

                        {/* Expand icon */}
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-500" />
                          : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </div>
                    </button>

                    {/* Commentary line */}
                    {(() => {
                      const commentary = getCycleCommentary(
                        cycle.warrior1.defiMove,
                        cycle.warrior2.defiMove,
                        cycle.w1IsHit,
                        cycle.w2IsHit,
                        cycle.roundNumber,
                        battle.warrior1.nftId,
                        battle.warrior2.nftId,
                      );
                      return commentary ? (
                        <div className="px-4 pb-2 -mt-1">
                          <p className="text-xs italic text-gray-500 leading-relaxed">
                            &ldquo;{commentary}&rdquo;
                          </p>
                        </div>
                      ) : null;
                    })()}

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
                            {/* Timestamp */}
                            {cycle.startedAt && (
                              <p className="text-xs text-gray-600">
                                Executed at {new Date(cycle.startedAt).toLocaleTimeString('en-US', {
                                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                                })}
                              </p>
                            )}

                            {/* Two-col warrior details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {[cycle.warrior1, cycle.warrior2].map((w, wIdx) => {
                                const nftId = wIdx === 0 ? battle.warrior1.nftId : battle.warrior2.nftId;
                                const isHit = wIdx === 0 ? cycle.w1IsHit : cycle.w2IsHit;
                                const isWinner = (wIdx === 0 && w1Won) || (wIdx === 1 && w2Won);
                                return (
                                  <div key={`${cycle.roundNumber}-w${nftId}`} className={`p-3 rounded-lg border ${
                                    isWinner ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02]'
                                  }`}>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-bold text-gray-300">#{nftId}</span>
                                      <div className="flex items-center gap-1.5">
                                        {w.defiMove && (
                                          <span className={`px-2 py-0.5 text-xs font-mono rounded border ${MOVE_COLORS[w.defiMove] || MOVE_COLORS.HOLD}`}>
                                            {w.defiMove}
                                          </span>
                                        )}
                                        <HitMissBadge isHit={isHit} />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div>
                                        <span className="text-gray-500">Score</span>
                                        <p className="text-white font-mono font-medium">{w.score}</p>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Yield</span>
                                        <p className={`font-mono font-medium ${Number(w.yieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                          {Number(w.yieldFormatted) >= 0 ? '+' : ''}{Number(w.yieldFormatted).toFixed(0)}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Allocation change */}
                                    {w.allocationBefore && w.allocationAfter && (
                                      <div className="mt-2 space-y-1">
                                        <div className="text-xs text-gray-500">Allocation shift</div>
                                        <div className="flex items-center gap-1.5">
                                          <div className="flex-1">
                                            <AllocationBar allocation={w.allocationBefore} />
                                          </div>
                                          <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                                          <div className="flex-1">
                                            <AllocationBar allocation={w.allocationAfter} />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Tx hash */}
                                    {w.txHash && (
                                      <a
                                        href={`${explorerUrl}/tx/${w.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-2"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        View on-chain tx
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Pool APYs */}
                            {cycle.poolAPYs && (
                              <div className="flex gap-3 text-xs text-gray-600">
                                <span>Pool APYs:</span>
                                <span className="text-orange-400/70">HY {(cycle.poolAPYs.highYield / 100).toFixed(1)}%</span>
                                <span className="text-green-400/70">ST {(cycle.poolAPYs.stable / 100).toFixed(1)}%</span>
                                <span className="text-blue-400/70">LP {(cycle.poolAPYs.lp / 100).toFixed(1)}%</span>
                              </div>
                            )}

                            {/* Judge Reasoning */}
                            {cycle.judgeReasoning && (
                              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1 font-bold">Judge&apos;s Analysis</p>
                                <p className="text-xs text-gray-300 leading-relaxed">{cycle.judgeReasoning}</p>
                              </div>
                            )}

                            {/* VRF Seeds */}
                            {(cycle.w1VrfSeed || cycle.w2VrfSeed) && (
                              <div className="text-xs">
                                <p className="text-gray-600 mb-1 flex items-center gap-1">
                                  <Zap className="w-3 h-3" /> VRF Seeds (on-chain verifiable)
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-gray-600">
                                  {cycle.w1VrfSeed && (
                                    <div className="truncate bg-white/[0.02] px-2 py-1 rounded" title={cycle.w1VrfSeed}>
                                      #{battle.warrior1.nftId}: {cycle.w1VrfSeed.slice(0, 10)}...{cycle.w1VrfSeed.slice(-6)}
                                    </div>
                                  )}
                                  {cycle.w2VrfSeed && (
                                    <div className="truncate bg-white/[0.02] px-2 py-1 rounded" title={cycle.w2VrfSeed}>
                                      #{battle.warrior2.nftId}: {cycle.w2VrfSeed.slice(0, 10)}...{cycle.w2VrfSeed.slice(-6)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Pending cycles placeholders */}
            {isActive && (battle.cycles ?? []).length < 5 && (
              <div className="flex gap-2 mt-2">
                {Array.from({ length: 5 - (battle.cycles ?? []).length }).map((_, i) => (
                  <div
                    key={`pending-${i}`}
                    className="flex-1 h-10 rounded-lg border border-dashed border-white/10 flex items-center justify-center"
                  >
                    <span className="text-xs text-gray-600 font-mono">
                      C{(battle.cycles ?? []).length + i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Micro-Markets (Per-Cycle Betting) ═══ */}
      {microMarkets && microMarkets.length > 0 && (
        <div className="glass-panel p-5 rounded-xl">
          <h3 className="text-lg font-bold text-white mb-4">Cycle Micro-Markets</h3>
          <p className="text-sm text-gray-400 mb-3">
            Bet on individual cycle outcomes — who earns more yield, which move will be used, and more.
          </p>
          <MicroMarketGrid
            markets={microMarkets}
            groupedMarkets={groupedMarkets}
          />
        </div>
      )}

      {/* ═══ Score Breakdown (Phase 5) ═══ */}
      {(battle?.cycles ?? []).length > 0 && (
        <div className="glass-panel p-5 rounded-xl">
          <h3 className="text-lg font-bold text-white mb-4">Score Breakdown</h3>
          <div className="space-y-3">
            {(battle?.cycles ?? []).map((cycle) => {
              const safeParse = (s: string | null | undefined) => {
                if (!s) return null;
                try { return JSON.parse(s); } catch { return null; }
              };
              const w1Breakdown = safeParse(cycle.w1ScoreBreakdown);
              const w2Breakdown = safeParse(cycle.w2ScoreBreakdown);
              if (!w1Breakdown && !w2Breakdown) return null;
              return (
                <div key={`breakdown-${cycle.roundNumber}`} className="bg-gray-800/50 p-3 rounded-lg">
                  <div className="text-xs text-gray-400 mb-2 font-mono">Cycle {cycle.roundNumber}</div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'W1', bd: w1Breakdown, color: 'blue' },
                      { label: 'W2', bd: w2Breakdown, color: 'red' },
                    ].map(({ label, bd, color }) => bd && (
                      <div key={label} className="space-y-1">
                        <div className="text-xs font-bold text-gray-300">{label}</div>
                        {[
                          { name: 'Yield', value: bd.yieldComponent, max: 600, col: 'bg-green-500' },
                          { name: 'AI Quality', value: bd.aiQualityComponent, max: 200, col: 'bg-purple-500' },
                          { name: 'Trait Bonus', value: bd.traitBonusComponent, max: 100, col: 'bg-yellow-500' },
                          { name: 'Move Counter', value: bd.moveCounterComponent, max: 100, col: 'bg-cyan-500' },
                        ].map(({ name, value, max, col }) => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-16 truncate">{name}</span>
                            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${col} rounded-full`}
                                style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 w-8 text-right">{value}</span>
                          </div>
                        ))}
                        {bd.vrfModifier < 1 && (
                          <div className="text-[10px] text-red-400">VRF Miss ({bd.vrfModifier}x)</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Battle Complete + Claim Winnings ═══ */}
      {isCompleted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 rounded-xl bg-gradient-to-r from-purple-900/20 to-pink-900/20 border-yellow-500/20"
        >
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-yellow-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {w1Wins
                ? `Warrior #${battle.warrior1.nftId} Wins!`
                : w2Wins
                ? `Warrior #${battle.warrior2.nftId} Wins!`
                : 'Draw - Stakes Split!'}
            </h3>
            <p className="text-gray-400 text-lg font-mono">
              {battle.warrior1.score} — {battle.warrior2.score}
            </p>
            {isDraw && (
              <span className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                DRAW
              </span>
            )}
            {/* ELO ratings at battle start */}
            {(battle.warrior1.ratingAtStart || battle.warrior2.ratingAtStart) && (
              <div className="flex items-center justify-center gap-4 mt-3">
                <div className="text-center">
                  <p className="text-xs text-gray-600">#{battle.warrior1.nftId} ELO</p>
                  <p className="text-sm font-mono text-blue-400/80">{battle.warrior1.ratingAtStart ?? '—'}</p>
                </div>
                <div className="text-xs text-gray-600 font-bold">vs</div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">#{battle.warrior2.nftId} ELO</p>
                  <p className="text-sm font-mono text-red-400/80">{battle.warrior2.ratingAtStart ?? '—'}</p>
                </div>
              </div>
            )}
            {battle.completedAt && (
              <p className="text-gray-600 text-xs mt-2">
                Completed {new Date(battle.completedAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
            {userBet && !userBet.claimed && (
              <button
                onClick={handleClaimWinnings}
                disabled={isClaiming}
                className="mt-5 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/20"
              >
                {isClaiming ? 'Claiming...' : 'Claim Winnings'}
              </button>
            )}
            {userBet?.claimed && betOutcome && (
              <div className="mt-4 space-y-2">
                <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold ${
                  betOutcome.won
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : safeBigInt(betOutcome.payout) === 0n
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                }`}>
                  {betOutcome.won ? 'YOU WON' : safeBigInt(betOutcome.payout) === 0n ? 'YOU LOST' : 'DRAW'}
                </span>
                {betOutcome.won && betOutcome.payout == null ? (
                  <p className="text-emerald-400 text-sm">Claimed on-chain</p>
                ) : betOutcome.won ? (
                  <p className="text-emerald-400 text-sm">
                    Payout: {Math.round(Number(formatEther(safeBigInt(betOutcome.payout))))} CRwN
                  </p>
                ) : !betOutcome.won && betOutcome.payout == null ? (
                  <p className="text-red-400 text-sm">Your bet did not win</p>
                ) : safeBigInt(betOutcome.payout) === 0n ? (
                  <p className="text-red-400 text-sm">Your bet did not win</p>
                ) : (
                  <p className="text-gray-400 text-sm">
                    Refunded: {Math.round(Number(formatEther(safeBigInt(betOutcome.payout))))} CRwN (minus fee)
                  </p>
                )}
              </div>
            )}
            {userBet?.claimed && !betOutcome && (
              <p className="mt-3 text-emerald-400 text-sm">Winnings claimed</p>
            )}
          </div>
        </motion.div>
      )}
      </div>
    </div>
  );
}
