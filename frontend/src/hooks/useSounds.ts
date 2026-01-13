/**
 * Hook for managing sound effects
 */

import { useState, useCallback, useEffect } from 'react';
import { soundManager, SoundType } from '../utils/sounds';

export interface UseSoundsReturn {
  enabled: boolean;
  volume: number;
  play: (type: SoundType) => void;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  playTradeResult: (isWin: boolean, profit: number) => void;
  playStreakCelebration: (streakLength: number) => void;
  playLevelUp: () => void;
}

export function useSounds(): UseSoundsReturn {
  const [enabled, setEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(1.0);

  // Initialize from sound manager on mount
  useEffect(() => {
    setEnabledState(soundManager.isEnabled());
    setVolumeState(soundManager.getMasterVolume());
  }, []);

  const play = useCallback((type: SoundType) => {
    soundManager.play(type);
  }, []);

  const toggle = useCallback(() => {
    const newEnabled = soundManager.toggle();
    setEnabledState(newEnabled);
  }, []);

  const setEnabled = useCallback((newEnabled: boolean) => {
    soundManager.setEnabled(newEnabled);
    setEnabledState(newEnabled);
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    soundManager.setMasterVolume(newVolume);
    setVolumeState(newVolume);
  }, []);

  const playTradeResult = useCallback((isWin: boolean, profit: number) => {
    soundManager.playTradeResult(isWin, profit);
  }, []);

  const playStreakCelebration = useCallback((streakLength: number) => {
    soundManager.playStreakCelebration(streakLength);
  }, []);

  const playLevelUp = useCallback(() => {
    soundManager.playLevelUp();
  }, []);

  return {
    enabled,
    volume,
    play,
    toggle,
    setEnabled,
    setVolume,
    playTradeResult,
    playStreakCelebration,
    playLevelUp,
  };
}
