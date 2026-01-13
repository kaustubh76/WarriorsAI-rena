'use client';

/**
 * Individual toast notification component
 */

import React, { useEffect, useState } from 'react';
import { Notification, NotificationType } from '../../contexts/NotificationContext';
import { RARITY_COLORS } from '../../utils/achievements';

interface ToastProps {
  notification: Notification;
  onClose: () => void;
}

const TYPE_STYLES: Record<NotificationType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-green-900/90',
    border: 'border-green-500',
    icon: '✓',
  },
  error: {
    bg: 'bg-red-900/90',
    border: 'border-red-500',
    icon: '✗',
  },
  warning: {
    bg: 'bg-yellow-900/90',
    border: 'border-yellow-500',
    icon: '⚠',
  },
  info: {
    bg: 'bg-blue-900/90',
    border: 'border-blue-500',
    icon: 'ℹ',
  },
  achievement: {
    bg: 'bg-gradient-to-r from-yellow-900/90 to-amber-800/90',
    border: 'border-yellow-400',
    icon: '🏆',
  },
  streak: {
    bg: 'bg-gradient-to-r from-orange-900/90 to-red-800/90',
    border: 'border-orange-500',
    icon: '🔥',
  },
  quest: {
    bg: 'bg-gradient-to-r from-purple-900/90 to-indigo-800/90',
    border: 'border-purple-500',
    icon: '📋',
  },
  levelup: {
    bg: 'bg-gradient-to-r from-cyan-900/90 to-blue-800/90',
    border: 'border-cyan-400',
    icon: '⬆️',
  },
  whale_alert: {
    bg: 'bg-gradient-to-r from-blue-900/90 to-cyan-800/90',
    border: 'border-blue-400',
    icon: '🐋',
  },
};

export function Toast({ notification, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(true);

  const styles = TYPE_STYLES[notification.type];
  const icon = notification.icon || styles.icon;

  // Handle entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 50);
    return () => clearTimeout(timer);
  }, []);

  // Handle exit animation
  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  // Special styling for achievements based on rarity
  let specialStyles = '';
  if (notification.achievement) {
    const rarityColors = RARITY_COLORS[notification.achievement.rarity];
    specialStyles = `${rarityColors.glow} shadow-lg`;
  }

  return (
    <div
      className={`
        relative overflow-hidden
        ${styles.bg} ${styles.border}
        border-2 rounded-lg
        p-4 min-w-[280px] max-w-[360px]
        transform transition-all duration-300 ease-out
        ${isEntering ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
        ${isExiting ? 'translate-x-full opacity-0' : ''}
        ${specialStyles}
        ${notification.type === 'achievement' ? 'animate-achievement-shimmer' : ''}
      `}
    >
      {/* Shimmer effect for achievements */}
      {notification.type === 'achievement' && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/20 to-transparent animate-shimmer" />
      )}

      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
      >
        ✕
      </button>

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`
          text-2xl flex-shrink-0
          ${notification.type === 'streak' ? 'animate-flame-pulse' : ''}
          ${notification.type === 'levelup' ? 'animate-bounce' : ''}
        `}>
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-white text-sm font-['Press_Start_2P'] leading-tight">
            {notification.title}
          </h4>
          {notification.message && (
            <p className="text-gray-300 text-xs mt-1">
              {notification.message}
            </p>
          )}

          {/* XP reward */}
          {notification.xp && (
            <div className="mt-2 text-yellow-400 text-xs font-bold">
              +{notification.xp} XP
            </div>
          )}

          {/* Streak count */}
          {notification.streak && notification.type === 'streak' && (
            <div className="mt-2 flex items-center gap-1">
              {Array.from({ length: Math.min(notification.streak, 10) }).map((_, i) => (
                <span key={i} className="text-sm">🔥</span>
              ))}
              {notification.streak > 10 && (
                <span className="text-orange-400 text-xs ml-1">+{notification.streak - 10}</span>
              )}
            </div>
          )}

          {/* Level badge */}
          {notification.level && notification.type === 'levelup' && (
            <div className="mt-2 inline-flex items-center gap-2 bg-cyan-500/30 px-3 py-1 rounded-full">
              <span className="text-cyan-300 text-xs font-bold">LVL</span>
              <span className="text-white text-lg font-bold">{notification.level}</span>
            </div>
          )}

          {/* Whale trade info */}
          {notification.whaleTrade && notification.type === 'whale_alert' && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={notification.whaleTrade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                {notification.whaleTrade.outcome.toUpperCase()}
              </span>
              <span className="text-gray-400">on</span>
              <span className="text-blue-300 capitalize">{notification.whaleTrade.source}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar for timed notifications */}
      {notification.duration && notification.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
          <div
            className="h-full bg-white/30 transition-all ease-linear"
            style={{
              animation: `shrink-width ${notification.duration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
}
