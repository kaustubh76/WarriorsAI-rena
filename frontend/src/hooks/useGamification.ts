/**
 * Unified gamification hook - facade for all gamification features
 */

import { useCallback, useEffect } from 'react';
import { useSounds } from './useSounds';
import { useStreak, StreakMilestone } from './useStreak';
import { useAchievements } from './useAchievements';
import { useDailyQuests } from './useDailyQuests';
import {
  getGamificationData,
  setGamificationData,
  incrementStat,
  getLevelFromXP,
  getXPProgress,
} from '../utils/storage';
import { Achievement } from '../utils/achievements';
import { Quest, QuestType } from '../utils/quests';

export interface TradeResultEvent {
  isWin: boolean;
  profit: number;
  volume?: number;
}

export interface GamificationEvents {
  onAchievementUnlocked?: (achievement: Achievement) => void;
  onStreakMilestone?: (milestone: StreakMilestone) => void;
  onQuestCompleted?: (quest: Quest) => void;
  onLevelUp?: (newLevel: number) => void;
}

export interface UseGamificationReturn {
  // Sounds
  sounds: ReturnType<typeof useSounds>;

  // Streaks
  streaks: ReturnType<typeof useStreak>;

  // Achievements
  achievements: ReturnType<typeof useAchievements>;

  // Daily Quests
  quests: ReturnType<typeof useDailyQuests>;

  // Stats
  stats: {
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
    totalProfit: number;
    totalXP: number;
    level: number;
    xpProgress: { current: number; needed: number; percent: number };
  };

  // Actions
  recordTradeResult: (result: TradeResultEvent) => {
    achievements: Achievement[];
    streakMilestone: StreakMilestone | null;
    questCompleted: Quest | null;
    leveledUp: boolean;
    newLevel: number;
  };
  recordFollow: () => Achievement[];
  recordCopyTrade: () => Achievement[];
  recordLiquidityAdded: () => Achievement[];
  recordBattleViewed: () => Quest | null;
  checkTimeBasedAchievements: () => Achievement[];

  // Level
  getLevel: () => number;
  getXPProgress: () => { current: number; needed: number; percent: number };
}

export function useGamification(events?: GamificationEvents): UseGamificationReturn {
  const sounds = useSounds();
  const streaks = useStreak();
  const achievements = useAchievements();
  const quests = useDailyQuests();

  // Record login on mount
  useEffect(() => {
    const milestone = streaks.recordLogin();
    if (milestone && events?.onStreakMilestone) {
      events.onStreakMilestone(milestone);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getStats = useCallback(() => {
    const data = getGamificationData();
    return {
      ...data.stats,
      xpProgress: getXPProgress(data.stats.totalXP),
    };
  }, []);

  const recordTradeResult = useCallback((result: TradeResultEvent) => {
    const { isWin, profit, volume = 0 } = result;
    const data = getGamificationData();
    const previousLevel = getLevelFromXP(data.stats.totalXP);

    // Update stats
    incrementStat('totalTrades', 1);
    if (isWin) {
      incrementStat('totalWins', 1);
      incrementStat('totalProfit', profit);
    } else {
      incrementStat('totalLosses', 1);
    }

    // Record streak
    let streakMilestone: StreakMilestone | null = null;
    if (isWin) {
      streakMilestone = streaks.recordWin();
    } else {
      streaks.recordLoss();
    }

    // Check achievements
    const updatedData = getGamificationData();
    const newAchievements = achievements.checkAndUnlock({
      totalTrades: updatedData.stats.totalTrades,
      totalWins: updatedData.stats.totalWins,
      totalProfit: updatedData.stats.totalProfit,
      bestWinStreak: updatedData.streaks.bestWinStreak,
    });

    // Track quest progress
    let questCompleted: Quest | null = null;
    const tradeQuest = quests.trackProgress('complete_trades', 1);
    if (tradeQuest) questCompleted = tradeQuest;

    if (isWin) {
      const winQuest = quests.trackProgress('win_trades', 1);
      if (winQuest) questCompleted = winQuest;

      if (profit > 0) {
        const profitQuest = quests.trackProgress('profit_target', profit);
        if (profitQuest) questCompleted = profitQuest;
      }
    }

    if (volume > 0) {
      const volumeQuest = quests.trackProgress('trade_volume', volume);
      if (volumeQuest) questCompleted = volumeQuest;
    }

    // Check for level up
    const finalData = getGamificationData();
    const newLevel = getLevelFromXP(finalData.stats.totalXP);
    const leveledUp = newLevel > previousLevel;

    // Play sounds
    sounds.playTradeResult(isWin, profit);

    if (streakMilestone) {
      sounds.playStreakCelebration(streakMilestone.streak);
    }

    if (newAchievements.length > 0) {
      sounds.play('achievement');
    }

    if (leveledUp) {
      sounds.playLevelUp();
    }

    // Trigger events
    newAchievements.forEach(a => events?.onAchievementUnlocked?.(a));
    if (streakMilestone) events?.onStreakMilestone?.(streakMilestone);
    if (questCompleted) events?.onQuestCompleted?.(questCompleted);
    if (leveledUp) events?.onLevelUp?.(newLevel);

    return {
      achievements: newAchievements,
      streakMilestone,
      questCompleted,
      leveledUp,
      newLevel,
    };
  }, [sounds, streaks, achievements, quests, events]);

  const recordFollow = useCallback((): Achievement[] => {
    incrementStat('totalFollows', 1);
    const data = getGamificationData();

    const newAchievements = achievements.checkAndUnlock({
      totalFollows: data.stats.totalFollows,
    });

    quests.trackProgress('follow_agent', 1);
    sounds.play('notification');

    newAchievements.forEach(a => events?.onAchievementUnlocked?.(a));

    return newAchievements;
  }, [achievements, quests, sounds, events]);

  const recordCopyTrade = useCallback((): Achievement[] => {
    incrementStat('totalCopyTrades', 1);
    const data = getGamificationData();

    const newAchievements = achievements.checkAndUnlock({
      totalCopyTrades: data.stats.totalCopyTrades,
    });

    quests.trackProgress('copy_trade', 1);
    sounds.play('coin');

    newAchievements.forEach(a => events?.onAchievementUnlocked?.(a));

    return newAchievements;
  }, [achievements, quests, sounds, events]);

  const recordLiquidityAdded = useCallback((): Achievement[] => {
    incrementStat('totalLiquidityAdded', 1);
    const data = getGamificationData();

    const newAchievements = achievements.checkAndUnlock({
      totalLiquidityAdded: data.stats.totalLiquidityAdded,
    });

    quests.trackProgress('add_liquidity', 1);
    sounds.play('coin');

    newAchievements.forEach(a => events?.onAchievementUnlocked?.(a));

    return newAchievements;
  }, [achievements, quests, sounds, events]);

  const recordBattleViewed = useCallback((): Quest | null => {
    return quests.trackProgress('view_battles', 1);
  }, [quests]);

  const checkTimeBasedAchievements = useCallback((): Achievement[] => {
    const hour = new Date().getHours();
    const newAchievements: Achievement[] = [];

    // Early bird: trade before 8 AM
    if (hour < 8) {
      const a = achievements.unlockSpecialAchievement('early_bird');
      if (a) newAchievements.push(a);
    }

    // Night owl: trade after midnight (0-4 AM)
    if (hour >= 0 && hour < 4) {
      const a = achievements.unlockSpecialAchievement('night_owl');
      if (a) newAchievements.push(a);
    }

    if (newAchievements.length > 0) {
      sounds.play('achievement');
      newAchievements.forEach(a => events?.onAchievementUnlocked?.(a));
    }

    return newAchievements;
  }, [achievements, sounds, events]);

  const getLevel = useCallback((): number => {
    const data = getGamificationData();
    return getLevelFromXP(data.stats.totalXP);
  }, []);

  const getXPProgressFn = useCallback(() => {
    const data = getGamificationData();
    return getXPProgress(data.stats.totalXP);
  }, []);

  // Get current stats
  const stats = getStats();

  return {
    sounds,
    streaks,
    achievements,
    quests,
    stats,
    recordTradeResult,
    recordFollow,
    recordCopyTrade,
    recordLiquidityAdded,
    recordBattleViewed,
    checkTimeBasedAchievements,
    getLevel,
    getXPProgress: getXPProgressFn,
  };
}
