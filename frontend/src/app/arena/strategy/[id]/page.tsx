'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { useStrategyBattle } from '@/hooks/arena/useStrategyBattle';
import { useBattleBetting, formatOdds, formatMultiplier } from '@/hooks/arena';
import { useWarriorMessage } from '@/contexts/WarriorMessageContext';
import { WARRIOR_MESSAGES } from '@/utils/warriorMessages';
import { TRAIT_MAP } from '@/constants/defiTraitMapping';
import { getFlowExplorerUrl } from '@/constants';
import { PredictionRound } from '@/types/predictionArena';
import BattleShareButton from '@/components/arena/BattleShareButton';
import ScoreProgressionChart from '@/components/arena/ScoreProgressionChart';
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
  Clock,
  Radio,
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

const POOL_COLORS = {
  highYield: { bg: 'bg-orange-500', label: 'High Yield' },
  stable: { bg: 'bg-green-500', label: 'Stable' },
  lp: { bg: 'bg-blue-500', label: 'LP' },
};

// ─── Helpers ──────────────────────────────────────────

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return '';
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return '';
  const diff = time - Date.now();
  if (diff <= 0) return 'soon';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

function safeBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try { return BigInt(value); }
  catch { return 0n; }
}

function HitMissBadge({ isHit }: { isHit: boolean | null }) {
  if (isHit === null || isHit === undefined) return null;
  return isHit ? (
    <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
      <Zap className="w-3 h-3" /> HIT
    </span>
  ) : (
    <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
      <Zap className="w-3 h-3" /> MISS
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

// ─── Page ─────────────────────────────────────────────

export default function StrategyBattlePage() {
  const params = useParams();
  const battleId = params?.id as string;
  const { battle, loading, error } = useStrategyBattle(battleId);
  const { address } = useAccount();
  const { pool, userBet, placeBet, claimWinnings, isPlacingBet, isClaiming, error: betError } = useBattleBetting(battleId);
  const { showMessage } = useWarriorMessage();
  const explorerUrl = getFlowExplorerUrl();

  const [betAmount, setBetAmount] = useState('1');
  const [betSide, setBetSide] = useState<'warrior1' | 'warrior2'>('warrior1');
  const [showTraits, setShowTraits] = useState(false);
  const [claimResult, setClaimResult] = useState<{ won: boolean; payout: string } | null>(null);

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
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
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
  const w1Wins = isCompleted && battle.warrior1.score > battle.warrior2.score;
  const w2Wins = isCompleted && battle.warrior2.score > battle.warrior1.score;
  const canBet = (isActive || battle.status === 'pending') && battle.currentRound === 0 && battle.betting?.bettingOpen !== false;

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

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Back Navigation + Share */}
      <div className="flex items-center justify-between">
        <Link href="/arena" className="text-gray-400 hover:text-white transition-colors text-sm">
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

      {/* Header */}
      <div className="glass-panel p-6 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Swords className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-white">Strategy Arena</h1>
          </div>
          <div className="flex items-center gap-3">
            {isActive && (
              <>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm flex items-center gap-1 animate-pulse">
                  <Radio className="w-3 h-3" /> Cycle {battle.currentRound}/5
                </span>
                {battle.nextCycleEstimate && battle.currentRound < 5 && (
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Next in {formatTimeRemaining(battle.nextCycleEstimate)}
                  </span>
                )}
              </>
            )}
            {isCompleted && (
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Settled
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-400">
          #{battle.warrior1.nftId} vs #{battle.warrior2.nftId} — Stake: {battle.stakes} CRwN each
        </p>

        {/* Automated Spectator Banner */}
        {isActive && (
          <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-3">
            <Radio className="w-4 h-4 text-purple-400 animate-pulse flex-shrink-0" />
            <div className="text-sm">
              <span className="text-purple-300 font-medium">Automated Battle in Progress</span>
              <span className="text-gray-400 ml-2">
                Cycles execute every ~1 min — Betting {battle.betting?.bettingOpen === false ? 'closed' : 'open until battle starts'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Warriors Scoreboard */}
      <div className="glass-panel p-6 rounded-xl">
        <div className="flex flex-col md:flex-row items-center justify-between">
          {/* Warrior 1 */}
          <div className="flex-1 text-center">
            <div className={`w-24 h-24 mx-auto rounded-full overflow-hidden flex items-center justify-center border-4 transition-all bg-gray-700 ${
              w1Wins
                ? 'border-yellow-500 shadow-lg shadow-yellow-500/25'
                : battle.warrior1.score > battle.warrior2.score
                  ? 'border-blue-500 shadow-lg shadow-blue-500/25'
                  : 'border-blue-500/50'
            }`}>
              <img
                src={battle.warrior1.imageUrl}
                alt={`Warrior #${battle.warrior1.nftId}`}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).src = '/lazered.png'; }}
              />
            </div>
            <p className="text-blue-400 font-bold text-lg mt-3">#{battle.warrior1.nftId}</p>
            <p className="text-xs text-gray-400">{shortenAddress(battle.warrior1.owner)}</p>
            <p className="text-xs text-purple-400 font-medium mt-1">{battle.warrior1.strategyProfile}</p>
            <motion.p
              key={`w1score-${battle.warrior1.score}`}
              initial={{ scale: 1.3, color: '#a78bfa' }}
              animate={{ scale: 1, color: '#ffffff' }}
              transition={{ duration: 0.5 }}
              className="text-5xl font-bold mt-2"
            >
              {battle.warrior1.score}
            </motion.p>
            {pool && (
              <p className="text-sm text-gray-400 mt-1">
                {formatOdds(pool.warrior1Odds)} odds
              </p>
            )}
            {/* Yield */}
            <div className={`text-sm font-mono mt-1 flex items-center justify-center gap-1 ${
              Number(battle.warrior1.totalYieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {Number(battle.warrior1.totalYieldFormatted) >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Number(battle.warrior1.totalYieldFormatted).toFixed(4)} CRwN
            </div>
            {/* Allocation */}
            {battle.warrior1.currentAllocation && (
              <div className="mt-2 mx-auto max-w-[160px]">
                <AllocationBar allocation={battle.warrior1.currentAllocation} />
              </div>
            )}
            {w1Wins && <Trophy className="w-6 h-6 text-yellow-400 mx-auto mt-2" />}
          </div>

          {/* VS Divider */}
          <div className="py-4 md:py-0 md:px-6">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-800 rounded-full flex items-center justify-center border-2 border-gray-600">
              <span className="text-xl md:text-2xl font-bold text-gray-400">VS</span>
            </div>
          </div>

          {/* Warrior 2 */}
          <div className="flex-1 text-center">
            <div className={`w-24 h-24 mx-auto rounded-full overflow-hidden flex items-center justify-center border-4 transition-all bg-gray-700 ${
              w2Wins
                ? 'border-yellow-500 shadow-lg shadow-yellow-500/25'
                : battle.warrior2.score > battle.warrior1.score
                  ? 'border-red-500 shadow-lg shadow-red-500/25'
                  : 'border-red-500/50'
            }`}>
              <img
                src={battle.warrior2.imageUrl}
                alt={`Warrior #${battle.warrior2.nftId}`}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).src = '/lazered.png'; }}
              />
            </div>
            <p className="text-red-400 font-bold text-lg mt-3">#{battle.warrior2.nftId}</p>
            <p className="text-xs text-gray-400">{shortenAddress(battle.warrior2.owner)}</p>
            <p className="text-xs text-purple-400 font-medium mt-1">{battle.warrior2.strategyProfile}</p>
            <motion.p
              key={`w2score-${battle.warrior2.score}`}
              initial={{ scale: 1.3, color: '#a78bfa' }}
              animate={{ scale: 1, color: '#ffffff' }}
              transition={{ duration: 0.5 }}
              className="text-5xl font-bold mt-2"
            >
              {battle.warrior2.score}
            </motion.p>
            {pool && (
              <p className="text-sm text-gray-400 mt-1">
                {formatOdds(pool.warrior2Odds)} odds
              </p>
            )}
            {/* Yield */}
            <div className={`text-sm font-mono mt-1 flex items-center justify-center gap-1 ${
              Number(battle.warrior2.totalYieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {Number(battle.warrior2.totalYieldFormatted) >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Number(battle.warrior2.totalYieldFormatted).toFixed(4)} CRwN
            </div>
            {/* Allocation */}
            {battle.warrior2.currentAllocation && (
              <div className="mt-2 mx-auto max-w-[160px]">
                <AllocationBar allocation={battle.warrior2.currentAllocation} />
              </div>
            )}
            {w2Wins && <Trophy className="w-6 h-6 text-yellow-400 mx-auto mt-2" />}
          </div>
        </div>
      </div>

      {/* Score Progression Chart */}
      {chartRounds.length > 0 && (
        <ScoreProgressionChart
          rounds={chartRounds}
          warrior1Score={battle.warrior1.score}
          warrior2Score={battle.warrior2.score}
        />
      )}

      {/* Collapsible Traits Panel */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <button
          onClick={() => setShowTraits(!showTraits)}
          aria-expanded={showTraits}
          className="w-full p-4 flex items-center justify-between text-white hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-bold">Warrior Traits</span>
          {showTraits ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showTraits && (
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
        )}
      </div>

      {/* Betting Panel */}
      {canBet && (
        <div className="glass-panel p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-white">Place Your Bet</h3>
              <p className="text-sm text-gray-400">Betting closes when battle starts</p>
            </div>
            {pool && (
              <div className="text-right">
                <p className="text-sm text-gray-400">Total Pool</p>
                <p className="text-lg font-bold text-purple-400">
                  {formatEther(BigInt(pool.totalPool || '0'))} CRwN
                </p>
              </div>
            )}
          </div>

          {userBet ? (
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-gray-400 text-sm">Your Bet</p>
              <p className="text-white font-bold">
                {formatEther(BigInt(userBet.amount))} CRwN on {userBet.betOnWarrior1 ? `#${battle.warrior1.nftId}` : `#${battle.warrior2.nftId}`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setBetSide('warrior1')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    betSide === 'warrior1'
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-gray-600 bg-white/5 hover:border-gray-500'
                  }`}
                >
                  <p className="text-blue-400 font-bold text-lg">#{battle.warrior1.nftId}</p>
                  {pool && (
                    <p className="text-sm text-gray-400">
                      {formatMultiplier(true, pool)} potential
                    </p>
                  )}
                </button>
                <button
                  onClick={() => setBetSide('warrior2')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    betSide === 'warrior2'
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-gray-600 bg-white/5 hover:border-gray-500'
                  }`}
                >
                  <p className="text-red-400 font-bold text-lg">#{battle.warrior2.nftId}</p>
                  {pool && (
                    <p className="text-sm text-gray-400">
                      {formatMultiplier(false, pool)} potential
                    </p>
                  )}
                </button>
              </div>

              <div className="flex gap-4">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  min="0.1"
                  step="0.1"
                  className="flex-1 bg-white/5 border border-gray-600 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="Amount in CRwN"
                />
                <button
                  onClick={handlePlaceBet}
                  disabled={isPlacingBet || !betAmount || Number(betAmount) <= 0 || !address}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-white hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isPlacingBet ? 'Placing...' : 'Place Bet'}
                </button>
              </div>
              {!address && (
                <p className="text-xs text-yellow-400">Connect wallet to place a bet</p>
              )}
              {betError && (
                <p className="text-xs text-red-400">{betError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Betting Pool Info (when betting is closed or showing pool stats) */}
      {!canBet && pool && (
        <div className="glass-panel p-5 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">Betting Pool</h3>
            {isActive && (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
                BETS CLOSED
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400">#{battle.warrior1.nftId}</p>
              <p className="text-sm font-mono text-blue-400">{formatEther(BigInt(pool.totalWarrior1Bets || '0'))} CRwN</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-sm font-mono text-purple-400">{formatEther(BigInt(pool.totalPool || '0'))} CRwN</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">#{battle.warrior2.nftId}</p>
              <p className="text-sm font-mono text-red-400">{formatEther(BigInt(pool.totalWarrior2Bets || '0'))} CRwN</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">{pool.totalBettors} bettors — Betting closed</p>
          {userBet && (
            <div className="mt-3 pt-3 border-t border-white/10 text-center">
              <p className="text-xs text-gray-400">Your Bet</p>
              <p className="text-sm text-white font-medium">
                {formatEther(BigInt(userBet.amount))} CRwN on {userBet.betOnWarrior1 ? `#${battle.warrior1.nftId}` : `#${battle.warrior2.nftId}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Cycle Timeline */}
      <div className="glass-panel p-5 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-4">Cycle Timeline</h3>
        {(battle.cycles ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No cycles executed yet.</p>
        ) : (
          <AnimatePresence initial={false}>
          <div className="space-y-3">
            {(battle.cycles ?? []).map((cycle) => (
              <motion.div
                key={cycle.roundNumber}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="p-4 bg-white/5 rounded-lg border border-white/5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Cycle {cycle.roundNumber}</span>
                    {cycle.startedAt && (
                      <span className="text-xs text-gray-500">
                        {new Date(cycle.startedAt).toLocaleTimeString('en-US', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    cycle.roundWinner === 'warrior1'
                      ? 'bg-blue-500/20 text-blue-400'
                      : cycle.roundWinner === 'warrior2'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {cycle.roundWinner === 'warrior1'
                      ? `#${battle.warrior1.nftId} wins`
                      : cycle.roundWinner === 'warrior2'
                        ? `#${battle.warrior2.nftId} wins`
                        : 'Draw'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[cycle.warrior1, cycle.warrior2].map((w, idx) => {
                    const nftId = idx === 0 ? battle.warrior1.nftId : battle.warrior2.nftId;
                    const isHit = idx === 0 ? cycle.w1IsHit : cycle.w2IsHit;
                    return (
                      <div key={`${cycle.roundNumber}-w${nftId}`} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">#{nftId}</span>
                          <div className="flex items-center gap-1.5">
                            {w.defiMove && (
                              <span className={`px-2 py-0.5 text-xs font-mono rounded border ${MOVE_COLORS[w.defiMove] || MOVE_COLORS.HOLD}`}>
                                {w.defiMove}
                              </span>
                            )}
                            <HitMissBadge isHit={isHit} />
                          </div>
                        </div>

                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Score:</span>
                            <span className="text-white font-mono">{w.score}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Yield:</span>
                            <span className={Number(w.yieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {Number(w.yieldFormatted).toFixed(4)} CRwN
                            </span>
                          </div>
                        </div>

                        {/* Allocation change */}
                        {w.allocationBefore && w.allocationAfter && (
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">Allocation</div>
                            <div className="flex items-center gap-1">
                              <div className="flex-1">
                                <AllocationBar allocation={w.allocationBefore} />
                              </div>
                              <ArrowRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
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
                            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View tx
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pool APYs */}
                {cycle.poolAPYs && (
                  <div className="flex gap-3 mt-2 pt-2 border-t border-white/5 text-xs text-gray-500">
                    <span>APYs: HY {(cycle.poolAPYs.highYield / 100).toFixed(1)}%</span>
                    <span>ST {(cycle.poolAPYs.stable / 100).toFixed(1)}%</span>
                    <span>LP {(cycle.poolAPYs.lp / 100).toFixed(1)}%</span>
                  </div>
                )}

                {/* Judge Reasoning */}
                {cycle.judgeReasoning && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <p className="text-xs text-gray-500 mb-0.5">Judge&apos;s Reasoning</p>
                    <p className="text-xs text-gray-300">{cycle.judgeReasoning}</p>
                  </div>
                )}

                {/* VRF Seeds */}
                {(cycle.w1VrfSeed || cycle.w2VrfSeed) && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> VRF Seeds
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-gray-500">
                      {cycle.w1VrfSeed && (
                        <div className="truncate" title={cycle.w1VrfSeed}>
                          #{battle.warrior1.nftId}: {cycle.w1VrfSeed.slice(0, 10)}...{cycle.w1VrfSeed.slice(-6)}
                        </div>
                      )}
                      {cycle.w2VrfSeed && (
                        <div className="truncate" title={cycle.w2VrfSeed}>
                          #{battle.warrior2.nftId}: {cycle.w2VrfSeed.slice(0, 10)}...{cycle.w2VrfSeed.slice(-6)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          </AnimatePresence>
        )}
      </div>

      {/* Battle Complete + Claim Winnings */}
      {isCompleted && (
        <div className="glass-panel p-8 rounded-xl bg-gradient-to-r from-purple-900/30 to-pink-900/30">
          <div className="text-center">
            <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
            <h3 className="text-2xl font-bold text-white mb-2">
              {w1Wins
                ? `Warrior #${battle.warrior1.nftId} Wins!`
                : w2Wins
                ? `Warrior #${battle.warrior2.nftId} Wins!`
                : 'Draw - Stakes Split!'}
            </h3>
            <p className="text-gray-400">
              Final Score: {battle.warrior1.score} - {battle.warrior2.score}
            </p>
            {battle.completedAt && (
              <p className="text-gray-500 text-sm mt-1">
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
                className="mt-4 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                {betOutcome.won ? (
                  <p className="text-emerald-400 text-sm">
                    Payout: {formatEther(safeBigInt(betOutcome.payout))} CRwN
                  </p>
                ) : safeBigInt(betOutcome.payout) === 0n ? (
                  <p className="text-red-400 text-sm">Your bet did not win</p>
                ) : (
                  <p className="text-gray-400 text-sm">
                    Refunded: {formatEther(safeBigInt(betOutcome.payout))} CRwN (minus fee)
                  </p>
                )}
              </div>
            )}
            {userBet?.claimed && !betOutcome && (
              <p className="mt-3 text-emerald-400 text-sm">Winnings claimed</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
