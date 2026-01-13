'use client';

/**
 * Achievement badge component with unlock state and progress
 */

import React from 'react';
import { Achievement, RARITY_COLORS, getAchievementProgress } from '../../utils/achievements';

interface AchievementBadgeProps {
  achievement: Achievement;
  unlocked: boolean;
  progress?: number; // 0-100, or undefined to calculate from currentValue
  currentValue?: number;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  showTooltip?: boolean;
  onClick?: () => void;
  className?: string;
}

const SIZE_CONFIG = {
  sm: { container: 'w-10 h-10', icon: 'text-lg', ring: 'p-0.5' },
  md: { container: 'w-16 h-16', icon: 'text-2xl', ring: 'p-1' },
  lg: { container: 'w-24 h-24', icon: 'text-4xl', ring: 'p-1.5' },
};

export function AchievementBadge({
  achievement,
  unlocked,
  progress: propProgress,
  currentValue,
  size = 'md',
  showProgress = true,
  showTooltip = true,
  onClick,
  className = '',
}: AchievementBadgeProps) {
  const config = SIZE_CONFIG[size];
  const colors = RARITY_COLORS[achievement.rarity];

  // Calculate progress
  const progress = propProgress ?? (currentValue !== undefined
    ? getAchievementProgress(achievement, currentValue)
    : unlocked ? 100 : 0);

  // Calculate progress ring stroke
  const circumference = 2 * Math.PI * 45; // SVG circle radius of 45
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div
      className={`
        relative inline-flex items-center justify-center
        ${config.container}
        ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}
        ${className}
      `}
      onClick={onClick}
      title={showTooltip ? `${achievement.name}: ${achievement.description}` : undefined}
    >
      {/* Progress ring (only show if not unlocked and showing progress) */}
      {showProgress && !unlocked && progress > 0 && (
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
          />
          {/* Progress ring */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={unlocked ? colors.border.replace('border-', '') : 'rgba(255,255,255,0.5)'}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
      )}

      {/* Badge container */}
      <div
        className={`
          ${config.ring}
          rounded-full
          ${unlocked ? colors.bg : 'bg-gray-800/80'}
          ${unlocked ? `border-2 ${colors.border}` : 'border-2 border-gray-600'}
          ${unlocked ? `shadow-lg ${colors.glow}` : ''}
          ${unlocked ? 'animate-badge-unlock' : ''}
          flex items-center justify-center
          w-[85%] h-[85%]
        `}
      >
        {/* Icon */}
        <span
          className={`
            ${config.icon}
            ${unlocked ? '' : 'grayscale opacity-40'}
            transition-all duration-300
          `}
        >
          {unlocked ? achievement.icon : '🔒'}
        </span>
      </div>

      {/* Rarity indicator (small dot) */}
      {unlocked && (
        <div
          className={`
            absolute -bottom-1 -right-1
            w-3 h-3 rounded-full
            ${colors.bg} ${colors.border} border
            ${colors.glow} shadow-md
          `}
        />
      )}
    </div>
  );
}

/**
 * Achievement badge with label
 */
interface LabeledAchievementBadgeProps extends AchievementBadgeProps {
  showLabel?: boolean;
  labelPosition?: 'bottom' | 'right';
}

export function LabeledAchievementBadge({
  showLabel = true,
  labelPosition = 'bottom',
  ...props
}: LabeledAchievementBadgeProps) {
  const { achievement, unlocked } = props;
  const colors = RARITY_COLORS[achievement.rarity];

  if (!showLabel) {
    return <AchievementBadge {...props} />;
  }

  const containerClass = labelPosition === 'bottom'
    ? 'flex-col items-center'
    : 'flex-row items-center gap-3';

  return (
    <div className={`flex ${containerClass}`}>
      <AchievementBadge {...props} />
      <div className={labelPosition === 'bottom' ? 'mt-2 text-center' : ''}>
        <div className={`text-sm font-bold ${unlocked ? colors.text : 'text-gray-500'}`}>
          {achievement.name}
        </div>
        {achievement.hidden && !unlocked ? (
          <div className="text-xs text-gray-600">???</div>
        ) : (
          <div className="text-xs text-gray-400 max-w-[120px]">
            {achievement.description}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Grid of achievement badges
 */
interface AchievementGridProps {
  achievements: Achievement[];
  unlockedIds: string[];
  getProgress?: (achievementId: string) => number;
  onBadgeClick?: (achievement: Achievement) => void;
  size?: 'sm' | 'md' | 'lg';
  columns?: number;
  className?: string;
}

export function AchievementGrid({
  achievements,
  unlockedIds,
  getProgress,
  onBadgeClick,
  size = 'md',
  columns = 4,
  className = '',
}: AchievementGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }[columns] || 'grid-cols-4';

  return (
    <div className={`grid ${gridCols} gap-4 ${className}`}>
      {achievements.map((achievement) => (
        <LabeledAchievementBadge
          key={achievement.id}
          achievement={achievement}
          unlocked={unlockedIds.includes(achievement.id)}
          progress={getProgress?.(achievement.id)}
          size={size}
          onClick={() => onBadgeClick?.(achievement)}
        />
      ))}
    </div>
  );
}
