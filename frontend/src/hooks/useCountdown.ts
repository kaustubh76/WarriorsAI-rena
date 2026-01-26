'use client';

/**
 * Countdown Timer Hooks
 * Hooks for countdown timers and time-based state management
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface CountdownState {
  /** Total milliseconds remaining */
  totalMs: number;
  /** Days remaining */
  days: number;
  /** Hours remaining (0-23) */
  hours: number;
  /** Minutes remaining (0-59) */
  minutes: number;
  /** Seconds remaining (0-59) */
  seconds: number;
  /** Whether the countdown has finished */
  isFinished: boolean;
  /** Whether the countdown is currently running */
  isRunning: boolean;
}

export interface UseCountdownOptions {
  /** Callback when countdown finishes */
  onFinish?: () => void;
  /** Callback on each tick */
  onTick?: (state: CountdownState) => void;
  /** Update interval in ms (default: 1000) */
  interval?: number;
  /** Whether to start automatically (default: true) */
  autoStart?: boolean;
}

/**
 * Parse milliseconds into time components
 */
function parseMs(ms: number): Omit<CountdownState, 'isFinished' | 'isRunning'> {
  const totalMs = Math.max(0, ms);

  const days = Math.floor(totalMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((totalMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((totalMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((totalMs % (60 * 1000)) / 1000);

  return { totalMs, days, hours, minutes, seconds };
}

/**
 * Hook for countdown to a specific date/time
 *
 * @example
 * const { days, hours, minutes, seconds, isFinished } = useCountdown(
 *   new Date('2024-12-31'),
 *   { onFinish: () => console.log('Happy New Year!') }
 * );
 */
export function useCountdown(
  targetDate: Date | string | number,
  options: UseCountdownOptions = {}
): CountdownState & {
  start: () => void;
  pause: () => void;
  reset: () => void;
} {
  const { onFinish, onTick, interval = 1000, autoStart = true } = options;

  const targetTime = useRef(new Date(targetDate).getTime());
  const [isRunning, setIsRunning] = useState(autoStart);
  const [state, setState] = useState<CountdownState>(() => {
    const remaining = targetTime.current - Date.now();
    return {
      ...parseMs(remaining),
      isFinished: remaining <= 0,
      isRunning: autoStart,
    };
  });

  const onFinishRef = useRef(onFinish);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onFinishRef.current = onFinish;
    onTickRef.current = onTick;
  }, [onFinish, onTick]);

  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      const remaining = targetTime.current - Date.now();
      const parsed = parseMs(remaining);
      const isFinished = remaining <= 0;

      const newState: CountdownState = {
        ...parsed,
        isFinished,
        isRunning: !isFinished,
      };

      setState(newState);
      onTickRef.current?.(newState);

      if (isFinished) {
        setIsRunning(false);
        onFinishRef.current?.();
      }
    };

    // Initial tick
    tick();

    const intervalId = setInterval(tick, interval);
    return () => clearInterval(intervalId);
  }, [isRunning, interval]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    targetTime.current = new Date(targetDate).getTime();
    const remaining = targetTime.current - Date.now();
    setState({
      ...parseMs(remaining),
      isFinished: remaining <= 0,
      isRunning: autoStart,
    });
    setIsRunning(autoStart);
  }, [targetDate, autoStart]);

  return { ...state, start, pause, reset };
}

/**
 * Hook for a countdown timer (duration-based)
 *
 * @example
 * const { minutes, seconds, isFinished, start, reset } = useTimer(
 *   60000, // 1 minute
 *   { autoStart: false }
 * );
 */
export function useTimer(
  durationMs: number,
  options: UseCountdownOptions = {}
): CountdownState & {
  start: () => void;
  pause: () => void;
  reset: () => void;
  restart: () => void;
} {
  const { onFinish, onTick, interval = 1000, autoStart = true } = options;

  const [remaining, setRemaining] = useState(durationMs);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isFinished, setIsFinished] = useState(false);

  const onFinishRef = useRef(onFinish);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onFinishRef.current = onFinish;
    onTickRef.current = onTick;
  }, [onFinish, onTick]);

  useEffect(() => {
    if (!isRunning || isFinished) return;

    const tick = () => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - interval);
        const parsed = parseMs(next);
        const finished = next <= 0;

        const state: CountdownState = {
          ...parsed,
          isFinished: finished,
          isRunning: !finished,
        };

        onTickRef.current?.(state);

        if (finished) {
          setIsFinished(true);
          setIsRunning(false);
          onFinishRef.current?.();
        }

        return next;
      });
    };

    const intervalId = setInterval(tick, interval);
    return () => clearInterval(intervalId);
  }, [isRunning, isFinished, interval]);

  const start = useCallback(() => {
    if (!isFinished) {
      setIsRunning(true);
    }
  }, [isFinished]);

  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    setRemaining(durationMs);
    setIsFinished(false);
    setIsRunning(false);
  }, [durationMs]);

  const restart = useCallback(() => {
    setRemaining(durationMs);
    setIsFinished(false);
    setIsRunning(true);
  }, [durationMs]);

  const parsed = parseMs(remaining);

  return {
    ...parsed,
    isFinished,
    isRunning,
    start,
    pause,
    reset,
    restart,
  };
}

/**
 * Hook for a stopwatch (counts up)
 *
 * @example
 * const { minutes, seconds, start, pause, reset } = useStopwatch();
 */
export function useStopwatch(
  options: {
    autoStart?: boolean;
    interval?: number;
  } = {}
): {
  totalMs: number;
  hours: number;
  minutes: number;
  seconds: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  lap: () => number[];
  laps: number[];
} {
  const { autoStart = false, interval = 1000 } = options;

  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [laps, setLaps] = useState<number[]>([]);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  useEffect(() => {
    if (!isRunning) return;

    startTimeRef.current = Date.now() - elapsedRef.current;

    const tick = () => {
      const newElapsed = Date.now() - startTimeRef.current;
      elapsedRef.current = newElapsed;
      setElapsed(newElapsed);
    };

    const intervalId = setInterval(tick, interval);
    return () => clearInterval(intervalId);
  }, [isRunning, interval]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    setElapsed(0);
    elapsedRef.current = 0;
    setIsRunning(false);
    setLaps([]);
  }, []);

  const lap = useCallback(() => {
    setLaps((prev) => [...prev, elapsed]);
    return [...laps, elapsed];
  }, [elapsed, laps]);

  const hours = Math.floor(elapsed / (60 * 60 * 1000));
  const minutes = Math.floor((elapsed % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((elapsed % (60 * 1000)) / 1000);

  return {
    totalMs: elapsed,
    hours,
    minutes,
    seconds,
    isRunning,
    start,
    pause,
    reset,
    lap,
    laps,
  };
}

/**
 * Hook to check if a deadline has passed
 *
 * @example
 * const isExpired = useDeadline(marketCloseDate);
 */
export function useDeadline(
  deadline: Date | string | number,
  interval: number = 1000
): boolean {
  const [isExpired, setIsExpired] = useState(() => {
    return Date.now() >= new Date(deadline).getTime();
  });

  useEffect(() => {
    const targetTime = new Date(deadline).getTime();

    if (Date.now() >= targetTime) {
      setIsExpired(true);
      return;
    }

    const check = () => {
      if (Date.now() >= targetTime) {
        setIsExpired(true);
      }
    };

    const intervalId = setInterval(check, interval);
    return () => clearInterval(intervalId);
  }, [deadline, interval]);

  return isExpired;
}

export default useCountdown;
