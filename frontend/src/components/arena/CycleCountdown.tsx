'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Radio } from 'lucide-react';

interface CycleCountdownProps {
  /** ISO string of when the next cycle is estimated */
  nextCycleEstimate: string | null;
  /** Current cycle number (0-5) */
  currentRound: number;
  /** Total cycles in the battle */
  totalRounds?: number;
  /** Whether the battle is active */
  isActive: boolean;
  /** Battle status string */
  status: string;
}

export default function CycleCountdown({
  nextCycleEstimate,
  currentRound,
  totalRounds = 5,
  isActive,
  status,
}: CycleCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Compute seconds remaining from ISO estimate
  useEffect(() => {
    if (!nextCycleEstimate || !isActive || currentRound >= totalRounds) {
      setSecondsLeft(0);
      return;
    }

    const target = new Date(nextCycleEstimate).getTime();

    const tick = () => {
      const diff = Math.max(0, Math.round((target - Date.now()) / 1000));
      setSecondsLeft(diff);
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [nextCycleEstimate, isActive, currentRound, totalRounds]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Progress: 60s total cycle interval, progress goes from 100% down to 0%
  const totalInterval = 60;
  const progress = Math.min(100, Math.max(0, (secondsLeft / totalInterval) * 100));

  const isImminent = secondsLeft <= 10 && secondsLeft > 0;
  const isClose = secondsLeft <= 20 && secondsLeft > 10;

  // Completed / not active states
  if (status === 'completed') {
    return (
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-center gap-2 text-yellow-400">
          <Zap className="w-5 h-5" />
          <span className="text-sm font-bold tracking-wide">BATTLE COMPLETE</span>
        </div>
        <div className="mt-2 flex justify-center">
          <div className="flex gap-1">
            {Array.from({ length: totalRounds }).map((_, i) => (
              <div
                key={i}
                className="w-8 h-2 rounded-full bg-yellow-500/60"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Clock className="w-5 h-5" />
          <span className="text-sm font-bold tracking-wide">WAITING TO START</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-panel rounded-xl p-4 transition-all duration-500 ${
      isImminent
        ? 'border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
        : isClose
          ? 'border-orange-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
          : ''
    }`}>
      {/* Top row: Live badge + Cycle counter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Live</span>
        </div>
        <span className="text-xs font-mono text-gray-400">
          Cycle {currentRound}/{totalRounds}
        </span>
      </div>

      {/* Cycle progress dots */}
      <div className="flex justify-center gap-1.5 mb-3">
        {Array.from({ length: totalRounds }).map((_, i) => {
          const cycleNum = i + 1;
          const isCompleted = cycleNum <= currentRound;
          const isCurrent = cycleNum === currentRound + 1;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <motion.div
                className={`h-2 rounded-full transition-all duration-300 ${
                  isCompleted
                    ? 'bg-emerald-500 w-10'
                    : isCurrent
                      ? 'bg-purple-500 w-10'
                      : 'bg-white/10 w-10'
                }`}
                animate={isCurrent ? { opacity: [1, 0.5, 1] } : {}}
                transition={isCurrent ? { duration: 1.5, repeat: Infinity } : {}}
              />
            </div>
          );
        })}
      </div>

      {/* Timer display */}
      {currentRound < totalRounds && (
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">
            {secondsLeft === 0 ? 'Executing...' : 'Next Cycle In'}
          </p>

          <motion.div
            key={secondsLeft}
            initial={secondsLeft <= 10 ? { scale: 1.08 } : { scale: 1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
            className={`text-3xl font-bold font-mono tabular-nums ${
              isImminent
                ? 'text-red-400'
                : isClose
                  ? 'text-orange-400'
                  : secondsLeft === 0
                    ? 'text-purple-400'
                    : 'text-white'
            }`}
          >
            {secondsLeft === 0 ? (
              <span className="flex items-center justify-center gap-2">
                <Radio className="w-5 h-5 animate-pulse" />
                <span>Processing</span>
              </span>
            ) : (
              formatTime(secondsLeft)
            )}
          </motion.div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                isImminent
                  ? 'bg-red-500'
                  : isClose
                    ? 'bg-orange-500'
                    : 'bg-purple-500'
              }`}
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Imminent execution warning */}
          {isImminent && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-red-400/80 mt-2 animate-pulse"
            >
              Cycle execution imminent...
            </motion.p>
          )}
        </div>
      )}
    </div>
  );
}
