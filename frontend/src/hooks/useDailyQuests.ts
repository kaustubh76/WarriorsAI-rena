/**
 * Hook for managing daily quests
 */

import { useState, useCallback, useEffect } from 'react';
import {
  getGamificationData,
  setGamificationData,
  getTodayDateString,
} from '../utils/storage';
import {
  Quest,
  QuestType,
  getDailyQuests,
  getTimeUntilReset,
  formatTimeUntilReset,
} from '../utils/quests';

export interface QuestProgress {
  quest: Quest;
  progress: number;
  claimed: boolean;
  isComplete: boolean;
}

export interface UseDailyQuestsReturn {
  quests: QuestProgress[];
  timeUntilReset: string;
  totalXPAvailable: number;
  totalXPClaimed: number;
  trackProgress: (type: QuestType, amount?: number) => Quest | null;
  claimQuest: (questId: string) => { xp: number; crwn: number } | null;
  claimAllComplete: () => { xp: number; crwn: number };
  refreshQuests: () => void;
}

export function useDailyQuests(): UseDailyQuestsReturn {
  const [questProgress, setQuestProgress] = useState<Record<string, { progress: number; claimed: boolean }>>({});
  const [todayQuests, setTodayQuests] = useState<Quest[]>([]);
  const [timeDisplay, setTimeDisplay] = useState('');

  // Load or generate daily quests
  const loadQuests = useCallback(() => {
    const today = getTodayDateString();
    const data = getGamificationData();

    // Check if we need new quests for today
    if (data.quests.date !== today) {
      // New day - reset quests
      const newQuests = getDailyQuests(today);
      const newProgress: Record<string, { progress: number; claimed: boolean }> = {};

      newQuests.forEach(quest => {
        newProgress[quest.id] = { progress: 0, claimed: false };
      });

      data.quests = { date: today, quests: newProgress };
      setGamificationData(data);
      setQuestProgress(newProgress);
      setTodayQuests(newQuests);
    } else {
      // Same day - load existing progress
      setQuestProgress(data.quests.quests);
      setTodayQuests(getDailyQuests(today));
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    loadQuests();

    // Update timer every second
    const timer = setInterval(() => {
      setTimeDisplay(formatTimeUntilReset());

      // Check if day changed
      const now = getTimeUntilReset();
      if (now.hours === 0 && now.minutes === 0 && now.seconds === 0) {
        loadQuests();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [loadQuests]);

  const saveProgress = useCallback((newProgress: Record<string, { progress: number; claimed: boolean }>) => {
    const data = getGamificationData();
    data.quests.quests = newProgress;
    setGamificationData(data);
    setQuestProgress(newProgress);
  }, []);

  const trackProgress = useCallback((type: QuestType, amount: number = 1): Quest | null => {
    const quest = todayQuests.find(q => q.type === type);
    if (!quest) return null;

    const current = questProgress[quest.id];
    if (!current || current.claimed) return null;

    const newProgress = Math.min(quest.target, current.progress + amount);
    const wasComplete = current.progress >= quest.target;
    const isNowComplete = newProgress >= quest.target;

    const newQuestProgress = {
      ...questProgress,
      [quest.id]: { ...current, progress: newProgress },
    };

    saveProgress(newQuestProgress);

    // Return quest if just completed
    if (!wasComplete && isNowComplete) {
      return quest;
    }

    return null;
  }, [todayQuests, questProgress, saveProgress]);

  const claimQuest = useCallback((questId: string): { xp: number; crwn: number } | null => {
    const quest = todayQuests.find(q => q.id === questId);
    if (!quest) return null;

    const current = questProgress[questId];
    if (!current || current.claimed || current.progress < quest.target) return null;

    // Mark as claimed
    const newProgress = {
      ...questProgress,
      [questId]: { ...current, claimed: true },
    };
    saveProgress(newProgress);

    // Add XP to stats
    const data = getGamificationData();
    data.stats.totalXP += quest.xpReward;
    setGamificationData(data);

    return {
      xp: quest.xpReward,
      crwn: quest.crwnReward || 0,
    };
  }, [todayQuests, questProgress, saveProgress]);

  const claimAllComplete = useCallback((): { xp: number; crwn: number } => {
    let totalXP = 0;
    let totalCRwN = 0;

    todayQuests.forEach(quest => {
      const current = questProgress[quest.id];
      if (current && !current.claimed && current.progress >= quest.target) {
        const claimed = claimQuest(quest.id);
        if (claimed) {
          totalXP += claimed.xp;
          totalCRwN += claimed.crwn;
        }
      }
    });

    return { xp: totalXP, crwn: totalCRwN };
  }, [todayQuests, questProgress, claimQuest]);

  const refreshQuests = useCallback(() => {
    loadQuests();
  }, [loadQuests]);

  // Compute derived values
  const quests: QuestProgress[] = todayQuests.map(quest => {
    const progress = questProgress[quest.id] || { progress: 0, claimed: false };
    return {
      quest,
      progress: progress.progress,
      claimed: progress.claimed,
      isComplete: progress.progress >= quest.target,
    };
  });

  const totalXPAvailable = todayQuests.reduce((sum, q) => sum + q.xpReward, 0);
  const totalXPClaimed = quests
    .filter(q => q.claimed)
    .reduce((sum, q) => sum + q.quest.xpReward, 0);

  return {
    quests,
    timeUntilReset: timeDisplay,
    totalXPAvailable,
    totalXPClaimed,
    trackProgress,
    claimQuest,
    claimAllComplete,
    refreshQuests,
  };
}
