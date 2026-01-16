'use client';

import { useMemo } from 'react';
import { WarriorArenaStats } from '../../types/predictionArena';

// ============================================
// ACHIEVEMENT DEFINITIONS
// ============================================

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  category: 'battles' | 'wins' | 'streaks' | 'rating' | 'special';
  check: (stats: WarriorArenaStats) => boolean;
  progress?: (stats: WarriorArenaStats) => { current: number; target: number };
}

const ACHIEVEMENTS: Achievement[] = [
  // Battle Count Achievements
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your first prediction battle',
    icon: '🩸',
    tier: 'bronze',
    category: 'wins',
    check: (stats) => stats.wins >= 1,
    progress: (stats) => ({ current: stats.wins, target: 1 }),
  },
  {
    id: 'debate_novice',
    name: 'Debate Novice',
    description: 'Complete 5 prediction battles',
    icon: '📜',
    tier: 'bronze',
    category: 'battles',
    check: (stats) => stats.totalBattles >= 5,
    progress: (stats) => ({ current: stats.totalBattles, target: 5 }),
  },
  {
    id: 'seasoned_debater',
    name: 'Seasoned Debater',
    description: 'Complete 25 prediction battles',
    icon: '📚',
    tier: 'silver',
    category: 'battles',
    check: (stats) => stats.totalBattles >= 25,
    progress: (stats) => ({ current: stats.totalBattles, target: 25 }),
  },
  {
    id: 'arena_veteran',
    name: 'Arena Veteran',
    description: 'Complete 100 prediction battles',
    icon: '🎖️',
    tier: 'gold',
    category: 'battles',
    check: (stats) => stats.totalBattles >= 100,
    progress: (stats) => ({ current: stats.totalBattles, target: 100 }),
  },
  {
    id: 'prediction_master',
    name: 'Prediction Master',
    description: 'Complete 500 prediction battles',
    icon: '👑',
    tier: 'platinum',
    category: 'battles',
    check: (stats) => stats.totalBattles >= 500,
    progress: (stats) => ({ current: stats.totalBattles, target: 500 }),
  },

  // Win Achievements
  {
    id: 'triple_threat',
    name: 'Triple Threat',
    description: 'Win 3 battles in a row',
    icon: '🔥',
    tier: 'bronze',
    category: 'streaks',
    check: (stats) => stats.longestStreak >= 3,
    progress: (stats) => ({ current: stats.longestStreak, target: 3 }),
  },
  {
    id: 'dominator',
    name: 'Dominator',
    description: 'Win 10 battles',
    icon: '💪',
    tier: 'silver',
    category: 'wins',
    check: (stats) => stats.wins >= 10,
    progress: (stats) => ({ current: stats.wins, target: 10 }),
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Win 5 battles in a row',
    icon: '⚡',
    tier: 'silver',
    category: 'streaks',
    check: (stats) => stats.longestStreak >= 5,
    progress: (stats) => ({ current: stats.longestStreak, target: 5 }),
  },
  {
    id: 'debate_champion',
    name: 'Debate Champion',
    description: 'Win 50 battles',
    icon: '🏆',
    tier: 'gold',
    category: 'wins',
    check: (stats) => stats.wins >= 50,
    progress: (stats) => ({ current: stats.wins, target: 50 }),
  },
  {
    id: 'legendary_streak',
    name: 'Legendary Streak',
    description: 'Win 10 battles in a row',
    icon: '🌟',
    tier: 'platinum',
    category: 'streaks',
    check: (stats) => stats.longestStreak >= 10,
    progress: (stats) => ({ current: stats.longestStreak, target: 10 }),
  },

  // Rating Achievements
  {
    id: 'rising_star',
    name: 'Rising Star',
    description: 'Reach 1200 arena rating',
    icon: '⭐',
    tier: 'bronze',
    category: 'rating',
    check: (stats) => stats.peakRating >= 1200,
    progress: (stats) => ({ current: stats.peakRating, target: 1200 }),
  },
  {
    id: 'silver_tongue',
    name: 'Silver Tongue',
    description: 'Reach 1400 arena rating',
    icon: '🗣️',
    tier: 'silver',
    category: 'rating',
    check: (stats) => stats.peakRating >= 1400,
    progress: (stats) => ({ current: stats.peakRating, target: 1400 }),
  },
  {
    id: 'golden_orator',
    name: 'Golden Orator',
    description: 'Reach 1600 arena rating',
    icon: '🎤',
    tier: 'gold',
    category: 'rating',
    check: (stats) => stats.peakRating >= 1600,
    progress: (stats) => ({ current: stats.peakRating, target: 1600 }),
  },
  {
    id: 'platinum_predictor',
    name: 'Platinum Predictor',
    description: 'Reach 1800 arena rating',
    icon: '🔮',
    tier: 'platinum',
    category: 'rating',
    check: (stats) => stats.peakRating >= 1800,
    progress: (stats) => ({ current: stats.peakRating, target: 1800 }),
  },
  {
    id: 'diamond_mind',
    name: 'Diamond Mind',
    description: 'Reach 2000 arena rating',
    icon: '💎',
    tier: 'diamond',
    category: 'rating',
    check: (stats) => stats.peakRating >= 2000,
    progress: (stats) => ({ current: stats.peakRating, target: 2000 }),
  },

  // Special Achievements
  {
    id: 'perfect_record',
    name: 'Perfect Record',
    description: 'Win 10+ battles with 80%+ win rate',
    icon: '💯',
    tier: 'gold',
    category: 'special',
    check: (stats) => stats.wins >= 10 && (stats.wins / stats.totalBattles) >= 0.8,
    progress: (stats) => ({
      current: Math.min(stats.wins, 10),
      target: 10,
    }),
  },
  {
    id: 'comeback_king',
    name: 'Comeback King',
    description: 'Win after losing 3 battles in a row',
    icon: '👊',
    tier: 'silver',
    category: 'special',
    check: () => false, // Would need battle history
  },
  {
    id: 'underdog',
    name: 'Underdog',
    description: 'Beat a warrior with 200+ higher rating',
    icon: '🐕',
    tier: 'gold',
    category: 'special',
    check: () => false, // Would need battle history
  },
];

const TIER_COLORS = {
  bronze: 'from-orange-600 to-orange-800',
  silver: 'from-gray-300 to-gray-500',
  gold: 'from-yellow-400 to-yellow-600',
  platinum: 'from-cyan-400 to-cyan-600',
  diamond: 'from-purple-400 to-pink-500',
};

const TIER_BG = {
  bronze: 'bg-orange-500/20 border-orange-500/50',
  silver: 'bg-gray-400/20 border-gray-400/50',
  gold: 'bg-yellow-500/20 border-yellow-500/50',
  platinum: 'bg-cyan-500/20 border-cyan-500/50',
  diamond: 'bg-purple-500/20 border-purple-500/50',
};

// ============================================
// COMPONENTS
// ============================================

interface AchievementsProps {
  stats: WarriorArenaStats;
  className?: string;
  showLocked?: boolean;
}

export function Achievements({ stats, className = '', showLocked = true }: AchievementsProps) {
  const { unlocked, locked, progress } = useMemo(() => {
    const unlocked: Achievement[] = [];
    const locked: Achievement[] = [];
    let totalProgress = 0;
    let maxProgress = 0;

    for (const achievement of ACHIEVEMENTS) {
      if (achievement.check(stats)) {
        unlocked.push(achievement);
        totalProgress += 100;
      } else {
        locked.push(achievement);
        if (achievement.progress) {
          const p = achievement.progress(stats);
          totalProgress += (p.current / p.target) * 100;
        }
      }
      maxProgress += 100;
    }

    return {
      unlocked,
      locked,
      progress: Math.round((totalProgress / maxProgress) * 100),
    };
  }, [stats]);

  return (
    <div className={`bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/30 to-pink-900/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Achievements</h2>
            <p className="text-gray-400 text-sm">
              {unlocked.length}/{ACHIEVEMENTS.length} unlocked
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-purple-400">{progress}%</p>
            <p className="text-gray-400 text-sm">Complete</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Unlocked Achievements */}
      {unlocked.length > 0 && (
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4">Unlocked</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {unlocked.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                stats={stats}
                isUnlocked
              />
            ))}
          </div>
        </div>
      )}

      {/* Locked Achievements */}
      {showLocked && locked.length > 0 && (
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-400 mb-4">Locked</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {locked.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                stats={stats}
                isUnlocked={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AchievementCardProps {
  achievement: Achievement;
  stats: WarriorArenaStats;
  isUnlocked: boolean;
}

function AchievementCard({ achievement, stats, isUnlocked }: AchievementCardProps) {
  const progressData = achievement.progress?.(stats);

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isUnlocked
          ? `${TIER_BG[achievement.tier]} hover:scale-105`
          : 'bg-gray-700/30 border-gray-600/50 opacity-60'
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-3xl ${isUnlocked ? '' : 'grayscale'}`}>
          {achievement.icon}
        </span>
        <div>
          <p className={`font-bold ${isUnlocked ? 'text-white' : 'text-gray-400'}`}>
            {achievement.name}
          </p>
          <p className={`text-xs ${isUnlocked ? TIER_COLORS[achievement.tier].split(' ')[0].replace('from-', 'text-') : 'text-gray-500'}`}>
            {achievement.tier.toUpperCase()}
          </p>
        </div>
      </div>
      <p className={`text-sm ${isUnlocked ? 'text-gray-300' : 'text-gray-500'}`}>
        {achievement.description}
      </p>

      {/* Progress bar for locked */}
      {!isUnlocked && progressData && (
        <div className="mt-3">
          <div className="h-1.5 bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${Math.min((progressData.current / progressData.target) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {progressData.current}/{progressData.target}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPACT ACHIEVEMENTS BADGE
// ============================================

interface AchievementsBadgeProps {
  stats: WarriorArenaStats;
  maxShow?: number;
}

export function AchievementsBadge({ stats, maxShow = 3 }: AchievementsBadgeProps) {
  const unlocked = useMemo(() => {
    return ACHIEVEMENTS
      .filter((a) => a.check(stats))
      .sort((a, b) => {
        const tierOrder = { diamond: 5, platinum: 4, gold: 3, silver: 2, bronze: 1 };
        return tierOrder[b.tier] - tierOrder[a.tier];
      })
      .slice(0, maxShow);
  }, [stats, maxShow]);

  if (unlocked.length === 0) return null;

  return (
    <div className="flex gap-1">
      {unlocked.map((achievement) => (
        <span
          key={achievement.id}
          title={`${achievement.name}: ${achievement.description}`}
          className="text-lg cursor-help"
        >
          {achievement.icon}
        </span>
      ))}
    </div>
  );
}

export default Achievements;
