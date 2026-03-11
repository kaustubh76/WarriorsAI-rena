'use client';

import { useParams } from 'next/navigation';
import { useStrategyBattle } from '@/hooks/arena/useStrategyBattle';
import { TRAIT_MAP } from '@/constants/defiTraitMapping';
import { getFlowExplorerUrl } from '@/constants';
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Timer,
  Swords,
  ArrowRight,
  Loader2,
  Play,
  ExternalLink,
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
  const { battle, loading, error, executeCycle, executingCycle } = useStrategyBattle(battleId);
  const explorerUrl = getFlowExplorerUrl();

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
        </div>
      </div>
    );
  }

  const isActive = battle.status === 'active';
  const isCompleted = battle.status === 'completed';
  const w1Wins = isCompleted && battle.warrior1.score > battle.warrior2.score;
  const w2Wins = isCompleted && battle.warrior2.score > battle.warrior1.score;

  const traitKeys = Object.keys(TRAIT_MAP) as Array<keyof typeof TRAIT_MAP>;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto space-y-6">
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
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm flex items-center gap-1">
                  <Timer className="w-3 h-3" /> Cycle {battle.currentRound}/5
                </span>
                <button
                  onClick={executeCycle}
                  disabled={executingCycle || battle.currentRound >= 5}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded-lg flex items-center gap-2 transition-colors"
                >
                  {executingCycle ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Executing...</>
                  ) : (
                    <><Play className="w-4 h-4" /> Execute Cycle</>
                  )}
                </button>
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
      </div>

      {/* Two-column warrior panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[battle.warrior1, battle.warrior2].map((warrior, idx) => {
          const isWinner = idx === 0 ? w1Wins : w2Wins;
          const label = idx === 0 ? 'Warrior 1' : 'Warrior 2';
          return (
            <div
              key={warrior.nftId}
              className={`glass-panel p-5 rounded-xl border ${isWinner ? 'border-yellow-500/40' : 'border-white/10'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs text-gray-400 uppercase">{label}</span>
                  <h2 className="text-lg font-bold text-white">Strategy #{warrior.nftId}</h2>
                  <span className="text-xs text-gray-500">{shortenAddress(warrior.owner)}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 uppercase">Profile</div>
                  <div className="text-sm font-bold text-purple-400">{warrior.strategyProfile}</div>
                  {isWinner && <Trophy className="w-5 h-5 text-yellow-400 ml-auto mt-1" />}
                </div>
              </div>

              {/* Traits */}
              {warrior.traits && (
                <div className="space-y-1.5 mb-4">
                  {traitKeys.map((key) => (
                    <TraitBar
                      key={key}
                      label={TRAIT_MAP[key].display}
                      value={warrior.traits![key as keyof typeof warrior.traits]}
                    />
                  ))}
                </div>
              )}

              {/* Current allocation */}
              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-1">Current Allocation</div>
                <AllocationBar allocation={warrior.currentAllocation} />
                {warrior.currentAllocation && (
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>HY: {(warrior.currentAllocation.highYield / 100).toFixed(1)}%</span>
                    <span>ST: {(warrior.currentAllocation.stable / 100).toFixed(1)}%</span>
                    <span>LP: {(warrior.currentAllocation.lp / 100).toFixed(1)}%</span>
                  </div>
                )}
              </div>

              {/* Score + Yield */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-xs text-gray-400">Score</div>
                  <div className="text-2xl font-mono font-bold text-white">{warrior.score}</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-xs text-gray-400">Total Yield</div>
                  <div className={`text-lg font-mono font-bold flex items-center gap-1 ${
                    Number(warrior.totalYieldFormatted) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {Number(warrior.totalYieldFormatted) >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {Number(warrior.totalYieldFormatted).toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500">CRwN</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cycle Timeline */}
      <div className="glass-panel p-5 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-4">Cycle Timeline</h3>
        {battle.cycles.length === 0 ? (
          <p className="text-sm text-gray-400">No cycles executed yet.</p>
        ) : (
          <div className="space-y-3">
            {battle.cycles.map((cycle) => (
              <div key={cycle.roundNumber} className="p-4 bg-white/5 rounded-lg border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-white">Cycle {cycle.roundNumber}</span>
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

                <div className="grid grid-cols-2 gap-4">
                  {[cycle.warrior1, cycle.warrior2].map((w, idx) => {
                    const nftId = idx === 0 ? battle.warrior1.nftId : battle.warrior2.nftId;
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">#{nftId}</span>
                          {w.defiMove && (
                            <span className={`px-2 py-0.5 text-xs font-mono rounded border ${MOVE_COLORS[w.defiMove] || MOVE_COLORS.HOLD}`}>
                              {w.defiMove}
                            </span>
                          )}
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
                    <span>APYs: HY {cycle.poolAPYs.highYield.toFixed(1)}%</span>
                    <span>ST {cycle.poolAPYs.stable.toFixed(1)}%</span>
                    <span>LP {cycle.poolAPYs.lp.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Betting Pool */}
      {battle.betting && (
        <div className="glass-panel p-5 rounded-xl">
          <h3 className="text-lg font-bold text-white mb-3">Spectator Betting</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="text-xs text-gray-400">Bets on #{battle.warrior1.nftId}</div>
              <div className="text-lg font-mono text-blue-400">{battle.betting.totalWarrior1Bets} wei</div>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <div className="text-xs text-gray-400">Bets on #{battle.warrior2.nftId}</div>
              <div className="text-lg font-mono text-red-400">{battle.betting.totalWarrior2Bets} wei</div>
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{battle.betting.totalBettors} bettors</span>
            <span>{battle.betting.bettingOpen ? 'Betting open' : 'Betting closed'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
