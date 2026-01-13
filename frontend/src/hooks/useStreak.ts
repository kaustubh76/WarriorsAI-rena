/**
 * Hook for managing win and login streaks
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getGamificationData,
  setGamificationData,
  getTodayDateString,
} from '../utils/storage';

export interface StreakData {
  currentWinStreak: number;
  bestWinStreak: number;
  currentLoginStreak: number;
  bestLoginStreak: number;
  lastLoginDate: string;
  lastTradeDate: string;
}

export interface StreakMilestone {
  streak: number;
  type: 'win' | 'login';
  isNew: boolean;
}

export interface UseStreakReturn {
  streaks: StreakData;
  recordWin: () => StreakMilestone | null;
  recordLoss: () => void;
  recordLogin: () => StreakMilestone | null;
  getWinStreakLevel: () => 'none' | 'hot' | 'fire' | 'blazing' | 'legendary';
  isWinStreakMilestone: (streak: number) => boolean;
}

const STREAK_MILESTONES = [3, 5, 10, 15, 20, 25, 50, 100];

export function useStreak(): UseStreakReturn {
  const [streaks, setStreaks] = useState<StreakData>({
    currentWinStreak: 0,
    bestWinStreak: 0,
    currentLoginStreak: 0,
    bestLoginStreak: 0,
    lastLoginDate: '',
    lastTradeDate: '',
  });

  // Load streaks on mount
  useEffect(() => {
    const data = getGamificationData();
    setStreaks(data.streaks);
  }, []);

  const saveStreaks = useCallback((newStreaks: StreakData) => {
    const data = getGamificationData();
    data.streaks = newStreaks;
    setGamificationData(data);
    setStreaks(newStreaks);
  }, []);

  const recordWin = useCallback((): StreakMilestone | null => {
    const today = getTodayDateString();
    const newStreak = streaks.currentWinStreak + 1;
    const isNewBest = newStreak > streaks.bestWinStreak;

    const newStreaks: StreakData = {
      ...streaks,
      currentWinStreak: newStreak,
      bestWinStreak: Math.max(newStreak, streaks.bestWinStreak),
      lastTradeDate: today,
    };

    saveStreaks(newStreaks);

    // Check if this is a milestone
    if (STREAK_MILESTONES.includes(newStreak)) {
      return {
        streak: newStreak,
        type: 'win',
        isNew: isNewBest,
      };
    }

    return null;
  }, [streaks, saveStreaks]);

  const recordLoss = useCallback(() => {
    const today = getTodayDateString();

    const newStreaks: StreakData = {
      ...streaks,
      currentWinStreak: 0,
      lastTradeDate: today,
    };

    saveStreaks(newStreaks);
  }, [streaks, saveStreaks]);

  const recordLogin = useCallback((): StreakMilestone | null => {
    const today = getTodayDateString();

    // Already logged in today
    if (streaks.lastLoginDate === today) {
      return null;
    }

    // Check if this is consecutive day
    const lastDate = streaks.lastLoginDate ? new Date(streaks.lastLoginDate) : null;
    const todayDate = new Date(today);

    let newLoginStreak = 1;

    if (lastDate) {
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day
        newLoginStreak = streaks.currentLoginStreak + 1;
      }
      // If more than 1 day, streak resets to 1
    }

    const isNewBest = newLoginStreak > streaks.bestLoginStreak;

    const newStreaks: StreakData = {
      ...streaks,
      currentLoginStreak: newLoginStreak,
      bestLoginStreak: Math.max(newLoginStreak, streaks.bestLoginStreak),
      lastLoginDate: today,
    };

    saveStreaks(newStreaks);

    // Check if this is a milestone
    if (STREAK_MILESTONES.includes(newLoginStreak)) {
      return {
        streak: newLoginStreak,
        type: 'login',
        isNew: isNewBest,
      };
    }

    return null;
  }, [streaks, saveStreaks]);

  const getWinStreakLevel = useCallback((): 'none' | 'hot' | 'fire' | 'blazing' | 'legendary' => {
    const streak = streaks.currentWinStreak;

    if (streak >= 20) return 'legendary';
    if (streak >= 10) return 'blazing';
    if (streak >= 5) return 'fire';
    if (streak >= 3) return 'hot';
    return 'none';
  }, [streaks.currentWinStreak]);

  const isWinStreakMilestone = useCallback((streak: number): boolean => {
    return STREAK_MILESTONES.includes(streak);
  }, []);

  return {
    streaks,
    recordWin,
    recordLoss,
    recordLogin,
    getWinStreakLevel,
    isWinStreakMilestone,
  };
}
