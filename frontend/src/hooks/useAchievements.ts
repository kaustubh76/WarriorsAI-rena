/**
 * Hook for managing achievements
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getGamificationData,
  setGamificationData,
  GamificationStorage,
} from '../utils/storage';
import {
  Achievement,
  ACHIEVEMENTS,
  getAchievementById,
  calculateTotalAchievementXP,
} from '../utils/achievements';

export interface UnlockedAchievement {
  achievement: Achievement;
  unlockedAt: number;
  progress?: number;
}

export interface UseAchievementsReturn {
  unlockedAchievements: UnlockedAchievement[];
  allAchievements: Achievement[];
  totalXP: number;
  isUnlocked: (achievementId: string) => boolean;
  getProgress: (achievementId: string) => number;
  checkAndUnlock: (stats: Partial<GamificationStorage['stats']> & Partial<GamificationStorage['streaks']>) => Achievement[];
  unlockAchievement: (achievementId: string) => Achievement | null;
  unlockSpecialAchievement: (achievementId: string) => Achievement | null;
}

export function useAchievements(): UseAchievementsReturn {
  const [unlockedMap, setUnlockedMap] = useState<Record<string, { unlockedAt: number; progress?: number }>>({});

  // Load achievements on mount
  useEffect(() => {
    const data = getGamificationData();
    setUnlockedMap(data.achievements);
  }, []);

  const saveAchievements = useCallback((newMap: Record<string, { unlockedAt: number; progress?: number }>) => {
    const data = getGamificationData();
    data.achievements = newMap;
    setGamificationData(data);
    setUnlockedMap(newMap);
  }, []);

  const isUnlocked = useCallback((achievementId: string): boolean => {
    return achievementId in unlockedMap;
  }, [unlockedMap]);

  const getProgress = useCallback((achievementId: string): number => {
    const achievement = getAchievementById(achievementId);
    if (!achievement) return 0;

    // If already unlocked, return 100
    if (unlockedMap[achievementId]) return 100;

    // Get current stats
    const data = getGamificationData();
    const stats = data.stats;
    const streaks = data.streaks;

    // Get the stat value based on checkStat
    if (!achievement.checkStat) return 0;

    let currentValue = 0;
    if (achievement.checkStat in stats) {
      currentValue = stats[achievement.checkStat as keyof typeof stats] as number;
    } else if (achievement.checkStat in streaks) {
      currentValue = streaks[achievement.checkStat as keyof typeof streaks] as number;
    }

    return Math.min(100, Math.floor((currentValue / achievement.requirement) * 100));
  }, [unlockedMap]);

  const unlockAchievement = useCallback((achievementId: string): Achievement | null => {
    if (unlockedMap[achievementId]) return null; // Already unlocked

    const achievement = getAchievementById(achievementId);
    if (!achievement) return null;

    const newMap = {
      ...unlockedMap,
      [achievementId]: { unlockedAt: Date.now() },
    };

    // Add XP to stats
    const data = getGamificationData();
    data.stats.totalXP += achievement.xpReward;
    data.achievements = newMap;
    setGamificationData(data);
    setUnlockedMap(newMap);

    return achievement;
  }, [unlockedMap]);

  const unlockSpecialAchievement = useCallback((achievementId: string): Achievement | null => {
    // For special achievements that don't have automatic stat checks
    return unlockAchievement(achievementId);
  }, [unlockAchievement]);

  const checkAndUnlock = useCallback((
    stats: Partial<GamificationStorage['stats']> & Partial<GamificationStorage['streaks']>
  ): Achievement[] => {
    const newlyUnlocked: Achievement[] = [];

    for (const achievement of ACHIEVEMENTS) {
      // Skip if already unlocked
      if (unlockedMap[achievement.id]) continue;

      // Skip if no stat check
      if (!achievement.checkStat) continue;

      const currentValue = stats[achievement.checkStat as keyof typeof stats];
      if (typeof currentValue !== 'number') continue;

      // Check if requirement is met
      if (currentValue >= achievement.requirement) {
        const unlocked = unlockAchievement(achievement.id);
        if (unlocked) {
          newlyUnlocked.push(unlocked);
        }
      }
    }

    return newlyUnlocked;
  }, [unlockedMap, unlockAchievement]);

  // Compute derived values
  const unlockedAchievements: UnlockedAchievement[] = Object.entries(unlockedMap).map(([id, data]) => ({
    achievement: getAchievementById(id)!,
    unlockedAt: data.unlockedAt,
    progress: data.progress,
  })).filter(u => u.achievement); // Filter out any invalid IDs

  const totalXP = calculateTotalAchievementXP(Object.keys(unlockedMap));

  return {
    unlockedAchievements,
    allAchievements: ACHIEVEMENTS,
    totalXP,
    isUnlocked,
    getProgress,
    checkAndUnlock,
    unlockAchievement,
    unlockSpecialAchievement,
  };
}
