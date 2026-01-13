'use client';

/**
 * Daily quest panel component
 */

import React, { useState } from 'react';
import { QuestProgress } from '../../hooks/useDailyQuests';
import { playSound } from '../../utils/sounds';

interface DailyQuestPanelProps {
  quests: QuestProgress[];
  timeUntilReset: string;
  onClaimQuest: (questId: string) => { xp: number; crwn: number } | null;
  onClaimAll: () => { xp: number; crwn: number };
  className?: string;
}

export function DailyQuestPanel({
  quests,
  timeUntilReset,
  onClaimQuest,
  onClaimAll,
  className = '',
}: DailyQuestPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const completedCount = quests.filter(q => q.isComplete).length;
  const claimableCount = quests.filter(q => q.isComplete && !q.claimed).length;
  const totalXPAvailable = quests.reduce((sum, q) => sum + q.quest.xpReward, 0);
  const claimedXP = quests.filter(q => q.claimed).reduce((sum, q) => sum + q.quest.xpReward, 0);

  const handleClaimQuest = (questId: string) => {
    const result = onClaimQuest(questId);
    if (result) {
      playSound('coin');
    }
  };

  const handleClaimAll = () => {
    const result = onClaimAll();
    if (result.xp > 0) {
      playSound('achievement');
    }
  };

  return (
    <div className={`bg-gray-900/90 border border-purple-700 rounded-lg overflow-hidden ${className}`}>
      {/* Header - always visible */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📋</span>
          <div className="text-left">
            <div className="text-sm font-bold text-white">Daily Quests</div>
            <div className="text-xs text-gray-400">{completedCount}/{quests.length} complete</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Claimable indicator */}
          {claimableCount > 0 && (
            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
              {claimableCount} ready!
            </span>
          )}

          {/* Timer */}
          <div className="text-xs text-gray-400">
            ⏱ {timeUntilReset}
          </div>

          {/* Expand arrow */}
          <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-700 px-4 py-3">
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Daily Progress</span>
              <span>{claimedXP}/{totalXPAvailable} XP</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                style={{ width: `${(claimedXP / totalXPAvailable) * 100}%` }}
              />
            </div>
          </div>

          {/* Quest list */}
          <div className="space-y-2">
            {quests.map((questProgress) => (
              <QuestItem
                key={questProgress.quest.id}
                questProgress={questProgress}
                onClaim={() => handleClaimQuest(questProgress.quest.id)}
              />
            ))}
          </div>

          {/* Claim all button */}
          {claimableCount > 1 && (
            <button
              onClick={handleClaimAll}
              className="w-full mt-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all"
            >
              Claim All ({claimableCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface QuestItemProps {
  questProgress: QuestProgress;
  onClaim: () => void;
}

function QuestItem({ questProgress, onClaim }: QuestItemProps) {
  const { quest, progress, isComplete, claimed } = questProgress;
  const progressPercent = Math.min(100, (progress / quest.target) * 100);

  return (
    <div
      className={`
        p-3 rounded-lg
        ${claimed ? 'bg-gray-800/30 opacity-60' : 'bg-gray-800/60'}
        ${isComplete && !claimed ? 'border border-green-500/50' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span className="text-xl">{quest.icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-sm font-bold ${claimed ? 'text-gray-500' : 'text-white'}`}>
              {quest.name}
            </h4>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-yellow-500">⭐</span>
              <span className={claimed ? 'text-gray-500' : 'text-yellow-400'}>
                {quest.xpReward}
              </span>
              {quest.crwnReward && (
                <>
                  <span className="text-gray-500 mx-1">+</span>
                  <span className={claimed ? 'text-gray-500' : 'text-green-400'}>
                    {quest.crwnReward} CRwN
                  </span>
                </>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-0.5">
            {quest.description}
          </p>

          {/* Progress bar */}
          {!claimed && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{progress}/{quest.target}</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isComplete ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Claim button */}
        {isComplete && !claimed && (
          <button
            onClick={onClaim}
            className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition-colors animate-pulse"
          >
            Claim
          </button>
        )}

        {/* Claimed indicator */}
        {claimed && (
          <span className="text-green-500 text-lg">✓</span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact quest indicator for header
 */
interface CompactQuestIndicatorProps {
  completedCount: number;
  totalCount: number;
  claimableCount: number;
  onClick?: () => void;
  className?: string;
}

export function CompactQuestIndicator({
  completedCount,
  totalCount,
  claimableCount,
  onClick,
  className = '',
}: CompactQuestIndicatorProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative inline-flex items-center gap-1.5
        px-2 py-1 rounded-lg
        bg-purple-900/50 border border-purple-600
        hover:bg-purple-800/50 transition-colors
        ${className}
      `}
      title="Daily Quests"
    >
      <span className="text-base">📋</span>
      <span className="text-xs font-bold text-purple-300">
        {completedCount}/{totalCount}
      </span>

      {/* Notification dot for claimable quests */}
      {claimableCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-bounce">
          {claimableCount}
        </span>
      )}
    </button>
  );
}
