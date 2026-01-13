/**
 * Type-safe localStorage wrapper for gamification data persistence
 */

export interface GamificationStorage {
  achievements: Record<string, { unlockedAt: number; progress?: number }>;
  streaks: {
    currentWinStreak: number;
    bestWinStreak: number;
    currentLoginStreak: number;
    bestLoginStreak: number;
    lastLoginDate: string;
    lastTradeDate: string;
  };
  quests: {
    date: string;
    quests: Record<string, { progress: number; claimed: boolean }>;
  };
  stats: {
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
    totalProfit: number;
    totalFollows: number;
    totalCopyTrades: number;
    totalLiquidityAdded: number;
    totalXP: number;
    level: number;
  };
  preferences: {
    soundEnabled: boolean;
    notificationsEnabled: boolean;
  };
}

const STORAGE_KEY = 'warriors_gamification';

const defaultStorage: GamificationStorage = {
  achievements: {},
  streaks: {
    currentWinStreak: 0,
    bestWinStreak: 0,
    currentLoginStreak: 0,
    bestLoginStreak: 0,
    lastLoginDate: '',
    lastTradeDate: '',
  },
  quests: {
    date: '',
    quests: {},
  },
  stats: {
    totalTrades: 0,
    totalWins: 0,
    totalLosses: 0,
    totalProfit: 0,
    totalFollows: 0,
    totalCopyTrades: 0,
    totalLiquidityAdded: 0,
    totalXP: 0,
    level: 1,
  },
  preferences: {
    soundEnabled: true,
    notificationsEnabled: true,
  },
};

/**
 * Get all gamification data from localStorage
 */
export function getGamificationData(): GamificationStorage {
  if (typeof window === 'undefined') return defaultStorage;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultStorage;

    const parsed = JSON.parse(stored);
    // Merge with defaults to handle new fields
    return {
      ...defaultStorage,
      ...parsed,
      streaks: { ...defaultStorage.streaks, ...parsed.streaks },
      stats: { ...defaultStorage.stats, ...parsed.stats },
      preferences: { ...defaultStorage.preferences, ...parsed.preferences },
    };
  } catch (error) {
    console.error('Failed to load gamification data:', error);
    return defaultStorage;
  }
}

/**
 * Save all gamification data to localStorage
 */
export function setGamificationData(data: GamificationStorage): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save gamification data:', error);
  }
}

/**
 * Update a specific section of gamification data
 */
export function updateGamificationData<K extends keyof GamificationStorage>(
  key: K,
  value: GamificationStorage[K]
): void {
  const data = getGamificationData();
  data[key] = value;
  setGamificationData(data);
}

/**
 * Get a specific section of gamification data
 */
export function getGamificationSection<K extends keyof GamificationStorage>(
  key: K
): GamificationStorage[K] {
  return getGamificationData()[key];
}

/**
 * Increment a stat value
 */
export function incrementStat(
  stat: keyof GamificationStorage['stats'],
  amount: number = 1
): number {
  const data = getGamificationData();
  data.stats[stat] += amount;
  setGamificationData(data);
  return data.stats[stat];
}

/**
 * Reset all gamification data (for testing)
 */
export function resetGamificationData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get today's date as YYYY-MM-DD string
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate XP needed for a level
 */
export function getXPForLevel(level: number): number {
  // Exponential curve: Level 1 = 0, Level 2 = 100, Level 3 = 250, etc.
  return Math.floor(50 * Math.pow(level - 1, 1.5));
}

/**
 * Calculate level from total XP
 */
export function getLevelFromXP(totalXP: number): number {
  let level = 1;
  while (getXPForLevel(level + 1) <= totalXP) {
    level++;
  }
  return level;
}

/**
 * Get XP progress towards next level
 */
export function getXPProgress(totalXP: number): { current: number; needed: number; percent: number } {
  const level = getLevelFromXP(totalXP);
  const currentLevelXP = getXPForLevel(level);
  const nextLevelXP = getXPForLevel(level + 1);
  const current = totalXP - currentLevelXP;
  const needed = nextLevelXP - currentLevelXP;
  return {
    current,
    needed,
    percent: Math.min(100, Math.floor((current / needed) * 100)),
  };
}
