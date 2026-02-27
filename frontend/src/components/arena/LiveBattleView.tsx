'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatEther } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { PredictionBattle, PredictionRound, DebateMove, DebateEvidence } from '../../types/predictionArena';
import { useBattleBetting, formatOdds, formatMultiplier } from '../../hooks/arena';
import { useWarriorMessage } from '../../contexts/WarriorMessageContext';
import { WARRIOR_MESSAGES } from '../../utils/warriorMessages';
import ArbitrageTrackingPanel from './ArbitrageTrackingPanel';
import ScoreProgressionChart from './ScoreProgressionChart';
import DebateReplayModal from './DebateReplayModal';
import { TrendingUp, PlayCircle } from 'lucide-react';

interface LiveBattleViewProps {
  battle: PredictionBattle;
  onExecuteRound?: () => Promise<void>;
  isExecuting?: boolean;
}

const MOVE_ICONS: Record<string, string> = {
  STRIKE: '⚔️',
  TAUNT: '😤',
  DODGE: '💨',
  SPECIAL: '✨',
  RECOVER: '💚',
};

const MOVE_COLORS: Record<string, string> = {
  STRIKE: 'text-red-400',
  TAUNT: 'text-yellow-400',
  DODGE: 'text-blue-400',
  SPECIAL: 'text-purple-400',
  RECOVER: 'text-green-400',
};

export function LiveBattleView({ battle, onExecuteRound, isExecuting }: LiveBattleViewProps) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [showBettingPanel, setShowBettingPanel] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [betAmount, setBetAmount] = useState('1');
  const [betSide, setBetSide] = useState<'yes' | 'no'>('yes');

  const { pool, userBet, placeBet, isPlacingBet } = useBattleBetting(battle.id);
  const { showMessage } = useWarriorMessage();
  const prevRoundCountRef = useRef(0);
  const prevStatusRef = useRef(battle.status);

  const currentRound = battle.rounds?.find(r => r.roundNumber === battle.currentRound);
  const completedRounds = battle.rounds?.filter(r => r.roundWinner) || [];

  // Warrior message on round completion
  useEffect(() => {
    const completedCount = completedRounds.length;
    if (completedCount > prevRoundCountRef.current && prevRoundCountRef.current > 0) {
      const msgs = WARRIOR_MESSAGES.ARENA.ROUND_COMPLETE;
      showMessage({
        id: 'round_complete',
        text: msgs[Math.floor(Math.random() * msgs.length)],
        duration: 4000,
      });
    }
    prevRoundCountRef.current = completedCount;
  }, [completedRounds.length, showMessage]);

  // Warrior message on battle completion
  useEffect(() => {
    if (prevStatusRef.current === 'active' && battle.status === 'completed') {
      const won = battle.warrior1Score > battle.warrior2Score;
      const msgs = won ? WARRIOR_MESSAGES.ARENA.BATTLE_WON : WARRIOR_MESSAGES.ARENA.BATTLE_LOST;
      showMessage({
        id: 'battle_result',
        text: msgs[Math.floor(Math.random() * msgs.length)],
        duration: 6000,
      });
    }
    prevStatusRef.current = battle.status;
  }, [battle.status, battle.warrior1Score, battle.warrior2Score, showMessage]);

  const handlePlaceBet = async () => {
    const success = await placeBet(betSide === 'yes', betAmount);
    if (success) {
      setShowBettingPanel(false);
      const msgs = WARRIOR_MESSAGES.ARENA.BETTING_PLACED;
      showMessage({
        id: 'bet_placed',
        text: msgs[Math.floor(Math.random() * msgs.length)],
        duration: 4000,
      });
    }
  };

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
      {/* Battle Header */}
      <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 p-6 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              battle.status === 'active'
                ? 'bg-green-500/20 text-green-400 border border-green-500/50 animate-pulse'
                : battle.status === 'completed'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
            }`}>
              {battle.status === 'active' ? '🔴 LIVE' : battle.status.toUpperCase()}
            </span>
            <span className="text-gray-400 text-sm">
              Round {Math.min(battle.currentRound, 5)}/5
            </span>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-sm">Stakes (each)</p>
            <p className="text-xl font-bold text-purple-400">
              {formatEther(BigInt(battle.stakes))} CRwN
            </p>
          </div>
        </div>
        <h2 className="text-xl font-bold text-white leading-tight">
          {battle.question}
        </h2>
        <p className="text-sm text-gray-400 mt-2">
          Source: {battle.source.toUpperCase()}
        </p>
      </div>

      {/* Warriors Scoreboard */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between">
          {/* Warrior 1 (YES) */}
          <div className="flex-1 text-center">
            <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center border-4 transition-all ${
              battle.warrior1Score > battle.warrior2Score
                ? 'bg-green-500/30 border-green-500 shadow-lg shadow-green-500/25'
                : 'bg-green-500/20 border-green-500/50'
            }`}>
              <span className="text-4xl">👍</span>
            </div>
            <p className="text-green-400 font-bold text-xl mt-3">YES</p>
            <Link href={`/prediction-arena/warrior/${battle.warrior1Id}`} className="text-white font-medium hover:text-purple-400 transition-colors">
              Warrior #{battle.warrior1Id}
            </Link>
            <motion.p
              key={`w1score-${battle.warrior1Score}`}
              initial={{ scale: 1.3, color: '#a78bfa' }}
              animate={{ scale: 1, color: '#ffffff' }}
              transition={{ duration: 0.5 }}
              className="text-5xl font-bold mt-2"
            >
              {battle.warrior1Score}
            </motion.p>
            {pool && (
              <p className="text-sm text-gray-400 mt-1">
                {formatOdds(pool.warrior1Odds)} odds
              </p>
            )}
          </div>

          {/* VS Divider */}
          <div className="px-8">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center border-2 border-gray-600">
              <span className="text-2xl font-bold text-gray-400">VS</span>
            </div>
          </div>

          {/* Warrior 2 (NO) */}
          <div className="flex-1 text-center">
            <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center border-4 transition-all ${
              battle.warrior2Score > battle.warrior1Score
                ? 'bg-red-500/30 border-red-500 shadow-lg shadow-red-500/25'
                : 'bg-red-500/20 border-red-500/50'
            }`}>
              <span className="text-4xl">👎</span>
            </div>
            <p className="text-red-400 font-bold text-xl mt-3">NO</p>
            <Link href={`/prediction-arena/warrior/${battle.warrior2Id}`} className="text-white font-medium hover:text-purple-400 transition-colors">
              Warrior #{battle.warrior2Id}
            </Link>
            <motion.p
              key={`w2score-${battle.warrior2Score}`}
              initial={{ scale: 1.3, color: '#a78bfa' }}
              animate={{ scale: 1, color: '#ffffff' }}
              transition={{ duration: 0.5 }}
              className="text-5xl font-bold mt-2"
            >
              {battle.warrior2Score}
            </motion.p>
            {pool && (
              <p className="text-sm text-gray-400 mt-1">
                {formatOdds(pool.warrior2Odds)} odds
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Score Progression Chart */}
      {completedRounds.length > 0 && (
        <div className="p-6 border-b border-gray-700">
          <ScoreProgressionChart
            rounds={completedRounds}
            warrior1Score={battle.warrior1Score}
            warrior2Score={battle.warrior2Score}
          />
        </div>
      )}

      {/* Betting Panel */}
      {battle.status === 'active' && battle.currentRound <= 2 && (
        <div className="p-6 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-white">Place Your Bet</h3>
              <p className="text-sm text-gray-400">Betting closes after round 2</p>
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
            <div className="bg-gray-700/50 rounded-xl p-4">
              <p className="text-gray-400 text-sm">Your Bet</p>
              <p className="text-white font-bold">
                {formatEther(BigInt(userBet.amount))} CRwN on {userBet.betOnWarrior1 ? 'YES' : 'NO'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setBetSide('yes')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    betSide === 'yes'
                      ? 'border-green-500 bg-green-500/20'
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <p className="text-green-400 font-bold text-lg">YES (Warrior 1)</p>
                  {pool && (
                    <p className="text-sm text-gray-400">
                      {formatMultiplier(true, pool)} potential
                    </p>
                  )}
                </button>
                <button
                  onClick={() => setBetSide('no')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    betSide === 'no'
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <p className="text-red-400 font-bold text-lg">NO (Warrior 2)</p>
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
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="Amount in CRwN"
                />
                <button
                  onClick={handlePlaceBet}
                  disabled={isPlacingBet || !betAmount}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-white hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isPlacingBet ? 'Placing...' : 'Place Bet'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Round Timeline */}
      <div className="p-6 border-b border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Debate Rounds</h3>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((roundNum) => {
            const round = battle.rounds?.find(r => r.roundNumber === roundNum);
            const isCurrentRound = roundNum === battle.currentRound && battle.status === 'active';
            const isCompleted = round?.roundWinner;

            return (
              <motion.button
                key={roundNum}
                initial={isCompleted ? { scale: 0.8, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: isCompleted ? 0.1 : 0 }}
                onClick={() => setSelectedRound(isCompleted ? roundNum : null)}
                className={`flex-1 p-4 rounded-xl transition-all ${
                  isCurrentRound
                    ? 'bg-purple-500/30 border-2 border-purple-500 animate-pulse'
                    : isCompleted
                    ? round.roundWinner === 'warrior1'
                      ? 'bg-green-500/20 border border-green-500/50 hover:border-green-500 cursor-pointer'
                      : round.roundWinner === 'warrior2'
                      ? 'bg-red-500/20 border border-red-500/50 hover:border-red-500 cursor-pointer'
                      : 'bg-yellow-500/20 border border-yellow-500/50 cursor-pointer'
                    : 'bg-gray-700/30 border border-gray-600/50'
                }`}
              >
                <p className="text-gray-400 text-xs mb-1">Round {roundNum}</p>
                {isCurrentRound ? (
                  <p className="text-purple-400 font-bold">In Progress...</p>
                ) : isCompleted ? (
                  <>
                    <p className="text-white font-medium text-sm">
                      {MOVE_ICONS[round?.w1Move || '']} vs {MOVE_ICONS[round?.w2Move || '']}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      {round?.w1Score} - {round?.w2Score}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-500">—</p>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Arbitrage Trade Tracking */}
      {(battle as any).isArbitrageBattle && (battle as any).arbitrageTradeId && (
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <h3 className="text-lg font-bold text-white">Arbitrage Trade Tracking</h3>
            <span className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold border border-green-500/50 rounded-full">
              ARBITRAGE BATTLE
            </span>
          </div>
          <ArbitrageTrackingPanel
            arbitrageTradeId={(battle as any).arbitrageTradeId}
            polymarketId={battle.externalMarketId}
            kalshiId={(battle as any).kalshiMarketId || ''}
          />
        </div>
      )}

      {/* Selected Round Detail */}
      {selectedRound && (
        <RoundDetailPanel
          round={battle.rounds?.find(r => r.roundNumber === selectedRound)}
          onClose={() => setSelectedRound(null)}
        />
      )}

      {/* Current Round Arguments (if active) */}
      {battle.status === 'active' && currentRound && !currentRound.roundWinner && (
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">
              Round {battle.currentRound} - Awaiting Execution
            </h3>
            {onExecuteRound && (
              <button
                onClick={onExecuteRound}
                disabled={isExecuting}
                className="px-4 py-2 bg-purple-600 rounded-lg text-white font-medium hover:bg-purple-500 disabled:opacity-50 transition-all"
              >
                {isExecuting ? 'Executing...' : 'Execute Round'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Latest Round Result */}
      <AnimatePresence mode="wait">
        {completedRounds.length > 0 && !selectedRound && (
          <motion.div
            key={`latest-${completedRounds[completedRounds.length - 1]?.roundNumber}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <RoundDetailPanel
              round={completedRounds[completedRounds.length - 1]}
              isLatest
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Battle Complete */}
      {battle.status === 'completed' && (
        <div className="p-8 bg-gradient-to-r from-purple-900/30 to-pink-900/30">
          <div className="text-center">
            <p className="text-2xl mb-2">🏆</p>
            <h3 className="text-2xl font-bold text-white mb-2">
              {battle.warrior1Score > battle.warrior2Score
                ? `Warrior #${battle.warrior1Id} (YES) Wins!`
                : battle.warrior2Score > battle.warrior1Score
                ? `Warrior #${battle.warrior2Id} (NO) Wins!`
                : 'Draw - Stakes Split!'}
            </h3>
            <p className="text-gray-400">
              Final Score: {battle.warrior1Score} - {battle.warrior2Score}
            </p>
            {completedRounds.length > 0 && (
              <button
                onClick={() => setShowReplay(true)}
                className="mt-4 px-6 py-2 bg-purple-600/30 border border-purple-500/50 rounded-xl text-purple-400 hover:bg-purple-600/50 hover:text-purple-300 transition-all flex items-center gap-2 mx-auto"
              >
                <PlayCircle className="w-4 h-4" />
                Replay Debate
              </button>
            )}
          </div>
        </div>
      )}

      {/* Debate Replay Modal */}
      <DebateReplayModal
        rounds={battle.rounds || []}
        isOpen={showReplay}
        onClose={() => setShowReplay(false)}
      />
    </div>
  );
}

// Parse evidence JSON safely
function parseEvidence(json?: string): DebateEvidence[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EVIDENCE_TYPE_COLORS: Record<string, string> = {
  news: 'bg-blue-500/20 text-blue-400',
  data: 'bg-cyan-500/20 text-cyan-400',
  expert: 'bg-purple-500/20 text-purple-400',
  historical: 'bg-amber-500/20 text-amber-400',
  market: 'bg-green-500/20 text-green-400',
};

function EvidenceList({ evidence }: { evidence: DebateEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {evidence.slice(0, 3).map((e, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${EVIDENCE_TYPE_COLORS[e.type] || 'bg-gray-600 text-gray-300'}`}>
            {e.type}
          </span>
          <span className="text-gray-300 flex-1 line-clamp-1">
            {e.simulated && <span className="text-yellow-500/70 mr-1">[AI]</span>}
            {e.title}
          </span>
          {e.relevance != null && (
            <span className="text-gray-500 flex-shrink-0">{e.relevance}%</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-gray-500 text-[10px]">Confidence</span>
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="text-gray-400 text-[10px] font-medium">{value}%</span>
    </div>
  );
}

function RoundDetailPanel({
  round,
  onClose,
  isLatest,
}: {
  round?: PredictionRound;
  onClose?: () => void;
  isLatest?: boolean;
}) {
  if (!round) return null;

  const w1Evidence = parseEvidence(round.w1Evidence);
  const w2Evidence = parseEvidence(round.w2Evidence);

  return (
    <div className="p-6 bg-gray-800/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">
          {isLatest ? 'Latest Result - ' : ''}Round {round.roundNumber}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            Close
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Warrior 1 Argument */}
        <div className={`p-4 rounded-xl border ${
          round.roundWinner === 'warrior1'
            ? 'border-green-500/50 bg-green-500/10'
            : 'border-gray-600 bg-gray-700/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-400 font-bold">YES</span>
            <span className={`text-xl ${MOVE_COLORS[round.w1Move || '']}`}>
              {MOVE_ICONS[round.w1Move || '']} {round.w1Move}
            </span>
          </div>
          <p className="text-white text-sm leading-relaxed">
            {round.w1Argument || 'No argument recorded'}
          </p>
          <EvidenceList evidence={w1Evidence} />
          <div className="mt-3 pt-3 border-t border-gray-600">
            <span className="text-2xl font-bold text-white">{round.w1Score}</span>
            <span className="text-gray-400 text-sm ml-2">points</span>
            {round.w1Confidence != null && (
              <ConfidenceBar value={round.w1Confidence} color="bg-green-500" />
            )}
          </div>
        </div>

        {/* Warrior 2 Argument */}
        <div className={`p-4 rounded-xl border ${
          round.roundWinner === 'warrior2'
            ? 'border-red-500/50 bg-red-500/10'
            : 'border-gray-600 bg-gray-700/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-400 font-bold">NO</span>
            <span className={`text-xl ${MOVE_COLORS[round.w2Move || '']}`}>
              {MOVE_ICONS[round.w2Move || '']} {round.w2Move}
            </span>
          </div>
          <p className="text-white text-sm leading-relaxed">
            {round.w2Argument || 'No argument recorded'}
          </p>
          <EvidenceList evidence={w2Evidence} />
          <div className="mt-3 pt-3 border-t border-gray-600">
            <span className="text-2xl font-bold text-white">{round.w2Score}</span>
            <span className="text-gray-400 text-sm ml-2">points</span>
            {round.w2Confidence != null && (
              <ConfidenceBar value={round.w2Confidence} color="bg-red-500" />
            )}
          </div>
        </div>
      </div>

      {/* Judge Reasoning */}
      {round.judgeReasoning && (
        <div className="mt-4 p-4 bg-gray-700/30 rounded-xl border border-gray-600">
          <p className="text-gray-400 text-sm mb-1">Judge&apos;s Reasoning</p>
          <p className="text-white text-sm">{round.judgeReasoning}</p>
        </div>
      )}

      {/* Round Winner */}
      <div className="mt-4 text-center">
        <span className={`inline-block px-4 py-2 rounded-full font-bold ${
          round.roundWinner === 'warrior1'
            ? 'bg-green-500/20 text-green-400'
            : round.roundWinner === 'warrior2'
            ? 'bg-red-500/20 text-red-400'
            : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {round.roundWinner === 'warrior1'
            ? 'YES Wins Round!'
            : round.roundWinner === 'warrior2'
            ? 'NO Wins Round!'
            : 'Round Draw'}
        </span>
      </div>
    </div>
  );
}

export default LiveBattleView;
