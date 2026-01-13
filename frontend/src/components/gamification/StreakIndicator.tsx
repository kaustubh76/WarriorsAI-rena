'use client';

/**
 * Win streak indicator component with fire animations
 */

import React from 'react';

interface StreakIndicatorProps {
  streak: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CONFIG = {
  sm: { text: 'text-sm', icon: 'text-base', gap: 'gap-1' },
  md: { text: 'text-base', icon: 'text-xl', gap: 'gap-1.5' },
  lg: { text: 'text-xl', icon: 'text-3xl', gap: 'gap-2' },
};

export function StreakIndicator({
  streak,
  showLabel = false,
  size = 'md',
  className = '',
}: StreakIndicatorProps) {
  if (streak < 1) return null;

  const config = SIZE_CONFIG[size];
  const level = getStreakLevel(streak);

  return (
    <div
      className={`
        inline-flex items-center ${config.gap}
        px-2 py-1 rounded-lg
        ${level.bgClass}
        ${className}
      `}
      title={`${streak} win streak!`}
    >
      {/* Fire icon with animation */}
      <span className={`${config.icon} ${level.animationClass}`}>
        {level.icon}
      </span>

      {/* Streak count */}
      <span className={`font-bold ${config.text} ${level.textClass}`}>
        {streak}
      </span>

      {/* Label */}
      {showLabel && (
        <span className={`text-xs ${level.textClass} opacity-80`}>
          {level.label}
        </span>
      )}
    </div>
  );
}

interface StreakLevel {
  icon: string;
  label: string;
  textClass: string;
  bgClass: string;
  animationClass: string;
}

function getStreakLevel(streak: number): StreakLevel {
  if (streak >= 20) {
    return {
      icon: '🌟',
      label: 'LEGENDARY',
      textClass: 'text-purple-300',
      bgClass: 'bg-gradient-to-r from-purple-900/80 to-pink-900/80 border border-purple-500',
      animationClass: 'animate-legendary-flame',
    };
  }
  if (streak >= 10) {
    return {
      icon: '🔥',
      label: 'BLAZING',
      textClass: 'text-red-300',
      bgClass: 'bg-gradient-to-r from-red-900/80 to-orange-900/80 border border-red-500',
      animationClass: 'animate-blazing-flame',
    };
  }
  if (streak >= 5) {
    return {
      icon: '🔥',
      label: 'ON FIRE',
      textClass: 'text-orange-300',
      bgClass: 'bg-orange-900/60 border border-orange-500',
      animationClass: 'animate-flame-pulse',
    };
  }
  if (streak >= 3) {
    return {
      icon: '🔥',
      label: 'HOT',
      textClass: 'text-yellow-300',
      bgClass: 'bg-yellow-900/50 border border-yellow-600',
      animationClass: 'animate-pulse',
    };
  }
  return {
    icon: '✨',
    label: 'STREAK',
    textClass: 'text-gray-300',
    bgClass: 'bg-gray-800/50 border border-gray-600',
    animationClass: '',
  };
}

/**
 * Compact streak indicator for header
 */
interface CompactStreakProps {
  streak: number;
  className?: string;
}

export function CompactStreak({ streak, className = '' }: CompactStreakProps) {
  if (streak < 1) return null;

  const level = getStreakLevel(streak);

  return (
    <div
      className={`
        inline-flex items-center gap-0.5
        px-1.5 py-0.5 rounded
        ${level.bgClass}
        ${className}
      `}
      title={`${streak} win streak!`}
    >
      <span className={`text-sm ${level.animationClass}`}>
        {level.icon}
      </span>
      <span className={`text-xs font-bold ${level.textClass}`}>
        {streak}
      </span>
    </div>
  );
}
