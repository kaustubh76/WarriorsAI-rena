'use client';

/**
 * Animated counter component for smooth number transitions
 */

import React from 'react';
import { useAnimatedValue } from '../../hooks/useAnimatedCounter';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  showDirection?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
};

export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  duration = 500,
  className = '',
  showDirection = true,
  size = 'md',
}: AnimatedCounterProps) {
  const { displayValue, isAnimating, direction } = useAnimatedValue(value, {
    decimals,
    duration,
  });

  const directionClass = showDirection
    ? direction === 'up'
      ? 'text-green-400'
      : direction === 'down'
      ? 'text-red-400'
      : ''
    : '';

  const animatingClass = isAnimating ? 'scale-105' : 'scale-100';

  return (
    <span
      className={`
        inline-flex items-center transition-all duration-200
        ${SIZE_CLASSES[size]}
        ${directionClass}
        ${animatingClass}
        ${className}
      `}
    >
      {prefix}
      <span className={isAnimating ? 'font-bold' : ''}>
        {displayValue}
      </span>
      {suffix}

      {/* Direction indicator */}
      {showDirection && direction !== 'none' && isAnimating && (
        <span className="ml-1 text-xs animate-pulse">
          {direction === 'up' ? '↑' : '↓'}
        </span>
      )}
    </span>
  );
}

/**
 * Animated counter specifically for currency/profit display
 */
interface ProfitCounterProps {
  value: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function ProfitCounter({ value, className = '', size = 'md' }: ProfitCounterProps) {
  const isPositive = value >= 0;

  return (
    <AnimatedCounter
      value={value}
      prefix={isPositive ? '+' : ''}
      suffix=" CRwN"
      decimals={2}
      className={`
        font-bold
        ${isPositive ? 'text-green-400' : 'text-red-400'}
        ${className}
      `}
      showDirection={false}
      size={size}
    />
  );
}

/**
 * XP counter with special styling
 */
interface XPCounterProps {
  value: number;
  className?: string;
}

export function XPCounter({ value, className = '' }: XPCounterProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-yellow-500">⭐</span>
      <AnimatedCounter
        value={value}
        suffix=" XP"
        decimals={0}
        className="text-yellow-400 font-bold"
        showDirection={false}
        size="sm"
      />
    </div>
  );
}
