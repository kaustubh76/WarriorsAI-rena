'use client';

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

function MovePill({ move }: { move: string }) {
  const colors = MOVE_COLORS[move] || MOVE_COLORS.HOLD;
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-mono rounded border ${colors}`}>
      {move}
    </span>
  );
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimeRemaining(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1 min';
  return `${mins} min`;
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
    ? Number(formatEther(BigInt(battle.w1TotalYield))).toFixed(4)
    : '0';
  const w2YieldFormatted = battle.w2TotalYield
    ? Number(formatEther(BigInt(battle.w2TotalYield))).toFixed(4)
    : '0';

  // Move history from rounds
  const w1Moves = battle.rounds?.map(r => r.w1DeFiMove).filter(Boolean) as string[] || [];
  const w2Moves = battle.rounds?.map(r => r.w2DeFiMove).filter(Boolean) as string[] || [];

  return (
    <Link href={`/arena/strategy/${battle.id}`}>
      <div className="glass-panel p-4 rounded-xl border border-white/10 hover:border-white/20 transition-all cursor-pointer group">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wide">
              Strategy Battle
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isActive && !isScheduledWaiting && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Radio className="w-3 h-3 animate-pulse" /> LIVE
              </span>
            )}
            {isScheduledWaiting && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Clock className="w-3 h-3" /> Starts in {formatTimeRemaining(battle.scheduledStartAt)}
              </span>
            )}
            {isActive && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Timer className="w-3 h-3" />
                Cycle {battle.currentRound}/5
              </span>
            )}
            {isActive && !isScheduledWaiting && battle.nextCycleEstimate && battle.currentRound < 5 && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Clock className="w-3 h-3" /> ~{formatTimeRemaining(battle.nextCycleEstimate)}
              </span>
            )}
            {isCompleted && (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <Trophy className="w-3 h-3" />
                Settled
              </span>
            )}
          </div>
        </div>

        {/* Two-column warrior panels */}
        <div className="grid grid-cols-2 gap-3">
          {/* Warrior 1 */}
          <div className={`p-3 rounded-lg border ${w1Leading && isCompleted ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {battle.warrior1ImageUrl && (
                  <img
                    src={battle.warrior1ImageUrl}
                    alt={`NFT #${battle.warrior1Id}`}
                    className="w-8 h-8 rounded-full object-cover border border-white/20"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span className="text-sm font-bold text-white">#{battle.warrior1Id}</span>
              </div>
              {w1Leading && isCompleted && <Trophy className="w-3 h-3 text-yellow-400" />}
            </div>
            <div className="text-xs text-gray-400 mb-2 truncate">
              {shortenAddress(battle.warrior1Owner)}
            </div>

            {/* Score */}
            <div className="text-lg font-mono font-bold text-white mb-1">
              {battle.warrior1Score}
            </div>

            {/* Yield */}
            <div className="flex items-center gap-1 text-xs mb-2">
              {Number(w1YieldFormatted) >= 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-400" />
              )}
              <span className={Number(w1YieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {w1YieldFormatted} CRwN
              </span>
            </div>

            {/* Move history */}
            <div className="flex flex-wrap gap-1">
              {w1Moves.map((move, i) => (
                <MovePill key={i} move={move} />
              ))}
            </div>
          </div>

          {/* Warrior 2 */}
          <div className={`p-3 rounded-lg border ${w2Leading && isCompleted ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {battle.warrior2ImageUrl && (
                  <img
                    src={battle.warrior2ImageUrl}
                    alt={`NFT #${battle.warrior2Id}`}
                    className="w-8 h-8 rounded-full object-cover border border-white/20"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span className="text-sm font-bold text-white">#{battle.warrior2Id}</span>
              </div>
              {w2Leading && isCompleted && <Trophy className="w-3 h-3 text-yellow-400" />}
            </div>
            <div className="text-xs text-gray-400 mb-2 truncate">
              {shortenAddress(battle.warrior2Owner)}
            </div>

            {/* Score */}
            <div className="text-lg font-mono font-bold text-white mb-1">
              {battle.warrior2Score}
            </div>

            {/* Yield */}
            <div className="flex items-center gap-1 text-xs mb-2">
              {Number(w2YieldFormatted) >= 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-400" />
              )}
              <span className={Number(w2YieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {w2YieldFormatted} CRwN
              </span>
            </div>

            {/* Move history */}
            <div className="flex flex-wrap gap-1">
              {w2Moves.map((move, i) => (
                <MovePill key={i} move={move} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              Stake: {battle.stakes} CRwN each
            </span>
            {bettingOpen !== null && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                bettingOpen
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {bettingOpen ? 'BETS OPEN' : 'BETS CLOSED'}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-white transition-colors">
            View Details <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
