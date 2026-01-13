'use client';

/**
 * Achievement unlock celebration modal
 */

import React, { useEffect, useState } from 'react';
import { Achievement, RARITY_COLORS } from '../../utils/achievements';
import { AchievementBadge } from './AchievementBadge';
import { AnimatedCounter } from './AnimatedCounter';

interface AchievementModalProps {
  achievement: Achievement | null;
  isOpen: boolean;
  onClose: () => void;
  autoCloseDelay?: number; // ms, 0 to disable
}

export function AchievementModal({
  achievement,
  isOpen,
  onClose,
  autoCloseDelay = 5000,
}: AchievementModalProps) {
  const [animatedXP, setAnimatedXP] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  // Handle animations when opened
  useEffect(() => {
    if (isOpen && achievement) {
      // Reset state
      setAnimatedXP(0);
      setShowDetails(false);

      // Animate XP after badge animation
      const xpTimer = setTimeout(() => {
        setAnimatedXP(achievement.xpReward);
      }, 600);

      // Show details
      const detailsTimer = setTimeout(() => {
        setShowDetails(true);
      }, 400);

      // Auto-close
      let closeTimer: NodeJS.Timeout | null = null;
      if (autoCloseDelay > 0) {
        closeTimer = setTimeout(onClose, autoCloseDelay);
      }

      return () => {
        clearTimeout(xpTimer);
        clearTimeout(detailsTimer);
        if (closeTimer) clearTimeout(closeTimer);
      };
    }
  }, [isOpen, achievement, autoCloseDelay, onClose]);

  if (!isOpen || !achievement) return null;

  const colors = RARITY_COLORS[achievement.rarity];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" />

      {/* Modal */}
      <div
        className={`
          relative
          bg-gradient-to-b from-gray-900 to-gray-950
          ${colors.border} border-2
          rounded-2xl
          p-8
          max-w-sm w-full
          text-center
          animate-scale-up
          ${colors.glow} shadow-2xl
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-yellow-400 text-sm font-bold tracking-wider mb-4 animate-pulse">
          ⭐ ACHIEVEMENT UNLOCKED ⭐
        </div>

        {/* Badge */}
        <div className="flex justify-center mb-6">
          <div className="animate-badge-unlock-large">
            <AchievementBadge
              achievement={achievement}
              unlocked={true}
              size="lg"
              showProgress={false}
              showTooltip={false}
            />
          </div>
        </div>

        {/* Name */}
        <h2 className={`text-2xl font-bold ${colors.text} mb-2 font-['Press_Start_2P']`}>
          {achievement.name}
        </h2>

        {/* Description */}
        <p
          className={`
            text-gray-300 mb-4
            transition-all duration-500
            ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          `}
        >
          {achievement.description}
        </p>

        {/* XP Reward */}
        <div
          className={`
            inline-flex items-center gap-2
            bg-yellow-900/30 border border-yellow-600
            px-4 py-2 rounded-full
            transition-all duration-500
            ${showDetails ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
          `}
        >
          <span className="text-yellow-500 text-xl">⭐</span>
          <span className="text-yellow-400 font-bold text-lg">
            +<AnimatedCounter value={animatedXP} decimals={0} showDirection={false} /> XP
          </span>
        </div>

        {/* Rarity badge */}
        <div
          className={`
            mt-4 inline-flex items-center
            px-3 py-1 rounded-full
            ${colors.bg} ${colors.border} border
            text-xs font-bold uppercase tracking-wider
            ${colors.text}
          `}
        >
          {achievement.rarity}
        </div>

        {/* Sparkle effects */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-sparkle"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 80}%`,
                animationDelay: `${i * 200}ms`,
              }}
            >
              ✨
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
