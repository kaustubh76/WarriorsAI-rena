'use client';

/**
 * Gamification context - wraps useGamification hook with notification integration
 */

import React, { createContext, useContext, useCallback, useState, ReactNode } from 'react';
import { useGamification, UseGamificationReturn, TradeResultEvent } from '../hooks/useGamification';
import { useNotifications } from './NotificationContext';
import { Achievement } from '../utils/achievements';
import { StreakMilestone } from '../hooks/useStreak';
import { Quest } from '../utils/quests';

interface GamificationContextValue extends UseGamificationReturn {
  // UI State
  showAchievementModal: boolean;
  currentAchievement: Achievement | null;
  showConfetti: boolean;
  confettiIntensity: 'low' | 'medium' | 'high';

  // UI Actions
  triggerConfetti: (intensity?: 'low' | 'medium' | 'high') => void;
  closeAchievementModal: () => void;

  // Enhanced Actions (with notifications)
  handleTradeComplete: (result: TradeResultEvent) => void;
  handleFollowAgent: () => void;
  handleCopyTrade: () => void;
  handleAddLiquidity: () => void;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

export function GamificationProvider({ children }: { children: ReactNode }) {
  const notifications = useNotifications();

  // UI State
  const [showAchievementModal, setShowAchievementModal] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiIntensity, setConfettiIntensity] = useState<'low' | 'medium' | 'high'>('low');

  // UI Actions - Define BEFORE event handlers that use them
  const triggerConfetti = useCallback((intensity: 'low' | 'medium' | 'high' = 'medium') => {
    setConfettiIntensity(intensity);
    setShowConfetti(true);

    // Auto-hide after animation
    const duration = intensity === 'high' ? 5000 : intensity === 'medium' ? 3000 : 2000;
    setTimeout(() => setShowConfetti(false), duration);
  }, []);

  const closeAchievementModal = useCallback(() => {
    setShowAchievementModal(false);
    setCurrentAchievement(null);
  }, []);

  // Event handlers for gamification (use triggerConfetti defined above)
  const handleAchievementUnlocked = useCallback((achievement: Achievement) => {
    notifications.achievement(achievement);
    setCurrentAchievement(achievement);
    setShowAchievementModal(true);
    triggerConfetti('medium');
  }, [notifications, triggerConfetti]);

  const handleStreakMilestone = useCallback((milestone: StreakMilestone) => {
    notifications.streak(milestone.streak, milestone.isNew);
    if (milestone.streak >= 10) {
      triggerConfetti('high');
    } else if (milestone.streak >= 5) {
      triggerConfetti('medium');
    }
  }, [notifications, triggerConfetti]);

  const handleQuestCompleted = useCallback((quest: Quest) => {
    notifications.questComplete(quest);
  }, [notifications]);

  const handleLevelUp = useCallback((newLevel: number) => {
    notifications.levelUp(newLevel);
    triggerConfetti('high');
  }, [notifications, triggerConfetti]);

  // Initialize gamification with event handlers
  const gamification = useGamification({
    onAchievementUnlocked: handleAchievementUnlocked,
    onStreakMilestone: handleStreakMilestone,
    onQuestCompleted: handleQuestCompleted,
    onLevelUp: handleLevelUp,
  });

  // Enhanced Actions with notifications
  const handleTradeComplete = useCallback((result: TradeResultEvent) => {
    const outcome = gamification.recordTradeResult(result);

    // Show trade result notification
    notifications.tradeResult(result.isWin, result.profit);

    // Check time-based achievements
    gamification.checkTimeBasedAchievements();

    // Trigger confetti for wins
    if (result.isWin) {
      if (result.profit > 500) {
        triggerConfetti('high');
      } else if (result.profit > 100) {
        triggerConfetti('medium');
      } else {
        triggerConfetti('low');
      }
    }
  }, [gamification, notifications, triggerConfetti]);

  const handleFollowAgent = useCallback(() => {
    gamification.recordFollow();
    notifications.success('Following Agent', 'Successfully followed agent');
  }, [gamification, notifications]);

  const handleCopyTrade = useCallback(() => {
    gamification.recordCopyTrade();
    notifications.success('Copy Trade', 'Trade copied from agent');
  }, [gamification, notifications]);

  const handleAddLiquidity = useCallback(() => {
    gamification.recordLiquidityAdded();
    notifications.success('Liquidity Added', 'Successfully added liquidity');
  }, [gamification, notifications]);

  const value: GamificationContextValue = {
    ...gamification,
    showAchievementModal,
    currentAchievement,
    showConfetti,
    confettiIntensity,
    triggerConfetti,
    closeAchievementModal,
    handleTradeComplete,
    handleFollowAgent,
    handleCopyTrade,
    handleAddLiquidity,
  };

  return (
    <GamificationContext.Provider value={value}>
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamificationContext(): GamificationContextValue {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamificationContext must be used within a GamificationProvider');
  }
  return context;
}
