/**
 * Achievement definitions for the gamification system
 */

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type AchievementCategory = 'trading' | 'streaks' | 'profits' | 'social' | 'special';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  xpReward: number;
  requirement: number; // The target value to unlock
  checkStat?: string; // The stat key to check against requirement
  hidden?: boolean; // Hidden until unlocked
}

// XP rewards by rarity
export const RARITY_XP: Record<AchievementRarity, number> = {
  common: 25,
  uncommon: 50,
  rare: 100,
  epic: 250,
  legendary: 500,
};

// Rarity colors for styling
export const RARITY_COLORS: Record<AchievementRarity, { bg: string; border: string; text: string; glow: string }> = {
  common: {
    bg: 'bg-gray-700',
    border: 'border-gray-500',
    text: 'text-gray-300',
    glow: 'shadow-gray-500/30',
  },
  uncommon: {
    bg: 'bg-green-900/50',
    border: 'border-green-500',
    text: 'text-green-400',
    glow: 'shadow-green-500/40',
  },
  rare: {
    bg: 'bg-blue-900/50',
    border: 'border-blue-500',
    text: 'text-blue-400',
    glow: 'shadow-blue-500/50',
  },
  epic: {
    bg: 'bg-purple-900/50',
    border: 'border-purple-500',
    text: 'text-purple-400',
    glow: 'shadow-purple-500/60',
  },
  legendary: {
    bg: 'bg-yellow-900/50',
    border: 'border-yellow-500',
    text: 'text-yellow-400',
    glow: 'shadow-yellow-500/70',
  },
};

export const ACHIEVEMENTS: Achievement[] = [
  // Trading Achievements
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Complete your first trade',
    icon: '⚔️',
    category: 'trading',
    rarity: 'common',
    xpReward: RARITY_XP.common,
    requirement: 1,
    checkStat: 'totalTrades',
  },
  {
    id: 'market_warrior',
    name: 'Market Warrior',
    description: 'Complete 10 trades',
    icon: '🗡️',
    category: 'trading',
    rarity: 'uncommon',
    xpReward: RARITY_XP.uncommon,
    requirement: 10,
    checkStat: 'totalTrades',
  },
  {
    id: 'battle_hardened',
    name: 'Battle Hardened',
    description: 'Complete 50 trades',
    icon: '🛡️',
    category: 'trading',
    rarity: 'rare',
    xpReward: RARITY_XP.rare,
    requirement: 50,
    checkStat: 'totalTrades',
  },
  {
    id: 'arena_champion',
    name: 'Arena Champion',
    description: 'Complete 100 trades',
    icon: '👑',
    category: 'trading',
    rarity: 'epic',
    xpReward: RARITY_XP.epic,
    requirement: 100,
    checkStat: 'totalTrades',
  },
  {
    id: 'trading_legend',
    name: 'Trading Legend',
    description: 'Complete 500 trades',
    icon: '🏆',
    category: 'trading',
    rarity: 'legendary',
    xpReward: RARITY_XP.legendary,
    requirement: 500,
    checkStat: 'totalTrades',
  },

  // Win Streak Achievements
  {
    id: 'hot_hand',
    name: 'Hot Hand',
    description: 'Win 3 trades in a row',
    icon: '🔥',
    category: 'streaks',
    rarity: 'common',
    xpReward: RARITY_XP.common,
    requirement: 3,
    checkStat: 'bestWinStreak',
  },
  {
    id: 'winning_streak',
    name: 'Winning Streak',
    description: 'Win 5 trades in a row',
    icon: '💫',
    category: 'streaks',
    rarity: 'uncommon',
    xpReward: RARITY_XP.uncommon,
    requirement: 5,
    checkStat: 'bestWinStreak',
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Win 10 trades in a row',
    icon: '⚡',
    category: 'streaks',
    rarity: 'rare',
    xpReward: RARITY_XP.rare,
    requirement: 10,
    checkStat: 'bestWinStreak',
  },
  {
    id: 'legendary_streak',
    name: 'Legendary Streak',
    description: 'Win 20 trades in a row',
    icon: '🌟',
    category: 'streaks',
    rarity: 'legendary',
    xpReward: RARITY_XP.legendary,
    requirement: 20,
    checkStat: 'bestWinStreak',
  },

  // Profit Achievements
  {
    id: 'first_fortune',
    name: 'First Fortune',
    description: 'Earn 100 CRwN in profit',
    icon: '💰',
    category: 'profits',
    rarity: 'common',
    xpReward: RARITY_XP.common,
    requirement: 100,
    checkStat: 'totalProfit',
  },
  {
    id: 'gold_hoarder',
    name: 'Gold Hoarder',
    description: 'Earn 1,000 CRwN in profit',
    icon: '💎',
    category: 'profits',
    rarity: 'uncommon',
    xpReward: RARITY_XP.uncommon,
    requirement: 1000,
    checkStat: 'totalProfit',
  },
  {
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    description: 'Earn 5,000 CRwN in profit',
    icon: '🏴‍☠️',
    category: 'profits',
    rarity: 'rare',
    xpReward: RARITY_XP.rare,
    requirement: 5000,
    checkStat: 'totalProfit',
  },
  {
    id: 'crypto_whale',
    name: 'Crypto Whale',
    description: 'Earn 25,000 CRwN in profit',
    icon: '🐋',
    category: 'profits',
    rarity: 'epic',
    xpReward: RARITY_XP.epic,
    requirement: 25000,
    checkStat: 'totalProfit',
  },
  {
    id: 'market_mogul',
    name: 'Market Mogul',
    description: 'Earn 100,000 CRwN in profit',
    icon: '🏰',
    category: 'profits',
    rarity: 'legendary',
    xpReward: RARITY_XP.legendary,
    requirement: 100000,
    checkStat: 'totalProfit',
  },

  // Social Achievements
  {
    id: 'apprentice',
    name: 'Apprentice',
    description: 'Copy trade from an AI agent',
    icon: '📚',
    category: 'social',
    rarity: 'common',
    xpReward: RARITY_XP.common,
    requirement: 1,
    checkStat: 'totalCopyTrades',
  },
  {
    id: 'network_builder',
    name: 'Network Builder',
    description: 'Follow 5 AI agents',
    icon: '🤝',
    category: 'social',
    rarity: 'uncommon',
    xpReward: RARITY_XP.uncommon,
    requirement: 5,
    checkStat: 'totalFollows',
  },
  {
    id: 'copy_master',
    name: 'Copy Master',
    description: 'Copy trade 25 times',
    icon: '🎯',
    category: 'social',
    rarity: 'rare',
    xpReward: RARITY_XP.rare,
    requirement: 25,
    checkStat: 'totalCopyTrades',
  },
  {
    id: 'liquidity_provider',
    name: 'Liquidity Provider',
    description: 'Add liquidity 10 times',
    icon: '💧',
    category: 'social',
    rarity: 'rare',
    xpReward: RARITY_XP.rare,
    requirement: 10,
    checkStat: 'totalLiquidityAdded',
  },

  // Special Achievements
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Trade before 8 AM',
    icon: '🌅',
    category: 'special',
    rarity: 'uncommon',
    xpReward: RARITY_XP.uncommon,
    requirement: 1,
    hidden: true,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Trade after midnight',
    icon: '🦉',
    category: 'special',
    rarity: 'uncommon',
    xpReward: RARITY_XP.uncommon,
    requirement: 1,
    hidden: true,
  },
  {
    id: 'dedicated_warrior',
    name: 'Dedicated Warrior',
    description: 'Login 7 days in a row',
    icon: '📅',
    category: 'special',
    rarity: 'rare',
    xpReward: RARITY_XP.rare,
    requirement: 7,
    checkStat: 'bestLoginStreak',
  },
  {
    id: 'arena_veteran',
    name: 'Arena Veteran',
    description: 'Login 30 days in a row',
    icon: '🎖️',
    category: 'special',
    rarity: 'epic',
    xpReward: RARITY_XP.epic,
    requirement: 30,
    checkStat: 'bestLoginStreak',
  },
  {
    id: 'lucky_seven',
    name: 'Lucky Seven',
    description: 'Win a trade with exactly 7.77% profit',
    icon: '🍀',
    category: 'special',
    rarity: 'legendary',
    xpReward: RARITY_XP.legendary,
    requirement: 1,
    hidden: true,
  },
];

/**
 * Get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

/**
 * Get achievements by category
 */
export function getAchievementsByCategory(category: AchievementCategory): Achievement[] {
  return ACHIEVEMENTS.filter(a => a.category === category);
}

/**
 * Get achievements by rarity
 */
export function getAchievementsByRarity(rarity: AchievementRarity): Achievement[] {
  return ACHIEVEMENTS.filter(a => a.rarity === rarity);
}

/**
 * Calculate total XP from unlocked achievements
 */
export function calculateTotalAchievementXP(unlockedIds: string[]): number {
  return unlockedIds.reduce((total, id) => {
    const achievement = getAchievementById(id);
    return total + (achievement?.xpReward || 0);
  }, 0);
}

/**
 * Get progress percentage for an achievement
 */
export function getAchievementProgress(achievement: Achievement, currentValue: number): number {
  if (currentValue >= achievement.requirement) return 100;
  return Math.floor((currentValue / achievement.requirement) * 100);
}
