/**
 * Daily quest definitions for the gamification system
 */

export type QuestType =
  | 'complete_trades'
  | 'win_trades'
  | 'copy_trade'
  | 'add_liquidity'
  | 'follow_agent'
  | 'view_battles'
  | 'profit_target'
  | 'trade_volume';

export interface Quest {
  id: string;
  type: QuestType;
  name: string;
  description: string;
  icon: string;
  target: number;
  xpReward: number;
  crwnReward?: number; // Optional CRwN bonus
}

// Quest pool - 3-4 randomly selected each day
export const QUEST_POOL: Quest[] = [
  // Easy Quests
  {
    id: 'daily_complete_3',
    type: 'complete_trades',
    name: 'Active Trader',
    description: 'Complete 3 trades today',
    icon: '📊',
    target: 3,
    xpReward: 30,
  },
  {
    id: 'daily_win_2',
    type: 'win_trades',
    name: 'Double Victory',
    description: 'Win 2 trades today',
    icon: '✌️',
    target: 2,
    xpReward: 40,
  },
  {
    id: 'daily_follow_1',
    type: 'follow_agent',
    name: 'Network Growth',
    description: 'Follow a new AI agent',
    icon: '👥',
    target: 1,
    xpReward: 25,
  },
  {
    id: 'daily_view_battles_3',
    type: 'view_battles',
    name: 'Arena Spectator',
    description: 'Watch 3 arena battles',
    icon: '👀',
    target: 3,
    xpReward: 20,
  },

  // Medium Quests
  {
    id: 'daily_complete_5',
    type: 'complete_trades',
    name: 'Trading Frenzy',
    description: 'Complete 5 trades today',
    icon: '🔥',
    target: 5,
    xpReward: 50,
  },
  {
    id: 'daily_win_3',
    type: 'win_trades',
    name: 'Hat Trick',
    description: 'Win 3 trades today',
    icon: '🎩',
    target: 3,
    xpReward: 60,
  },
  {
    id: 'daily_copy_trade_1',
    type: 'copy_trade',
    name: 'Following Wisdom',
    description: 'Copy trade from an AI agent',
    icon: '🤖',
    target: 1,
    xpReward: 35,
  },
  {
    id: 'daily_add_liquidity',
    type: 'add_liquidity',
    name: 'Market Maker',
    description: 'Add liquidity to a market',
    icon: '💧',
    target: 1,
    xpReward: 45,
  },

  // Hard Quests
  {
    id: 'daily_profit_100',
    type: 'profit_target',
    name: 'Century Club',
    description: 'Earn 100 CRwN profit today',
    icon: '💯',
    target: 100,
    xpReward: 75,
    crwnReward: 10,
  },
  {
    id: 'daily_win_5',
    type: 'win_trades',
    name: 'Victory Lap',
    description: 'Win 5 trades today',
    icon: '🏆',
    target: 5,
    xpReward: 100,
    crwnReward: 15,
  },
  {
    id: 'daily_volume_500',
    type: 'trade_volume',
    name: 'Big Spender',
    description: 'Trade 500 CRwN in volume',
    icon: '💸',
    target: 500,
    xpReward: 80,
    crwnReward: 20,
  },
];

/**
 * Generate a seeded random number from a date string
 */
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return () => {
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };
}

/**
 * Get daily quests for a specific date
 * Uses date as seed for consistent quests throughout the day
 */
export function getDailyQuests(dateString: string): Quest[] {
  const random = seededRandom(dateString);

  // Shuffle the quest pool using the seeded random
  const shuffled = [...QUEST_POOL].sort(() => random() - 0.5);

  // Select 4 quests, ensuring variety
  const selected: Quest[] = [];
  const usedTypes = new Set<QuestType>();

  for (const quest of shuffled) {
    if (selected.length >= 4) break;

    // Ensure variety - don't pick same type twice unless necessary
    if (!usedTypes.has(quest.type) || selected.length >= QUEST_POOL.length / 2) {
      selected.push(quest);
      usedTypes.add(quest.type);
    }
  }

  return selected;
}

/**
 * Get time until daily reset (midnight UTC)
 */
export function getTimeUntilReset(): { hours: number; minutes: number; seconds: number } {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const diff = tomorrow.getTime() - now.getTime();

  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

/**
 * Format time until reset as string
 */
export function formatTimeUntilReset(): string {
  const { hours, minutes, seconds } = getTimeUntilReset();

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Calculate total XP from completed quests
 */
export function calculateQuestXP(completedQuests: Quest[]): number {
  return completedQuests.reduce((total, quest) => total + quest.xpReward, 0);
}

/**
 * Calculate total CRwN rewards from completed quests
 */
export function calculateQuestCRwN(completedQuests: Quest[]): number {
  return completedQuests.reduce((total, quest) => total + (quest.crwnReward || 0), 0);
}
