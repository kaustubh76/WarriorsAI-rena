'use client';

/**
 * Gamification overlay component - renders confetti and achievement modals
 */

import React from 'react';
import { useGamificationContext } from '../../contexts/GamificationContext';
import { Confetti } from './Confetti';
import { AchievementModal } from './AchievementModal';

export function GamificationOverlay() {
  const {
    showConfetti,
    confettiIntensity,
    showAchievementModal,
    currentAchievement,
    closeAchievementModal,
  } = useGamificationContext();

  return (
    <>
      <Confetti active={showConfetti} intensity={confettiIntensity} />
      <AchievementModal
        achievement={currentAchievement}
        isOpen={showAchievementModal}
        onClose={closeAchievementModal}
      />
    </>
  );
}
