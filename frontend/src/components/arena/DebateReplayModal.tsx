'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { PredictionRound } from '../../types/predictionArena';

interface DebateReplayModalProps {
  rounds: PredictionRound[];
  isOpen: boolean;
  onClose: () => void;
}

type ReplayPhase = 'w1' | 'w2' | 'judge' | 'result';

const PHASE_DURATION_MS = 4000;
const FAST_PHASE_DURATION_MS = 2000;

const MOVE_ICONS: Record<string, string> = {
  STRIKE: '\u2694\uFE0F',
  TAUNT: '\uD83D\uDE24',
  DODGE: '\uD83D\uDCA8',
  SPECIAL: '\u2728',
  RECOVER: '\uD83D\uDC9A',
};

export default function DebateReplayModal({
  rounds,
  isOpen,
  onClose,
}: DebateReplayModalProps) {
  const sortedRounds = [...rounds]
    .filter((r) => r.roundWinner)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [phase, setPhase] = useState<ReplayPhase>('w1');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const round = sortedRounds[currentRoundIdx];

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const advancePhase = useCallback(() => {
    setPhase((prev: ReplayPhase) => {
      if (prev === 'w1') return 'w2';
      if (prev === 'w2') return 'judge';
      if (prev === 'judge') return 'result';
      // result → next round or stop
      if (currentRoundIdx < sortedRounds.length - 1) {
        setCurrentRoundIdx((i: number) => i + 1);
        return 'w1';
      }
      setPlaying(false);
      return 'result';
    });
  }, [currentRoundIdx, sortedRounds.length]);

  // Auto-advance timer
  useEffect(() => {
    clearTimer();
    if (!playing || !isOpen) return;
    const ms = speed === 2 ? FAST_PHASE_DURATION_MS : PHASE_DURATION_MS;
    timerRef.current = setTimeout(advancePhase, ms);
    return clearTimer;
  }, [playing, phase, currentRoundIdx, speed, advancePhase, isOpen]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setCurrentRoundIdx(0);
      setPhase('w1');
      setPlaying(true);
    }
  }, [isOpen]);

  const goToRound = (idx: number) => {
    clearTimer();
    setCurrentRoundIdx(idx);
    setPhase('w1');
    setPlaying(true);
  };

  const goPrev = () => {
    if (currentRoundIdx > 0) {
      goToRound(currentRoundIdx - 1);
    }
  };

  const goNext = () => {
    if (currentRoundIdx < sortedRounds.length - 1) {
      goToRound(currentRoundIdx + 1);
    }
  };

  if (!isOpen || sortedRounds.length === 0) return null;

  const phaseOrder: ReplayPhase[] = ['w1', 'w2', 'judge', 'result'];
  const phaseIdx = phaseOrder.indexOf(phase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto border border-gray-700"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-bold text-white">Debate Replay</h3>
            <p className="text-sm text-gray-400">
              Round {round?.roundNumber || 1} of {sortedRounds.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 min-h-[300px]">
          {round && (
            <AnimatePresence mode="wait">
              {/* W1 argument (YES) — left-aligned green bubble */}
              {phaseIdx >= 0 && (
                <motion.div
                  key={`w1-${round.roundNumber}`}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mb-4"
                >
                  <div className="flex items-start gap-3 max-w-[85%]">
                    <div className="w-8 h-8 rounded-full bg-green-500/30 border border-green-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs">YES</span>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-2xl rounded-tl-sm p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-green-400 text-xs font-bold">
                          Warrior 1 {round.w1Move && `• ${MOVE_ICONS[round.w1Move] || ''} ${round.w1Move}`}
                        </span>
                        {round.w1Confidence != null && (
                          <span className="text-gray-500 text-[10px]">
                            {round.w1Confidence}% confident
                          </span>
                        )}
                      </div>
                      <p className="text-white text-sm leading-relaxed">
                        {round.w1Argument || 'No argument recorded'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* W2 argument (NO) — right-aligned red bubble */}
              {phaseIdx >= 1 && (
                <motion.div
                  key={`w2-${round.roundNumber}`}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mb-4 flex justify-end"
                >
                  <div className="flex items-start gap-3 max-w-[85%] flex-row-reverse">
                    <div className="w-8 h-8 rounded-full bg-red-500/30 border border-red-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs">NO</span>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl rounded-tr-sm p-4">
                      <div className="flex items-center gap-2 mb-1 justify-end">
                        {round.w2Confidence != null && (
                          <span className="text-gray-500 text-[10px]">
                            {round.w2Confidence}% confident
                          </span>
                        )}
                        <span className="text-red-400 text-xs font-bold">
                          Warrior 2 {round.w2Move && `• ${MOVE_ICONS[round.w2Move] || ''} ${round.w2Move}`}
                        </span>
                      </div>
                      <p className="text-white text-sm leading-relaxed">
                        {round.w2Argument || 'No argument recorded'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Judge reasoning */}
              {phaseIdx >= 2 && round.judgeReasoning && (
                <motion.div
                  key={`judge-${round.roundNumber}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mb-4"
                >
                  <div className="mx-auto max-w-[90%] bg-gray-800 border border-gray-600 rounded-xl p-4">
                    <p className="text-gray-400 text-xs font-bold mb-1">Judge&apos;s Reasoning</p>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {round.judgeReasoning}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Result */}
              {phaseIdx >= 3 && (
                <motion.div
                  key={`result-${round.roundNumber}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-center mt-2"
                >
                  <span
                    className={`inline-block px-5 py-2 rounded-full font-bold text-sm ${
                      round.roundWinner === 'warrior1'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                        : round.roundWinner === 'warrior2'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                    }`}
                  >
                    {round.roundWinner === 'warrior1'
                      ? `YES Wins Round ${round.roundNumber}! (${round.w1Score} - ${round.w2Score})`
                      : round.roundWinner === 'warrior2'
                      ? `NO Wins Round ${round.roundNumber}! (${round.w1Score} - ${round.w2Score})`
                      : `Round ${round.roundNumber} Draw (${round.w1Score} - ${round.w2Score})`}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Controls */}
        <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 px-6 py-4">
          {/* Round dots */}
          <div className="flex items-center justify-center gap-2 mb-3">
            {sortedRounds.map((r, idx) => (
              <button
                key={r.roundNumber}
                onClick={() => goToRound(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  idx === currentRoundIdx
                    ? 'bg-purple-500 scale-125'
                    : idx < currentRoundIdx
                    ? 'bg-gray-500'
                    : 'bg-gray-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={currentRoundIdx === 0}
              className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setPlaying(!playing)}
                className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition"
              >
                {playing ? (
                  <Pause className="w-4 h-4 text-white" />
                ) : (
                  <Play className="w-4 h-4 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={() => setSpeed(speed === 1 ? 2 : 1)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                  speed === 2
                    ? 'bg-purple-500/30 text-purple-400 border border-purple-500/50'
                    : 'bg-gray-700 text-gray-400 border border-gray-600'
                }`}
              >
                {speed}x
              </button>
            </div>

            <button
              onClick={goNext}
              disabled={currentRoundIdx >= sortedRounds.length - 1}
              className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
