'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatEther } from 'viem';
import { PredictionBattle, PredictionRound, DebateMove } from '../../types/predictionArena';
import { useBattleBetting, formatOdds, formatMultiplier } from '../../hooks/arena';

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
  const [betAmount, setBetAmount] = useState('1');
  const [betSide, setBetSide] = useState<'yes' | 'no'>('yes');

  const { pool, userBet, placeBet, isPlacingBet } = useBattleBetting(battle.id);

  const currentRound = battle.rounds?.find(r => r.roundNumber === battle.currentRound);
  const completedRounds = battle.rounds?.filter(r => r.roundWinner) || [];

  const handlePlaceBet = async () => {
    const success = await placeBet(betSide === 'yes', betAmount);
    if (success) {
      setShowBettingPanel(false);
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
            <p className="text-white font-medium">Warrior #{battle.warrior1Id}</p>
            <p className="text-5xl font-bold text-white mt-2">{battle.warrior1Score}</p>
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
            <p className="text-white font-medium">Warrior #{battle.warrior2Id}</p>
            <p className="text-5xl font-bold text-white mt-2">{battle.warrior2Score}</p>
            {pool && (
              <p className="text-sm text-gray-400 mt-1">
                {formatOdds(pool.warrior2Odds)} odds
              </p>
            )}
          </div>
        </div>
      </div>

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
              <button
                key={roundNum}
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
              </button>
            );
          })}
        </div>
      </div>

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
      {completedRounds.length > 0 && !selectedRound && (
        <RoundDetailPanel
          round={completedRounds[completedRounds.length - 1]}
          isLatest
        />
      )}

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
          </div>
        </div>
      )}
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
          <div className="mt-3 pt-3 border-t border-gray-600">
            <span className="text-2xl font-bold text-white">{round.w1Score}</span>
            <span className="text-gray-400 text-sm ml-2">points</span>
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
          <div className="mt-3 pt-3 border-t border-gray-600">
            <span className="text-2xl font-bold text-white">{round.w2Score}</span>
            <span className="text-gray-400 text-sm ml-2">points</span>
          </div>
        </div>
      </div>

      {/* Judge Reasoning */}
      {round.judgeReasoning && (
        <div className="mt-4 p-4 bg-gray-700/30 rounded-xl border border-gray-600">
          <p className="text-gray-400 text-sm mb-1">Judge's Reasoning</p>
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
