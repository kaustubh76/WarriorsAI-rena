/**
 * Hook for animated number counter
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseAnimatedCounterOptions {
  duration?: number; // Animation duration in ms
  decimals?: number; // Number of decimal places
  easing?: 'linear' | 'easeOut' | 'easeInOut';
}

export interface UseAnimatedCounterReturn {
  displayValue: string;
  isAnimating: boolean;
  direction: 'up' | 'down' | 'none';
  setValue: (newValue: number) => void;
}

const easingFunctions = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

export function useAnimatedCounter(
  initialValue: number = 0,
  options: UseAnimatedCounterOptions = {}
): UseAnimatedCounterReturn {
  const {
    duration = 500,
    decimals = 2,
    easing = 'easeOut',
  } = options;

  const [displayValue, setDisplayValue] = useState(initialValue.toFixed(decimals));
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down' | 'none'>('none');

  const currentValue = useRef<number>(initialValue);
  const targetValue = useRef<number>(initialValue);
  const animationFrame = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const startValue = useRef<number>(initialValue);

  const animate = useCallback(() => {
    if (startTime.current === null) {
      startTime.current = performance.now();
      startValue.current = currentValue.current;
    }

    const elapsed = performance.now() - startTime.current;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easingFunctions[easing](progress);

    const start = startValue.current;
    const target = targetValue.current;
    const current = start + (target - start) * easedProgress;

    currentValue.current = current;
    setDisplayValue(current.toFixed(decimals));

    if (progress < 1) {
      animationFrame.current = requestAnimationFrame(animate);
    } else {
      setIsAnimating(false);
      setDirection('none');
      startTime.current = null;
    }
  }, [duration, decimals, easing]);

  const setValue = useCallback((newValue: number) => {
    const oldValue = currentValue.current;

    if (newValue === oldValue) return;

    // Cancel existing animation
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }

    // Set direction
    setDirection(newValue > oldValue ? 'up' : 'down');

    // Start new animation
    targetValue.current = newValue;
    startTime.current = null;
    setIsAnimating(true);
    animationFrame.current = requestAnimationFrame(animate);
  }, [animate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, []);

  return {
    displayValue,
    isAnimating,
    direction,
    setValue,
  };
}

/**
 * Hook for animated counter that syncs with external value
 */
export function useAnimatedValue(
  value: number,
  options: UseAnimatedCounterOptions = {}
): { displayValue: string; isAnimating: boolean; direction: 'up' | 'down' | 'none' } {
  const counter = useAnimatedCounter(value, options);

  useEffect(() => {
    counter.setValue(value);
  }, [value, counter.setValue]);

  return {
    displayValue: counter.displayValue,
    isAnimating: counter.isAnimating,
    direction: counter.direction,
  };
}
