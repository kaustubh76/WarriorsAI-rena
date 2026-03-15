'use client';

import { useState, useEffect, useRef } from 'react';
import { formatEther } from 'viem';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Swords, Timer, Trophy, ChevronRight, Radio, Clock } from 'lucide-react';

export interface StrategyBattle {
  id: string;
  status: string;
  currentRound: number;
  question: string;
  stakes: string;
  warrior1Id: number;
  warrior1Owner: string;
  warrior1Score: number;
  warrior2Id: number;
  warrior2Owner: string;
  warrior2Score: number;
  warrior1ImageUrl?: string | null;
  warrior2ImageUrl?: string | null;
  w1TotalYield?: string | null;
  w2TotalYield?: string | null;
  createdAt: string;
  completedAt?: string | null;
  scheduledStartAt?: string | null;
  nextCycleEstimate?: string | null;
  betting?: {
    totalWarrior1Bets: string;
    totalWarrior2Bets: string;
    totalBettors: number;
    bettingOpen: boolean;
  } | null;
  rounds?: Array<{
    roundNumber: number;
    w1DeFiMove?: string | null;
    w2DeFiMove?: string | null;
    w1Score: number;
    w2Score: number;
    roundWinner?: string | null;
  }>;
}

interface StrategyBattleCardProps {
  battle: StrategyBattle;
}

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

function MovePill({ move }: { move: string }) {
  const colors = MOVE_COLORS[move] || MOVE_COLORS.HOLD;
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${colors}`}>
      {MOVE_ICONS[move] || '•'} {move}
    </span>
  );
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Mini inline countdown that ticks live */
function MiniCountdown({ isoString }: { isoString: string }) {
  const [secs, setSecs] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const target = new Date(isoString).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.round((target - Date.now()) / 1000));
      setSecs(diff);
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isoString]);

  if (secs === 0) return <span className="text-purple-400 animate-pulse">executing...</span>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className={`font-mono tabular-nums ${secs <= 10 ? 'text-red-400' : secs <= 20 ? 'text-orange-400' : 'text-blue-400'}`}>
      {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}

export default function StrategyBattleCard({ battle }: StrategyBattleCardProps) {
  const isActive = battle.status === 'active';
  const isCompleted = battle.status === 'completed';
  const w1Leading = battle.warrior1Score > battle.warrior2Score;
  const w2Leading = battle.warrior2Score > battle.warrior1Score;
  const bettingOpen = battle.betting?.bettingOpen ?? null;
  const isScheduledWaiting = isActive && battle.scheduledStartAt &&
    new Date(battle.scheduledStartAt).getTime() > Date.now() && battle.currentRound === 0;

  const w1YieldFormatted = battle.w1TotalYield
    ? Number(formatEther(BigInt(battle.w1TotalYield))).toFixed(0)
    : '0';
  const w2YieldFormatted = battle.w2TotalYield
    ? Number(formatEther(BigInt(battle.w2TotalYield))).toFixed(0)
    : '0';

  // Move history from rounds
  const w1Moves = battle.rounds?.map(r => r.w1DeFiMove).filter(Boolean) as string[] || [];
  const w2Moves = battle.rounds?.map(r => r.w2DeFiMove).filter(Boolean) as string[] || [];

  // Score bar width
  const totalScore = battle.warrior1Score + battle.warrior2Score;
  const w1ScorePct = totalScore > 0 ? (battle.warrior1Score / totalScore) * 100 : 50;

  return (
    <Link href={`/arena/strategy/${battle.id}`}>
      <div className="glass-panel p-4 rounded-xl border border-white/10 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all cursor-pointer group">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center">
              <Swords className="w-3 h-3 text-purple-400" />
            </div>
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wide">
              Strategy Battle
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isActive && !isScheduledWaiting && (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                LIVE
              </span>
            )}
            {isScheduledWaiting && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Clock className="w-3 h-3" /> Scheduled
              </span>
            )}
            {isActive && (
              <span className="flex items-center gap-1 text-xs text-gray-400 font-mono">
                <Timer className="w-3 h-3" />
                {battle.currentRound}/5
              </span>
            )}
            {isCompleted && (
              <span className="flex items-center gap-1 text-xs text-yellow-400 font-bold">
                <Trophy className="w-3 h-3" />
                Settled
              </span>
            )}
          </div>
        </div>

        {/* Live countdown bar */}
        {isActive && !isScheduledWaiting && battle.nextCycleEstimate && battle.currentRound < 5 && (
          <div className="mb-3 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Clock className="w-3 h-3 text-gray-500 flex-shrink-0" />
            <span className="text-xs text-gray-500">Next cycle:</span>
            <MiniCountdown isoString={battle.nextCycleEstimate} />
            {/* Mini cycle progress dots */}
            <div className="ml-auto flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i < battle.currentRound
                      ? 'bg-emerald-500'
                      : i === battle.currentRound
                        ? 'bg-purple-500 animate-pulse'
                        : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Two-column warrior panels */}
        <div className="grid grid-cols-2 gap-3">
          {/* Warrior 1 */}
          <div className={`p-3 rounded-lg border transition-all ${
            w1Leading && isCompleted
              ? 'border-yellow-500/30 bg-yellow-500/5'
              : w1Leading
                ? 'border-blue-500/20 bg-blue-500/[0.03]'
                : 'border-white/5 bg-white/[0.02]'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {battle.warrior1ImageUrl && (
                <img
                  src={battle.warrior1ImageUrl}
                  alt={`NFT #${battle.warrior1Id}`}
                  className={`w-9 h-9 rounded-full object-cover border-2 ${
                    w1Leading ? 'border-blue-500/50' : 'border-white/10'
                  }`}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="min-w-0">
                <span className="text-sm font-bold text-white">#{battle.warrior1Id}</span>
                <p className="text-xs text-gray-500 truncate">{shortenAddress(battle.warrior1Owner)}</p>
              </div>
              {w1Leading && isCompleted && <Trophy className="w-3 h-3 text-yellow-400 ml-auto" />}
            </div>

            {/* Score + Yield */}
            <div className="flex items-end justify-between mb-2">
              <div className="text-2xl font-bold font-mono text-white leading-none">
                {battle.warrior1Score}
              </div>
              <div className="flex items-center gap-1 text-xs">
                {Number(w1YieldFormatted) >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                )}
                <span className={`font-mono ${Number(w1YieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {Number(w1YieldFormatted) >= 0 ? '+' : ''}{w1YieldFormatted}
                </span>
              </div>
            </div>

            {/* Move history */}
            {w1Moves.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {w1Moves.map((move, i) => (
                  <MovePill key={i} move={move} />
                ))}
              </div>
            )}
          </div>

          {/* Warrior 2 */}
          <div className={`p-3 rounded-lg border transition-all ${
            w2Leading && isCompleted
              ? 'border-yellow-500/30 bg-yellow-500/5'
              : w2Leading
                ? 'border-red-500/20 bg-red-500/[0.03]'
                : 'border-white/5 bg-white/[0.02]'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {battle.warrior2ImageUrl && (
                <img
                  src={battle.warrior2ImageUrl}
                  alt={`NFT #${battle.warrior2Id}`}
                  className={`w-9 h-9 rounded-full object-cover border-2 ${
                    w2Leading ? 'border-red-500/50' : 'border-white/10'
                  }`}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="min-w-0">
                <span className="text-sm font-bold text-white">#{battle.warrior2Id}</span>
                <p className="text-xs text-gray-500 truncate">{shortenAddress(battle.warrior2Owner)}</p>
              </div>
              {w2Leading && isCompleted && <Trophy className="w-3 h-3 text-yellow-400 ml-auto" />}
            </div>

            {/* Score + Yield */}
            <div className="flex items-end justify-between mb-2">
              <div className="text-2xl font-bold font-mono text-white leading-none">
                {battle.warrior2Score}
              </div>
              <div className="flex items-center gap-1 text-xs">
                {Number(w2YieldFormatted) >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                )}
                <span className={`font-mono ${Number(w2YieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {Number(w2YieldFormatted) >= 0 ? '+' : ''}{w2YieldFormatted}
                </span>
              </div>
            </div>

            {/* Move history */}
            {w2Moves.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {w2Moves.map((move, i) => (
                  <MovePill key={i} move={move} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Score comparison bar */}
        {totalScore > 0 && (
          <div className="mt-3 flex h-1.5 rounded-full overflow-hidden gap-px">
            <div className="bg-blue-500 rounded-l-full transition-all duration-500" style={{ width: `${w1ScorePct}%` }} />
            <div className="bg-red-500 rounded-r-full transition-all duration-500" style={{ width: `${100 - w1ScorePct}%` }} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">
              {Math.round(Number(battle.stakes))} CRwN
            </span>
            {bettingOpen !== null && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                bettingOpen
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {bettingOpen ? 'BETS OPEN' : 'BETS CLOSED'}
              </span>
            )}
            {battle.betting && battle.betting.totalBettors > 0 && (
              <span className="text-xs text-gray-600">
                {battle.betting.totalBettors} bettor{battle.betting.totalBettors > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs text-gray-500 group-hover:text-purple-400 transition-colors font-medium">
            Details <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </Link>
  );
}
